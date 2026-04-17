import { EventEmitter } from 'events'
import { screen } from 'electron'
import type { RecordingState, StartRecordingPayload, Step } from '@shared/types'
import { inputHooks, type CapturedEvent } from './inputHooks'
import { captureScreen, getClickDotPosition } from './screenshotCapture'
import { stepsRepo } from './database/stepsRepo'
import { projectsRepo } from './database/projectsRepo'
import { saveImageBuffer, getRelativeImagePath } from './utils/fileStore'
import { logger } from './utils/logger'
import { DEFAULT_CROP_RADIUS, DEFAULT_SCREENSHOT_DELAY_MS } from '@shared/constants'
import type { Annotation } from '@shared/types'

export class RecordingSession extends EventEmitter {
  private _state: RecordingState = 'idle'
  private projectId: string | null = null
  private config: StartRecordingPayload | null = null
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private pendingEvent: CapturedEvent | null = null
  private stepCount = 0
  private startTime = 0
  private elapsedTimer: ReturnType<typeof setInterval> | null = null

  get state(): RecordingState {
    return this._state
  }

  get currentProjectId(): string | null {
    return this.projectId
  }

  get currentStepCount(): number {
    return this.stepCount
  }

  get elapsedMs(): number {
    return this.startTime ? Date.now() - this.startTime : 0
  }

  async start(config: StartRecordingPayload): Promise<void> {
    if (this._state !== 'idle') throw new Error('Already recording')

    this.config = config
    this.projectId = config.projectId
    this.stepCount = 0
    this.startTime = Date.now()
    this._state = 'recording'

    // Start input hooks
    inputHooks.on('event', this.onInputEvent)
    inputHooks.on('error', (err) => logger.error('Input hook error:', err))

    await inputHooks.start({
      captureTyping: config.captureTyping,
      captureScrolling: config.captureScrolling
    })

    // Elapsed time ticker
    this.elapsedTimer = setInterval(() => {
      this.emit('tick', { elapsedMs: this.elapsedMs, stepCount: this.stepCount })
    }, 1000)

    this.emitState()
    logger.info(`Recording started for project ${this.projectId}`)
  }

  pause(): void {
    if (this._state !== 'recording') return
    this._state = 'paused'
    this.emitState()
  }

  resume(): void {
    if (this._state !== 'paused') return
    this._state = 'recording'
    this.emitState()
  }

  async stop(): Promise<string | null> {
    if (this._state === 'idle') return null
    this._state = 'stopping'
    this.emitState()

    // Clear timers
    if (this.debounceTimer) { clearTimeout(this.debounceTimer); this.debounceTimer = null }
    if (this.elapsedTimer) { clearInterval(this.elapsedTimer); this.elapsedTimer = null }

    // Process any pending event
    if (this.pendingEvent) {
      await this.processCapturedEvent(this.pendingEvent)
      this.pendingEvent = null
    }

    inputHooks.off('event', this.onInputEvent)
    inputHooks.stop()

    const pid = this.projectId
    this._state = 'idle'
    this.projectId = null
    this.config = null
    this.startTime = 0
    this.stepCount = 0

    this.emitState()
    logger.info(`Recording stopped. Project: ${pid}`)
    return pid
  }

  private onInputEvent = (event: CapturedEvent): void => {
    if (this._state !== 'recording') return

    // For scroll events, debounce longer to group scroll actions
    const delay = event.type === 'scroll'
      ? (this.config?.screenshotDelay ?? DEFAULT_SCREENSHOT_DELAY_MS) * 2
      : (this.config?.screenshotDelay ?? DEFAULT_SCREENSHOT_DELAY_MS)

    this.pendingEvent = event

    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(async () => {
      const ev = this.pendingEvent
      this.pendingEvent = null
      if (ev) await this.processCapturedEvent(ev)
    }, delay)
  }

