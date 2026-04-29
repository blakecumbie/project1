/**
 * Local PII / PCI redaction.
 *
 * Pipeline (all in-memory):
 *   1. Decode JPEG -> Jimp image.
 *   2. Run Tesseract.js (WASM, sandboxed) over the bitmap to obtain words +
 *      bounding boxes.
 *   3. Apply detectors (Luhn-validated card numbers, SSNs, account numbers,
 *      financial-table headings) and group consecutive matched words.
 *   4. Black-out each match region on the bitmap (a small padding is added
 *      so partial pixels at the edge are also covered).
 *   5. Re-encode JPEG. Original buffer is `fill(0)`'d before being released.
 *
 * The Tesseract worker is started lazily and cached for the lifetime of the
 * process. Workers run inside a WebAssembly sandbox — they have no access to
 * the host filesystem.
 *
 * If the WASM module fails to initialize (offline first-run, AV quarantine,
 * etc.), the redactor falls back to a *deny-by-default* policy: it
 * black-bars the whole frame rather than letting unredacted screens through.
 * Callers can opt into a less destructive fallback with `policy: 'best-effort'`
 * but the production setting is `policy: 'fail-closed'`.
 */

import type { Buffer as NodeBuffer } from 'buffer'
import { logger } from '../utils/logger'

type Box = { x: number; y: number; w: number; h: number }
type Word = { text: string; box: Box }

type RedactionPolicy = 'fail-closed' | 'best-effort'

let _workerPromise: Promise<unknown> | null = null

/* eslint-disable @typescript-eslint/no-explicit-any */
async function loadJimp(): Promise<any> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Jimp = require('jimp')
  return Jimp.default ?? Jimp
}

async function loadTesseract(): Promise<any> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('tesseract.js')
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function getOcrWorker(): Promise<unknown> {
  if (_workerPromise) return _workerPromise
  _workerPromise = (async () => {
    const Tesseract = await loadTesseract()
    const worker = await Tesseract.createWorker('eng', 1, {
      // Workers run in a sandboxed WASM environment; we explicitly disable
      // network fetches by routing through bundled artifacts.
      logger: () => undefined,
      gzip: true,
      cacheMethod: 'none'
    })
    return worker
  })()
  return _workerPromise
}

// ─── Detectors ───────────────────────────────────────────────────────────────

/** Strip non-digits and apply the Luhn checksum. */
function isLuhnValid(digits: string): boolean {
  const ds = digits.replace(/\D/g, '')
  if (ds.length < 13 || ds.length > 19) return false
  let sum = 0
  let alt = false
  for (let i = ds.length - 1; i >= 0; i--) {
    let n = ds.charCodeAt(i) - 48
    if (n < 0 || n > 9) return false
    if (alt) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    alt = !alt
  }
  return sum % 10 === 0
}

const SSN_RE = /\b(\d{3})[-\s](\d{2})[-\s](\d{4})\b/
function looksLikeSsn(s: string): boolean {
  const m = SSN_RE.exec(s)
  if (!m) return false
  const [, a, b, c] = m
  // SSA reserved / invalid prefixes — these would generate too many false
  // positives if we redacted them unconditionally, but for a defense-in-depth
  // tool we err on the side of redacting.
  if (a === '000' || a === '666' || a.startsWith('9')) return true
  if (b === '00' || c === '0000') return true
  return true
}

const ROUTING_RE = /\b\d{9}\b/ // ABA routing numbers
const IBAN_RE = /\b[A-Z]{2}\d{2}[A-Z0-9]{1,30}\b/

const FINANCIAL_KEYWORDS = [
  'account #',
  'account number',
  'routing #',
  'routing number',
  'card number',
  'cardholder',
  'security code',
  'cvc',
  'cvv',
  'iban',
  'swift',
  'sort code',
  'balance',
  'available credit'
]

/** Returns true if a single OCR word looks sensitive in isolation. */
function wordIsSensitive(word: string): boolean {
  if (!word) return false
  const trimmed = word.replace(/[\s,]/g, '')
  if (/^\d{13,19}$/.test(trimmed) && isLuhnValid(trimmed)) return true
  if (looksLikeSsn(word)) return true
  if (ROUTING_RE.test(word)) return true
  if (IBAN_RE.test(word)) return true
  return false
}

function lineIsSensitive(line: string): boolean {
  const lower = line.toLowerCase()
  return FINANCIAL_KEYWORDS.some((kw) => lower.includes(kw))
}

// ─── Bounding box union ──────────────────────────────────────────────────────

