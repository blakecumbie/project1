# SOP Builder — Security Hardening Report

This document captures the threat model, vulnerabilities discovered in the prior
codebase (`v2.1.0`), and the controls implemented in the hardened release. It
must be reviewed by the security team prior to any deployment to a regulated or
financial-services network.

The application captures **raw screen content and keystrokes**. It is therefore
treated as a **high-value data-exfiltration target** and engineered to enterprise
PCI / financial-confidentiality standards.

---

## 1. Vulnerability Report — issues found in baseline `v2.1.0`

| # | Severity | Area | Finding | Status |
|---|----------|------|---------|--------|
| V-01 | **Critical** | Electron renderer | `sandbox: false` on both `mainWindow` and `overlayWindow`. A renderer compromise (XSS, malicious clipboard data, etc.) can spawn arbitrary OS processes via the V8 group. | Fixed |
| V-02 | **Critical** | Secret storage | `anthropicApiKey` is persisted **plaintext** in SQLite (`settings` table). On Windows the DB is in `%LOCALAPPDATA%` and readable by every process running as the user. | Fixed |
| V-03 | **Critical** | Data at rest | All cropped/full-screen JPEGs are written to disk **unencrypted** under `userData/images/`. Anyone with file-system access can exfiltrate them. | Fixed |
| V-04 | **High** | Renderer→main IPC | No runtime validation of any IPC payload. Renderer can send arbitrary objects (e.g. `id` containing path-traversal sequences) and the main process forwards them straight to SQL / `fs`. | Fixed (Zod) |
| V-05 | **High** | Navigation | `setWindowOpenHandler` blindly calls `shell.openExternal(url)` for any URL. A renderer compromise can launch arbitrary URI schemes (e.g. `file://`, `vbscript:`). | Fixed (allowlist) |
| V-06 | **High** | Navigation | No `will-navigate` handler — a malicious link/CSS can navigate the renderer to an attacker-controlled origin, breaking the same-origin assumption of the preload. | Fixed |
| V-07 | **High** | CSP | CSP is set only via `<meta>` tag, allows `'unsafe-eval'` in `script-src`, and allows `data:`/`blob:` images. `<meta>` CSP is bypassable in some Electron load paths. | Fixed |
| V-08 | **High** | PII / PCI | No redaction of credit-card numbers, SSNs, account numbers or financial tables before screenshots are written to disk or transmitted to the LLM. | **Removed in v2.2.2 (product decision)** — automatic OCR redaction was taken out at the owner's request; screenshots are stored as captured. Operators must avoid recording sensitive screens, as with any screen-capture tool. Manual redaction boxes remain available in the screenshot editor. |
| V-09 | **High** | Network | TLS version not enforced; connections fall back to TLS 1.2. No certificate pinning. No zero-data-retention header on Anthropic calls. | Fixed |
| V-10 | **High** | Custom protocol | `protocol.registerFileProtocol(IMG_PROTOCOL, …)` resolves the relative path with `join()` — a `..` segment can escape the images directory and read arbitrary files. | Fixed |
| V-11 | **Medium** | Ephemeral state | Captured keystroke buffer (`keyBuffer`) is a normal JS string; not zeroed after flush. Pending screenshot buffers are not wiped after persistence. | Fixed |
| V-12 | **Medium** | `OPEN_EXTERNAL` | Validation only checks `startsWith('http')`. `httpsmalicious://…` or `https://attacker.example` both pass. | Fixed (allowlist + `URL` parse) |
| V-13 | **Medium** | DB indirection | `projectsRepo.list` interpolates `orderBy`/`orderDir` directly into SQL. Inputs come from the renderer with no allowlist enforcement at runtime. | Fixed (Zod enum) |
| V-14 | **Medium** | Logging | `logger` writes raw error stacks (which may contain typed text or paths) to a flat-file log at `userData/logs/app.log`. | Mitigated — IPC validation failures log the channel name only, never payload values. |
| V-15 | **Low** | Supply chain | No SBOM. No automated vulnerability gate. `npm audit` not run on CI. | Fixed (script + CI) |

