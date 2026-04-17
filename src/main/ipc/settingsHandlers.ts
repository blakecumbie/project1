import { ipcMain, shell } from 'electron'
import { IPC } from '@shared/ipcChannels'
import { settingsRepo } from '../database/settingsRepo'
import type { AppSettings } from '@shared/types'

export function registerSettingsHandlers(): void {
  ipcMain.handle(IPC.SETTINGS_GET, () => {
    try { return { data: settingsRepo.get() } }
    catch (err) { return { error: String(err) } }
  })

  ipcMain.handle(IPC.SETTINGS_SET, (_, patch: Partial<AppSettings>) => {
    try {
      settingsRepo.set(patch)
      return { data: settingsRepo.get() }
    } catch (err) { return { error: String(err) } }
  })

  ipcMain.handle(IPC.OPEN_EXTERNAL, async (_, url: string) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      await shell.openExternal(url)
    }
    return { data: { success: true } }
  })
}
