import { dialog } from 'electron'
import { IPC } from '@shared/ipcChannels'
import { exportPdf } from '../export/exportPdf'
import { exportHtml } from '../export/exportHtml'
import { exportMarkdown } from '../export/exportMarkdown'
import { projectsRepo } from '../database/projectsRepo'
import { stepsRepo } from '../database/stepsRepo'
import { sendToMain } from '../windowManager'
import { logger } from '../utils/logger'
import { validatedHandle } from '../security/ipcValidation'

export function registerExportHandlers(): void {
  validatedHandle(IPC.EXPORT_PDF, 'exportPayload', async (_event, payload) => {
    try {
      const project = projectsRepo.get(payload.projectId)
      if (!project) return { error: 'Project not found' }
      const steps = stepsRepo.listForProject(payload.projectId)
      sendToMain(IPC.EXPORT_PROGRESS, { phase: 'Generating PDF…', progress: 0.1 })
      await exportPdf(project, steps, payload.outputPath, payload.options.stepsPerPage ?? 1)
      sendToMain(IPC.EXPORT_PROGRESS, { phase: 'Done', progress: 1 })
      return { data: { outputPath: payload.outputPath } }
    } catch (err) {
      logger.error('PDF export error:', err)
      return { error: String(err) }
    }
  })

  validatedHandle(IPC.EXPORT_HTML, 'exportPayload', async (_event, payload) => {
    try {
      const project = projectsRepo.get(payload.projectId)
      if (!project) return { error: 'Project not found' }
      const steps = stepsRepo.listForProject(payload.projectId)
      exportHtml(project, steps, payload.outputPath)
      return { data: { outputPath: payload.outputPath } }
    } catch (err) {
      return { error: String(err) }
    }
  })

  validatedHandle(IPC.EXPORT_MARKDOWN, 'exportPayload', async (_event, payload) => {
    try {
      const project = projectsRepo.get(payload.projectId)
      if (!project) return { error: 'Project not found' }
      const steps = stepsRepo.listForProject(payload.projectId)
      exportMarkdown(project, steps, payload.outputPath)
      return { data: { outputPath: payload.outputPath } }
    } catch (err) {
      return { error: String(err) }
    }
  })

  validatedHandle(IPC.SHOW_SAVE_DIALOG, 'showSaveDialog', async (_event, opts) => {
    try {
      const result = await dialog.showSaveDialog({
        title: opts.title,
        defaultPath: opts.defaultPath,
        filters: opts.filters as Electron.FileFilter[]
      })
      return { data: result }
    } catch (err) {
      return { error: String(err) }
    }
  })

  validatedHandle(IPC.OPEN_ITEM, 'openItem', async (_event, path) => {
    const { shell } = await import('electron')
    shell.showItemInFolder(path)
    return { data: { success: true } }
  })
}
