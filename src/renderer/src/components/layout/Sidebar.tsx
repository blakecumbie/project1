import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Settings, PlusCircle, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/store/projectStore'
import { useRecordingStore } from '@/store/recordingStore'

export function Sidebar(): React.ReactElement {
  const { projects, createProject, setActiveProject } = useProjectStore()
  const recordingState = useRecordingStore((s) => s.state)
  const navigate = useNavigate()

  const handleNewRecording = async () => {
    if (recordingState !== 'idle') return
    const project = await createProject()
    if (project) {
      await setActiveProject(project.id)
      navigate(`/document/${project.id}?new=1`)
    }
  }

  return (
    <aside className="w-56 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col">
      {/* Logo */}
      <div className="h-14 flex items-center px-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-sky-500 flex items-center justify-center">
            <FileText className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-slate-800 text-sm">SOP Builder</span>
        </div>
      </div>

      {/* New recording button */}
      <div className="p-3">
        <button
          onClick={handleNewRecording}
          disabled={recordingState !== 'idle'}
          className="w-full flex items-center gap-2 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors"
        >
          <PlusCircle className="w-4 h-4" />
          New Recording
        </button>
      </div>

      {/* Nav */}
      <nav className="px-2 pb-2">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            cn('flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors', isActive ? 'bg-sky-50 text-sky-700 font-medium' : 'text-slate-600 hover:bg-slate-50')
          }
        >
          <LayoutDashboard className="w-4 h-4" />
          All Guides
        </NavLink>
      </nav>

      {/* Recent projects */}
      {projects.length > 0 && (
        <div className="flex-1 overflow-y-auto px-2">
          <p className="px-3 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wide">Recent</p>
          <div className="space-y-0.5">
            {projects.slice(0, 15).map((p) => (
              <NavLink
                key={p.id}
                to={`/document/${p.id}`}
                className={({ isActive }) =>
                  cn('flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors truncate', isActive ? 'bg-sky-50 text-sky-700' : 'text-slate-600 hover:bg-slate-50')
                }
              >
                <FileText className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{p.title}</span>
              </NavLink>
            ))}
          </div>
        </div>
      )}

      {/* Bottom nav */}
      <div className="p-2 border-t border-slate-100 mt-auto">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn('flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors', isActive ? 'bg-sky-50 text-sky-700' : 'text-slate-600 hover:bg-slate-50')
          }
        >
          <Settings className="w-4 h-4" />
          Settings
        </NavLink>
      </div>
    </aside>
  )
}
