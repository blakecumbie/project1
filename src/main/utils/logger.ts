import { app } from 'electron'
import { createWriteStream, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { tmpdir } from 'os'

let _stream: ReturnType<typeof createWriteStream> | null = null

function getStream(): ReturnType<typeof createWriteStream> {
  if (_stream) return _stream
  try {
    const logDir = app.isReady() ? join(app.getPath('userData'), 'logs') : tmpdir()
    mkdirSync(logDir, { recursive: true })
    _stream = createWriteStream(join(logDir, 'app.log'), { flags: 'a' })
  } catch {
    _stream = createWriteStream(join(tmpdir(), 'sopbuilder.log'), { flags: 'a' })
  }
  return _stream!
}

function write(level: string, ...args: unknown[]): void {
  const ts = new Date().toISOString()
  const msg = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')
  const line = `[${ts}] [${level}] ${msg}\n`
  try { getStream().write(line) } catch {}
  if (process.env.NODE_ENV !== 'production') process.stdout.write(line)
}

export const logger = {
  info: (...args: unknown[]) => write('INFO', ...args),
  warn: (...args: unknown[]) => write('WARN', ...args),
  error: (...args: unknown[]) => write('ERROR', ...args),
  debug: (...args: unknown[]) => write('DEBUG', ...args)
}
