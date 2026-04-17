import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'fs'
import { getAnthropicClient } from './anthropicClient'
import { resolveImagePath } from '../utils/fileStore'
import type { Step } from '@shared/types'

const SYSTEM_PROMPT = `You are a technical writer creating step-by-step SOP (Standard Operating Procedure) documents.
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

export async function generateStepDescription(
  step: Step,
  projectTitle: string,
  previousDescriptions: string[],
  apiKey: string,
  model: string
): Promise<string> {
  const client = getAnthropicClient(apiKey)

  const messages: Anthropic.MessageParam[] = []

  // Build content array
  const content: Anthropic.MessageParam['content'] = []

  // Attach screenshot if available
  if (step.screenshotPath) {
    try {
      const fullPath = resolveImagePath(step.screenshotPath)
      const imageData = readFileSync(fullPath)
      const base64 = imageData.toString('base64')
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: base64 }
      })
    } catch {}
  }

  const prevContext = previousDescriptions.length > 0
    ? `\nPrevious steps:\n${previousDescriptions.slice(-3).map((d, i) => `${i + 1}. ${d}`).join('\n')}`
    : ''

  content.push({
    type: 'text',
    text: `Generate a step description for this workflow action.

Document: "${projectTitle}"
Action type: ${step.actionType}
${step.typedText ? `Text typed: "${step.typedText}"` : ''}
${step.keyName ? `Key pressed: ${step.keyName}` : ''}
${step.scrollDeltaY !== null ? `Scroll direction: ${(step.scrollDeltaY ?? 0) > 0 ? 'down' : 'up'}` : ''}
${step.windowTitle ? `Window: ${step.windowTitle}` : ''}
${prevContext}

Look at the screenshot to identify the specific UI element and generate an accurate, specific description.`
  })

  messages.push({ role: 'user', content })

  const response = await client.messages.create({
    model,
    max_tokens: 150,
    system: SYSTEM_PROMPT,
    messages
  })

  const text = response.content.find((b) => b.type === 'text')
  return (text as { type: 'text'; text: string })?.text?.trim() ?? ''
}
