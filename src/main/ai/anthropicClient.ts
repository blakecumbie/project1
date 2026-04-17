import Anthropic from '@anthropic-ai/sdk'

let client: Anthropic | null = null
let currentKey = ''

export function getAnthropicClient(apiKey: string): Anthropic {
  if (client && apiKey === currentKey) return client
  client = new Anthropic({ apiKey })
  currentKey = apiKey
  return client
}

export async function testApiKey(apiKey: string): Promise<boolean> {
  try {
    const c = new Anthropic({ apiKey })
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
