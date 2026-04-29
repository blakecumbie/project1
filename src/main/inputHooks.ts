import { EventEmitter } from 'events'
import type { ActionType } from '@shared/types'
import { MAX_TYPED_TEXT_LENGTH } from '@shared/constants'
import { SecureString } from './security/memoryGuard'

export interface CapturedEvent {
  type: ActionType
  x: number | null
  y: number | null
  scrollDeltaX: number | null
  scrollDeltaY: number | null
  typedText: string | null
  keyName: string | null
  timestamp: number
}

class InputHookManager extends EventEmitter {
  private active = false
  private captureTyping = true
  private captureScrolling = true
  // Captured keystrokes are held in a wipeable TypedArray instead of a JS
  // string so that we can predictably zero the memory on flush / stop.
  private keyBuffer: SecureString = new SecureString(MAX_TYPED_TEXT_LENGTH)
  private lastMouseX = 0
  private lastMouseY = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private uiohook: any = null

  async start(opts: { captureTyping: boolean; captureScrolling: boolean }): Promise<void> {
    if (this.active) return
    this.captureTyping = opts.captureTyping
    this.captureScrolling = opts.captureScrolling
    this.keyBuffer.clear()
    this.keyBuffer = new SecureString(MAX_TYPED_TEXT_LENGTH)

    try {
      // Dynamic import — gracefully degrade if native module isn't available
      const { uIOhook, UiohookKey } = await import('uiohook-napi')
      this.uiohook = uIOhook

      uIOhook.on('mousedown', (e) => {
        if (!this.active) return
        this.flushKeyBuffer()
        let actionType: ActionType = 'click'
        if (e.button === 2) actionType = 'right_click'

        this.emit('event', {
          type: actionType,
          x: e.x,
          y: e.y,
          scrollDeltaX: null,
          scrollDeltaY: null,
          typedText: null,
          keyName: null,
          timestamp: Date.now()
        } satisfies CapturedEvent)
      })

      uIOhook.on('mousemove', (e) => {
        this.lastMouseX = e.x
        this.lastMouseY = e.y
      })

      if (this.captureScrolling) {
        uIOhook.on('wheel', (e) => {
          if (!this.active) return
          this.flushKeyBuffer()
          this.emit('event', {
            type: 'scroll',
            x: e.x,
            y: e.y,
            scrollDeltaX: 0,
            scrollDeltaY: e.direction === 3 ? (e.rotation ?? 1) * 120 : -(e.rotation ?? 1) * 120,
            typedText: null,
            keyName: null,
            timestamp: Date.now()
          } satisfies CapturedEvent)
        })
      }

      if (this.captureTyping) {
        uIOhook.on('keydown', (e) => {
          if (!this.active) return
          const keyName = (UiohookKey as unknown as Record<number, string>)[e.keycode] ?? null

          // Special keys flush the text buffer
          if (keyName === 'Return' || keyName === 'Tab' || keyName === 'Escape') {
            this.flushKeyBuffer()
            if (keyName !== 'Escape') {
              this.emit('event', {
                type: 'key',
                x: this.lastMouseX,
                y: this.lastMouseY,
                scrollDeltaX: null,
                scrollDeltaY: null,
                typedText: null,
                keyName,
                timestamp: Date.now()
              } satisfies CapturedEvent)
            }
            return
          }

          if (keyName === 'Backspace') {
            this.keyBuffer.popLast()
            return
          }

          // Printable character — accumulate
          if (e.keycode && !e.ctrlKey && !e.altKey && !e.metaKey) {
            const char = keyCodeToChar(e.keycode, e.shiftKey)
            if (char) {
              this.keyBuffer.push(char)
              if (this.keyBuffer.length >= MAX_TYPED_TEXT_LENGTH) this.flushKeyBuffer()
            }
          }
        })
      }

      uIOhook.start()
      this.active = true
    } catch (err) {
      this.emit('error', new Error(`Failed to start input hooks: ${err}`))
    }
  }

  stop(): void {
    if (!this.active) return
    this.flushKeyBuffer()
    try {
      this.uiohook?.stop()
      this.uiohook?.removeAllListeners()
    } catch {}
    this.keyBuffer.clear()
    this.active = false
  }

  private flushKeyBuffer(): void {
    if (this.keyBuffer.isEmpty()) return
    // Reveal once, immediately consume in the emit, then wipe the storage.
    const text = this.keyBuffer.reveal(MAX_TYPED_TEXT_LENGTH)
    this.keyBuffer.clear()
    this.keyBuffer = new SecureString(MAX_TYPED_TEXT_LENGTH)
    if (text.trim().length === 0) return
    this.emit('event', {
      type: 'type',
      x: this.lastMouseX,
      y: this.lastMouseY,
      scrollDeltaX: null,
      scrollDeltaY: null,
      typedText: text,
      keyName: null,
      timestamp: Date.now()
    } satisfies CapturedEvent)
  }
}

// Basic keycode → character mapping for common keys
function keyCodeToChar(keycode: number, shift: boolean): string | null {
  const map: Record<number, [string, string]> = {
    2: ['1', '!'], 3: ['2', '@'], 4: ['3', '#'], 5: ['4', '$'], 6: ['5', '%'],
    7: ['6', '^'], 8: ['7', '&'], 9: ['8', '*'], 10: ['9', '('], 11: ['0', ')'],
    16: ['q', 'Q'], 17: ['w', 'W'], 18: ['e', 'E'], 19: ['r', 'R'], 20: ['t', 'T'],
    21: ['y', 'Y'], 22: ['u', 'U'], 23: ['i', 'I'], 24: ['o', 'O'], 25: ['p', 'P'],
    30: ['a', 'A'], 31: ['s', 'S'], 32: ['d', 'D'], 33: ['f', 'F'], 34: ['g', 'G'],
    35: ['h', 'H'], 36: ['j', 'J'], 37: ['k', 'K'], 38: ['l', 'L'],
    44: ['z', 'Z'], 45: ['x', 'X'], 46: ['c', 'C'], 47: ['v', 'V'], 48: ['b', 'B'],
    49: ['n', 'N'], 50: ['m', 'M'], 57: [' ', ' '],
    12: ['-', '_'], 13: ['=', '+'], 26: ['[', '{'], 27: [']', '}'],
    39: [';', ':'], 40: ["'", '"'], 41: ['`', '~'], 43: ['\\', '|'],
    51: [',', '<'], 52: ['.', '>'], 53: ['/', '?']
  }
  const pair = map[keycode]
  if (!pair) return null
  return shift ? pair[1] : pair[0]
}

export const inputHooks = new InputHookManager()
