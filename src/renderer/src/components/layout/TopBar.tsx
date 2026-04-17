import React from 'react'
import { useLocation } from 'react-router-dom'
import { Circle } from 'lucide-react'
import { useRecordingStore } from '@/store/recordingStore'
import { formatDuration } from '@/lib/utils'

export function TopBar(): React.ReactElement {
  const location = useLocation()
  const { state, elapsedMs, stepCount } = useRecordingStore()

  const isRecording = state === 'recording' || state === 'paused'

  const title = (() => {
    if (location.pathname === '/') return 'All Guides'
    if (location.pathname === '/settings') return 'Settings'
    if (location.pathname.startsWith('/document/')) return 'Guide'
    return 'SOP Builder'
  })()

  return (
    <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-5 flex-shrink-0">
      <h1 className="text-sm font-semibold text-slate-700">{title}</h1>

      {isRecording && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 px-3 py-1.5 rounded-full">
          <Circle className="w-2.5 h-2.5 fill-red-500 text-red-500 record-dot" />
          <span className="text-xs font-medium text-red-700">
            {state === 'paused' ? 'Paused' : 'Recording'} · {formatDuration(elapsedMs)}
          </span>
          <span className="text-xs text-red-500">{stepCount} step{stepCount !== 1 ? 's' : ''}</span>
        </div>
      )}
    </header>
  )
}
