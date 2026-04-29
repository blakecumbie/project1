import Anthropic from '@anthropic-ai/sdk'
import { pinnedHttpsAgent, anthropicSecurityHeaders } from '../../security/network'
import { SYSTEM_PROMPT, buildUserPrompt, type LlmProvider, type GenerationRequest } from './types'

function buildClient(apiKey: string): Anthropic {
  return new Anthropic({
    apiKey,
    defaultHeaders: anthropicSecurityHeaders(),
    fetchOptions: { agent: pinnedHttpsAgent() } as Anthropic.RequestOptions['fetchOptions'],
    logLevel: 'warn'
  })
}

export const anthropicProvider: LlmProvider = {
  id: 'anthropic',

  async generateDescription(req: GenerationRequest): Promise<string> {
    const apiKey = (req as GenerationRequest & { apiKey?: string }).apiKey ?? ''
    if (!apiKey) throw new Error('anthropic: apiKey not provided')
    const client = buildClient(apiKey)

    const content: Anthropic.MessageParam['content'] = []
    if (req.imageBytes) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: req.imageMimeType,
          data: req.imageBytes.toString('base64')
        }
      })
    }
    content.push({ type: 'text', text: buildUserPrompt(req) })

    const response = await client.messages.create({
      model: req.model,
      max_tokens: req.maxTokens,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content }]
    })
    const text = response.content.find((b) => b.type === 'text')
    return (text as { type: 'text'; text: string } | undefined)?.text?.trim() ?? ''
  },

  async testCredentials({ apiKey, model }): Promise<boolean> {
    try {
      const c = buildClient(apiKey)
      await c.messages.create({
        model,
        max_tokens: 5,
        messages: [{ role: 'user', content: 'Hi' }]
      })
      return true
    } catch {
      return false
    }
  }
}
