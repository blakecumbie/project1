import Anthropic from '@anthropic-ai/sdk'
import { pinnedHttpsAgent, anthropicSecurityHeaders } from '../security/network'

let client: Anthropic | null = null
let currentKey = ''

/**
 * Build (or return) a process-singleton Anthropic client that:
 *   - sends every request through our TLS-1.3 pinned `https.Agent`
 *   - injects the zero-data-retention header set
 *   - never logs request bodies (default-suppressed via `logLevel: 'warn'`)
 */
export function getAnthropicClient(apiKey: string): Anthropic {
  if (client && apiKey === currentKey) return client
  client = new Anthropic({
    apiKey,
    defaultHeaders: anthropicSecurityHeaders(),
    fetchOptions: {
      // Node-fetch / undici both honor `agent` here.
      agent: pinnedHttpsAgent()
    } as Anthropic.RequestOptions['fetchOptions'],
    logLevel: 'warn'
  })
  currentKey = apiKey
  return client
}

export async function testApiKey(apiKey: string): Promise<boolean> {
  try {
    const c = new Anthropic({
      apiKey,
      defaultHeaders: anthropicSecurityHeaders(),
      fetchOptions: { agent: pinnedHttpsAgent() } as Anthropic.RequestOptions['fetchOptions'],
      logLevel: 'warn'
    })
    await c.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 5,
      messages: [{ role: 'user', content: 'Hi' }]
    })
    return true
  } catch {
    return false
  }
}