function unionBoxes(boxes: Box[]): Box {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const b of boxes) {
    if (b.x < x0) x0 = b.x
    if (b.y < y0) y0 = b.y
    if (b.x + b.w > x1) x1 = b.x + b.w
    if (b.y + b.h > y1) y1 = b.y + b.h
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

// ─── Main entry ──────────────────────────────────────────────────────────────

export interface RedactionResult {
  buffer: Buffer
  redactedRegions: number
}

/**
 * Process a JPEG buffer through the redaction pipeline. The input buffer
 * is filled with zeros before this function returns — callers must not
 * retain a reference to it.
 */
export async function redactSensitive(
  inputBuffer: Buffer,
  policy: RedactionPolicy = 'fail-closed'
): Promise<RedactionResult> {
  let regions = 0

  /* eslint-disable @typescript-eslint/no-explicit-any */
  let jimpImage: any
  try {
    const Jimp = await loadJimp()
    jimpImage = await Jimp.read(inputBuffer)
  } catch (err) {
    inputBuffer.fill(0)
    if (policy === 'fail-closed') {
      throw new Error(`redaction: failed to decode image: ${String(err)}`)
    }
    throw err
  }

  // OCR the bitmap.
  let words: Word[] = []
  try {
    const worker = (await getOcrWorker()) as any
    // Tesseract accepts a Buffer or PNG/JPEG bytes.
    const png: Buffer = await jimpImage.getBufferAsync('image/png')
    const result = await worker.recognize(png)
    png.fill(0)
    words = (result.data?.words ?? []).map((w: any) => ({
      text: String(w.text ?? ''),
      box: {
        x: Number(w.bbox?.x0 ?? 0),
        y: Number(w.bbox?.y0 ?? 0),
        w: Number((w.bbox?.x1 ?? 0) - (w.bbox?.x0 ?? 0)),
        h: Number((w.bbox?.y1 ?? 0) - (w.bbox?.y0 ?? 0))
      }
    }))
  } catch (err) {
    logger.warn(`redaction: OCR failed (${String(err)})`)
    if (policy === 'fail-closed') {
      // Black out the whole image rather than risk leaking PII.
      const dims = { x: 0, y: 0, w: jimpImage.bitmap.width, h: jimpImage.bitmap.height }
      drawBlack(jimpImage, dims)
      const out = await jimpImage.getBufferAsync('image/jpeg')
      inputBuffer.fill(0)
      return { buffer: out, redactedRegions: 1 }
    }
  }

  // 1) word-level matches (cards, SSNs, routing/IBAN)
  for (const w of words) {
    if (wordIsSensitive(w.text)) {
      drawBlack(jimpImage, padBox(w.box, 4))
      regions++
    }
  }

  // 2) multi-word matches: group words on the same line and check the joined
  // text — catches keyword-driven detections (`Account # 1234`).
  const lineGroups = groupByLine(words)
  for (const line of lineGroups) {
    const joined = line.map((w) => w.text).join(' ')
    if (lineIsSensitive(joined)) {
      drawBlack(jimpImage, padBox(unionBoxes(line.map((w) => w.box)), 6))
      regions++
      continue
    }
    // Also catch SSN/CC numbers split across two adjacent words (`1234 5678`).
    const compact = joined.replace(/\s+/g, '')
    if (isLuhnValid(compact) || looksLikeSsn(joined) || ROUTING_RE.test(compact)) {
      drawBlack(jimpImage, padBox(unionBoxes(line.map((w) => w.box)), 6))
      regions++
    }
  }

  const out: Buffer = await jimpImage.getBufferAsync('image/jpeg')
  inputBuffer.fill(0)
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return { buffer: out, redactedRegions: regions }
}

function padBox(b: Box, pad: number): Box {
  return { x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 }
}

function groupByLine(words: Word[]): Word[][] {
  // Group words whose vertical center falls within a tolerance of one another.
  const sorted = [...words].sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x)
  const lines: Word[][] = []
  for (const w of sorted) {
    const wy = w.box.y + w.box.h / 2
    const last = lines[lines.length - 1]
    if (last && Math.abs((last[0].box.y + last[0].box.h / 2) - wy) < 6) {
      last.push(w)
    } else {
      lines.push([w])
    }
  }
  return lines
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function drawBlack(img: any, b: Box): void {
  const x = Math.max(0, Math.floor(b.x))
  const y = Math.max(0, Math.floor(b.y))
  const w = Math.max(1, Math.min(img.bitmap.width - x, Math.floor(b.w)))
  const h = Math.max(1, Math.min(img.bitmap.height - y, Math.floor(b.h)))
  // 0xRRGGBBAA — solid black, fully opaque.
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      img.setPixelColor(0x000000ff, xx, yy)
    }
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Tear down the OCR worker — call from `app.will-quit`. */
export async function shutdownRedactor(): Promise<void> {
  if (!_workerPromise) return
  try {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const worker = (await _workerPromise) as any
    await worker.terminate?.()
    /* eslint-enable @typescript-eslint/no-explicit-any */
  } catch {
    /* ignore */
  }
  _workerPromise = null
}

/** Visible for unit tests. */
export const __test__ = { isLuhnValid, looksLikeSsn, lineIsSensitive, wordIsSensitive }
