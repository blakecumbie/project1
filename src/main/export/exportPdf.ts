import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from 'pdf-lib'
import { readFileSync, writeFileSync } from 'fs'
import { resolveImagePath } from '../utils/fileStore'
import type { Project, Step } from '@shared/types'

const PAGE_W = 595
const PAGE_H = 842
const MARGIN = 40

// Sky-500 #0ea5e9 → rgb(0.055, 0.647, 0.914)
const SKY = rgb(0.055, 0.647, 0.914)
// Slate-800 #1e293b
const DARK = rgb(0.118, 0.161, 0.231)
// Slate-500 #64748b
const MID = rgb(0.392, 0.455, 0.545)
// Slate-200 #e2e8f0
const BORDER = rgb(0.886, 0.914, 0.941)
// Slate-50 #f8fafc
const LIGHT_BG = rgb(0.973, 0.980, 0.988)

export async function exportPdf(
  project: Project,
  steps: Step[],
  outputPath: string,
  stepsPerPage: number = 1
): Promise<void> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)

  // ── Cover page ──────────────────────────────────────────────────────────────
  const cover = doc.addPage([PAGE_W, PAGE_H])
  // Gradient-ish header band (solid sky-500)
  cover.drawRectangle({ x: 0, y: PAGE_H - 130, width: PAGE_W, height: 130, color: SKY })
  // App label
  cover.drawText('SOP Builder', { x: MARGIN, y: PAGE_H - 28, size: 11, font, color: rgb(1, 1, 1) })
  // Title on white below band
  drawWrappedText(cover, project.title, MARGIN, PAGE_H - 170, PAGE_W - MARGIN * 2, 24, fontBold, DARK)
  if (project.description) {
    drawWrappedText(cover, project.description, MARGIN, PAGE_H - 210, PAGE_W - MARGIN * 2, 12, font, MID)
  }
  cover.drawText(
    `${steps.length} step${steps.length !== 1 ? 's' : ''}  ·  Generated ${new Date().toLocaleDateString()}`,
    { x: MARGIN, y: MARGIN + 8, size: 10, font, color: MID }
  )

  // ── Step pages ──────────────────────────────────────────────────────────────
  const perPage = Math.max(1, Math.min(4, stepsPerPage))

  // Usable vertical space between top margin and bottom footer
  const usableH = PAGE_H - MARGIN * 2 - 24 // 24 = footer height
  const cardH = Math.floor(usableH / perPage) - (perPage > 1 ? 8 : 0)

  // Image height cap scales with card size
  const imgMaxH = Math.min(280, Math.floor(cardH * 0.45))
  const imgMaxW = PAGE_W - MARGIN * 2

  let page: PDFPage | null = null
  let slotIndex = 0

  for (let i = 0; i < steps.length; i++) {
    if (slotIndex === 0 || slotIndex >= perPage) {
      page = doc.addPage([PAGE_W, PAGE_H])
      drawPageChrome(page, project.title, font, fontBold)
      slotIndex = 0
    }

    const step = steps[i]
    // Top of this card slot
    const slotTop = PAGE_H - MARGIN - slotIndex * (cardH + 8)

    await drawStepCard(
      page!, doc, step, i, cardH, imgMaxH, imgMaxW,
      MARGIN, slotTop,
      font, fontBold
    )

    slotIndex++
  }

  // Page-number footers
  const pageCount = doc.getPageCount()
  for (let p = 1; p < pageCount; p++) {
    const pg = doc.getPage(p)
    pg.drawText(`${p} / ${pageCount - 1}`, {
      x: PAGE_W - MARGIN - 28, y: MARGIN - 12, size: 8, font, color: MID
    })
  }

  writeFileSync(outputPath, await doc.save())
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function drawPageChrome(page: PDFPage, title: string, font: PDFFont, fontBold: PDFFont) {
  // Thin top bar
  page.drawRectangle({ x: 0, y: PAGE_H - 22, width: PAGE_W, height: 22, color: SKY })
  page.drawText('SOP Builder', { x: MARGIN, y: PAGE_H - 15, size: 9, font, color: rgb(1, 1, 1) })
  const titleTrunc = title.length > 55 ? title.slice(0, 52) + '…' : title
  page.drawText(titleTrunc, { x: PAGE_W / 2 - 60, y: PAGE_H - 15, size: 9, font, color: rgb(0.85, 0.95, 1) })
  // Footer line
  page.drawLine({
    start: { x: MARGIN, y: MARGIN - 4 },
    end: { x: PAGE_W - MARGIN, y: MARGIN - 4 },
    thickness: 0.5, color: BORDER
  })
}