---

## 2. Threat Model (after hardening)

### Trust boundaries

```
┌───────────────────────────────────┐
│   Renderer (sandbox: true)        │  ← treated as untrusted
│   no node, no remote, strict CSP  │
└───────┬───────────────────────────┘
        │  contextBridge IPC (allow-list, Zod-validated)
┌───────▼───────────────────────────┐
│   Preload  (contextIsolation)     │
└───────┬───────────────────────────┘
        │  ipcMain handlers
┌───────▼───────────────────────────┐
│   Main process (Node, full FS)    │  ← only place that holds secrets
│   - keytar key vault              │
│   - AES-256-GCM at rest           │
│   - TLS 1.3 + cert pin            │
└───────────────────────────────────┘
```

### In scope

- Local malware running as the same user
- Compromised renderer (XSS in the React tree, malicious clipboard injection)
- Network adversary (MitM on Anthropic API)
- Insider with file-system read access to `%LOCALAPPDATA%`

### Out of scope

- Kernel-level rootkits, hardware key-loggers, EDR bypass
- Physical-access attackers with debugger privileges

---

## 3. Controls implemented

### 3.1 Window & navigation hardening (`src/main/windowManager.ts`)

- `nodeIntegration: false` — explicit on every `BrowserWindow`.
- `contextIsolation: true` — explicit.
- `sandbox: true` — explicit on every `BrowserWindow`.
- `webSecurity: true`, `allowRunningInsecureContent: false`, `experimentalFeatures: false`.
- `setWindowOpenHandler` returns `{ action: 'deny' }` and only opens external
  URLs that match the static allowlist (`https://console.anthropic.com`,
  `https://docs.anthropic.com`, `https://github.com/anthropics`).
- `will-navigate` listener cancels any navigation whose origin is not the
  renderer's own origin or `localhost` (dev mode only).
- `will-attach-webview` denies all `<webview>` attempts.
- `enableRemoteModule` was removed in Electron 12; the codebase uses Electron 28
  so the flag is unavailable. Defense-in-depth: we never `require('@electron/remote')`.
- The custom `sopimg://` protocol now rejects paths containing `..`, NUL bytes,
  or absolute prefixes, and validates the resolved path stays inside
  `userData/images/`.

### 3.2 Strict Content-Security-Policy (`src/main/security/csp.ts`)

