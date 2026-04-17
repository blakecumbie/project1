import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Trash2, FileText, Calendar, Hash } from 'lucide-react'
import { formatRelative, imgSrc } from '@/lib/utils'
import type { Project } from '../../../../shared/types'

interface Props {
  project: Project
  onDelete: (id: string) => void
}

export function ProjectCard({ project, onDelete }: Props): React.ReactElement {
  const navigate = useNavigate()

  return (
    <div
      className="group bg-white rounded-xl border border-slate-200 overflow-hidden cursor-pointer hover:shadow-md hover:border-sky-200 transition-all duration-200"
      onClick={() => navigate(`/document/${project.id}`)}
    >
      {/* Screenshot thumbnail */}
      <div className="h-36 bg-gradient-to-br from-slate-100 to-slate-200 overflow-hidden relative">
        {project.thumbnailPath ? (
          <img
            src={imgSrc(project.thumbnailPath)}
            alt=""
            className="w-full h-full object-cover object-top"
            draggable={false}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <FileText className="w-10 h-10 text-slate-300" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      {/* Card body */}
      <div className="p-4">
        <h3 className="font-semibold text-slate-800 text-sm truncate mb-1">{project.title}</h3>
        {project.description && (
          <p className="text-xs text-slate-500 truncate mb-2">{project.description}</p>
        )}
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="flex items-center gap-1">
            <Hash className="w-3 h-3" />
            {project.stepCount} step{project.stepCount !== 1 ? 's' : ''}
          </span>
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {formatRelative(project.updatedAt)}
          </span>
        </div>
      </div>

      {/* Delete button */}
      <button
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 w-7 h-7 rounded-full bg-white/90 flex items-center justify-center hover:bg-red-50 hover:text-red-500 text-slate-400 transition-all shadow-sm"
        onClick={(e) => { e.stopPropagation(); onDelete(project.id) }}
        title="Delete guide"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
