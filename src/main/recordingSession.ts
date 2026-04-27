import { EventEmitter } from 'events'
import type { RecordingState, StartRecordingPayload } from '@shared/types'
import { inputHooks, type CapturedEvent } from './inputHooks'
import { captureScreen, getClickDotPosition, getJpegDimensions } from './screenshotCapture'
import { stepsRepo } from './database/stepsRepo'
import { projectsRepo } from './database/projectsRepo'
import { saveImageBuffer, saveFullImageBuffer, getRelativeImagePath, getRelativeFullImagePath } from './utils/fileStore'
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

  // Serial processing queue — guarantees events are persisted in chronological order
  // even when screen capture for one event is slower than the next.
  private processQueue: Promise<void> = Promise.resolve()

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
    this.processQueue = Promise.resolve()

    inputHooks.on('event', this.onInputEvent)
    inputHooks.on('error', (err) => logger.error('Input hook error:', err))

    await inputHooks.start({
      captureTyping: config.captureTyping,
      captureScrolling: config.captureScrolling
    })

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

    if (this.debounceTimer) { clearTimeout(this.debounceTimer); this.debounceTimer = null }
    if (this.elapsedTimer) { clearInterval(this.elapsedTimer); this.elapsedTimer = null }

    if (this.pendingEvent) {
      this.enqueue(this.pendingEvent)
      this.pendingEvent = null
    }

    // Wait for any queued events to fully process before tearing down
    await this.processQueue

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

    const delay = event.type === 'scroll'
      ? (this.config?.screenshotDelay ?? DEFAULT_SCREENSHOT_DELAY_MS) * 2
      : (this.config?.screenshotDelay ?? DEFAULT_SCREENSHOT_DELAY_MS)

    this.pendingEvent = event

    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => {
      const ev = this.pendingEvent
      this.pendingEvent = null
      if (ev) this.enqueue(ev)
    }, delay)
  }

  // Append the event to the serial queue. Events are guaranteed to be processed
  // in the order they were enqueued — fixes out-of-order steps when capture races.
  private enqueue(event: CapturedEvent): void {
    this.processQueue = this.processQueue.then(() => this.processCapturedEvent(event))
  }

  private async processCapturedEvent(event: CapturedEvent): Promise<void> {
    if (!this.projectId || !this.config) return

    try {
      const cropRadius = this.config.cropRadius ?? DEFAULT_CROP_RADIUS
      const result = await captureScreen({
        displayId: this.config.displayId,
        cropX: event.x ?? undefined,
        cropY: event.y ?? undefined,
        cropRadius
      })

      if (result) {
        const dims = getJpegDimensions(result.croppedBuffer)
        const screenshotWidth = dims?.width ?? null
        const screenshotHeight = dims?.height ?? null

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
          screenshotWidth,
          screenshotHeight,
          fullScreenshotPath: null,
          cropX: result.cropX,
          cropY: result.cropY,
          cropRadius: result.cropRadius,
          scaleFactor: result.scaleFactor,
          capturedAt: event.timestamp
        })

        saveImageBuffer(this.projectId, step.id, result.croppedBuffer)
        saveFullImageBuffer(this.projectId, step.id, result.fullBuffer)

        const realPath = getRelativeImagePath(this.projectId, step.id)
        const realFullPath = getRelativeFullImagePath(this.projectId, step.id)

        // Click-dot annotation, in cropped image pixel coordinates
        if (
          (event.type === 'click' || event.type === 'right_click' || event.type === 'double_click') &&
          event.x !== null && event.y !== null &&
          screenshotWidth && screenshotHeight
        ) {
          const dotPos = getClickDotPosition(
            event.x, event.y,
            result.cropX, result.cropY,
            result.cropRadius,
            result.displayWidth, result.displayHeight,
            screenshotWidth, screenshotHeight
          )
          const annotations: Annotation[] = [{
            id: `dot_${step.id}`,
            type: 'click_dot',
            x: dotPos.x,
            y: dotPos.y,
            color: '#ef4444',
            opacity: 0.75
          }]
          stepsRepo.updateAnnotations(step.id, annotations)
        }

        stepsRepo.update(step.id, { screenshotPath: realPath, fullScreenshotPath: realFullPath })

        const finalStep = stepsRepo.get(step.id)!
        this.stepCount++
        projectsRepo.updateStepCount(this.projectId)

        if (this.stepCount === 1) {
          projectsRepo.update(this.projectId, { thumbnailPath: realPath })
        }

        this.emit('stepCaptured', finalStep)
        logger.debug(`Step captured: ${event.type} at (${event.x}, ${event.y})`)
        return
      }

      // No screenshot — still record the step (rare)
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

export const recordingSession = new RecordingSession()
