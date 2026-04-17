import { create } from 'zustand'
import type { RecordingState } from '../../../shared/types'

interface RecordingStore {
  state: RecordingState
  projectId: string | null
  stepCount: number
  elapsedMs: number

  setState: (state: RecordingState) => void
  setProjectId: (id: string | null) => void
  setStepCount: (n: number) => void
  setElapsedMs: (ms: number) => void
  reset: () => void
}

export const useRecordingStore = create<RecordingStore>((set) => ({
  state: 'idle',
  projectId: null,
  stepCount: 0,
  elapsedMs: 0,

  setState: (state) => set({ state }),
  setProjectId: (projectId) => set({ projectId }),
  setStepCount: (stepCount) => set({ stepCount }),
  setElapsedMs: (elapsedMs) => set({ elapsedMs }),
  reset: () => set({ state: 'idle', projectId: null, stepCount: 0, elapsedMs: 0 })
}))
