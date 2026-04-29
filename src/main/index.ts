import { app, globalShortcut, protocol } from 'electron'
import { initDatabase, closeDatabase } from './database/connection'
import { createMainWindow, registerImageProtocol } from './windowManager'
import { registerAllIpcHandlers } from './ipc/index'
import { recordingSession } from './recordingSession'
import { logger } from './utils/logger'
import { IMG_PROTOCOL } from '@shared/constants'
import { installContentSecurityPolicy } from './security/csp'
import { wipeAllTracked } from './security/memoryGuard'
import { shutdownRedactor } from './security/redaction'
import { logNetworkConfig } from './security/network'

// Required for native modules on some Linux setups
if (process.platform === 'linux') {
  app.disableHardwareAcceleration()
}

// Force a single application instance — multiple instances would each hold
// the same encryption key in memory and race on the SQLite WAL file.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

// Disable telemetry and crash reporter — confidential financial data must not
// be uploaded to Google or any other crash service.
app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors')
app.setAppUserModelId('com.sopbuilder.app')

// Register custom image protocol before app is ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: IMG_PROTOCOL,
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: false,
      // The renderer never needs to read these as a stream / fetch object —
      // it only references them via <img src>. Drop fetch support to shrink
      // the attack surface.
      bypassCSP: false,
      corsEnabled: false
    }
  }
])

app.on('ready', async () => {
  try {
    initDatabase()
    // CSP must be installed before any window is created so the bootstrap
    // HTML is also covered.
    installContentSecurityPolicy()
    registerImageProtocol()
    registerAllIpcHandlers()
    createMainWindow()
    logNetworkConfig()

    // Global shortcut: Ctrl+Shift+R = stop recording if active
    globalShortcut.register('CommandOrControl+Shift+R', async () => {
      if (recordingSession.state === 'recording' || recordingSession.state === 'paused') {
        await recordingSession.stop()
      }
    })

    logger.info('App started successfully (hardened mode)')
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
  await shutdownRedactor().catch(() => {})
  // Zero every tracked secure buffer / string before the process exits.
  wipeAllTracked()
  closeDatabase()
})

// Refuse <webview> tags entirely (defense in depth — also handled per-window).
app.on('web-contents-created', (_e, contents) => {
  contents.on('will-attach-webview', (event) => event.preventDefault())
})

app.on('activate', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getMainWindow, createMainWindow: create } = require('./windowManager')
  if (!getMainWindow()) create()
})