  private async processCapturedEvent(event: CapturedEvent): Promise<void> {
    if (!this.projectId || !this.config) return

    try {
      const cropRadius = this.config.cropRadius ?? DEFAULT_CROP_RADIUS
      const buffer = await captureScreen({
        displayId: this.config.displayId,
        cropX: event.x ?? undefined,
        cropY: event.y ?? undefined,
        cropRadius
      })

      let screenshotPath: string | null = null
      let screenshotWidth: number | null = null
      let screenshotHeight: number | null = null
      const annotations: Annotation[] = []

      if (buffer) {
        const tempId = `tmp_${Date.now()}`
        const relativePath = getRelativeImagePath(this.projectId, tempId)

        // Create step to get real ID, then update path
        const step = stepsRepo.create({
          projectId: this.projectId,
          actionType: event.type,
          x: event.x,
          y: event.y,
          scrollDeltaX: event.scrollDeltaX,
          scrollDeltaY: event.scrollDeltaY,
          typedText: event.typedText,
          keyName: event.keyName,
          screenshotPath: null,
          capturedAt: event.timestamp
        })

        // Save screenshot with real step ID
        const realPath = getRelativeImagePath(this.projectId, step.id)
        saveImageBuffer(this.projectId, step.id, buffer)

        // Add click dot annotation for click events
        if ((event.type === 'click' || event.type === 'right_click' || event.type === 'double_click') && event.x !== null && event.y !== null) {
          const display = screen.getPrimaryDisplay()
          const dotPos = getClickDotPosition(
            event.x, event.y,
            event.x, event.y,
            display.scaleFactor,
            cropRadius
          )
          annotations.push({
            id: `dot_${step.id}`,
            type: 'click_dot',
            x: dotPos.x,
            y: dotPos.y,
            color: '#ef4444'
          })
          stepsRepo.updateAnnotations(step.id, annotations)
        }

        stepsRepo.update(step.id, { screenshotPath: realPath })
        screenshotPath = realPath

        // Get image dimensions from buffer (JPEG SOF marker)
        const dims = getJpegDimensions(buffer)
        if (dims) { screenshotWidth = dims.width; screenshotHeight = dims.height }

        const finalStep = stepsRepo.get(step.id)!
        this.stepCount++
        projectsRepo.updateStepCount(this.projectId)

        if (this.stepCount === 1) {
          projectsRepo.update(this.projectId, { thumbnailPath: realPath })
        }

        this.emit('stepCaptured', finalStep)
        logger.debug(`Step captured: ${event.type} at (${event.x}, ${event.y})`)
        return // ← must return here, no-screenshot path is separate
      }

      // No screenshot available — still record the step
      const step = stepsRepo.create({
        projectId: this.projectId,
        actionType: event.type,
        x: event.x,
        y: event.y,
        scrollDeltaX: event.scrollDeltaX,
        scrollDeltaY: event.scrollDeltaY,
        typedText: event.typedText,
        keyName: event.keyName,
        screenshotPath,
        screenshotWidth,
        screenshotHeight,
        capturedAt: event.timestamp
      })

      this.stepCount++
      projectsRepo.updateStepCount(this.projectId)
      this.emit('stepCaptured', step)
    } catch (err) {
      logger.error('Error processing captured event:', err)
    }
  }

  private emitState(): void {
    this.emit('stateChanged', {
      state: this._state,
      projectId: this.projectId,
      stepCount: this.stepCount,
      elapsedMs: this.elapsedMs
    })
  }
}

// Quick JPEG dimension parser (reads SOF0 marker)
function getJpegDimensions(buffer: Buffer): { width: number; height: number } | null {
  try {
    let i = 2
    while (i < buffer.length) {
      if (buffer[i] !== 0xff) break
      const marker = buffer[i + 1]
      const len = buffer.readUInt16BE(i + 2)
      if (marker >= 0xc0 && marker <= 0xc3) {
        const height = buffer.readUInt16BE(i + 5)
        const width = buffer.readUInt16BE(i + 7)
        return { width, height }
      }
      i += 2 + len
    }
  } catch {}
  return null
}

export const recordingSession = new RecordingSession()
