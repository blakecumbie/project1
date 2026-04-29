import { readFileSync } from 'fs'
import { IPC } from '@shared/ipcChannels'
import { stepsRepo } from '../database/stepsRepo'
import { projectsRepo } from '../database/projectsRepo'
import { deleteImageFile, saveImageBuffer, getRelativeImagePath, resolveFullImagePath } from '../utils/fileStore'
import { cropFromFull, getClickDotPosition, getJpegDimensions } from '../screenshotCapture'
import { validatedHandle } from '../security/ipcValidation'
import type { Annotation } from '@shared/types'

export function registerStepHandlers(): void {
  validatedHandle(IPC.STEPS_LIST, 'stepsList', (_event, projectId) => {
    try {
      return { data: stepsRepo.listForProject(projectId) }
    } catch (err) {
      return { error: String(err) }
    }
  })

  validatedHandle(IPC.STEPS_GET, 'stepsGet', (_event, id) => {
    try {
      return { data: stepsRepo.get(id) }
    } catch (err) {
      return { error: String(err) }
    }
  })

  validatedHandle(IPC.STEPS_UPDATE, 'stepsUpdate', (_event, id, patch) => {
    try {
      return { data: stepsRepo.update(id, patch) }
    } catch (err) {
      return { error: String(err) }
    }
  })

  validatedHandle(IPC.STEPS_UPDATE_ANNOTATIONS, 'stepsUpdateAnnotations', (_event, id, annotations) => {
    try {
      stepsRepo.updateAnnotations(id, annotations as Annotation[])
      return { data: { success: true } }
    } catch (err) {
      return { error: String(err) }
    }
  })

  validatedHandle(IPC.STEPS_UPDATE_CROP, 'stepsUpdateCrop', (_event, payload) => {
    try {
      const step = stepsRepo.get(payload.stepId)
      if (!step?.fullScreenshotPath) return { error: 'No full screenshot stored for this step' }

      const fullAbsPath = resolveFullImagePath(step.fullScreenshotPath)
      const fullBuffer = readFileSync(fullAbsPath)
      const scaleFactor = step.scaleFactor ?? 1
      const cropped = cropFromFull(fullBuffer, {
        cropX: payload.cropX,
        cropY: payload.cropY,
        cropRadius: payload.cropRadius,
        scaleFactor
      })
      // Best-effort wipe of the just-read full screenshot from RAM.
      fullBuffer.fill(0)
      if (!cropped) return { error: 'Crop operation failed' }

      saveImageBuffer(step.projectId, step.id, cropped)

      const fullDims = getJpegDimensions(fullBuffer)
      const croppedDims = getJpegDimensions(cropped)
      const displayWidth = fullDims ? fullDims.width / scaleFactor : 0
      const displayHeight = fullDims ? fullDims.height / scaleFactor : 0

      const otherAnnotations = step.annotations.filter((a) => a.type !== 'click_dot')
      const existingDot = step.annotations.find((a) => a.type === 'click_dot')
      if (
        existingDot &&
        existingDot.type === 'click_dot' &&
        step.x !== null &&
        step.y !== null &&
        croppedDims &&
        displayWidth > 0 &&
        displayHeight > 0
      ) {
        const newDotPos = getClickDotPosition(
          step.x,
          step.y,
          payload.cropX,
          payload.cropY,
          payload.cropRadius,
          displayWidth,
          displayHeight,
          croppedDims.width,
          croppedDims.height
        )
        otherAnnotations.push({ ...existingDot, x: newDotPos.x, y: newDotPos.y })
      }

      const updated = stepsRepo.updateCrop(step.id, {
        screenshotPath: getRelativeImagePath(step.projectId, step.id),
        cropX: payload.cropX,
        cropY: payload.cropY,
        cropRadius: payload.cropRadius,
        screenshotWidth: croppedDims?.width ?? null,
        screenshotHeight: croppedDims?.height ?? null,
        annotations: otherAnnotations
      })
      cropped.fill(0)
      return { data: updated }
    } catch (err) {
      return { error: String(err) }
    }
  })

  validatedHandle(IPC.STEPS_REORDER, 'stepsReorder', (_event, payload) => {
    try {
      stepsRepo.reorder(payload.projectId, payload.orderedIds)
      return { data: { success: true } }
    } catch (err) {
      return { error: String(err) }
    }
  })

  validatedHandle(IPC.STEPS_DELETE, 'stepsDelete', (_event, id) => {
    try {
      const step = stepsRepo.get(id)
      if (step?.screenshotPath) deleteImageFile(step.screenshotPath)
      if (step?.fullScreenshotPath) deleteImageFile(step.fullScreenshotPath)
      stepsRepo.delete(id)
      if (step) projectsRepo.updateStepCount(step.projectId)
      return { data: { success: true } }
    } catch (err) {
      return { error: String(err) }
    }
  })
}
