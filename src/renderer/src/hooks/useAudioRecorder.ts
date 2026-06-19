import { useRef, useCallback, useEffect } from 'react'
import { IPC } from '@shared/ipcChannels'

export interface AudioRecorderControls {
  /** Returns true if the microphone started successfully, false if permission was denied. */
  start: (projectId: string) => Promise<boolean>
  stop: (projectId: string, startedAt: number) => Promise<void>
  mute: () => void
  unmute: () => void
}

export function useAudioRecorder(): AudioRecorderControls {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const projectIdRef = useRef<string | null>(null)

  // Listen for mute state changes from the main process (triggered by the overlay)
  useEffect(() => {
    const unsub = window.api.on(IPC.AUDIO_MUTE_STATE, (payload: unknown) => {
      const { muted } = payload as { muted: boolean }
      if (streamRef.current) {
        streamRef.current.getAudioTracks().forEach((t) => { t.enabled = !muted })
      }
    })
    return unsub
  }, [])

  const start = useCallback(async (projectId: string): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      streamRef.current = stream
      projectIdRef.current = projectId

      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
      mediaRecorderRef.current = mr

      mr.ondataavailable = async (e) => {
        if (e.data.size === 0) return
        const buf = await e.data.arrayBuffer()
        window.api.invoke(IPC.AUDIO_CHUNK, projectId, buf).catch(() => {/* silent */})
      }

      mr.start(1000)
      return true
    } catch (err) {
      console.warn('useAudioRecorder: getUserMedia failed', err)
      return false
    }
  }, [])

  const stop = useCallback(async (projectId: string, startedAt: number): Promise<void> => {
    const mr = mediaRecorderRef.current
    if (mr && mr.state !== 'inactive') {
      await new Promise<void>((resolve) => {
        mr.onstop = () => resolve()
        mr.stop()
      })
      // Chrome fires one final ondataavailable synchronously before onstop, but the
      // handler is async (arrayBuffer() + IPC). Wait a tick so those in-flight
      // promises can dispatch their AUDIO_CHUNK before we close the session.
      await new Promise((r) => setTimeout(r, 150))
    }
    mediaRecorderRef.current = null

    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    projectIdRef.current = null

    await window.api.invoke(IPC.AUDIO_RECORDING_STOP, { projectId, startedAt })
  }, [])

  const mute = useCallback((): void => {
    streamRef.current?.getAudioTracks().forEach((t) => { t.enabled = false })
  }, [])

  const unmute = useCallback((): void => {
    streamRef.current?.getAudioTracks().forEach((t) => { t.enabled = true })
  }, [])

  return { start, stop, mute, unmute }
}
