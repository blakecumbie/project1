import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type IpcChannel } from '../shared/ipcChannels'

const ALLOWED_CHANNELS = new Set<string>(Object.values(IPC))

const api = {
  invoke: <T>(channel: IpcChannel, ...args: unknown[]): Promise<T> => {
    if (!ALLOWED_CHANNELS.has(channel)) throw new Error(`Channel not allowed: ${channel}`)
    return ipcRenderer.invoke(channel, ...args)
  },

  on: (channel: IpcChannel, callback: (...args: unknown[]) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, ...args: unknown[]) => callback(...args)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  },

  once: (channel: IpcChannel, callback: (...args: unknown[]) => void): void => {
    ipcRenderer.once(channel, (_, ...args) => callback(...args))
  },

  channels: IPC
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
