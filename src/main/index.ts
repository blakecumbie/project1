import { app, globalShortcut, protocol } from 'electron'
import { initDatabase, closeDatabase } from './database/connection'
import { createMainWindow, registerImageProtocol } from './windowManager'
import { registerAllIpcHandlers } from './ipc/index'
import { recordingSession } from './recordingSession'
import { logger } from './utils/logger'
import { IMG_PROTOCOL } from '@shared/constants'

// Required for native modules on some Linux setups
if (process.platform === 'linux') {
  app.disableHardwareAcceleration()
}

// Register custom image protocol before app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: IMG_PROTOCOL, privileges: { secure: true, standard: true, supportFetchAPI: true } }
])

app.on('ready', async () => {
  try {
    initDatabase()
    registerImageProtocol()
    registerAllIpcHandlers()
    createMainWindow()

    // Global shortcut: Ctrl+Shift+R = stop recording if active
    globalShortcut.register('CommandOrControl+Shift+R', async () => {
      if (recordingSession.state === 'recording' || recordingSession.state === 'paused') {
        await recordingSession.stop()
      }
    })

    logger.info('App started successfully')
  } catch (err) {
    logger.error('Startup error:', err)
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', async () => {
  globalShortcut.unregisterAll()
  if (recordingSession.state !== 'idle') {
    await recordingSession.stop().catch(() => {})
  }
  closeDatabase()
})

app.on('activate', () => {
  const { getMainWindow, createMainWindow: create } = require('./windowManager')
  if (!getMainWindow()) create()
})
