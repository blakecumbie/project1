/**
 * Provider-agnostic credential test.
 *
 * The legacy file name is kept so existing imports (e.g. older bundle
 * cache references) don't break, but the implementation now delegates to
 * the active `LlmProvider`.
 */

import { getProvider } from './providers'
import type { AppSettings } from '@shared/types'

export async function testApiKey(apiKey: string, settings: AppSettings): Promise<boolean> {
  if (!apiKey) return false
  const provider = getProvider(settings.aiProvider)
  return provider.testCredentials({
    apiKey,
    model: settings.aiModel,
    baseUrl: settings.aiBaseUrl
  })
}
