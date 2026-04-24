import { ipcMain } from 'electron'
import { readFileSync } from 'fs'
import { IPC } from '@shared/ipcChannels'
import { stepsRepo } from '../database/stepsRepo'
import { projectsRepo } from '../database/projectsRepo'
import { deleteImageFile, saveImageBuffer, getRelativeImagePath, resolveFullImagePath } from '../utils/fileStore'
import { cropFromFull, getClickDotPosition } from '../screenshotCapture'
import type { StepsReorderPayload, Annotation, UpdateCropPayload } from '@shared/types'

export function registerStepHandlers(): void {
  ipcMain.handle(IPC.STEPS_LIST, (_, projectId: string) => {
    try { return { data: stepsRepo.listForProject(projectId) } }
    catch (err) { return { error: String(err) } }
  })

  ipcMain.handle(IPC.STEPS_GET, (_, id: string) => {
    try { return { data: stepsRepo.get(id) } }
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

  ipcMain.handle(IPC.STEPS_UPDATE_CROP, (_, payload: UpdateCropPayload) => {
    try {
      const step = stepsRepo.get(payload.stepId)
      if (!step?.fullScreenshotPath) return { error: 'No full screenshot stored for this step' }

      const fullAbsPath = resolveFullImagePath(step.fullScreenshotPath)
      const fullBuffer = readFileSync(fullAbsPath)
      const cropped = cropFromFull(fullBuffer, {
        cropX: payload.cropX,
        cropY: payload.cropY,
        cropRadius: payload.cropRadius,
        scaleFactor: step.scaleFactor ?? 1
      })
      if (!cropped) return { error: 'Crop operation failed' }

      saveImageBuffer(step.projectId, step.id, cropped)

      // Recalculate click_dot position with the new crop params
      const otherAnnotations = step.annotations.filter(a => a.type !== 'click_dot')
      const existingDot = step.annotations.find(a => a.type === 'click_dot')
      if (existingDot && existingDot.type === 'click_dot' && step.x !== null && step.y !== null) {
        const newDotPos = getClickDotPosition(
          step.x, step.y,
          payload.cropX, payload.cropY,
          step.scaleFactor ?? 1,
          payload.cropRadius
        )
        otherAnnotations.push({ ...existingDot, x: newDotPos.x, y: newDotPos.y })
      }

      const updated = stepsRepo.updateCrop(step.id, {
        screenshotPath: getRelativeImagePath(step.projectId, step.id),
        cropX: payload.cropX,
        cropY: payload.cropY,
        cropRadius: payload.cropRadius,
        annotations: otherAnnotations
      })
      return { data: updated }
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
      if (step?.fullScreenshotPath) deleteImageFile(step.fullScreenshotPath)
      stepsRepo.delete(id)
      if (step) projectsRepo.updateStepCount(step.projectId)
      return { data: { success: true } }
    } catch (err) { return { error: String(err) } }
  })
}
