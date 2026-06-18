/**
 * Common provider abstraction for description generation. Each provider is a
 * thin adapter over a vision-capable chat-completion endpoint — the project
 * does not need streaming, tools, or function calling, so the surface stays
 * deliberately small.
 */

import type { Step, AiProvider } from '@shared/types'

export interface GenerationRequest {
  step: Step
  projectTitle: string
  /** Up to 3 prior step descriptions for short-term context. */
  previousDescriptions: string[]
  /** Provider-specific model identifier. */
  model: string
  /** PNG/JPEG bytes of the screenshot, or null if missing. */
  imageBytes: Buffer | null
  /** MIME type of the image (always 'image/jpeg' for our pipeline today). */
  imageMimeType: 'image/jpeg' | 'image/png'
  /** Cap on response tokens. */
  maxTokens: number
  /** Optional OpenAI-compatible base URL for self-hosted endpoints. */
  baseUrl?: string
  /** Voice narration matched to this step — used to enrich the description. */
  voiceTranscript?: string
  /** When set, bypasses the standard prompt and sends this text directly to the model. */
  overridePrompt?: string
}

export interface LlmProvider {
  /** Unique identifier matching `AppSettings.aiProvider`. */
  readonly id: AiProvider
  /** Generate a single short step description. */
  generateDescription(req: GenerationRequest): Promise<string>
  /**
   * Lightweight credential check. Implementations should make the cheapest
   * possible call (a 1-token completion or a `/models` GET) and return true
   * iff the credentials are accepted.
   */
  testCredentials(opts: { apiKey: string; model: string; baseUrl?: string }): Promise<boolean>
}

/**
 * Shared system prompt — kept in one place so prompt-engineering changes
 * apply uniformly to every provider.
 */
export const SYSTEM_PROMPT =
  `You are a technical writer creating step-by-step SOP (Standard Operating Procedure) documents.
Generate a single, concise action description for a GUI workflow step.

Rules:
- Write in imperative voice ("Click", "Type", "Select", "Scroll")
- Be specific: mention the exact UI element, button label, or field name visible in the screenshot
- Keep descriptions to 1-2 sentences maximum
- For typing steps, include the text that was typed
- For scroll steps, describe what section the user is scrolling through
- Use title case for UI element names (e.g., "the Submit button", "the Search field")
- Do not start with "Step" or a number
- Output only the description text, nothing else`

/**
 * Build the provider-agnostic instruction text. Each provider wraps this in
 * its own message envelope (Anthropic vs OpenAI vs Gemini differ on how
 * images are attached to a user turn).
 */
export function buildUserPrompt(req: Pick<GenerationRequest, 'step' | 'projectTitle' | 'previousDescriptions' | 'voiceTranscript' | 'overridePrompt'>): string {
  if (req.overridePrompt) return req.overridePrompt

  const { step, projectTitle, previousDescriptions, voiceTranscript } = req
  const prevContext =
    previousDescriptions.length > 0
      ? `\nPrevious steps:\n${previousDescriptions
          .slice(-3)
          .map((d, i) => `${i + 1}. ${d}`)
          .join('\n')}`
      : ''

  const voiceCtx = voiceTranscript
    ? `\nVoice narration captured at this step: "${voiceTranscript}"\n` +
      `Use the narration to enrich or clarify the description where helpful.`
    : ''

  return `Generate a step description for this workflow action.

Document: "${projectTitle}"
Action type: ${step.actionType}
${step.typedText ? `Text typed: "${step.typedText}"` : ''}
${step.keyName ? `Key pressed: ${step.keyName}` : ''}
${step.scrollDeltaY !== null ? `Scroll direction: ${(step.scrollDeltaY ?? 0) > 0 ? 'down' : 'up'}` : ''}
${step.windowTitle ? `Window: ${step.windowTitle}` : ''}
${prevContext}
${voiceCtx}
Look at the screenshot to identify the specific UI element and generate an accurate, specific description.`
}
