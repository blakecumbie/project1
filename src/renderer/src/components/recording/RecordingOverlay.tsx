import React, { useEffect } from 'react'
import { Square, Pause, Play, Circle, Minus } from 'lucide-react'
import { recording as recordingApi } from '@/lib/ipc'
import { useRecordingStore } from '@/store/recordingStore'
import { formatDuration } from '@/lib/utils'
import type { RecordingStateChangedPayload } from '../../../../shared/types'

export function RecordingOverlay(): React.ReactElement {
  const { state, elapsedMs, stepCount, setState, setElapsedMs, setStepCount } = useRecordingStore()

  useEffect(() => {
    const unsubState = recordingApi.onStateChanged((p: RecordingStateChangedPayload) => {
      setState(p.state)
      setElapsedMs(p.elapsedMs)
      setStepCount(p.stepCount)
    })
    // 1Hz tick from the main process — the only thing that drives the
    // stopwatch between state transitions.
    const unsubTick = recordingApi.onTick(({ elapsedMs: ms, stepCount: n }) => {
      setElapsedMs(ms)
      setStepCount(n)
    })
    // Per-step bumps so the counter updates the instant a step is captured,
    // without waiting for the next 1Hz tick.
    const unsubStep = recordingApi.onStepCaptured(() => {
      setStepCount(useRecordingStore.getState().stepCount + 1)
    })
    return () => {
      unsubState()
      unsubTick()
      unsubStep()
    }
  }, [setState, setElapsedMs, setStepCount])

  const handleStop = (): void => void recordingApi.stop()
  const handleMinimize = (): void => void recordingApi.minimizeOverlay()
  const handleTogglePause = (): void => {
    if (state === 'paused') void recordingApi.resume()
    else void recordingApi.pause()
  }

  return (
    // The outer wrapper is the drag region — clicking and holding anywhere on
    // the dark pill (except on a button) lets the user drag the overlay.
    // `app-region: drag` is Chromium's mechanism for moving frameless windows.
    <div
      className="flex items-center gap-2 bg-gray-900/95 backdrop-blur rounded-2xl px-4 py-3 h-full shadow-2xl border border-white/10 select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Red dot */}
      <Circle className={`w-3 h-3 fill-red-500 text-red-500 flex-shrink-0 ${state === 'recording' ? 'record-dot' : ''}`} />

      {/* Timer + steps */}
      <div className="flex flex-col min-w-0">
        <span className="text-white text-sm font-mono font-semibold">{formatDuration(elapsedMs)}</span>
        <span className="text-gray-400 text-xs">{stepCount} step{stepCount !== 1 ? 's' : ''}</span>
      </div>

      {/* Pause/Resume — buttons opt out of the drag region so clicks register. */}
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
