import { readFileSync } from 'fs'
import FormData from 'form-data'
import { logger } from '../utils/logger'
import type { AudioTranscription } from '@shared/types'

export async function transcribeAudio(opts: {
  audioPath: string
  apiKey: string
  baseUrl: string
}): Promise<AudioTranscription> {
  const { audioPath, apiKey, baseUrl } = opts
  const url = `${baseUrl.replace(/\/$/, '')}/audio/transcriptions`

  // Read into a Buffer — form-data's getBuffer() silently drops ReadStream entries
  const audioBuffer = readFileSync(audioPath)

  const form = new FormData()
  form.append('file', audioBuffer, {
    filename: 'recording.webm',
    contentType: 'audio/webm'
  })
  form.append('model', 'whisper-1')
  form.append('response_format', 'verbose_json')
  form.append('timestamp_granularities[]', 'segment')

  logger.info(`transcriptionService: uploading ${audioBuffer.byteLength} bytes to Whisper`)

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...form.getHeaders()
    },
    body: form.getBuffer()
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Whisper API error ${res.status}: ${text.slice(0, 200)}`)
  }

  const json = (await res.json()) as {
    text: string
    segments?: Array<{ text: string; start: number; end: number }>
  }

  const segments = (json.segments ?? []).map((s) => ({
    text: s.text.trim(),
    start: s.start,
    end: s.end
  }))

  logger.info(`transcriptionService: got ${segments.length} segments`)
  return { fullText: json.text, segments }
}
