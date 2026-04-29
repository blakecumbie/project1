import { IPC } from '../../../shared/ipcChannels'
import type {
  Project,
  Step,
  AppSettings,
  StartRecordingPayload,
  ProjectsListPayload,
  StepsReorderPayload,
  RecordingStateChangedPayload,
  StepCapturedPayload,
  AiProgressPayload,
  AiStepDonePayload,
  Annotation,
  IpcResult,
  DisplayInfo,
  ExportPayload,
  UpdateCropPayload
} from '../../../shared/types'

declare global {
  interface Window {
    api: {
      invoke: <T>(channel: string, ...args: unknown[]) => Promise<T>
      on: (channel: string, callback: (...args: unknown[]) => void) => () => void
      once: (channel: string, callback: (...args: unknown[]) => void) => void
      channels: typeof IPC
    }
  }
}

async function invoke<T>(channel: string, ...args: unknown[]): Promise<IpcResult<T>> {
  return window.api.invoke<IpcResult<T>>(channel, ...args)
}

// ── Projects ──────────────────────────────────────────────────────────────────
export const projects = {
  list: (payload?: ProjectsListPayload) => invoke<Project[]>(IPC.PROJECTS_LIST, payload),
  get: (id: string) => invoke<Project>(IPC.PROJECTS_GET, id),
  create: (title?: string) => invoke<Project>(IPC.PROJECTS_CREATE, title),
  update: (id: string, patch: Partial<Pick<Project, 'title' | 'description' | 'status'>>) =>
    invoke<Project>(IPC.PROJECTS_UPDATE, id, patch),
  delete: (id: string) => invoke<{ success: boolean }>(IPC.PROJECTS_DELETE, id)
}

// ── Steps ─────────────────────────────────────────────────────────────────────
export const steps = {
  list: (projectId: string) => invoke<Step[]>(IPC.STEPS_LIST, projectId),
  get: (id: string) => invoke<Step>(IPC.STEPS_GET, id),
  update: (id: string, patch: { description?: string }) => invoke<Step>(IPC.STEPS_UPDATE, id, patch),
  delete: (id: string) => invoke<{ success: boolean }>(IPC.STEPS_DELETE, id),
  reorder: (payload: StepsReorderPayload) => invoke<{ success: boolean }>(IPC.STEPS_REORDER, payload),
  updateAnnotations: (id: string, annotations: Annotation[]) =>
    invoke<{ success: boolean }>(IPC.STEPS_UPDATE_ANNOTATIONS, id, annotations),
  updateCrop: (payload: UpdateCropPayload) => invoke<Step>(IPC.STEPS_UPDATE_CROP, payload)
}

// ── Recording ─────────────────────────────────────────────────────────────────
export const recording = {
  start: (payload: StartRecordingPayload) => invoke<{ success: boolean }>(IPC.RECORDING_START, payload),
  stop: () => invoke<{ projectId: string }>(IPC.RECORDING_STOP),
  pause: () => invoke<{ success: boolean }>(IPC.RECORDING_PAUSE),
  resume: () => invoke<{ success: boolean }>(IPC.RECORDING_RESUME),
  minimizeOverlay: () => invoke<{ success: boolean }>(IPC.RECORDING_MINIMIZE_OVERLAY),
  getDisplays: () => invoke<DisplayInfo[]>(IPC.GET_DISPLAYS),

  onStateChanged: (cb: (p: RecordingStateChangedPayload) => void) =>
    window.api.on(IPC.RECORDING_STATE_CHANGED, cb as (...args: unknown[]) => void),
  onStepCaptured: (cb: (p: StepCapturedPayload) => void) =>
    window.api.on(IPC.RECORDING_STEP_CAPTURED, cb as (...args: unknown[]) => void),
  onTick: (cb: (p: { elapsedMs: number; stepCount: number }) => void) =>
    window.api.on(IPC.RECORDING_TICK, cb as (...args: unknown[]) => void),
  onError: (cb: (p: { message: string }) => void) =>
    window.api.on(IPC.RECORDING_ERROR, cb as (...args: unknown[]) => void)
}

// ── AI ────────────────────────────────────────────────────────────────────────
export const ai = {
  generateAll: (projectId: string) => invoke<{ started: boolean }>(IPC.AI_GENERATE_ALL, projectId),
  regenerateStep: (stepId: string, projectTitle: string) =>
    invoke<{ started: boolean }>(IPC.AI_REGENERATE_STEP, stepId, projectTitle),
  cancel: (projectId: string) => invoke<{ success: boolean }>(IPC.AI_CANCEL, projectId),
  testKey: (apiKey: string) => invoke<{ valid: boolean }>(IPC.AI_TEST_KEY, apiKey),
  setKey: (apiKey: string) => invoke<{ success: boolean }>(IPC.AI_SET_KEY, apiKey),

  onProgress: (cb: (p: AiProgressPayload) => void) =>
    window.api.on(IPC.AI_PROGRESS, cb as (...args: unknown[]) => void),
  onStepDone: (cb: (p: AiStepDonePayload) => void) =>
    window.api.on(IPC.AI_STEP_DONE, cb as (...args: unknown[]) => void)
}

// ── Export ────────────────────────────────────────────────────────────────────
export const exportApi = {
  pdf: (payload: ExportPayload) => invoke<{ outputPath: string }>(IPC.EXPORT_PDF, payload),
  html: (payload: ExportPayload) => invoke<{ outputPath: string }>(IPC.EXPORT_HTML, payload),
  markdown: (payload: ExportPayload) => invoke<{ outputPath: string }>(IPC.EXPORT_MARKDOWN, payload),
  showSaveDialog: (opts: { title: string; defaultPath: string; filters: { name: string; extensions: string[] }[] }) =>
    invoke<{ canceled: boolean; filePath?: string }>(IPC.SHOW_SAVE_DIALOG, opts),
  openItem: (path: string) => invoke<{ success: boolean }>(IPC.OPEN_ITEM, path)
}

// ── Settings ──────────────────────────────────────────────────────────────────
export const settingsApi = {
  get: () => invoke<AppSettings>(IPC.SETTINGS_GET),
  set: (patch: Partial<AppSettings>) => invoke<AppSettings>(IPC.SETTINGS_SET, patch)
}
