import React, { useEffect, useState, useRef } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { useProjectStore } from '@/store/projectStore'
import { DocumentHeader } from '@/components/document/DocumentHeader'
import { StepCard } from '@/components/document/StepCard'
import { RecordingSetup } from '@/components/recording/RecordingSetup'
import { ExportDialog } from '@/components/export/ExportDialog'
import { ai as aiApi, recording as recordingApi } from '@/lib/ipc'
import type { RecordingStateChangedPayload, StepCapturedPayload, AiProgressPayload, AiStepDonePayload } from '../../../shared/types'
import { useRecordingStore } from '@/store/recordingStore'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'
import { Inbox } from 'lucide-react'

export function DocumentPage(): React.ReactElement {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const { setActiveProject, activeSteps, isLoadingSteps, reorderSteps, appendStep, setAiProgress, applyAiStepDone, projects } = useProjectStore()
  const recordingState = useRecordingStore((s) => s.state)
  const { setState: setRecState, setStepCount, setElapsedMs } = useRecordingStore()

  const [showSetup, setShowSetup] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const audioRecorder = useAudioRecorder()
  // Track voice session: { projectId, startedAt } while recording with voice
  const voiceSessionRef = useRef<{ projectId: string; startedAt: number } | null>(null)

  const project = projects.find((p) => p.id === id) ?? null
  const isNewRecording = searchParams.get('new') === '1'

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  useEffect(() => {
    if (!id) return
    setActiveProject(id)
  }, [id, setActiveProject])

  // Open recording setup on new project
  useEffect(() => {
    if (isNewRecording && id && recordingState === 'idle') {
      setShowSetup(true)
    }
  }, [isNewRecording, id, recordingState])

  // Subscribe to recording events
  useEffect(() => {
    const unsubs = [
      recordingApi.onStateChanged(async (p: RecordingStateChangedPayload) => {
        setRecState(p.state)
        setStepCount(p.stepCount)
        setElapsedMs(p.elapsedMs)
        if (p.state === 'idle' && p.projectId) {
          // Stop voice recording if active
          if (voiceSessionRef.current) {
            const { projectId: vpid, startedAt } = voiceSessionRef.current
            voiceSessionRef.current = null
            await audioRecorder.stop(vpid, startedAt)
          }
          // Refresh steps after recording stops
          if (p.projectId === id) setActiveProject(p.projectId)
          navigate(`/document/${p.projectId}`)
        }
      }),
      recordingApi.onStepCaptured((p: StepCapturedPayload) => {
        if (p.step.projectId === id) appendStep(p.step)
      })
    ]
    return () => unsubs.forEach((fn) => fn())
  }, [id, setRecState, setStepCount, setElapsedMs, appendStep, setActiveProject, navigate, audioRecorder])

  // Subscribe to AI events
  useEffect(() => {
    if (!id) return
    const unsubs = [
      aiApi.onProgress((p: AiProgressPayload) => {
        if (p.projectId === id) setAiProgress(p)
      }),
      aiApi.onStepDone((p: AiStepDonePayload) => {
        applyAiStepDone(p)
      })
    ]
    return () => unsubs.forEach((fn) => fn())
  }, [id, setAiProgress, applyAiStepDone])

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id || !id) return
    const oldIdx = activeSteps.findIndex((s) => s.id === active.id)
    const newIdx = activeSteps.findIndex((s) => s.id === over.id)
    if (oldIdx === -1 || newIdx === -1) return
    const newOrder = [...activeSteps]
    newOrder.splice(newIdx, 0, ...newOrder.splice(oldIdx, 1))
    reorderSteps(id, newOrder.map((s) => s.id))
  }

  if (!id) return <div className="p-8 text-slate-500">No project selected.</div>

  if (isLoadingSteps) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {project && <DocumentHeader project={project} onExport={() => setShowExport(true)} />}

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto">
          {activeSteps.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <Inbox className="w-12 h-12 text-slate-300 mb-4" />
              <p className="text-slate-500 font-medium">No steps yet</p>
              {recordingState === 'idle' && (
                <button
                  onClick={() => setShowSetup(true)}
                  className="btn-primary mt-4"
                >
                  Start Recording
                </button>
              )}
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis]}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={activeSteps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-4">
                  {activeSteps.map((step, i) => (
                    <StepCard
                      key={step.id}
                      step={step}
                      index={i}
                      projectTitle={project?.title ?? ''}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>

      {showSetup && id && (
        <RecordingSetup
          projectId={id}
          onClose={() => { setShowSetup(false); navigate(`/document/${id}`, { replace: true }) }}
          onStarted={(captureVoice, startedAt) => {
            if (captureVoice && id) {
              voiceSessionRef.current = { projectId: id, startedAt }
              audioRecorder.start(id).catch(() => {/* mic denied — graceful no-op */})
            }
          }}
        />
      )}

      {showExport && project && (
        <ExportDialog project={project} onClose={() => setShowExport(false)} />
      )}
    </div>
  )
}
