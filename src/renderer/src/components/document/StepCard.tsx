import React, { useState, useRef, useEffect } from 'react'
import { Trash2, GripVertical, Loader2, Sparkles, Edit2, Check, X, PencilLine } from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn, actionTypeLabel, imgSrc } from '@/lib/utils'
import { useProjectStore } from '@/store/projectStore'
import { ai as aiApi } from '@/lib/ipc'
import { ScreenshotEditor } from './ScreenshotEditor'
import type { Step } from '../../../../shared/types'

interface Props {
  step: Step
  index: number
  projectTitle: string
}

export function StepCard({ step, index, projectTitle }: Props): React.ReactElement {
  const { updateStep, deleteStep } = useProjectStore()
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState(step.description)
  const [editorOpen, setEditorOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id })

  const style = { transform: CSS.Transform.toString(transform), transition }

  // Keep editText in sync with step.description when not actively editing.
  // Without this, an AI-generated description that arrives after mount leaves
  // editText stale — clicking Edit would show the stale value briefly.
  useEffect(() => {
    if (!isEditing) setEditText(step.description)
  }, [step.description, isEditing])

  const startEdit = () => {
    setEditText(step.description)
    setIsEditing(true)
    setTimeout(() => textareaRef.current?.focus(), 10)
  }

  const commitEdit = () => {
    setIsEditing(false)
    if (editText !== step.description) {
      updateStep(step.id, { description: editText })
    }
  }

  const cancelEdit = () => {
    setIsEditing(false)
    setEditText(step.description)
  }

  const handleRegenerate = () => {
    aiApi.regenerateStep(step.id, projectTitle)
  }

  const handleDelete = () => {
    if (confirm('Delete this step?')) deleteStep(step.id)
  }

  const isAiLoading = step.aiStatus === 'processing'
  const vbW = step.screenshotWidth ?? 900
  const vbH = step.screenshotHeight ?? 600

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className={cn('step-card flex gap-0 animate-fade-in', isDragging && 'opacity-50 shadow-2xl scale-[1.02] z-50')}
      >
        {/* Drag handle + step number */}
        <div className="flex flex-col items-center justify-start gap-2 px-3 pt-4 pb-4 bg-slate-50 border-r border-slate-100 min-w-[52px]">
          <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 p-1">
            <GripVertical className="w-4 h-4" />
          </div>
          <div className="w-7 h-7 rounded-full bg-sky-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {index + 1}
          </div>
          <span className="text-[10px] font-medium text-slate-400 text-center leading-tight bg-white border border-slate-100 rounded px-1 py-0.5">
            {actionTypeLabel(step.actionType)}
          </span>
        </div>

        {/* Main content */}
        <div className="flex flex-col sm:flex-row flex-1 min-w-0">
          {/* Screenshot */}
          <div className="sm:w-80 flex-shrink-0 bg-slate-50 flex items-center justify-center p-3 border-b sm:border-b-0 sm:border-r border-slate-100">
            {step.screenshotPath ? (
              <div className="relative rounded-lg overflow-hidden border border-slate-200 shadow-sm w-full">
                <img
                  src={imgSrc(step.screenshotPath)}
                  alt={`Step ${index + 1} screenshot`}
                  className="w-full h-auto block"
                  draggable={false}
                />
                {/* All annotations (including click_dot) rendered in SVG so coords scale with image */}
                {step.annotations.length > 0 && (
                  <svg
                    className="absolute inset-0 w-full h-full pointer-events-none"
                    viewBox={`0 0 ${vbW} ${vbH}`}
                    preserveAspectRatio="none"
                  >
                    {step.annotations.map((a) => {
                      if (a.type === 'highlight') {
                        return (
                          <rect
                            key={a.id}
                            x={a.x} y={a.y} width={a.width} height={a.height}
                            fill={a.color} opacity={a.opacity}
                          />
                        )
                      }
                      if (a.type === 'draw' && a.points.length >= 2) {
                        const d = a.points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ')
                        return (
                          <path
                            key={a.id} d={d}
                            stroke={a.color} strokeWidth={a.strokeWidth}
                            strokeOpacity={a.opacity} fill="none"
                            strokeLinecap="round" strokeLinejoin="round"
                          />
                        )
                      }
                      if (a.type === 'click_dot') {
                        // Dot radius in viewBox units — slightly larger for better visibility
                        const r = Math.max(8, Math.round(vbW * 0.014))
                        const opacity = a.opacity ?? 0.75
                        return (
                          <g key={a.id}>
                            {/* Pulse ring (animated via SMIL — preserves animation in SVG) */}
                            <circle cx={a.x} cy={a.y} r={r} fill={a.color} opacity={0.35}>
                              <animate
                                attributeName="r"
                                values={`${r};${r * 1.8};${r}`}
                                dur="1.6s"
                                repeatCount="indefinite"
                              />
                              <animate
                                attributeName="opacity"
                                values="0.35;0;0.35"
                                dur="1.6s"
                                repeatCount="indefinite"
                              />
                            </circle>
                            {/* Solid dot */}
                            <circle
                              cx={a.x} cy={a.y} r={r}
                              fill={a.color} opacity={opacity}
                              stroke="white" strokeWidth={Math.max(2, r * 0.25)}
                            />
                          </g>
                        )
                      }
                      return null
                    })}
                  </svg>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center w-full h-24 bg-slate-100 rounded-lg border border-dashed border-slate-300">
                <span className="text-xs text-slate-400">No screenshot</span>
              </div>
            )}
          </div>

          {/* Description */}
          <div className="flex-1 p-4 flex flex-col justify-between min-w-0">
            <div className="flex-1">
              {isEditing ? (
                <div>
                  <textarea
                    ref={textareaRef}
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        e.preventDefault()
                        cancelEdit()
                      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault()
                        commitEdit()
                      }
                    }}
                    rows={4}
                    className="w-full text-sm text-slate-700 bg-slate-50 border border-sky-300 rounded-lg p-3 resize-none outline-none focus:ring-2 focus:ring-sky-200"
                    placeholder="Describe this step…"
                  />
                  <div className="flex items-center gap-2 mt-2">
                    <button onClick={commitEdit} className="flex items-center gap-1.5 btn-primary py-1.5 px-3 text-xs">
                      <Check className="w-3 h-3" /> Save
                    </button>
                    <button onClick={cancelEdit} className="flex items-center gap-1.5 btn-secondary py-1.5 px-3 text-xs">
                      <X className="w-3 h-3" /> Cancel
                    </button>
                    <span className="text-[10px] text-slate-400 ml-1">Ctrl+Enter to save · Esc to cancel</span>
                  </div>
                </div>
              ) : (
                <div
                  onDoubleClick={startEdit}
                  className="group/desc relative cursor-text"
                  title="Double-click to edit"
                >
                  {isAiLoading ? (
                    <div className="space-y-2">
                      <div className="ai-shimmer h-3.5 rounded w-full" />
                      <div className="ai-shimmer h-3.5 rounded w-4/5" />
                      <div className="ai-shimmer h-3.5 rounded w-3/5" />
                    </div>
                  ) : step.description ? (
                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{step.description}</p>
                  ) : (
                    <p className="text-sm text-slate-400 italic">No description yet — click AI Descriptions or double-click to write manually</p>
                  )}
                </div>
              )}

              {step.aiStatus === 'error' && (
                <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                  AI generation failed
                </p>
              )}
            </div>

            {/* Actions */}
            {!isEditing && (
              <div className="flex items-center gap-1 mt-3 pt-3 border-t border-slate-100 flex-wrap">
                <button
                  onClick={startEdit}
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-sky-600 px-2 py-1 rounded hover:bg-sky-50 transition-colors"
                >
                  <Edit2 className="w-3 h-3" /> Edit
                </button>
                <button
                  onClick={handleRegenerate}
                  disabled={isAiLoading}
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-violet-600 px-2 py-1 rounded hover:bg-violet-50 transition-colors disabled:opacity-50"
                >
                  {isAiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  Regenerate
                </button>
                {step.screenshotPath && (
                  <button
                    onClick={() => setEditorOpen(true)}
                    className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-emerald-600 px-2 py-1 rounded hover:bg-emerald-50 transition-colors"
                  >
                    <PencilLine className="w-3 h-3" /> Edit Screenshot
                  </button>
                )}
                <button
                  onClick={handleDelete}
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 transition-colors ml-auto"
                >
                  <Trash2 className="w-3 h-3" /> Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {editorOpen && (
        <ScreenshotEditor step={step} onClose={() => setEditorOpen(false)} />
      )}
    </>
  )
}