async function drawStepCard(
  page: PDFPage,
  doc: PDFDocument,
  step: Step,
  idx: number,
  cardH: number,
  imgMaxH: number,
  imgMaxW: number,
  x: number,
  topY: number,
  font: PDFFont,
  fontBold: PDFFont
): Promise<void> {
  const cardW = PAGE_W - x * 2
  const cardBottom = topY - cardH

  // Card background (white) + border
  page.drawRectangle({
    x, y: cardBottom, width: cardW, height: cardH,
    color: rgb(1, 1, 1)
  })
  page.drawRectangle({
    x, y: cardBottom, width: cardW, height: cardH,
    borderColor: BORDER, borderWidth: 0.75, color: rgb(1, 1, 1)
  })

  // ── Step number circle ──────────────────────────────────────────────────────
  const circleR = 11
  const circleX = x + 16
  const circleY = topY - 16
  page.drawCircle({ x: circleX, y: circleY, size: circleR, color: SKY })
  const numStr = String(idx + 1)
  const numW = numStr.length > 1 ? 10 : 6
  page.drawText(numStr, {
    x: circleX - numW / 2, y: circleY - 4,
    size: 9, font: fontBold, color: rgb(1, 1, 1)
  })

  let curY = topY - 10

  // ── Screenshot ──────────────────────────────────────────────────────────────
  if (step.screenshotPath) {
    try {
      const imgBuf = readFileSync(resolveImagePath(step.screenshotPath))
      const img = await doc.embedJpg(imgBuf)
      const dims = img.scaleToFit(imgMaxW - 32, imgMaxH)
      const imgX = x + (cardW - dims.width) / 2
      curY -= 6
      // Subtle shadow via slightly larger grey rect
      page.drawRectangle({
        x: imgX - 1, y: curY - dims.height - 1,
        width: dims.width + 2, height: dims.height + 2,
        color: BORDER
      })
      page.drawImage(img, { x: imgX, y: curY - dims.height, width: dims.width, height: dims.height })
      curY -= dims.height + 10
    } catch { /* skip missing image */ }
  } else {
    curY -= 8
  }

  // ── Description box with left accent ───────────────────────────────────────
  const desc = step.description || 'No description available.'
  const descFontSize = cardH < 180 ? 9 : 10
  const descLineH = descFontSize + 4
  const descX = x + 8
  const descW = cardW - 16

  const lines = wrapText(desc, descFontSize, descW - 16)
  const maxLines = Math.max(1, Math.floor((curY - cardBottom - 12) / descLineH))
  const visibleLines = lines.slice(0, maxLines)

  const boxH = visibleLines.length * descLineH + 10
  const boxY = curY - boxH

  // Description background
  page.drawRectangle({ x: descX, y: boxY, width: descW, height: boxH, color: LIGHT_BG })
  // Blue left accent bar
  page.drawRectangle({ x: descX, y: boxY, width: 3, height: boxH, color: SKY })

  // Text
  let textY = curY - descLineH
  for (const line of visibleLines) {
    if (textY < cardBottom + 6) break
    page.drawText(line, { x: descX + 10, y: textY, size: descFontSize, font, color: DARK })
    textY -= descLineH
  }
}

function drawWrappedText(
  page: PDFPage, text: string, x: number, y: number,
  maxW: number, size: number, font: PDFFont, color: ReturnType<typeof rgb>
): void {
  const lines = wrapText(text, size, maxW)
  let curY = y
  for (const line of lines.slice(0, 6)) {
    page.drawText(line, { x, y: curY, size, font, color })
    curY -= size + 4
  }
}

function wrapText(text: string, size: number, maxW: number): string[] {
  const charW = size * 0.55
  const words = text.split(' ')
  const lines: string[] = []
  let cur = ''
  for (const word of words) {
    const test = cur ? `${cur} ${word}` : word
    if (test.length * charW > maxW && cur) {
      lines.push(cur)
      cur = word
    } else {
      cur = test
    }
  }
  if (cur) lines.push(cur)
  return lines
}
