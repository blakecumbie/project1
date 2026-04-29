/**
 * OS-credential-vault-backed encryption for at-rest data.
 *
 *   - Master key: 32 random bytes, generated on first run, stored ONLY in the
 *     OS credential manager via `keytar`. Never written to disk.
 *   - Cipher: AES-256-GCM with a fresh 12-byte IV for every ciphertext.
 *   - Output frame: `version(1) || iv(12) || tag(16) || ciphertext(N)`
 *     Encoded as base64 for SQLite-friendly storage.
 *
 * The key never leaves this module — callers operate on plaintext / ciphertext
 * pairs. The key buffer is held inside a `SecureBuffer` and zeroed on
 * `app.will-quit`.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { SecureBuffer } from './memoryGuard'
import { logger } from '../utils/logger'

const SERVICE = 'com.sopbuilder.app'
const ACCOUNT = 'local-encryption-key'
const VERSION = 0x01
const IV_LEN = 12
const TAG_LEN = 16
const KEY_LEN = 32 // AES-256

let cachedKey: SecureBuffer | null = null

// Lazy-load keytar — it is a native module and we don't want it to crash the
// renderer process on import in dev. The require is intentionally indirect so
// that bundling tools cannot follow it into the renderer bundle.
type KeytarModule = {
  getPassword: (service: string, account: string) => Promise<string | null>
  setPassword: (service: string, account: string, password: string) => Promise<void>
  deletePassword: (service: string, account: string) => Promise<boolean>
}

async function loadKeytar(): Promise<KeytarModule> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const mod: KeytarModule = require('keytar')
  return mod
}

/** Generate, store, or load the master key from the OS credential vault. */
async function getMasterKey(): Promise<SecureBuffer> {
  if (cachedKey && cachedKey.byteLength === KEY_LEN) return cachedKey

  const keytar = await loadKeytar()
  let b64 = await keytar.getPassword(SERVICE, ACCOUNT)
  if (!b64) {
    const fresh = randomBytes(KEY_LEN)
    b64 = fresh.toString('base64')
    await keytar.setPassword(SERVICE, ACCOUNT, b64)
    fresh.fill(0)
    logger.info('secureStore: generated new master key in OS vault')
  }

  // Materialize into a SecureBuffer so the lifetime is bounded.
  const raw = Buffer.from(b64, 'base64')
  if (raw.length !== KEY_LEN) {
    raw.fill(0)
    throw new Error('secureStore: master key has wrong length')
  }
  cachedKey = new SecureBuffer(raw)
  return cachedKey
}

/** Encrypt arbitrary bytes. Returns a self-describing base64 frame. */
export async function encrypt(plain: Buffer | string): Promise<string> {
  const key = await getMasterKey()
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv('aes-256-gcm', key.bytes, iv)
  const input = typeof plain === 'string' ? Buffer.from(plain, 'utf8') : plain
  const ct = Buffer.concat([cipher.update(input), cipher.final()])
  const tag = cipher.getAuthTag()

  const frame = Buffer.concat([Buffer.from([VERSION]), iv, tag, ct])
  // Best-effort wipe of the plaintext we just consumed.
  if (typeof plain !== 'string') plain.fill(0)
  return frame.toString('base64')
}

/** Decrypt a frame produced by `encrypt`. Throws on tag mismatch. */
export async function decrypt(b64: string): Promise<Buffer> {
  const key = await getMasterKey()
  const frame = Buffer.from(b64, 'base64')
  if (frame.length < 1 + IV_LEN + TAG_LEN) throw new Error('secureStore: short frame')
  const version = frame.readUInt8(0)
  if (version !== VERSION) throw new Error(`secureStore: unsupported version ${version}`)
  const iv = frame.subarray(1, 1 + IV_LEN)
  const tag = frame.subarray(1 + IV_LEN, 1 + IV_LEN + TAG_LEN)
  const ct = frame.subarray(1 + IV_LEN + TAG_LEN)

  const decipher = createDecipheriv('aes-256-gcm', key.bytes, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()])
}

/** Convenience: encrypt a UTF-8 string -> ciphertext frame. */
export async function encryptString(s: string): Promise<string> {
  return encrypt(s)
}

/** Convenience: decrypt a frame -> UTF-8 string. */
export async function decryptString(b64: string): Promise<string> {
  const buf = await decrypt(b64)
  const s = buf.toString('utf8')
  buf.fill(0)
  return s
}

/** Delete the master key from the OS vault. Used by uninstall flows. */
export async function destroyMasterKey(): Promise<void> {
  const keytar = await loadKeytar()
  await keytar.deletePassword(SERVICE, ACCOUNT)
  if (cachedKey) {
    cachedKey.wipe()
    cachedKey = null
  }
}

/** Heuristic check: is the value a frame produced by this module? */
export function looksEncrypted(value: string): boolean {
  if (!value) return false
  try {
    const buf = Buffer.from(value, 'base64')
    return buf.length >= 1 + IV_LEN + TAG_LEN && buf.readUInt8(0) === VERSION
  } catch {
    return false
  }
}

/** Visible for tests only — never call in production code. */
export const __test__ = {
  reset: () => {
    cachedKey?.wipe()
    cachedKey = null
  }
}
