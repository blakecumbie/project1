import React, { useState, useEffect } from 'react'
import { Video, Monitor, X, ChevronDown } from 'lucide-react'
import { recording as recordingApi } from '@/lib/ipc'
import { useProjectStore } from '@/store/projectStore'
import { useSettingsStore } from '@/store/settingsStore'
import type { DisplayInfo } from '../../../../shared/types'

interface Props {
  projectId: string
  onClose: () => void
}

export function RecordingSetup({ projectId, onClose }: Props): React.ReactElement {
  const [displays, setDisplays] = useState<DisplayInfo[]>([])
  const [selectedDisplay, setSelectedDisplay] = useState<string>('')
  const [captureTyping, setCaptureTyping] = useState(true)
  const [captureScrolling, setCaptureScrolling] = useState(true)
  const { settings } = useSettingsStore()

  useEffect(() => {
    recordingApi.getDisplays().then((res) => {
      if (res.data) {
        setDisplays(res.data)
        const primary = res.data.find((d) => d.isPrimary)
        if (primary) setSelectedDisplay(primary.id)
      }
    })
    setCaptureTyping(settings.captureTyping)
    setCaptureScrolling(settings.captureScrolling)
  }, [settings])

  const handleStart = async () => {
    const res = await recordingApi.start({
      projectId,
      displayId: selectedDisplay || undefined,
      captureMouseClicks: true,
      captureTyping,
      captureScrolling,
      screenshotDelay: settings.defaultScreenshotDelay,
      cropRadius: settings.defaultCropRadius
    })
    if (res.data) {
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center">
              <Video className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-800">Start Recording</h2>
              <p className="text-xs text-slate-500">Configure capture settings</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5">
          {/* Display selector */}
          {displays.length > 1 && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                <Monitor className="w-4 h-4 inline mr-1.5" />
                Screen to capture
              </label>
              <div className="relative">
                <select
                  value={selectedDisplay}
                  onChange={(e) => setSelectedDisplay(e.target.value)}
                  className="w-full appearance-none bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 pr-8"
                >
                  {displays.map((d) => (
                    <option key={d.id} value={d.id}>{d.label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
            </div>
          )}

          {/* Options */}
          <div className="space-y-3">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="text-sm font-medium text-slate-700">Capture keyboard input</p>
                <p className="text-xs text-slate-500">Record what you type into fields</p>
              </div>
              <div
                className={`w-10 h-6 rounded-full relative cursor-pointer transition-colors ${captureTyping ? 'bg-sky-500' : 'bg-slate-200'}`}
                onClick={() => setCaptureTyping(!captureTyping)}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${captureTyping ? 'left-5' : 'left-1'}`} />
              </div>
            </label>

            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="text-sm font-medium text-slate-700">Capture scroll events</p>
                <p className="text-xs text-slate-500">Record when you scroll through content</p>
              </div>
              <div
                className={`w-10 h-6 rounded-full relative cursor-pointer transition-colors ${captureScrolling ? 'bg-sky-500' : 'bg-slate-200'}`}
                onClick={() => setCaptureScrolling(!captureScrolling)}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${captureScrolling ? 'left-5' : 'left-1'}`} />
              </div>
            </label>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
            <strong>Tip:</strong> The app will minimize while recording. Click the floating stop button or press{' '}
            <kbd className="bg-amber-100 px-1 rounded">Ctrl+Shift+R</kbd> to stop.
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 pt-0 flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={handleStart} className="btn-primary flex-1 flex items-center justify-center gap-2">
            <Video className="w-4 h-4" />
            Start Recording
          </button>
        </div>
      </div>
    </div>
  )
}
