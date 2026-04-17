import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Video, MousePointerClick, FileText, Sparkles } from 'lucide-react'
import { useProjectStore } from '@/store/projectStore'
import { useSettingsStore } from '@/store/settingsStore'

export function EmptyState(): React.ReactElement {
  const navigate = useNavigate()
  const { createProject, setActiveProject } = useProjectStore()
  const { settings } = useSettingsStore()

  const handleStart = async () => {
    const project = await createProject()
    if (project) {
      await setActiveProject(project.id)
      navigate(`/document/${project.id}?new=1`)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center h-full py-20 px-8 text-center">
      <div className="w-16 h-16 rounded-2xl bg-sky-50 flex items-center justify-center mb-5">
        <Video className="w-8 h-8 text-sky-500" />
      </div>

      <h2 className="text-xl font-bold text-slate-800 mb-2">Create your first guide</h2>
      <p className="text-slate-500 text-sm max-w-sm mb-8 leading-relaxed">
        Record your screen while working through any process. SOP Builder captures every click,
        keystroke, and scroll — then generates an AI-written step-by-step guide automatically.
      </p>

      {/* Feature pills */}
      <div className="flex flex-wrap gap-2 justify-center mb-8">
        {[
          { icon: MousePointerClick, label: 'Captures every click' },
          { icon: FileText, label: 'Auto-generates steps' },
          { icon: Sparkles, label: 'AI descriptions' }
        ].map(({ icon: Icon, label }) => (
          <span key={label} className="flex items-center gap-1.5 bg-white border border-slate-200 text-slate-600 text-xs px-3 py-1.5 rounded-full">
            <Icon className="w-3.5 h-3.5 text-sky-500" />
            {label}
          </span>
        ))}
      </div>

      <button onClick={handleStart} className="btn-primary flex items-center gap-2 text-base px-6 py-3">
        <Video className="w-4 h-4" />
        Start Recording
      </button>

      {!settings.anthropicApiKey && (
        <p className="mt-5 text-xs text-amber-600 bg-amber-50 border border-amber-200 px-4 py-2 rounded-lg">
          Add your Anthropic API key in Settings to enable AI descriptions
        </p>
      )}
    </div>
  )
}
