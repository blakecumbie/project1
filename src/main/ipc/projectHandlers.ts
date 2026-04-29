import { IPC } from '@shared/ipcChannels'
import { projectsRepo } from '../database/projectsRepo'
import { stepsRepo } from '../database/stepsRepo'
import { deleteImageFile } from '../utils/fileStore'
import { validatedHandle } from '../security/ipcValidation'

export function registerProjectHandlers(): void {
  validatedHandle(IPC.PROJECTS_LIST, 'projectsList', (_event, payload) => {
    try {
      return { data: projectsRepo.list(payload ?? {}) }
    } catch (err) {
      return { error: String(err) }
    }
  })

  validatedHandle(IPC.PROJECTS_GET, 'projectsGet', (_event, id) => {
    try {
      return { data: projectsRepo.get(id) }
    } catch (err) {
      return { error: String(err) }
    }
  })

  validatedHandle(IPC.PROJECTS_CREATE, 'projectsCreate', (_event, title) => {
    try {
      return { data: projectsRepo.create(title) }
    } catch (err) {
      return { error: String(err) }
    }
  })

  validatedHandle(IPC.PROJECTS_UPDATE, 'projectsUpdate', (_event, id, patch) => {
    try {
      return { data: projectsRepo.update(id, patch) }
    } catch (err) {
      return { error: String(err) }
    }
  })

  validatedHandle(IPC.PROJECTS_DELETE, 'projectsDelete', (_event, id) => {
    try {
      const steps = stepsRepo.listForProject(id)
      steps.forEach((s) => {
        if (s.screenshotPath) deleteImageFile(s.screenshotPath)
        if (s.fullScreenshotPath) deleteImageFile(s.fullScreenshotPath)
      })
      projectsRepo.delete(id)
      return { data: { success: true } }
    } catch (err) {
      return { error: String(err) }
    }
  })
}