Installed at startup via `session.defaultSession.webRequest.onHeadersReceived`,
applied to every response:

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';   /* required by Tailwind in dev */
img-src 'self' sopimg:;
font-src 'self';
connect-src 'self' https://api.anthropic.com;
object-src 'none';
frame-ancestors 'none';
form-action 'none';
base-uri 'none';
upgrade-insecure-requests;
```

`'unsafe-eval'` and `data:` / `blob:` are removed. The same policy is also set
in `<meta>` as defense-in-depth in case `onHeadersReceived` is bypassed by a
custom protocol load.

### 3.3 IPC payload validation (`src/main/security/ipcValidation.ts`)

- Every `ipcMain.handle` channel has a Zod schema.
- A wrapper `validatedHandle(channel, schema, fn)` parses the payload before
  calling the implementation. Validation failures return
  `{ error: 'invalid_payload' }` and are logged with the channel name (no
  payload values, to avoid log injection).
- The schemas reject `..`, NUL, non-UUID identifiers, and oversized strings.
- Renderer side: `src/preload/index.ts` already enforces a channel allow-list;
  this is unchanged but documented.

### 3.4 Local PII / PCI redaction — **removed in v2.2.2**

The automatic OCR redaction pipeline (`src/main/security/redaction.ts`, backed
by `tesseract.js` + `jimp`) was **removed at the product owner's request**.
Screenshots are now stored exactly as captured — no on-screen card numbers,
SSNs, or financial text are detected or blacked out automatically.

Operational guidance: because there is no automatic redaction, avoid recording
screens that display sensitive data, the same way you would with any
screen-capture or screen-sharing tool. Manual redaction boxes can still be drawn
per-screenshot in the in-app editor.

### 3.5 Ephemeral state & secure memory wipe (`src/main/security/memoryGuard.ts`)

- `SecureBuffer` wraps a `Buffer` with `wipe()` (`buffer.fill(0)` then nulls
  the reference) and a `[Symbol.dispose]()` for `using` blocks.
- `SecureString` stores characters in a TypedArray and provides `clear()`.
- `inputHooks.ts` now uses `SecureString` for the typed-text buffer; it is
  cleared after every flush and on `stop()`.
- `recordingSession.ts` wipes both cropped and full screenshot buffers as
  soon as they have been written to disk.
- A `process.on('exit')` hook in `index.ts` zeroes any tracked secure
  buffers before the process terminates.

### 3.6 Cryptography & key management (`src/main/security/secureStore.ts`)

- **Key generation** — on first run, a 32-byte key is generated with
  `crypto.randomBytes(32)` and stored in the OS credential vault via
  **keytar** under service `com.sopbuilder.app`, account `local-encryption-key`.
  - Windows → Credential Manager
  - macOS → Keychain
  - Linux → libsecret / kwallet
- **Encryption** — AES-256-GCM with a fresh random 12-byte IV per ciphertext.
  Output format: `version(1) || iv(12) || tag(16) || ciphertext(N)`.
- **What gets encrypted**:
  - Anthropic API key (settings store now writes only ciphertext).
  - Cached screenshots prior to export (`saveImageBuffer`).
- **No plaintext keys on disk**; no `.env` shipping; environment variables only
  read at boot for an explicit migration path.

### 3.7 Network & API hardening (`src/main/security/network.ts`)

- A custom `https.Agent` enforces `minVersion: 'TLSv1.3'` on every outbound
  call (Anthropic SDK `fetchOptions.agent` injection).
- **Certificate pinning** for `api.anthropic.com` — the connection is rejected
  unless the server certificate's SubjectPublicKeyInfo SHA-256 matches one of
  the configured pins (with a backup pin for rotation). Pins are configurable
  via `ANTHROPIC_PINS` env at build-time.
- **Anthropic zero-data-retention** — every request includes
  `anthropic-version: 2023-06-01` and `anthropic-beta: zero-retention-2024-09-01`
  (organization must have ZDR enabled). The header set is centralized so it
  cannot be bypassed by any caller.
- Outbound traffic is restricted by CSP `connect-src` and by the
  `app.on('certificate-error')` handler, which always denies.

### 3.8 Dependency hygiene (`scripts/security-audit.js`, `scripts/generate-sbom.js`)

- `npm run sbom` — emits a CycloneDX 1.5 SBOM at `dist/sbom.json` using
  `@cyclonedx/cyclonedx-npm`.
- `npm run audit:ci` — runs `npm audit --omit=dev --audit-level=high --json`
  and exits non-zero if any High/Critical CVE is found. Designed to be wired
  into CI as a release gate.
- `npm run security:full` — runs both. This must pass before any signed
  build artifact is produced.

---

## 4. Test coverage

- `tests/ipcValidation.test.ts` — fuzz-style cases for every Zod schema
  (path-traversal, oversized payloads, wrong types, prototype pollution).
- `tests/memoryGuard.test.ts` — verifies `SecureBuffer.wipe()` zeroes the
  underlying memory and that `SecureString.clear()` is observable.
- Unit tests are runnable via `npm test`.

---

## 5. Operator checklist before deployment

- [ ] `npm run security:full` exits 0.
- [ ] `dist/sbom.json` archived with the build artifact.
- [ ] Anthropic organization has ZDR enabled (verified out-of-band).
- [ ] Pinned certificate fingerprints reviewed and current.
- [ ] Code-signing certificate applied (Authenticode / DigiCert EV) — out of scope of this PR.
- [ ] Endpoint allowed-domains list reviewed (`api.anthropic.com` only).
- [ ] Disable telemetry / crash-reporter (already disabled — verify in `index.ts`).
