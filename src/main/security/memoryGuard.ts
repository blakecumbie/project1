/**
 * Volatile-memory primitives. These are NOT a substitute for OS-level
 * protection — V8 makes no hard guarantees about when GC reclaims a string —
 * but they give us a predictable wipe point for raw screenshots and key
 * material before we drop the only reference.
 *
 * Important caveats for reviewers:
 *   - `Buffer.fill(0)` overwrites the underlying ArrayBuffer storage. After
 *     `wipe()` returns, a heap-snapshot taken at that moment will not contain
 *     the original bytes.
 *   - `SecureString` stores characters in a Uint16Array (one TypedArray slot
 *     per UTF-16 code unit). It is appropriate for keystroke buffers and API
 *     keys; it is NOT appropriate for arbitrary user prose.
 */

const tracked = new Set<{ wipe: () => void }>()

export class SecureBuffer {
  private buf: Buffer | null

  constructor(input: Buffer | Uint8Array | number) {
    if (typeof input === 'number') {
      this.buf = Buffer.alloc(input)
    } else if (Buffer.isBuffer(input)) {
      // We take ownership — caller must not hold their own reference.
      this.buf = input
    } else {
      this.buf = Buffer.from(input)
    }
    tracked.add(this)
  }

  /** Returns a *view* of the underlying buffer. Do not retain across `wipe()`. */
  get bytes(): Buffer {
    if (!this.buf) throw new Error('SecureBuffer: already wiped')
    return this.buf
  }

  get byteLength(): number {
    return this.buf?.length ?? 0
  }

  /** Zeroes the underlying memory and drops the reference. Idempotent. */
  wipe(): void {
    if (this.buf) {
      this.buf.fill(0)
      this.buf = null
    }
    tracked.delete(this)
  }

  /**
   * Manual disposal hook. We intentionally use a named method rather than
   * `[Symbol.dispose]` so the file compiles under tsconfig `lib: ES2022`.
   * If Node's runtime has `Symbol.dispose`, the prototype is patched below
   * so `using` syntax also works.
   */
  dispose(): void {
    this.wipe()
  }
}

const disposeSym = (Symbol as unknown as { dispose?: symbol }).dispose
if (disposeSym) {
  ;(SecureBuffer.prototype as unknown as Record<symbol, unknown>)[disposeSym] = SecureBuffer.prototype.dispose
}

export class SecureString {
  private storage: Uint16Array | null
  private len = 0

  constructor(initialCapacity = 64) {
    this.storage = new Uint16Array(Math.max(8, initialCapacity))
    tracked.add(this)
  }

  push(ch: string): void {
    if (!this.storage) throw new Error('SecureString: cleared')
    for (let i = 0; i < ch.length; i++) {
      if (this.len >= this.storage.length) this.grow()
      this.storage[this.len++] = ch.charCodeAt(i)
    }
  }

  popLast(): void {
    if (!this.storage) return
    if (this.len > 0) {
      this.len -= 1
      this.storage[this.len] = 0
    }
  }

  get length(): number {
    return this.len
  }

  /**
   * Materialize as a JS string. Only call this immediately before passing
   * the value to a sink that can't accept a Uint16Array (e.g. SQLite). After
   * the call you should `clear()` and not retain the returned string longer
   * than necessary.
   */
  reveal(maxLen?: number): string {
    if (!this.storage) return ''
    const end = maxLen !== undefined ? Math.min(this.len, maxLen) : this.len
    return String.fromCharCode(...this.storage.subarray(0, end))
  }

  isEmpty(): boolean {
    return this.len === 0
  }

  clear(): void {
    if (this.storage) {
      this.storage.fill(0)
      this.storage = null
    }
    this.len = 0
    tracked.delete(this)
  }

  wipe(): void {
    this.clear()
  }

  /** Manual disposal hook; prototype is patched below for `using` syntax. */
  dispose(): void {
    this.clear()
  }

  private grow(): void {
    if (!this.storage) return
    const next = new Uint16Array(this.storage.length * 2)
    next.set(this.storage)
    this.storage.fill(0)
    this.storage = next
  }
}

if (disposeSym) {
  ;(SecureString.prototype as unknown as Record<symbol, unknown>)[disposeSym] = SecureString.prototype.dispose
}

/** Wipe every tracked SecureBuffer / SecureString. Call from `app.on('will-quit')`. */
export function wipeAllTracked(): void {
  for (const item of [...tracked]) {
    try {
      item.wipe()
    } catch {
      /* ignore — best effort */
    }
  }
  tracked.clear()
}

/** Test/inspection only. */
export function _trackedSize(): number {
  return tracked.size
}
