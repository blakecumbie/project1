import { ipcMain } from 'electron'
import { IPC } from '@shared/ipcChannels'
import { projectsRepo } from '../database/projectsRepo'
import { stepsRepo } from '../database/stepsRepo'
import { deleteImageFile } from '../utils/fileStore'
import type { ProjectsListPayload } from '@shared/types'

export function registerProjectHandlers(): void {
  ipcMain.handle(IPC.PROJECTS_LIST, (_, payload: ProjectsListPayload = {}) => {
    try { return { data: projectsRepo.list(payload) } }
    catch (err) { return { error: String(err) } }
  })

  ipcMain.handle(IPC.PROJECTS_GET, (_, id: string) => {
    try { return { data: projectsRepo.get(id) } }
    catch (err) { return { error: String(err) } }
  })

  ipcMain.handle(IPC.PROJECTS_CREATE, (_, title?: string) => {
    try { return { data: projectsRepo.create(title) } }
    catch (err) { return { error: String(err) } }
  })

  ipcMain.handle(IPC.PROJECTS_UPDATE, (_, id: string, patch: Parameters<typeof projectsRepo.update>[1]) => {
    try { return { data: projectsRepo.update(id, patch) } }
    catch (err) { return { error: String(err) } }
  })

  ipcMain.handle(IPC.PROJECTS_DELETE, (_, id: string) => {
    try {
      // Delete screenshots for all steps
      const steps = stepsRepo.listForProject(id)
      steps.forEach((s) => { if (s.screenshotPath) deleteImageFile(s.screenshotPath) })
      projectsRepo.delete(id)
      return { data: { success: true } }
    } catch (err) { return { error: String(err) } }
  })
}
