import { IPC } from '@shared/ipcChannels'
import { batchProcessor } from '../ai/batchProcessor'
import { testApiKey } from '../ai/anthropicClient'
import { settingsRepo } from '../database/settingsRepo'
import { projectsRepo } from '../database/projectsRepo'
import { sendToMain } from '../windowManager'
import { validatedHandle } from '../security/ipcValidation'

export function registerAiHandlers(): void {
  batchProcessor.on('progress', (payload) => sendToMain(IPC.AI_PROGRESS, payload))
  batchProcessor.on('stepDone', (payload) => sendToMain(IPC.AI_STEP_DONE, payload))

  validatedHandle(IPC.AI_GENERATE_ALL, 'aiGenerateAll', async (_event, projectId) => {
    try {
      const project = projectsRepo.get(projectId)
      if (!project) return { error: 'Project not found' }
      batchProcessor.processProject(projectId, project.title).catch(() => {})
      return { data: { started: true } }
    } catch (err) {
      return { error: String(err) }
    }
  })

  validatedHandle(IPC.AI_REGENERATE_STEP, 'aiRegenerateStep', async (_event, stepId, projectTitle) => {
    try {
      batchProcessor.regenerateStep(stepId, projectTitle).catch(() => {})
      return { data: { started: true } }
    } catch (err) {
      return { error: String(err) }
    }
  })

  validatedHandle(IPC.AI_CANCEL, 'aiCancel', (_event, projectId) => {
    batchProcessor.cancel(projectId)
    return { data: { success: true } }
  })

  validatedHandle(IPC.AI_TEST_KEY, 'aiTestKey', async (_event, apiKey) => {
    try {
      const ok = await testApiKey(apiKey)
      return { data: { valid: ok } }
    } catch {
      return { data: { valid: false } }
    }
  })

  validatedHandle(IPC.AI_SET_KEY, 'aiSetKey', async (_event, apiKey) => {
    try {
      await settingsRepo.set({ anthropicApiKey: apiKey })
      return { data: { success: true } }
    } catch (err) {
      return { error: String(err) }
    }
  })
}
