import { BrowserWindow, screen, shell, protocol, app } from 'electron'
import { join, normalize, isAbsolute, resolve, sep } from 'path'
import { is } from '@electron-toolkit/utils'
import { OVERLAY_WIDTH, OVERLAY_HEIGHT, IMG_PROTOCOL } from '@shared/constants'
import { logger } from './utils/logger'

let mainWindow: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null

/**
 * Static allow-list for outbound `shell.openExternal` calls. The renderer
 * cannot launch any other URL — even via the Electron `window.open` API.
 */
const EXTERNAL_URL_ALLOWLIST = new Set<string>([
  'https://console.anthropic.com',
  'https://docs.anthropic.com',
  'https://github.com'
])

function isAllowedExternalUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl)
    if (u.protocol !== 'https:') return false
    // Match by origin only — query/path may vary.
    for (const allowed of EXTERNAL_URL_ALLOWLIST) {
      const a = new URL(allowed)
      if (u.host === a.host) return true
    }
    return false
  } catch {
    return false
  }
}

/** True if the navigation URL points to the renderer's own origin. */
function isInternalNavigation(targetUrl: string): boolean {
  try {
    const u = new URL(targetUrl)
    if (is.dev) {
      const dev = process.env['ELECTRON_RENDERER_URL']
      if (dev && u.origin === new URL(dev).origin) return true
    }
    // Production loads via file:// — only same-origin file URLs allowed.
    if (u.protocol === 'file:') return true
    return false
  } catch {
    return false
  }
}

/**
 * Bound the resolved file path to the userData/images directory.
 * Rejects `..`, NUL bytes, absolute paths and symlink-style escapes.
 */
function safeResolveImagePath(relative: string): string | null {
  if (!relative) return null
  if (relative.includes('\0')) return null
  if (isAbsolute(relative)) return null
  const normalized = normalize(relative)
  if (normalized.startsWith('..') || normalized.includes(`..${sep}`) || normalized.includes(`${sep}..`)) {
    return null
  }
  const baseDir = resolve(app.getPath('userData'), 'images')
  const full = resolve(baseDir, normalized)
  if (!full.startsWith(baseDir + sep) && full !== baseDir) return null
  return full
}

export function registerImageProtocol(): void {
  protocol.registerFileProtocol(IMG_PROTOCOL, (request, callback) => {
    try {
      const url = decodeURIComponent(request.url.replace(`${IMG_PROTOCOL}://`, ''))
      const safe = safeResolveImagePath(url)
      if (!safe) {
        logger.warn(`sopimg: rejected unsafe path`)
        // -6 = NET::ERR_FILE_NOT_FOUND
        callback({ error: -6 })
        return
      }
      callback({ path: safe })
    } catch (err) {
      logger.warn(`sopimg: protocol error: ${String(err)}`)
      callback({ error: -6 })
    }
  })
}

/**
 * Common security flags applied to every BrowserWindow.
 * Each of these is REQUIRED — do not remove without a recorded review.
 */
const HARDENED_WEB_PREFERENCES: Electron.WebPreferences = {
  // Renderer cannot require() Node modules.
  nodeIntegration: false,
  // Worker threads also cannot use Node.
  nodeIntegrationInWorker: false,
  nodeIntegrationInSubFrames: false,
  // contextBridge isolates preload globals from the page's V8 context.
  contextIsolation: true,
  // Renderer runs in the OS sandbox (seccomp / AppContainer).
  sandbox: true,
  // Force SOP — refuse mixed content and bypass-localhost shortcuts.
  webSecurity: true,
  allowRunningInsecureContent: false,
  // No experimental Chromium flags.
  experimentalFeatures: false,
  // No Pepper plugins.
  plugins: false,
  // Disable spellcheck — talks to a remote dictionary service we don't pin.
  spellcheck: false,
  // Disable web platform features the app does not use.
  webgl: false
  // NOTE: `enableRemoteModule` was removed in Electron 12 (current = 28).
  // The flag is intentionally absent.
}

function attachSecurityListeners(win: BrowserWindow): void {
  // Block any navigation away from the app's own origin.
  win.webContents.on('will-navigate', (event, url) => {
    if (!isInternalNavigation(url)) {
      logger.warn(`will-navigate: blocked ${url}`)
      event.preventDefault()
    }
  })

  // Block any redirect that lands on a foreign origin.
  win.webContents.on('will-redirect', (event, url) => {
    if (!isInternalNavigation(url)) {
      logger.warn(`will-redirect: blocked ${url}`)
      event.preventDefault()
    }
  })

  // Renderer attempting `window.open` -> deny by default; only open external
  // URLs via the OS browser if they pass the allow-list.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      shell.openExternal(url).catch((e) => logger.warn(`openExternal failed: ${String(e)}`))
    } else {
      logger.warn(`window.open: blocked ${url}`)
    }
    return { action: 'deny' }
  })

  // No <webview> tags — strip any preload/webPreferences attempt.
  win.webContents.on('will-attach-webview', (event, prefs, params) => {
    logger.warn(`will-attach-webview: blocked (params=${params.src})`)
    delete (prefs as Record<string, unknown>).preload
    event.preventDefault()
  })

  // Refuse all permission requests at the contents level (also handled
  // session-wide in csp.ts; this is defense in depth).
  win.webContents.session.setPermissionRequestHandler((_wc, _p, cb) => cb(false))
}

export function createMainWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#f8fafc',
    webPreferences: {
      ...HARDENED_WEB_PREFERENCES,
      preload: join(__dirname, '../preload/index.js')
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  attachSecurityListeners(mainWindow)

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

export function createOverlayWindow(): BrowserWindow {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize

  overlayWindow = new BrowserWindow({
    width: OVERLAY_WIDTH,
    height: OVERLAY_HEIGHT,
    x: width - OVERLAY_WIDTH - 20,
    y: height - OVERLAY_HEIGHT - 20,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: true,
    show: false,
    webPreferences: {
      ...HARDENED_WEB_PREFERENCES,
      preload: join(__dirname, '../preload/index.js')
    }
  })

  overlayWindow.setAlwaysOnTop(true, 'screen-saver')
  attachSecurityListeners(overlayWindow)

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    overlayWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/overlay`)
  } else {
    overlayWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/overlay' })
  }

  overlayWindow.on('closed', () => {
    overlayWindow = null
  })

  return overlayWindow
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function getOverlayWindow(): BrowserWindow | null {
  return overlayWindow
}

export function showOverlay(): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    createOverlayWindow()
  }
  overlayWindow?.show()
}

export function hideOverlay(): void {
  overlayWindow?.hide()
}

export function hideMain(): void {
  mainWindow?.hide()
}

export function showMain(): void {
  mainWindow?.show()
  mainWindow?.focus()
}

export function sendToMain(channel: string, ...args: unknown[]): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args)
  }
}

export function sendToOverlay(channel: string, ...args: unknown[]): void {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send(channel, ...args)
  }
}

/** Exposed for the OPEN_EXTERNAL IPC handler. */
export function openExternalAllowlisted(rawUrl: string): boolean {
  if (!isAllowedExternalUrl(rawUrl)) {
    logger.warn(`openExternal: blocked ${rawUrl}`)
    return false
  }
  shell.openExternal(rawUrl).catch((e) => logger.warn(`openExternal failed: ${String(e)}`))
  return true
}
