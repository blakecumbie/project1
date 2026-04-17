import { ipcMain } from 'electron'
import { IPC } from '@shared/ipcChannels'
import { batchProcessor } from '../ai/batchProcessor'
import { testApiKey } from '../ai/anthropicClient'
import { settingsRepo } from '../database/settingsRepo'
import { projectsRepo } from '../database/projectsRepo'
import { sendToMain } from '../windowManager'

export function registerAiHandlers(): void {
  batchProcessor.on('progress', (payload) => sendToMain(IPC.AI_PROGRESS, payload))
  batchProcessor.on('stepDone', (payload) => sendToMain(IPC.AI_STEP_DONE, payload))

  ipcMain.handle(IPC.AI_GENERATE_ALL, async (_, projectId: string) => {
    try {
      const project = projectsRepo.get(projectId)
      if (!project) return { error: 'Project not found' }
      batchProcessor.processProject(projectId, project.title).catch(() => {})
      return { data: { started: true } }
    } catch (err) { return { error: String(err) } }
  })

  ipcMain.handle(IPC.AI_REGENERATE_STEP, async (_, stepId: string, projectTitle: string) => {
    try {
      batchProcessor.regenerateStep(stepId, projectTitle).catch(() => {})
      return { data: { started: true } }
    } catch (err) { return { error: String(err) } }
  })

  ipcMain.handle(IPC.AI_CANCEL, (_, projectId: string) => {
    batchProcessor.cancel(projectId)
    return { data: { success: true } }
  })

  ipcMain.handle(IPC.AI_TEST_KEY, async (_, apiKey: string) => {
    try {
      const ok = await testApiKey(apiKey)
      return { data: { valid: ok } }
    } catch { return { data: { valid: false } } }
  })

  ipcMain.handle(IPC.AI_SET_KEY, (_, apiKey: string) => {
    try {
      settingsRepo.set({ anthropicApiKey: apiKey })
      return { data: { success: true } }
    } catch (err) { return { error: String(err) } }
  })
}
