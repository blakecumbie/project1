import { BrowserWindow, screen, shell, protocol, app } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { OVERLAY_WIDTH, OVERLAY_HEIGHT, IMG_PROTOCOL } from '@shared/constants'
import { resolveImagePath } from './utils/fileStore'

let mainWindow: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null

export function registerImageProtocol(): void {
  protocol.registerFileProtocol(IMG_PROTOCOL, (request, callback) => {
    const url = request.url.replace(`${IMG_PROTOCOL}://`, '')
    const safePath = resolveImagePath(decodeURIComponent(url))
    callback({ path: safePath })
  })
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
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

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
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  overlayWindow.setAlwaysOnTop(true, 'screen-saver')

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    overlayWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/overlay`)
  } else {
    overlayWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/overlay' })
  }

  overlayWindow.on('closed', () => { overlayWindow = null })

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
