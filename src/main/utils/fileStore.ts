import { app } from 'electron'
import { mkdirSync, existsSync, writeFileSync, unlinkSync } from 'fs'
import { join, dirname } from 'path'

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
  writeFileSync(filePath, buffer)
  return filePath
}

export function deleteImageFile(relativePath: string): void {
  try {
    const full = join(app.getPath('userData'), 'images', relativePath)
    if (existsSync(full)) unlinkSync(full)
  } catch {}
}

export function resolveImagePath(relativePath: string): string {
  return join(app.getPath('userData'), 'images', relativePath)
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
