/**
 * Provider factory. Maps `AppSettings.aiProvider` to a concrete `LlmProvider`
 * implementation. Adding a new provider is a one-line registration here.
 */

import type { AiProvider } from '@shared/types'
import type { LlmProvider } from './types'
import { anthropicProvider } from './anthropic'
import { openaiProvider, openaiCompatibleProvider } from './openai'
import { googleProvider } from './google'

const REGISTRY: Record<AiProvider, LlmProvider> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
  google: googleProvider,
  'openai-compatible': openaiCompatibleProvider
}

export function getProvider(id: AiProvider): LlmProvider {
  const p = REGISTRY[id]
  if (!p) throw new Error(`Unknown AI provider: ${id}`)
  return p
}

export type { LlmProvider, GenerationRequest } from './types'
