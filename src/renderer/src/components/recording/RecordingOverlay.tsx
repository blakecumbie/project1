import React, { useEffect, useState } from 'react'
import { Square, Pause, Play, Circle, Minus, Mic, MicOff } from 'lucide-react'
import { recording as recordingApi } from '@/lib/ipc'
import { useRecordingStore } from '@/store/recordingStore'
import { formatDuration } from '@/lib/utils'
import type { RecordingStateChangedPayload } from '@shared/types'
import { IPC } from '@shared/ipcChannels'

export function RecordingOverlay(): React.ReactElement {
  const { state, elapsedMs, setState, setElapsedMs } = useRecordingStore()
  const [voiceEnabled, setVoiceEnabled] = useState(false)
  const [voiceMuted, setVoiceMuted] = useState(false)

  useEffect(() => {
    const unsubState = recordingApi.onStateChanged((p: RecordingStateChangedPayload) => {
      setState(p.state)
      setElapsedMs(p.elapsedMs)
      setVoiceEnabled(p.voiceEnabled ?? false)
      setVoiceMuted(p.voiceMuted ?? false)
    })
    // 1Hz tick from the main process — drives the stopwatch between transitions.
    const unsubTick = recordingApi.onTick(({ elapsedMs: ms }) => {
      setElapsedMs(ms)
    })
    // Mute state sync (main process echoes back after toggle)
    const unsubMute = window.api.on(IPC.AUDIO_MUTE_STATE, (p: unknown) => {
      setVoiceMuted((p as { muted: boolean }).muted)
    })
    return () => {
      unsubState()
      unsubTick()
      unsubMute()
    }
  }, [setState, setElapsedMs])

  const handleStop = (): void => void recordingApi.stop()
  const handleMinimize = (): void => void recordingApi.minimizeOverlay()
  const handleTogglePause = (): void => {
    if (state === 'paused') void recordingApi.resume()
    else void recordingApi.pause()
  }
  const handleToggleMute = (): void => {
    window.api.invoke(IPC.AUDIO_MUTE_TOGGLE).catch(() => {/* silent */})
  }

  return (
    <div className="flex items-center gap-2 bg-gray-900/95 backdrop-blur rounded-2xl px-3 py-3 h-full shadow-2xl border border-white/10 select-none">
      {/*
        Only this status area is the drag region. The control buttons are kept
        OUTSIDE any `-webkit-app-region: drag` element — on a frameless,
        transparent window a drag region that *wraps* its buttons swallows their
        mouse events, which is why Pause/Stop appeared dead. Buttons that are
        siblings of (not descendants of) the drag region click normally.
      */}
      <div
        className="flex items-center gap-2 flex-1 min-w-0 pl-1 cursor-move"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <Circle
          className={`w-3 h-3 fill-red-500 text-red-500 flex-shrink-0 ${state === 'recording' ? 'record-dot' : ''}`}
        />
        <span className="text-white text-sm font-mono font-semibold">{formatDuration(elapsedMs)}</span>
        {state === 'paused' && <span className="text-amber-300 text-xs font-medium">Paused</span>}
      </div>

      {/* Mic mute toggle — only when voice recording is active */}
      {voiceEnabled && (
        <button
          onClick={handleToggleMute}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          className={`w-8 h-8 rounded-full flex items-center justify-center text-white transition-colors ${
            voiceMuted ? 'bg-red-500/80 hover:bg-red-600' : 'bg-white/10 hover:bg-white/20'
          }`}
          title={voiceMuted ? 'Unmute microphone' : 'Mute microphone'}
        >
          {voiceMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
        </button>
      )}

      {/* Pause / Resume */}
      <button
        onClick={handleTogglePause}
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
        title={state === 'paused' ? 'Resume' : 'Pause'}
      >
        {state === 'paused' ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
      </button>

      {/* Minimize */}
      <button
        onClick={handleMinimize}
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
        title="Minimize to taskbar"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>

      {/* Stop */}
      <button
        onClick={handleStop}
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        className="w-8 h-8 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white transition-colors"
        title="Stop recording"
      >
        <Square className="w-3.5 h-3.5 fill-white" />
      </button>
    </div>
  )
}
