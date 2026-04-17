import { registerRecordingHandlers } from './recordingHandlers'
import { registerProjectHandlers } from './projectHandlers'
import { registerStepHandlers } from './stepHandlers'
import { registerAiHandlers } from './aiHandlers'
import { registerExportHandlers } from './exportHandlers'
import { registerSettingsHandlers } from './settingsHandlers'

export function registerAllIpcHandlers(): void {
  registerRecordingHandlers()
  registerProjectHandlers()
  registerStepHandlers()
  registerAiHandlers()
  registerExportHandlers()
  registerSettingsHandlers()
}
