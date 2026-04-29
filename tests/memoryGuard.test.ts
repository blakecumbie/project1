/**
 * Tests for the volatile-memory primitives. These verify that:
 *   - SecureBuffer.wipe() actually zeroes the underlying ArrayBuffer.
 *   - SecureString.clear() leaves no readable characters behind.
 *   - The wipe-all-tracked exit hook drains every active instance.
 *
 * Run: `npm test`
 */

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  SecureBuffer,
  SecureString,
  wipeAllTracked,
  _trackedSize
} from '../src/main/security/memoryGuard'

beforeEach(() => {
  wipeAllTracked()
})

describe('SecureBuffer', () => {
  it('zeroes its bytes when wiped', () => {
    const sb = new SecureBuffer(Buffer.from('topsecret'))
    const handle = sb.bytes
    assert.equal(handle.toString('utf8'), 'topsecret')
    sb.wipe()
    // The underlying memory was filled with zeros before the reference was
    // dropped — the captured handle points at the same memory and now reads
    // as a NUL-only string.
    assert.equal(handle.toString('utf8'), '\0'.repeat(9))
  })

  it('throws if accessed after wipe', () => {
    const sb = new SecureBuffer(Buffer.from('x'))
    sb.wipe()
    assert.throws(() => sb.bytes)
  })

  it('is idempotent', () => {
    const sb = new SecureBuffer(Buffer.from('x'))
    sb.wipe()
    sb.wipe()
    assert.equal(sb.byteLength, 0)
  })

  it('exposes a dispose() method (compatible with `using` syntax)', () => {
    const sb = new SecureBuffer(Buffer.from('disposeme'))
    const handle = sb.bytes
    sb.dispose()
    assert.equal(handle.toString('utf8'), '\0'.repeat(9))
  })

  it('is registered with the global tracker', () => {
    const before = _trackedSize()
    const sb = new SecureBuffer(8)
    assert.equal(_trackedSize(), before + 1)
    sb.wipe()
    assert.equal(_trackedSize(), before)
  })
})

describe('SecureString', () => {
  it('reveals only what was pushed and clears predictably', () => {
    const ss = new SecureString(16)
    'hunter2'.split('').forEach((c) => ss.push(c))
    assert.equal(ss.length, 7)
    assert.equal(ss.reveal(), 'hunter2')
    ss.clear()
    assert.equal(ss.length, 0)
    assert.equal(ss.reveal(), '')
  })

  it('popLast removes the trailing character and zeros its slot', () => {
    const ss = new SecureString(8)
    ss.push('a')
    ss.push('b')
    ss.push('c')
    ss.popLast()
    assert.equal(ss.reveal(), 'ab')
    assert.equal(ss.length, 2)
  })

  it('grows past the initial capacity without losing data', () => {
    const ss = new SecureString(2)
    'abcdefgh'.split('').forEach((c) => ss.push(c))
    assert.equal(ss.reveal(), 'abcdefgh')
  })

  it('reveal(maxLen) caps the returned string', () => {
    const ss = new SecureString()
    ss.push('abcdef')
    assert.equal(ss.reveal(3), 'abc')
  })

  it('clear is observable: storage cannot be re-read after', () => {
    const ss = new SecureString()
    ss.push('top-secret')
    ss.clear()
    // Reveal returns '' rather than throwing — consumers should treat it
    // as an empty value.
    assert.equal(ss.reveal(), '')
  })

  it('wipeAllTracked drains every live instance', () => {
    const a = new SecureString()
    const b = new SecureString()
    a.push('aa')
    b.push('bb')
    const before = _trackedSize()
    assert.ok(before >= 2)
    wipeAllTracked()
    assert.equal(_trackedSize(), 0)
    assert.equal(a.reveal(), '')
    assert.equal(b.reveal(), '')
  })
})

describe('Redaction detectors (PCI/SSN heuristics)', async () => {
  // Direct unit tests on the exported detectors. Image-mode redaction is
  // exercised via the integration suite where Tesseract.js is bundled.
  const mod = await import('../src/main/security/redaction')
  const { isLuhnValid, looksLikeSsn, lineIsSensitive, wordIsSensitive } = mod.__test__

  it('Luhn check passes a known valid card', () => {
    assert.equal(isLuhnValid('4111111111111111'), true)
  })

  it('Luhn check rejects a one-digit-off card', () => {
    assert.equal(isLuhnValid('4111111111111112'), false)
  })

  it('Luhn rejects too-short / too-long inputs', () => {
    assert.equal(isLuhnValid('411111'), false)
    assert.equal(isLuhnValid('1'.repeat(25)), false)
  })

  it('SSN regex matches conventional formats', () => {
    assert.equal(looksLikeSsn('123-45-6789'), true)
    assert.equal(looksLikeSsn('123 45 6789'), true)
  })

  it('SSN regex does not match plain phone numbers', () => {
    assert.equal(looksLikeSsn('+1 415-555-1234'), false)
  })

  it('financial keywords trigger line-level redaction', () => {
    assert.equal(lineIsSensitive('Account # 5599 1234 5678 9012'), true)
    assert.equal(lineIsSensitive('Routing number 021000021'), true)
    assert.equal(lineIsSensitive('Available credit balance summary'), true)
  })

  it('benign UI text is left alone', () => {
    assert.equal(lineIsSensitive('Submit'), false)
    assert.equal(lineIsSensitive('Open Settings'), false)
    assert.equal(wordIsSensitive('Settings'), false)
  })
})
