import React, { useEffect } from 'react'
import { Square, Pause, Play, Circle } from 'lucide-react'
import { recording as recordingApi } from '@/lib/ipc'
import { useRecordingStore } from '@/store/recordingStore'
import { formatDuration } from '@/lib/utils'
import type { RecordingStateChangedPayload } from '../../../../shared/types'

export function RecordingOverlay(): React.ReactElement {
  const { state, elapsedMs, stepCount, setState, setElapsedMs, setStepCount } = useRecordingStore()

  useEffect(() => {
    const unsub = recordingApi.onStateChanged((p: RecordingStateChangedPayload) => {
      setState(p.state)
      setElapsedMs(p.elapsedMs)
      setStepCount(p.stepCount)
    })
    return unsub
  }, [setState, setElapsedMs, setStepCount])

  const handleStop = () => recordingApi.stop()
  const handleTogglePause = () => {
    if (state === 'paused') recordingApi.resume()
    else recordingApi.pause()
  }

  return (
    <div className="flex items-center gap-2 bg-gray-900/95 backdrop-blur rounded-2xl px-4 py-3 h-full shadow-2xl border border-white/10">
      {/* Red dot */}
      <Circle className={`w-3 h-3 fill-red-500 text-red-500 flex-shrink-0 ${state === 'recording' ? 'record-dot' : ''}`} />

      {/* Timer + steps */}
      <div className="flex flex-col min-w-0">
        <span className="text-white text-sm font-mono font-semibold">{formatDuration(elapsedMs)}</span>
        <span className="text-gray-400 text-xs">{stepCount} step{stepCount !== 1 ? 's' : ''}</span>
      </div>

      {/* Pause/Resume */}
      <button
        onClick={handleTogglePause}
        className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
        title={state === 'paused' ? 'Resume' : 'Pause'}
      >
        {state === 'paused' ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
      </button>

      {/* Stop */}
      <button
        onClick={handleStop}
        className="w-8 h-8 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white transition-colors"
        title="Stop recording"
      >
        <Square className="w-3.5 h-3.5 fill-white" />
      </button>
    </div>
  )
}
