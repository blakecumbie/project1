import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { useProjectStore } from '@/store/projectStore'
import { ProjectCard } from '@/components/dashboard/ProjectCard'
import { EmptyState } from '@/components/dashboard/EmptyState'
import { RecordingSetup } from '@/components/recording/RecordingSetup'

export function DashboardPage(): React.ReactElement {
  const { projects, isLoadingProjects, loadProjects, deleteProject } = useProjectStore()
  const [search, setSearch] = useState('')
  const [showSetup, setShowSetup] = useState(false)
  const [setupProjectId, setSetupProjectId] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => { loadProjects() }, [loadProjects])

  const filtered = search
    ? projects.filter((p) => p.title.toLowerCase().includes(search.toLowerCase()))
    : projects

  const handleDelete = async (id: string) => {
    if (confirm('Delete this guide and all its steps?')) {
      await deleteProject(id)
    }
  }

  if (isLoadingProjects) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (projects.length === 0 && !search) {
    return (
      <>
        <EmptyState />
        {showSetup && setupProjectId && (
          <RecordingSetup projectId={setupProjectId} onClose={() => setShowSetup(false)} />
        )}
      </>
    )
  }

  return (
    <div className="p-6">
      <div className="max-w-5xl mx-auto">
        {/* Search bar */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search guides…"
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
          />
        </div>

        {/* Grid */}
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <p>No guides match "{search}"</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 relative">
            {filtered.map((project) => (
              <div key={project.id} className="relative">
                <ProjectCard project={project} onDelete={handleDelete} />
              </div>
            ))}
          </div>
        )}
      </div>

      {showSetup && setupProjectId && (
        <RecordingSetup projectId={setupProjectId} onClose={() => setShowSetup(false)} />
      )}
    </div>
  )
}
