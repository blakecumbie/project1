import { create } from 'zustand'
import { projects as projectsApi, steps as stepsApi, ai } from '../lib/ipc'
import type { Project, Step, AiProgressPayload, AiStepDonePayload } from '../../../shared/types'

interface ProjectStore {
  projects: Project[]
  activeProjectId: string | null
  activeSteps: Step[]
  isLoadingProjects: boolean
  isLoadingSteps: boolean
  aiProgress: AiProgressPayload | null

  loadProjects: () => Promise<void>
  createProject: (title?: string) => Promise<Project | null>
  deleteProject: (id: string) => Promise<void>
  setActiveProject: (id: string) => Promise<void>
  updateProjectTitle: (id: string, title: string) => Promise<void>
  loadSteps: (projectId: string) => Promise<void>
  updateStep: (id: string, patch: { description?: string }) => void
  optimisticUpdateStep: (id: string, patch: Partial<Step>) => void
  deleteStep: (id: string) => Promise<void>
  reorderSteps: (projectId: string, orderedIds: string[]) => Promise<void>
  appendStep: (step: Step) => void
  setAiProgress: (p: AiProgressPayload | null) => void
  applyAiStepDone: (p: AiStepDonePayload) => void
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  activeProjectId: null,
  activeSteps: [],
  isLoadingProjects: false,
  isLoadingSteps: false,
  aiProgress: null,

  loadProjects: async () => {
    set({ isLoadingProjects: true })
    const res = await projectsApi.list()
    if (res.data) set({ projects: res.data })
    set({ isLoadingProjects: false })
  },

  createProject: async (title) => {
    const res = await projectsApi.create(title)
    if (res.data) {
      set((s) => ({ projects: [res.data!, ...s.projects] }))
      return res.data
    }
    return null
  },

  deleteProject: async (id) => {
    await projectsApi.delete(id)
    set((s) => ({
      projects: s.projects.filter((p) => p.id !== id),
      activeProjectId: s.activeProjectId === id ? null : s.activeProjectId,
      activeSteps: s.activeProjectId === id ? [] : s.activeSteps
    }))
  },

  setActiveProject: async (id) => {
    set({ activeProjectId: id, activeSteps: [], isLoadingSteps: true })
    const res = await stepsApi.list(id)
    if (res.data) set({ activeSteps: res.data })
    set({ isLoadingSteps: false })
  },

  updateProjectTitle: async (id, title) => {
    const res = await projectsApi.update(id, { title })
    if (res.data) {
      set((s) => ({
        projects: s.projects.map((p) => (p.id === id ? res.data! : p))
      }))
    }
  },

  loadSteps: async (projectId) => {
    set({ isLoadingSteps: true })
    const res = await stepsApi.list(projectId)
    if (res.data) set({ activeSteps: res.data })
    set({ isLoadingSteps: false })
  },

  updateStep: async (id, patch) => {
    get().optimisticUpdateStep(id, patch)
    await stepsApi.update(id, patch)
  },

  optimisticUpdateStep: (id, patch) => {
    set((s) => ({
      activeSteps: s.activeSteps.map((st) => (st.id === id ? { ...st, ...patch } : st))
    }))
  },

  deleteStep: async (id) => {
    await stepsApi.delete(id)
    set((s) => ({ activeSteps: s.activeSteps.filter((st) => st.id !== id) }))
    // Refresh step count in project list
    const pid = get().activeProjectId
    if (pid) {
      const res = await projectsApi.get(pid)
      if (res.data) {
        set((s) => ({ projects: s.projects.map((p) => (p.id === pid ? res.data! : p)) }))
      }
    }
  },

  reorderSteps: async (projectId, orderedIds) => {
    const currentSteps = get().activeSteps
    const ordered = orderedIds.map((id) => currentSteps.find((s) => s.id === id)!).filter(Boolean)
    set({ activeSteps: ordered })
    await stepsApi.reorder({ projectId, orderedIds })
  },

  appendStep: (step) => {
    set((s) => ({ activeSteps: [...s.activeSteps, step] }))
  },

  setAiProgress: (p) => set({ aiProgress: p }),

  applyAiStepDone: (p) => {
    set((s) => ({
      activeSteps: s.activeSteps.map((st) =>
        st.id === p.stepId ? { ...st, description: p.description || st.description, aiStatus: p.aiStatus } : st
      )
    }))
  }
}))
