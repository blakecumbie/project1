/**
 * Outbound-network hardening:
 *   1. Force TLS 1.2 minimum on every HTTPS connection (TLS 1.3 preferred).
 *   2. Optionally pin the SubjectPublicKeyInfo SHA-256 of `api.anthropic.com`
 *      when `ANTHROPIC_PINS` is set at build time.
 *
 * Pinning is **opt-in** — shipping a build with no pins still validates the
 * cert chain via Chromium's normal logic. Hard-failing every connection in
 * the absence of operator-supplied pins (the v2.2.0 behaviour) bricked the
 * default install for users who hadn't configured pins.
 */

import { Agent, AgentOptions } from 'https'
import { TLSSocket, PeerCertificate } from 'tls'
import { createHash } from 'crypto'
import { logger } from '../utils/logger'

/**
 * Optional SubjectPublicKeyInfo SHA-256 base64 fingerprints for
 * `api.anthropic.com`. Set via `ANTHROPIC_PINS=fp1,fp2` at build time.
 *
 * Generate with:
 *
 *   echo | openssl s_client -servername api.anthropic.com \
 *     -connect api.anthropic.com:443 2>/dev/null \
 *   | openssl x509 -pubkey -noout \
 *   | openssl pkey -pubin -outform DER \
 *   | openssl dgst -sha256 -binary | base64
 *
 * Always include a backup pin (next planned cert) to avoid bricking clients
 * during rotation.
 */
const ANTHROPIC_PINS: ReadonlyArray<string> = (process.env.ANTHROPIC_PINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter((s) => s.length === 44) // base64 of a 32-byte SHA-256 is 44 chars

const ANTHROPIC_HOST = 'api.anthropic.com'
const PINNED_HOSTS = new Set<string>([ANTHROPIC_HOST])

/** SHA-256 of a DER SubjectPublicKeyInfo, base64-encoded. */
function spkiFingerprint(cert: PeerCertificate): string {
  const pubkey = (cert as unknown as { pubkey?: Buffer }).pubkey
  if (!pubkey) throw new Error('cert.pubkey unavailable — cannot pin')
  return createHash('sha256').update(pubkey).digest('base64')
}

function buildSecureAgent(): Agent {
  const opts: AgentOptions = {
    // TLS 1.2 minimum — TLS 1.3 is preferred and negotiated by default but we
    // don't clamp maxVersion. Some upstream load balancers still negotiate
    // TLS 1.2 for the initial handshake.
    minVersion: 'TLSv1.2',
    keepAlive: true,
    ALPNProtocols: ['h2', 'http/1.1']
  }
  class SecureAgent extends Agent {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    createConnection(options: any, cb?: (err: Error | null, sock?: any) => void): any {
      const wrappedCb = cb
        ? (err: Error | null, sock?: any) => {
            if (err || !sock) return cb(err, sock)
            verifyPin(sock as TLSSocket, options.host, (verr) => {
              if (verr) {
                ;(sock as TLSSocket).destroy(verr)
                cb(verr)
                return
              }
              cb(null, sock)
            })
          }
        : undefined
      return super.createConnection(options, wrappedCb as never)
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }
  return new SecureAgent(opts)
}

function verifyPin(socket: TLSSocket, host: string | undefined, cb: (err: Error | null) => void): void {
  socket.once('secureConnect', () => {
    // Pinning only applies to known sensitive hosts AND only when the operator
    // has supplied pins. Otherwise we rely on Chromium's chain validation.
    if (!host || !PINNED_HOSTS.has(host) || ANTHROPIC_PINS.length === 0) {
      return cb(null)
    }
    try {
      type ChainNode = PeerCertificate & {
        issuerCertificate?: ChainNode
        fingerprint?: string
      }
      const cert = socket.getPeerCertificate(true) as unknown as ChainNode
      const seen = new Set<string>()
      let current: ChainNode | undefined = cert
      while (current && current.fingerprint && !seen.has(current.fingerprint)) {
        seen.add(current.fingerprint)
        try {
          const fp = spkiFingerprint(current)
          if (ANTHROPIC_PINS.includes(fp)) return cb(null)
        } catch {
          /* skip — try next link */
        }
        current = current.issuerCertificate
      }
      cb(new Error(`pin_mismatch:${host}`))
    } catch (e) {
      cb(e instanceof Error ? e : new Error(String(e)))
    }
  })
}

let _agent: Agent | null = null
export function pinnedHttpsAgent(): Agent {
  if (!_agent) _agent = buildSecureAgent()
  return _agent
}

/**
 * Anthropic-specific request headers. Only the API version is required.
 *
 * Zero-data-retention is enforced at the **organization** level in the
 * Anthropic console — there is no per-request beta header that toggles it.
 * Operators that need ZDR must enroll their org out-of-band; this client
 * does not (and cannot) opt them in via a header.
 */
export function anthropicSecurityHeaders(): Record<string, string> {
  return {
    'anthropic-version': '2023-06-01',
    'x-sopbuilder-client': 'sopbuilder-electron'
  }
}

/** Diagnostics for tests / startup logging. */
export function networkSummary(): string {
  return `TLS>=1.2, pins=${ANTHROPIC_PINS.length}, pinned-hosts=${[...PINNED_HOSTS].join(',')}`
}

export function logNetworkConfig(): void {
  logger.info(`network: ${networkSummary()}`)
}
