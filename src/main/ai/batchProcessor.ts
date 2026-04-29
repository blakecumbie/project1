import { EventEmitter } from 'events'
import { generateStepDescription } from './descriptionGen'
import { stepsRepo } from '../database/stepsRepo'
import { settingsRepo } from '../database/settingsRepo'
import { logger } from '../utils/logger'
import { AI_RATE_LIMIT_DELAY_MS } from '@shared/constants'
import type { AiProgressPayload, AiStepDonePayload } from '@shared/types'

class AiBatchProcessor extends EventEmitter {
  private running = new Set<string>() // projectIds currently processing
  private cancelled = new Set<string>()

  async processProject(projectId: string, projectTitle: string): Promise<void> {
    if (this.running.has(projectId)) return
    this.running.add(projectId)
    this.cancelled.delete(projectId)

    const settings = await settingsRepo.get()
    // openai-compatible providers (Ollama, LM Studio, etc.) often run without
    // a key — only require one for the cloud providers.
    const requiresKey = settings.aiProvider !== 'openai-compatible'
    if (requiresKey && !settings.aiApiKey) {
      this.running.delete(projectId)
      this.emit('error', { projectId, message: 'No API key configured' })
      return
    }

    const steps = stepsRepo.getPendingForProject(projectId)
    const total = steps.length

    if (total === 0) {
      this.running.delete(projectId)
      return
    }

    this.emit('progress', {
      projectId,
      total,
      completed: 0,
      currentStepId: null
    } satisfies AiProgressPayload)

    const previousDescriptions: string[] = []

    for (let i = 0; i < steps.length; i++) {
      if (this.cancelled.has(projectId)) break

      const step = steps[i]
      stepsRepo.update(step.id, { aiStatus: 'processing' })
      this.emit('progress', {
        projectId,
        total,
        completed: i,
        currentStepId: step.id
      } satisfies AiProgressPayload)

      try {
        const description = await generateStepDescription(
          step,
          projectTitle,
          previousDescriptions,
          settings
        )

        stepsRepo.update(step.id, {
          description,
          aiStatus: 'done',
          aiRawResponse: description
        })

        previousDescriptions.push(description)

        this.emit('stepDone', {
          stepId: step.id,
          description,
          aiStatus: 'done'
        } satisfies AiStepDonePayload)
      } catch (err) {
        logger.error(`AI generation failed for step ${step.id}:`, err)
        stepsRepo.update(step.id, {
          aiStatus: 'error',
          aiError: String(err)
        })
        this.emit('stepDone', {
          stepId: step.id,
          description: '',
          aiStatus: 'error'
        } satisfies AiStepDonePayload)
      }

      // Rate-limit delay between calls
      if (i < steps.length - 1 && !this.cancelled.has(projectId)) {
        await delay(AI_RATE_LIMIT_DELAY_MS)
      }
    }

    this.emit('progress', {
      projectId,
      total,
      completed: total,
      currentStepId: null
    } satisfies AiProgressPayload)

    this.running.delete(projectId)
    this.cancelled.delete(projectId)
    logger.info(`AI batch complete for project ${projectId}`)
  }

  async regenerateStep(stepId: string, projectTitle: string): Promise<void> {
    const step = stepsRepo.get(stepId)
    if (!step) return

    const settings = await settingsRepo.get()
    if (settings.aiProvider !== 'openai-compatible' && !settings.aiApiKey) return

    stepsRepo.update(stepId, { aiStatus: 'processing' })
    this.emit('stepDone', { stepId, description: '', aiStatus: 'processing' })

    try {
      // Get preceding steps for context
      const allSteps = stepsRepo.listForProject(step.projectId)
      const idx = allSteps.findIndex((s) => s.id === stepId)
      const prevDescs = allSteps.slice(Math.max(0, idx - 3), idx).map((s) => s.description).filter(Boolean)

      const description = await generateStepDescription(step, projectTitle, prevDescs, settings)
      stepsRepo.update(stepId, { description, aiStatus: 'done' })
      this.emit('stepDone', { stepId, description, aiStatus: 'done' } satisfies AiStepDonePayload)
    } catch (err) {
      stepsRepo.update(stepId, { aiStatus: 'error', aiError: String(err) })
      this.emit('stepDone', { stepId, description: '', aiStatus: 'error' } satisfies AiStepDonePayload)
    }
  }

  cancel(projectId: string): void {
    this.cancelled.add(projectId)
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export const batchProcessor = new AiBatchProcessor()
