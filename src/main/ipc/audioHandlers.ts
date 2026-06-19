import { ipcMain } from 'electron'
import { IPC } from '@shared/ipcChannels'
import { openSession, appendChunk, closeSession, audioExists, audioFilePath, getStartedAt } from '../audio/audioStore'
import { transcribeAudio } from '../audio/transcriptionService'
import { matchAndEnhance } from '../audio/matchingService'
import { settingsRepo } from '../database/settingsRepo'
import { sendToMain, sendToOverlay } from '../windowManager'
import { validatedHandle } from '../security/ipcValidation'
import { logger } from '../utils/logger'

let voiceMuted = false

export function registerAudioHandlers(): void {
  // Binary chunk from MediaRecorder — bypass Zod (binary validation is impractical)
  ipcMain.handle(IPC.AUDIO_CHUNK, (_event, projectId: string, chunk: Buffer) => {
    // UUID check prevents path-traversal — audioFilePath() does a bare join(audioDir(), id)
    if (typeof projectId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId)) {
      return { error: 'invalid_payload' }
    }
    if (!Buffer.isBuffer(chunk) && !(chunk instanceof Uint8Array)) return { error: 'invalid_payload' }
    openSession(projectId)
    appendChunk(projectId, Buffer.from(chunk))
    return { data: { ok: true } }
  })

  // Renderer signals that voice recording is finished
  validatedHandle(IPC.AUDIO_RECORDING_STOP, 'audioRecordingStop', async (_event, payload) => {
    try {
      await closeSession(payload.projectId, payload.startedAt)
      return { data: { ok: true } }
    } catch (e) {
      return { error: String(e) }
    }
  })

  // Check if a voice recording exists for a project
  ipcMain.handle(IPC.AUDIO_CHECK, (_event, projectId: unknown) => {
    if (typeof projectId !== 'string') return { data: { exists: false } }
    return { data: { exists: audioExists(projectId) } }
  })

  // Mute toggle from the overlay
  ipcMain.handle(IPC.AUDIO_MUTE_TOGGLE, () => {
    voiceMuted = !voiceMuted
    sendToMain(IPC.AUDIO_MUTE_STATE, { muted: voiceMuted })
    sendToOverlay(IPC.AUDIO_MUTE_STATE, { muted: voiceMuted })
    return { data: { muted: voiceMuted } }
  })

  // Kick off the transcription + matching pipeline
  validatedHandle(IPC.AI_TRANSCRIBE, 'aiTranscribe', async (_event, projectId) => {
    try {
      const settings = await settingsRepo.get()

      // Resolve which API key + base URL to use for transcription
      const transcriptionKey = settings.transcriptionApiKey || settings.aiApiKey
      const transcriptionBase =
        settings.transcriptionBaseUrl || 'https://api.openai.com/v1'

      if (!transcriptionKey) {
        return { error: 'no_transcription_key' }
      }
      if (!audioExists(projectId)) {
        return { error: 'no_audio_file' }
      }

      const startedAt = getStartedAt(projectId)
      if (!startedAt) return { error: 'no_audio_metadata' }

      sendToMain(IPC.AI_TRANSCRIPTION_PROGRESS, {
        phase: 'uploading',
        progress: 0
      })

      const transcription = await transcribeAudio({
        audioPath: audioFilePath(projectId),
        apiKey: transcriptionKey,
        baseUrl: transcriptionBase
      })

      sendToMain(IPC.AI_TRANSCRIPTION_PROGRESS, {
        phase: 'matching',
        progress: 15
      })

      await matchAndEnhance({
        projectId,
        segments: transcription.segments,
        startedAt,
        settings,
        onProgress: (phase, progress, current, total) => {
          sendToMain(IPC.AI_TRANSCRIPTION_PROGRESS, { phase, progress, currentStep: current, totalSteps: total })
        }
      })

      return { data: { ok: true } }
    } catch (err) {
      logger.error('AI_TRANSCRIBE error:', err)
      return { error: String(err) }
    }
  })
}

export function resetMuteState(): void {
  voiceMuted = false
}
