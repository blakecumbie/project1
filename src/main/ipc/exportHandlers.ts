import { ipcMain, dialog } from 'electron'
import { IPC } from '@shared/ipcChannels'
import { exportPdf } from '../export/exportPdf'
import { exportHtml } from '../export/exportHtml'
import { exportMarkdown } from '../export/exportMarkdown'
import { projectsRepo } from '../database/projectsRepo'
import { stepsRepo } from '../database/stepsRepo'
import { sendToMain } from '../windowManager'
import { logger } from '../utils/logger'
import type { ExportPayload } from '@shared/types'
import { join } from 'path'
import { mkdirSync } from 'fs'

export function registerExportHandlers(): void {
  ipcMain.handle(IPC.EXPORT_PDF, async (_, payload: ExportPayload) => {
    try {
      const project = projectsRepo.get(payload.projectId)
      if (!project) return { error: 'Project not found' }
      const steps = stepsRepo.listForProject(payload.projectId)
      sendToMain(IPC.EXPORT_PROGRESS, { phase: 'Generating PDF…', progress: 0.1 })
      await exportPdf(project, steps, payload.outputPath)
      sendToMain(IPC.EXPORT_PROGRESS, { phase: 'Done', progress: 1 })
      return { data: { outputPath: payload.outputPath } }
    } catch (err) {
      logger.error('PDF export error:', err)
      return { error: String(err) }
    }
  })

  ipcMain.handle(IPC.EXPORT_HTML, async (_, payload: ExportPayload) => {
    try {
      const project = projectsRepo.get(payload.projectId)
      if (!project) return { error: 'Project not found' }
      const steps = stepsRepo.listForProject(payload.projectId)
      exportHtml(project, steps, payload.outputPath)
      return { data: { outputPath: payload.outputPath } }
    } catch (err) { return { error: String(err) } }
  })

  ipcMain.handle(IPC.EXPORT_MARKDOWN, async (_, payload: ExportPayload) => {
    try {
      const project = projectsRepo.get(payload.projectId)
      if (!project) return { error: 'Project not found' }
      const steps = stepsRepo.listForProject(payload.projectId)
      exportMarkdown(project, steps, payload.outputPath)
      return { data: { outputPath: payload.outputPath } }
    } catch (err) { return { error: String(err) } }
  })

  ipcMain.handle(IPC.SHOW_SAVE_DIALOG, async (_, opts: { title: string; defaultPath: string; filters: Electron.FileFilter[] }) => {
    try {
      const result = await dialog.showSaveDialog({ title: opts.title, defaultPath: opts.defaultPath, filters: opts.filters })
      return { data: result }
    } catch (err) { return { error: String(err) } }
  })

  ipcMain.handle(IPC.OPEN_ITEM, async (_, path: string) => {
    const { shell } = await import('electron')
    shell.showItemInFolder(path)
    return { data: { success: true } }
  })
}
