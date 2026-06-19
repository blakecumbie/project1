export const IPC = {
  // Recording lifecycle
  RECORDING_START: 'recording:start',
  RECORDING_STOP: 'recording:stop',
  RECORDING_PAUSE: 'recording:pause',
  RECORDING_RESUME: 'recording:resume',
  RECORDING_STATE_CHANGED: 'recording:stateChanged',
  RECORDING_STEP_CAPTURED: 'recording:stepCaptured',
  RECORDING_TICK: 'recording:tick',
  RECORDING_ERROR: 'recording:error',
  RECORDING_MINIMIZE_OVERLAY: 'recording:minimizeOverlay',

  // Projects
  PROJECTS_LIST: 'projects:list',
  PROJECTS_CREATE: 'projects:create',
  PROJECTS_GET: 'projects:get',
  PROJECTS_UPDATE: 'projects:update',
  PROJECTS_DELETE: 'projects:delete',

  // Steps
  STEPS_LIST: 'steps:list',
  STEPS_GET: 'steps:get',
  STEPS_UPDATE: 'steps:update',
  STEPS_DELETE: 'steps:delete',
  STEPS_REORDER: 'steps:reorder',
  STEPS_UPDATE_ANNOTATIONS: 'steps:updateAnnotations',
  STEPS_UPDATE_CROP: 'steps:updateCrop',

  // AI
  AI_GENERATE_ALL: 'ai:generateAll',
  AI_REGENERATE_STEP: 'ai:regenerateStep',
  AI_PROGRESS: 'ai:progress',
  AI_STEP_DONE: 'ai:stepDone',
  AI_SET_KEY: 'ai:setKey',
  AI_TEST_KEY: 'ai:testKey',
  AI_CANCEL: 'ai:cancel',

  // Export
  EXPORT_PDF: 'export:pdf',
  EXPORT_HTML: 'export:html',
  EXPORT_MARKDOWN: 'export:markdown',
  EXPORT_PROGRESS: 'export:progress',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',

  // Audio / voice recording
  AUDIO_CHUNK: 'audio:chunk',           // renderer → main: binary chunk from MediaRecorder
  AUDIO_RECORDING_STOP: 'audio:recordingStop', // renderer → main: voice recording finished
  AUDIO_MUTE_TOGGLE: 'audio:muteToggle', // overlay → main: toggle mic mute
  AUDIO_MUTE_STATE: 'audio:muteState',  // main → renderer: current mute state
  AUDIO_CHECK: 'audio:check',           // renderer → main: does a voice recording exist?
  AI_TRANSCRIBE: 'ai:transcribe',       // renderer → main: start transcription pipeline
  AI_TRANSCRIPTION_PROGRESS: 'ai:transcriptionProgress', // main → renderer: progress

  // System
  OPEN_EXTERNAL: 'system:openExternal',
  GET_DISPLAYS: 'system:getDisplays',
  SHOW_SAVE_DIALOG: 'system:showSaveDialog',
  OPEN_ITEM: 'system:openItem'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
