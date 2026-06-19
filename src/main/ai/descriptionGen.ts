import { readFileSync } from 'fs'
import { resolveImagePath } from '../utils/fileStore'
import { getProvider } from './providers'
import type { Step, AppSettings } from '@shared/types'

/**
 * Generate a single step description by routing through the provider that
 * matches the user's current `aiProvider` setting.
 *
 * The screenshot is read once, on the main process, and passed to the provider
 * as raw bytes — each provider knows how to encode them for its own API
 * (base64 source for Anthropic, data-URL for OpenAI, inlineData for Gemini).
 */
export async function generateStepDescription(
  step: Step,
  projectTitle: string,
  previousDescriptions: string[],
  settings: AppSettings
): Promise<string> {
  const provider = getProvider(settings.aiProvider)

  let imageBytes: Buffer | null = null
  if (step.screenshotPath) {
    try {
      imageBytes = readFileSync(resolveImagePath(step.screenshotPath))
    } catch {
      imageBytes = null
    }
  }

  // Provider implementations read `apiKey` off the request object; the type
  // declares the field as optional so the abstraction stays small.
  const req = {
    step,
    projectTitle,
    previousDescriptions,
    model: settings.aiModel,
    imageBytes,
    imageMimeType: 'image/jpeg' as const,
    maxTokens: 150,
    baseUrl: settings.aiBaseUrl,
    apiKey: settings.aiApiKey
  }

  try {
    return await provider.generateDescription(req)
  } finally {
    // Best-effort wipe of the screenshot bytes we just consumed.
    if (imageBytes) imageBytes.fill(0)
  }
}
