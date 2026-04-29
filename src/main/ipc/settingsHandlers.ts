import { IPC } from '@shared/ipcChannels'
import { settingsRepo } from '../database/settingsRepo'
import { openExternalAllowlisted } from '../windowManager'
import { validatedHandle } from '../security/ipcValidation'

export function registerSettingsHandlers(): void {
  validatedHandle(IPC.SETTINGS_GET, 'settingsGet', async () => {
    try {
      return { data: await settingsRepo.get() }
    } catch (err) {
      return { error: String(err) }
    }
  })

  validatedHandle(IPC.SETTINGS_SET, 'settingsSet', async (_event, patch) => {
    try {
      await settingsRepo.set(patch)
      return { data: await settingsRepo.get() }
    } catch (err) {
      return { error: String(err) }
    }
  })

  validatedHandle(IPC.OPEN_EXTERNAL, 'openExternal', async (_event, url) => {
    const ok = openExternalAllowlisted(url)
    return ok ? { data: { success: true } } : { error: 'url_not_allowed' }
  })
}
