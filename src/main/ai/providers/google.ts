/**
 * Google Gemini provider — talks directly to the Generative Language API
 * (`generativelanguage.googleapis.com/v1beta`).
 *
 * Image inputs use the `inlineData` part shape; the API key is passed as a
 * `?key=` query param per Google's documented convention.
 */

import { SYSTEM_PROMPT, buildUserPrompt, type LlmProvider, type GenerationRequest } from './types'
import { pinnedHttpsAgent } from '../../security/network'

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'

interface GeminiPart {
  text?: string
  inlineData?: { mimeType: string; data: string }
}

interface GeminiContent {
  role: 'user' | 'model'
  parts: GeminiPart[]
}

interface GeminiRequest {
  contents: GeminiContent[]
  systemInstruction?: { parts: Array<{ text: string }> }
  generationConfig?: { maxOutputTokens?: number }
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] }
  }>
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-sopbuilder-client': 'sopbuilder-electron'
    },
    body: JSON.stringify(body),
    // @ts-expect-error — Node's fetch accepts a custom agent at runtime.
    agent: pinnedHttpsAgent()
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`gemini: ${res.status} ${res.statusText} — ${text.slice(0, 200)}`)
  }
  return (await res.json()) as T
}

export const googleProvider: LlmProvider = {
  id: 'google',

  async generateDescription(req: GenerationRequest): Promise<string> {
    const apiKey = (req as GenerationRequest & { apiKey?: string }).apiKey ?? ''
    if (!apiKey) throw new Error('gemini: apiKey not provided')

    const parts: GeminiPart[] = []
    if (req.imageBytes) {
      parts.push({
        inlineData: {
          mimeType: req.imageMimeType,
          data: req.imageBytes.toString('base64')
        }
      })
    }
    parts.push({ text: buildUserPrompt(req) })

    const body: GeminiRequest = {
      contents: [{ role: 'user', parts }],
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      generationConfig: { maxOutputTokens: req.maxTokens }
    }

    const url = `${GEMINI_BASE}/models/${encodeURIComponent(req.model)}:generateContent?key=${encodeURIComponent(apiKey)}`
    const data = await postJson<GeminiResponse>(url, body)
    const text = data.candidates?.[0]?.content?.parts?.find((p) => typeof p.text === 'string')?.text
    return (text ?? '').trim()
  },

  async testCredentials({ apiKey, model }): Promise<boolean> {
    try {
      if (!apiKey) return false
      const url = `${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`
      const body: GeminiRequest = {
        contents: [{ role: 'user', parts: [{ text: 'Hi' }] }],
        generationConfig: { maxOutputTokens: 5 }
      }
      await postJson<GeminiResponse>(url, body)
      return true
    } catch {
      return false
    }
  }
}
