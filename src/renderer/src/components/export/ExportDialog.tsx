import React, { useState } from 'react'
import { X, FileText, FileCode, Hash, Download, Loader2, FolderOpen } from 'lucide-react'
import { exportApi } from '@/lib/ipc'
import type { Project } from '../../../../shared/types'

interface Props {
  project: Project
  onClose: () => void
}

type Format = 'pdf' | 'html' | 'markdown'

const FORMATS = [
  { id: 'pdf' as Format, icon: FileText, label: 'PDF Document', desc: 'Polished, printable guide with embedded screenshots' },
  { id: 'html' as Format, icon: FileCode, label: 'HTML File', desc: 'Self-contained web page, works offline' },
  { id: 'markdown' as Format, icon: Hash, label: 'Markdown', desc: 'Folder with README.md and images directory' }
]

const DENSITY_OPTIONS = [
  { value: 1, label: 'Spacious', desc: '1 step per page' },
  { value: 2, label: 'Normal', desc: '2 steps per page' },
  { value: 3, label: 'Compact', desc: '3 steps per page' },
  { value: 4, label: 'Dense', desc: '4 steps per page' }
]

export function ExportDialog({ project, onClose }: Props): React.ReactElement {
  const [format, setFormat] = useState<Format>('pdf')
  const [stepsPerPage, setStepsPerPage] = useState(2)
  const [isExporting, setIsExporting] = useState(false)
  const [lastOutput, setLastOutput] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleExport = async () => {
    setError(null)
    const dialogResult = await exportApi.showSaveDialog({
      title: 'Export Guide',
      defaultPath: `${project.title.replace(/[^a-z0-9]/gi, '-')}${format === 'markdown' ? '' : `.${format}`}`,
      filters:
        format === 'pdf' ? [{ name: 'PDF', extensions: ['pdf'] }]
        : format === 'html' ? [{ name: 'HTML', extensions: ['html'] }]
        : [{ name: 'Folder', extensions: [] }]
    })

    if (dialogResult.data?.canceled || !dialogResult.data?.filePath) return

    setIsExporting(true)
    const outputPath = dialogResult.data.filePath

    const options = { includeStepNumbers: true, screenshotMaxWidth: 800, stepsPerPage }
    const res = format === 'pdf' ? await exportApi.pdf({ projectId: project.id, outputPath, options })
               : format === 'html' ? await exportApi.html({ projectId: project.id, outputPath, options })
               : await exportApi.markdown({ projectId: project.id, outputPath, options })

    setIsExporting(false)

    if (res.error) {
      setError(res.error)
    } else {
      setLastOutput(outputPath)
    }
  }

  const openFile = () => {
    if (lastOutput) exportApi.openItem(lastOutput)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h2 className="font-semibold text-slate-800">Export Guide</h2>
            <p className="text-xs text-slate-500 truncate max-w-xs">{project.title}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Format selection */}
          <div className="space-y-2">
            {FORMATS.map(({ id, icon: Icon, label, desc }) => (
              <label
                key={id}
                className={`flex items-start gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${format === id ? 'border-sky-400 bg-sky-50' : 'border-slate-200 hover:border-slate-300'}`}
              >
                <input type="radio" name="format" value={id} checked={format === id} onChange={() => setFormat(id)} className="sr-only" />
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${format === id ? 'bg-sky-500' : 'bg-slate-100'}`}>
                  <Icon className={`w-4 h-4 ${format === id ? 'text-white' : 'text-slate-500'}`} />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800">{label}</p>
                  <p className="text-xs text-slate-500">{desc}</p>
                </div>
              </label>
            ))}
          </div>

          {/* Density selector — shown only for PDF */}
          {format === 'pdf' && (
            <div className="rounded-xl border border-slate-200 p-3.5">
              <p className="text-xs font-semibold text-slate-600 mb-2.5 uppercase tracking-wide">Page density</p>
              <div className="grid grid-cols-4 gap-2">
                {DENSITY_OPTIONS.map(({ value, label, desc }) => (
                  <button
                    key={value}
                    onClick={() => setStepsPerPage(value)}
                    className={`flex flex-col items-center gap-1 py-2 px-1 rounded-lg border-2 text-center transition-all ${
                      stepsPerPage === value
                        ? 'border-sky-400 bg-sky-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {/* Mini page preview */}
                    <div className="w-8 h-10 bg-slate-100 rounded border border-slate-200 flex flex-col gap-0.5 p-0.5 overflow-hidden">
                      {Array.from({ length: value }).map((_, i) => (
                        <div key={i} className={`flex-1 rounded-sm ${stepsPerPage === value ? 'bg-sky-300' : 'bg-slate-300'}`} />
                      ))}
                    </div>
                    <span className={`text-[10px] font-semibold leading-tight ${stepsPerPage === value ? 'text-sky-700' : 'text-slate-500'}`}>
                      {label}
                    </span>
                    <span className="text-[9px] text-slate-400 leading-tight">{desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-200">{error}</p>}

          {lastOutput && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg p-3">
              <span className="text-xs text-green-700 flex-1 truncate">Exported successfully</span>
              <button onClick={openFile} className="flex items-center gap-1.5 text-xs text-green-700 hover:text-green-800 font-medium">
                <FolderOpen className="w-3.5 h-3.5" /> Show file
              </button>
            </div>
          )}
        </div>

        <div className="p-5 pt-0 flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">Close</button>
          <button onClick={handleExport} disabled={isExporting} className="btn-primary flex-1 flex items-center justify-center gap-2">
            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {isExporting ? 'Exporting…' : 'Export'}
          </button>
        </div>
      </div>
    </div>
  )
}
