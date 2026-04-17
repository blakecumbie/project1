import React, { useState, useRef, useEffect } from 'react'
import { Download, Sparkles, Loader2, RotateCcw } from 'lucide-react'
import { useProjectStore } from '@/store/projectStore'
import { ai as aiApi } from '@/lib/ipc'
import type { Project } from '../../../../shared/types'

interface Props {
  project: Project
  onExport: () => void
}

export function DocumentHeader({ project, onExport }: Props): React.ReactElement {
  const { updateProjectTitle, aiProgress } = useProjectStore()
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(project.title)
  const [isGenerating, setIsGenerating] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setTitle(project.title) }, [project.title])

  useEffect(() => {
    if (aiProgress && aiProgress.projectId === project.id) {
      setIsGenerating(aiProgress.completed < aiProgress.total)
    }
  }, [aiProgress, project.id])

  const commitTitle = async () => {
    setEditing(false)
    if (title.trim() && title !== project.title) {
      await updateProjectTitle(project.id, title.trim())
    } else {
      setTitle(project.title)
    }
  }

  const handleGenerateAll = async () => {
    setIsGenerating(true)
    await aiApi.generateAll(project.id)
  }

  const handleCancelAi = async () => {
    await aiApi.cancel(project.id)
    setIsGenerating(false)
  }

  return (
    <div className="bg-white border-b border-slate-200 px-8 py-5">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {editing ? (
              <input
                ref={inputRef}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => { if (e.key === 'Enter') commitTitle(); if (e.key === 'Escape') { setTitle(project.title); setEditing(false) } }}
                className="text-2xl font-bold text-slate-800 bg-transparent border-b-2 border-sky-400 outline-none w-full"
                autoFocus
              />
            ) : (
              <h1
                className="text-2xl font-bold text-slate-800 cursor-text hover:text-sky-700 transition-colors truncate"
                onClick={() => { setEditing(true); setTimeout(() => inputRef.current?.select(), 10) }}
                title="Click to rename"
              >
                {project.title}
              </h1>
            )}
            <p className="text-sm text-slate-500 mt-1">
              {project.stepCount} step{project.stepCount !== 1 ? 's' : ''}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {isGenerating ? (
              <button
                onClick={handleCancelAi}
                className="flex items-center gap-2 btn-secondary text-orange-600 border-orange-200"
              >
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating…
              </button>
            ) : (
              <button
                onClick={handleGenerateAll}
                className="flex items-center gap-2 btn-secondary"
                title="Generate AI descriptions for all steps"
              >
                <Sparkles className="w-4 h-4 text-violet-500" />
                AI Descriptions
              </button>
            )}

            <button onClick={onExport} className="btn-primary flex items-center gap-2">
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>
        </div>

        {/* AI progress bar */}
        {aiProgress && aiProgress.projectId === project.id && aiProgress.total > 0 && isGenerating && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
              <span className="flex items-center gap-1.5"><Sparkles className="w-3 h-3 text-violet-500" /> Generating descriptions with AI…</span>
              <span>{aiProgress.completed} / {aiProgress.total}</span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-violet-500 to-sky-500 rounded-full transition-all duration-500"
                style={{ width: `${(aiProgress.completed / aiProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
