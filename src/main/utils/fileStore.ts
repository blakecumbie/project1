import { app } from 'electron'
import { mkdirSync, existsSync, writeFileSync, unlinkSync } from 'fs'
import { join, dirname, resolve, normalize, isAbsolute, sep } from 'path'

/**
 * Bound a relative path to the userData/images directory. Returns null on any
 * traversal attempt (`..`, NUL, absolute prefix). Used by every callsite that
 * accepts a path from the renderer or DB to defeat directory escapes.
 */
function bounded(base: string, relative: string): string | null {
  if (!relative || relative.includes('\0') || isAbsolute(relative)) return null
  const norm = normalize(relative)
  if (norm.startsWith('..') || norm.includes(`..${sep}`) || norm.includes(`${sep}..`)) return null
  const full = resolve(base, norm)
  if (!full.startsWith(base + sep) && full !== base) return null
  return full
}

export function getImagesDir(projectId?: string): string {
  const base = join(app.getPath('userData'), 'images')
  const dir = projectId ? join(base, projectId) : base
  mkdirSync(dir, { recursive: true })
  return dir
}

export function getImagePath(projectId: string, stepId: string): string {
  return join(getImagesDir(projectId), `${stepId}.jpg`)
}

export function getRelativeImagePath(projectId: string, stepId: string): string {
  return `${projectId}/${stepId}.jpg`
}

export function saveImageBuffer(projectId: string, stepId: string, buffer: Buffer): string {
  const dir = getImagesDir(projectId)
  const filePath = join(dir, `${stepId}.jpg`)
  writeFileSync(filePath, buffer, { mode: 0o600 })
  return filePath
}

export function deleteImageFile(relativePath: string): void {
  try {
    const base = resolve(app.getPath('userData'), 'images')
    const full = bounded(base, relativePath)
    if (full && existsSync(full)) unlinkSync(full)
  } catch {}
}

export function resolveImagePath(relativePath: string): string {
  const base = resolve(app.getPath('userData'), 'images')
  const full = bounded(base, relativePath)
  if (!full) throw new Error('resolveImagePath: unsafe path')
  return full
}

export function getExportsDir(): string {
  const dir = join(app.getPath('userData'), 'exports')
  mkdirSync(dir, { recursive: true })
  return dir
}

export function ensureDir(path: string): void {
  const dir = dirname(path)
  mkdirSync(dir, { recursive: true })
}

export function getRelativeFullImagePath(projectId: string, stepId: string): string {
  return `${projectId}/${stepId}_full.jpg`
}

export function saveFullImageBuffer(projectId: string, stepId: string, buffer: Buffer): void {
  writeFileSync(join(getImagesDir(projectId), `${stepId}_full.jpg`), buffer)
}

export function resolveFullImagePath(relativePath: string): string {
  return join(app.getPath('userData'), 'images', relativePath)
}
