/**
 * OpenAI Chat Completions provider.
 *
 * Doubles as the "openai-compatible" provider for self-hosted backends —
 * Ollama, LM Studio, vLLM, llama.cpp's `--api`, OpenRouter, Together,
 * Fireworks, Groq, etc. The only difference is the base URL.
 *
 * Image inputs follow the standard `image_url` data-URL convention so the
 * same payload works against any compliant server.
 */

import { SYSTEM_PROMPT, buildUserPrompt, type LlmProvider, type GenerationRequest } from './types'
import { pinnedHttpsAgent } from '../../security/network'

const DEFAULT_OPENAI_BASE = 'https://api.openai.com/v1'

interface OpenAIChatRequest {
  model: string
  max_tokens?: number
  messages: Array<{
    role: 'system' | 'user' | 'assistant'
    content: string | Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } }
    >
  }>
}

interface OpenAIChatResponse {
  choices: Array<{ message: { content?: string | null } }>
}

function normalizeBaseUrl(base: string | undefined): string {
  const b = (base?.trim() || DEFAULT_OPENAI_BASE).replace(/\/+$/, '')
  // Some users paste the chat completions URL itself — accept that.
  if (b.endsWith('/chat/completions')) return b.slice(0, -'/chat/completions'.length)
  return b
}

async function postJson<T>(url: string, body: unknown, apiKey: string): Promise<T> {
  // Pull in node-fetch's underlying agent so TLS settings (1.2 minimum) apply
  // to OpenAI calls too. `fetch` in Node 20+ honours `dispatcher` from undici;
  // the SDK call above uses `agent` for the older flow. We pass both to
  // cover whichever route Node picks.
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'x-sopbuilder-client': 'sopbuilder-electron'
    },
    body: JSON.stringify(body),
    // @ts-expect-error — Node's fetch accepts a custom agent at runtime.
    agent: pinnedHttpsAgent()
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`openai: ${res.status} ${res.statusText} — ${text.slice(0, 200)}`)
  }
  return (await res.json()) as T
}

function buildProvider(id: 'openai' | 'openai-compatible'): LlmProvider {
  return {
    id,

    async generateDescription(req: GenerationRequest): Promise<string> {
      const apiKey = (req as GenerationRequest & { apiKey?: string }).apiKey ?? ''
      const base = normalizeBaseUrl(req.baseUrl)
      // Local servers (Ollama, LM Studio) often don't require an API key.
      // OpenAI and OpenRouter do. We only enforce the key for the canonical
      // openai provider.
      if (id === 'openai' && !apiKey) throw new Error('openai: apiKey not provided')

      const userContent: OpenAIChatRequest['messages'][number]['content'] = []
      if (req.imageBytes) {
        userContent.push({
          type: 'image_url',
          image_url: {
            url: `data:${req.imageMimeType};base64,${req.imageBytes.toString('base64')}`
          }
        })
      }
      userContent.push({ type: 'text', text: buildUserPrompt(req) })

      const body: OpenAIChatRequest = {
        model: req.model,
        max_tokens: req.maxTokens,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent }
        ]
      }
      const data = await postJson<OpenAIChatResponse>(`${base}/chat/completions`, body, apiKey)
      return (data.choices?.[0]?.message?.content ?? '').trim()
    },

    async testCredentials({ apiKey, model, baseUrl }): Promise<boolean> {
      try {
        const base = normalizeBaseUrl(baseUrl)
        if (id === 'openai' && !apiKey) return false
        await postJson<OpenAIChatResponse>(
          `${base}/chat/completions`,
          {
            model,
            max_tokens: 1,
            messages: [{ role: 'user', content: 'Hi' }]
          },
          apiKey
        )
        return true
      } catch {
        return false
      }
    }
  }
}

export const openaiProvider = buildProvider('openai')
export const openaiCompatibleProvider = buildProvider('openai-compatible')
