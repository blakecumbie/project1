import { createWriteStream, existsSync, readFileSync, statSync, writeFileSync, WriteStream } from 'fs'
import { mkdirSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { logger } from '../utils/logger'

interface ActiveSession {
  stream: WriteStream
  path: string
}

const sessions = new Map<string, ActiveSession>()

function audioDir(): string {
  const dir = join(app.getPath('userData'), 'audio')
  mkdirSync(dir, { recursive: true })
  return dir
}

export function audioFilePath(projectId: string): string {
  return join(audioDir(), `${projectId}.webm`)
}

function audioMetaPath(projectId: string): string {
  return join(audioDir(), `${projectId}.meta.json`)
}

export function openSession(projectId: string): void {
  if (sessions.has(projectId)) return
  const path = audioFilePath(projectId)
  const stream = createWriteStream(path)
  sessions.set(projectId, { stream, path })
  logger.info(`audioStore: opened for ${projectId}`)
}

export function appendChunk(projectId: string, chunk: Buffer): void {
  const s = sessions.get(projectId)
  if (!s) { logger.warn(`audioStore: no active session for ${projectId}`); return }
  s.stream.write(chunk)
}

export function closeSession(projectId: string, startedAt: number): Promise<void> {
  return new Promise((resolve) => {
    const s = sessions.get(projectId)
    sessions.delete(projectId)
    if (!s) { resolve(); return }
    s.stream.end(() => {
      try {
        writeFileSync(audioMetaPath(projectId), JSON.stringify({ startedAt }), 'utf8')
      } catch (e) {
        logger.error(`audioStore: meta write failed: ${String(e)}`)
      }
      logger.info(`audioStore: closed for ${projectId}`)
      resolve()
    })
  })
}

export function audioExists(projectId: string): boolean {
  try {
    const p = audioFilePath(projectId)
    return existsSync(p) && statSync(p).size > 1024
  } catch {
    return false
  }
}

export function getStartedAt(projectId: string): number | null {
  try {
    const raw = readFileSync(audioMetaPath(projectId), 'utf8')
    const meta = JSON.parse(raw)
    return typeof meta.startedAt === 'number' ? meta.startedAt : null
  } catch {
    return null
  }
}
