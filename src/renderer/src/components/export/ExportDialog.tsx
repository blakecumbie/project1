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

export function ExportDialog({ project, onClose }: Props): React.ReactElement {
  const [format, setFormat] = useState<Format>('pdf')
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

    const payload = { projectId: project.id, outputPath, options: { includeStepNumbers: true, screenshotMaxWidth: 800 } }
    const res = format === 'pdf' ? await exportApi.pdf(payload)
               : format === 'html' ? await exportApi.html(payload)
               : await exportApi.markdown(payload)

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

        <div className="p-5 space-y-3">
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
