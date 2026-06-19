import { logger } from '../utils/logger'
import { stepsRepo } from '../database/stepsRepo'
import { getProvider } from '../ai/providers'
import { resolveImagePath } from '../utils/fileStore'
import { readFileSync } from 'fs'
import type { AppSettings, TranscriptionSegment, Step } from '@shared/types'

/** Seconds before a step's timestamp that voice narration may begin. */
const LOOK_BACK_S = 8
/** Seconds after a step's timestamp that narration may end. */
const LOOK_AHEAD_S = 2

interface StepMatch {
  step: Step
  transcript: string
  offsetS: number
}

function findTranscriptForStep(
  step: Step,
  segments: TranscriptionSegment[],
  startedAt: number
): string | null {
  const offsetS = (step.capturedAt - startedAt) / 1000
  const matched = segments.filter(
    (seg) => seg.start >= offsetS - LOOK_BACK_S && seg.end <= offsetS + LOOK_AHEAD_S
  )
  if (matched.length === 0) return null
  return matched.map((s) => s.text).join(' ').trim()
}

async function verifyMatches(
  matches: StepMatch[],
  settings: AppSettings
): Promise<Map<string, boolean>> {
  if (matches.length === 0) return new Map()

  const lines = matches
    .map(
      (m, i) =>
        `[${i + 1}] stepId=${m.step.id} action=${m.step.actionType} offset=${m.offsetS.toFixed(1)}s\n` +
        `    description: "${m.step.description.slice(0, 120)}"\n` +
        `    transcript: "${m.transcript.slice(0, 200)}"`
    )
    .join('\n')

  const prompt =
    `Review these screen-recording step / voice-narration matches. ` +
    `For each, decide if the transcript plausibly matches that step's action. ` +
    `Reply with ONLY a JSON array of booleans in the same order as the input, e.g. [true, false, true].\n\n` +
    lines

  try {
    const provider = getProvider(settings.aiProvider)
    const req = {
      step: matches[0].step,
      projectTitle: '',
      previousDescriptions: [],
      model: settings.aiModel,
      imageBytes: null,
      imageMimeType: 'image/jpeg' as const,
      maxTokens: 512,
      baseUrl: settings.aiBaseUrl,
      apiKey: settings.aiApiKey,
      overridePrompt: prompt
    }
    const raw = await provider.generateDescription(req as Parameters<typeof provider.generateDescription>[0])
    const arr = JSON.parse(raw.match(/\[[\s\S]*\]/)?.[0] ?? '[]') as boolean[]
    const result = new Map<string, boolean>()
    matches.forEach((m, i) => result.set(m.step.id, arr[i] ?? true))
    return result
  } catch (e) {
    logger.warn(`matchingService: verification call failed (${String(e)}) — accepting all`)
    const result = new Map<string, boolean>()
    matches.forEach((m) => result.set(m.step.id, true))
    return result
  }
}

async function enhanceDescription(
  step: Step,
  transcript: string,
  settings: AppSettings
): Promise<string> {
  const provider = getProvider(settings.aiProvider)

  let imageBytes: Buffer | null = null
  if (step.screenshotPath) {
    try { imageBytes = readFileSync(resolveImagePath(step.screenshotPath)) } catch { /* no img */ }
  }

  const req = {
    step,
    projectTitle: '',
    previousDescriptions: [],
    model: settings.aiModel,
    imageBytes,
    imageMimeType: 'image/jpeg' as const,
    maxTokens: 200,
    baseUrl: settings.aiBaseUrl,
    apiKey: settings.aiApiKey,
    voiceTranscript: transcript
  }

  try {
    return await provider.generateDescription(req as Parameters<typeof provider.generateDescription>[0])
  } finally {
    if (imageBytes) imageBytes.fill(0)
  }
}

export async function matchAndEnhance(opts: {
  projectId: string
  segments: TranscriptionSegment[]
  startedAt: number
  settings: AppSettings
  onProgress: (phase: string, progress: number, current?: number, total?: number) => void
}): Promise<void> {
  const { projectId, segments, startedAt, settings, onProgress } = opts

  onProgress('matching', 0)
  const steps = stepsRepo.listForProject(projectId)

  const matches: StepMatch[] = []
  for (const step of steps) {
    const transcript = findTranscriptForStep(step, segments, startedAt)
    if (transcript) {
      matches.push({ step, transcript, offsetS: (step.capturedAt - startedAt) / 1000 })
    }
  }
  logger.info(`matchingService: ${matches.length}/${steps.length} steps matched`)

  onProgress('verifying', 10)
  const verified = await verifyMatches(matches, settings)

  const accepted = matches.filter((m) => verified.get(m.step.id) !== false)
  logger.info(`matchingService: ${accepted.length} matches accepted after verification`)

  for (let i = 0; i < accepted.length; i++) {
    const m = accepted[i]
    onProgress('enhancing', 20 + Math.round((i / accepted.length) * 75), i + 1, accepted.length)

    stepsRepo.update(m.step.id, { voiceTranscript: m.transcript })

    if (m.step.description && m.step.description !== '') {
      try {
        const enhanced = await enhanceDescription(m.step, m.transcript, settings)
        if (enhanced) stepsRepo.update(m.step.id, { description: enhanced })
      } catch (e) {
        logger.error(`matchingService: enhance failed for ${m.step.id}: ${String(e)}`)
      }
    }
  }

  onProgress('done', 100)
}
