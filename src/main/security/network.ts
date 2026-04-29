/**
 * Outbound-network hardening:
 *   1. Force TLS 1.3 minimum on every HTTPS connection.
 *   2. Pin the SubjectPublicKeyInfo SHA-256 of `api.anthropic.com`
 *      (with a backup pin to allow rotation).
 *   3. Centralize the Anthropic header set so zero-data-retention is always
 *      sent — no caller can opt out.
 *
 * The agent is plumbed into the Anthropic SDK via `fetchOptions` (the SDK
 * v0.24 routes through `fetch()` internally; passing `dispatcher`/`agent`
 * via `fetchOptions` ensures both code paths are covered).
 */

import { Agent, AgentOptions } from 'https'
import { TLSSocket, PeerCertificate } from 'tls'
import { createHash } from 'crypto'
import { logger } from '../utils/logger'

/**
 * SubjectPublicKeyInfo SHA-256 base64 fingerprints for `api.anthropic.com`.
 *
 * Operators MUST regenerate these before each release window:
 *
 *   echo | openssl s_client -servername api.anthropic.com \
 *     -connect api.anthropic.com:443 2>/dev/null \
 *   | openssl x509 -pubkey -noout \
 *   | openssl pkey -pubin -outform DER \
 *   | openssl dgst -sha256 -binary | base64
 *
 * The list is checked in order; presence of ANY pin in the chain is sufficient.
 * Always keep at least one *backup* pin (next planned cert) to avoid bricking
 * clients during rotation.
 *
 * The values below are placeholders — they MUST be replaced via the
 * `ANTHROPIC_PINS` env at build time, comma-separated.
 */
const ANTHROPIC_PINS: ReadonlyArray<string> = (process.env.ANTHROPIC_PINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter((s) => s.length === 44) // base64 of a 32-byte SHA-256 is 44 chars

const ANTHROPIC_HOST = 'api.anthropic.com'

/** SHA-256 of a DER SubjectPublicKeyInfo, base64-encoded. */
function spkiFingerprint(cert: PeerCertificate): string {
  // Node exposes the SPKI bytes via `cert.pubkey` only on newer Node;
  // fall back to constructing from `cert.raw` would require a full ASN.1
  // parser. We rely on `cert.pubkey` being populated under Node 20+ which
  // ships in Electron 28.
  const pubkey = (cert as unknown as { pubkey?: Buffer }).pubkey
  if (!pubkey) throw new Error('cert.pubkey unavailable — cannot pin')
  return createHash('sha256').update(pubkey).digest('base64')
}

function buildPinnedAgent(): Agent {
  const opts: AgentOptions = {
    minVersion: 'TLSv1.3',
    // Belt-and-braces: also set maxVersion so a downgrade attack can't
    // negotiate TLS 1.2.
    maxVersion: 'TLSv1.3',
    keepAlive: true,
    ALPNProtocols: ['h2', 'http/1.1']
  }
  // Use a custom subclass so we can hook every connection without fighting
  // Node's overload signatures for `Agent.prototype.createConnection`.
  class PinnedAgent extends Agent {
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
  return new PinnedAgent(opts)
}

function verifyPin(socket: TLSSocket, host: string | undefined, cb: (err: Error | null) => void): void {
  socket.once('secureConnect', () => {
    if (host !== ANTHROPIC_HOST || ANTHROPIC_PINS.length === 0) {
      // Pinning only enforced for Anthropic right now. If pins aren't set,
      // we still required TLS 1.3 above; refuse the connection in production
      // builds because shipping with no pins is a misconfig.
      if (host === ANTHROPIC_HOST && process.env.NODE_ENV === 'production') {
        return cb(new Error('TLS pin set is empty; refusing to connect'))
      }
      return cb(null)
    }
    try {
      // `getPeerCertificate(true)` returns a `DetailedPeerCertificate` whose
      // chain links via `.issuerCertificate`. Older Node typings don't expose
      // that field on `PeerCertificate`, so we treat the chain as a generic
      // linked list of cert-shaped objects.
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
  if (!_agent) _agent = buildPinnedAgent()
  return _agent
}

/**
 * The Anthropic header set required for zero-data-retention.
 * Centralized so that no caller can opt out, and so that toggling the version
 * is a one-line change.
 */
export function anthropicSecurityHeaders(): Record<string, string> {
  return {
    'anthropic-version': '2023-06-01',
    // Header set communicated by Anthropic enterprise account managers.
    // Requires the org to be enrolled in ZDR.
    'anthropic-beta': 'zero-retention-2024-09-01',
    // Identify the client so anomalous traffic can be flagged at the gateway.
    'x-sopbuilder-client': 'sopbuilder-electron'
  }
}

/** Diagnostics for tests / startup logging. */
export function networkSummary(): string {
  return `TLS=1.3, pins=${ANTHROPIC_PINS.length}, host=${ANTHROPIC_HOST}`
}

export function logNetworkConfig(): void {
  logger.info(`network: ${networkSummary()}`)
}
