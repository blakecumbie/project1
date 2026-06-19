/**
 * Strict Content-Security-Policy installed at the session layer.
 *
 * `<meta http-equiv>` CSP is unreliable in Electron because:
 *   - it does not apply to subresources requested before the meta is parsed
 *   - it can be bypassed when the renderer is loaded from a non-http(s) scheme
 *
 * `webRequest.onHeadersReceived` is the canonical Electron-grade install point
 * — it is enforced by Chromium for every response, including the bootstrap HTML.
 */

import { session, app } from 'electron'
import { is } from '@electron-toolkit/utils'

/** Hosts that the renderer is allowed to talk to. Keep this list minimal. */
const ALLOWED_API_HOSTS = ['https://api.anthropic.com'] as const

const buildPolicy = (): string => {
  const connectSrc = ['\'self\'', ...ALLOWED_API_HOSTS]
  if (is.dev) connectSrc.push('http://localhost:*', 'ws://localhost:*')

  const scriptSrc = ['\'self\'']
  // Electron-vite injects an HMR client that needs eval ONLY in dev.
  // Production never includes 'unsafe-eval'.
  if (is.dev) scriptSrc.push('\'unsafe-eval\'')

  return [
    `default-src 'self'`,
    `script-src ${scriptSrc.join(' ')}`,
    // 'unsafe-inline' for styles is required by Tailwind/Radix runtime;
    // the Trusted-Types nonce alternative would force a build-system rewrite.
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' sopimg:`,
    `font-src 'self'`,
    `media-src 'self' blob:`,
    `connect-src ${connectSrc.join(' ')}`,
    `object-src 'none'`,
    `frame-ancestors 'none'`,
    `frame-src 'none'`,
    `child-src 'none'`,
    `worker-src 'self' blob:`,
    `form-action 'none'`,
    `base-uri 'none'`,
    `manifest-src 'self'`,
    `upgrade-insecure-requests`
  ].join('; ')
}

/**
 * Install CSP + companion security headers on every response served to the
 * default session. Must be called *after* `app.whenReady()` because it relies
 * on `session.defaultSession`.
 */
export function installContentSecurityPolicy(): void {
  const policy = buildPolicy()

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders }

    // Strip any policy the upstream may have set — we are the source of truth.
    for (const k of Object.keys(headers)) {
      const lower = k.toLowerCase()
      if (lower === 'content-security-policy' || lower === 'content-security-policy-report-only') {
        delete headers[k]
      }
    }

    headers['Content-Security-Policy'] = [policy]
    headers['X-Content-Type-Options'] = ['nosniff']
    headers['X-Frame-Options'] = ['DENY']
    headers['Referrer-Policy'] = ['no-referrer']
    headers['Cross-Origin-Opener-Policy'] = ['same-origin']
    headers['Cross-Origin-Resource-Policy'] = ['same-origin']
    headers['Cross-Origin-Embedder-Policy'] = ['require-corp']
    headers['Permissions-Policy'] = [
      'camera=(), microphone=(self), geolocation=(), display-capture=(), payment=(), usb=(), screen-wake-lock=()'
    ]

    callback({ responseHeaders: headers })
  })

  // Allow microphone (audio-only) for voice recording; deny camera and everything else.
  // 'media' covers both audio and video — inspect mediaTypes to restrict to audio only.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb, details) => {
    if (permission !== 'media') { cb(false); return }
    const types = (details as { mediaTypes?: string[] }).mediaTypes ?? []
    cb(types.length > 0 && types.every((t) => t === 'audio'))
  })
  session.defaultSession.setPermissionCheckHandler((_wc, permission, _origin, details) => {
    if (permission !== 'media') return false
    const types = (details as { mediaType?: string }).mediaType
    return types === 'audio'
  })

  // Block any certificate-error fallback. Pinning is enforced separately;
  // this is the last line of defense if Chromium's chain validation fails.
  app.on('certificate-error', (event, _wc, _url, _err, _cert, callback) => {
    event.preventDefault()
    callback(false)
  })
}
