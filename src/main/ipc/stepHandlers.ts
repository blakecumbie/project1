import { ipcMain } from 'electron'
import { IPC } from '@shared/ipcChannels'
import { stepsRepo } from '../database/stepsRepo'
import { projectsRepo } from '../database/projectsRepo'
import { deleteImageFile } from '../utils/fileStore'
import type { StepsReorderPayload, Annotation } from '@shared/types'

export function registerStepHandlers(): void {
  ipcMain.handle(IPC.STEPS_LIST, (_, projectId: string) => {
    try { return { data: stepsRepo.listForProject(projectId) } }
    catch (err) { return { error: String(err) } }
  })

  ipcMain.handle(IPC.STEPS_UPDATE, (_, id: string, patch: { description?: string }) => {
    try { return { data: stepsRepo.update(id, patch) } }
    catch (err) { return { error: String(err) } }
  })

  ipcMain.handle(IPC.STEPS_UPDATE_ANNOTATIONS, (_, id: string, annotations: Annotation[]) => {
    try {
      stepsRepo.updateAnnotations(id, annotations)
      return { data: { success: true } }
    } catch (err) { return { error: String(err) } }
  })

  ipcMain.handle(IPC.STEPS_REORDER, (_, payload: StepsReorderPayload) => {
    try {
      stepsRepo.reorder(payload.projectId, payload.orderedIds)
      return { data: { success: true } }
    } catch (err) { return { error: String(err) } }
  })

  ipcMain.handle(IPC.STEPS_DELETE, (_, id: string) => {
    try {
      const step = stepsRepo.get(id)
      if (step?.screenshotPath) deleteImageFile(step.screenshotPath)
      stepsRepo.delete(id)
      if (step) projectsRepo.updateStepCount(step.projectId)
      return { data: { success: true } }
    } catch (err) { return { error: String(err) } }
  })
}
