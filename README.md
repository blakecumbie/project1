# SOP Builder

An AI-powered screen recording SOP (Standard Operating Procedure) document builder — a full-featured Scribe AI duplicate.

## Features

- **Screen recording** — captures every click, keystroke, and scroll across any application
- **Auto screenshots** — takes a cropped screenshot at each action point with a click indicator
- **Full-screen storage** — stores the complete screen alongside each cropped thumbnail, enabling post-edit re-cropping
- **Screenshot editor** — click "Edit Screenshot" on any step to open the full editor modal:
  - **Freehand draw** — draw on screenshots with adjustable color, opacity, and stroke width
  - **Highlight** — drag to place translucent color highlights with adjustable opacity
  - **Re-crop** — drag the crop region to a new area of the full screenshot and apply
- **Click-dot annotations** — a semi-translucent pulsing dot marks every mouse click automatically
- **AI descriptions** — uses Claude (Anthropic API) to generate clear, specific step descriptions
- **Drag-to-reorder** — reorganize steps with drag-and-drop
- **Inline editing** — double-click any description to edit it
- **Export** — PDF, HTML (self-contained), and Markdown formats
- **Per-user install on Windows** — no admin privileges required

## What's new in v2.2.2 (multi-screen recording + overlay fixes)

- **Record multiple screens simultaneously** — the Start Recording dialog now
  lets you tick one or more connected displays (all are selected by default).
  Each captured action is screenshotted on whichever selected screen it happens
  on. Under the hood, the global click position is now mapped to the correct
  monitor and translated into that display's local space before cropping —
  which also fixes screenshots on secondary monitors being cropped from the
  wrong spot.
- **Working Pause & Stop on the recording control** — the floating control's
  buttons were nested inside the window's drag region, which on a frameless,
  transparent window swallowed their clicks. The drag region is now limited to
  the status area, so the buttons respond reliably.
- **Cleaner recording control** — removed the white box that appeared around the
  floating pill (the shared app background was painting behind the transparent
  window) and removed the live step counter. A small "Paused" label now shows
  when recording is paused.
- **Removed automatic on-screen redaction** — the OCR pipeline that blacked out
  detected card numbers / SSNs / financial text on every screenshot has been
  removed. Screenshots are now stored exactly as captured. (You can still draw
  manual redaction boxes in the screenshot editor.)

## What's new in v2.2.1 (recording overlay fixes + multi-provider AI)

- **Recording overlay** — the floating timer and step counter now actually
  update during a recording session (the v2.2 release wasn't relaying the 1Hz
  tick or per-step events to the overlay window). The overlay is also now
  draggable from any non-button area and has a new minimize button so it
  collapses to the taskbar instead of staying stuck on top.
- **Anthropic API key works again** — v2.2 introduced a hard cert-pinning
  requirement that bricked every Anthropic call when no `ANTHROPIC_PINS` env
  was supplied. Pinning is now opt-in: TLS is still locked to ≥ 1.2 and
  Chromium's chain validation runs as normal, but the connection isn't
  refused when no pins are configured.
- **Multi-provider AI** — pick your provider in Settings:
  - **Anthropic** (Claude Haiku / Sonnet / Opus)
  - **OpenAI** (GPT-4o / GPT-4o mini / GPT-4.1)
  - **Google** (Gemini 2.0 / 2.5 Flash, 2.5 Pro)
  - **Custom / Self-hosted (OpenAI-compatible)** — point at Ollama,
    LM Studio, vLLM, OpenRouter, Groq, Together, etc. Local servers don't
    need an API key.
  Existing v2.2.0 users with an Anthropic key set via the old `Anthropic
  API Key` field are migrated automatically on first launch — no re-entry
  required.

## What's new in v2.2 (enterprise security hardening)

This release re-engineers the app to enterprise security standards required
for deployment on restricted corporate networks handling confidential financial
data. Full report and threat model in [`SECURITY.md`](SECURITY.md).

- **Sandboxed renderers** — every `BrowserWindow` now runs with
  `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, and
  hardened web preferences (`webSecurity`, no `experimentalFeatures`, no
  spellcheck/webgl).
- **Strict navigation control** — `will-navigate`, `will-redirect` and
  `will-attach-webview` block off-origin destinations; `setWindowOpenHandler`
  enforces an external-URL allow-list.
- **Strict CSP via `onHeadersReceived`** — no `'unsafe-eval'` in production,
  no `data:`/`blob:` images, plus COOP/CORP/COEP/Permissions-Policy.
- **IPC payload validation** — every `ipcMain` channel is wrapped with a Zod
  schema; malformed or oversized payloads are rejected before reaching repos
  or the filesystem.
- **AES-256-GCM at rest + OS key vault** — a 32-byte master key is generated
  and stored in the OS credential manager via `keytar` (Windows Credential
  Manager / macOS Keychain / Linux Secret Service). The Anthropic API key is
  ciphertext-only in SQLite, with auto-migration from any pre-2.2 plaintext
  value.
- **Ephemeral state** — `SecureBuffer` / `SecureString` zero memory on
  dispose; raw screenshots and keystroke buffers are wiped immediately after
  use; `app.will-quit` drains every live secure buffer.
- **TLS 1.3 + cert pinning** — outbound HTTPS forces TLS 1.3 minimum and
  maximum (downgrade-blocked); SubjectPublicKeyInfo SHA-256 pinning for
  `api.anthropic.com` (configurable via `ANTHROPIC_PINS`); zero-data-retention
  header set on every Anthropic request.
- **Path-traversal-safe `sopimg://` protocol** — resolved paths are bounded
  to `userData/images`; `..`, NUL bytes, and absolute prefixes are rejected.
- **Supply-chain release gate** — `npm run sbom` (CycloneDX 1.5) and
  `npm run audit:ci` (fails on any High/Critical CVE in production deps).

### Breaking changes

- The `ANTHROPIC_API_KEY` env-only path is removed; the key is held in the
  OS vault. Existing plaintext SQLite entries are migrated transparently on
  first launch.
- `OPEN_EXTERNAL` only opens an allow-listed set of HTTPS hosts.
- `electron-builder` now unpacks `keytar` from the asar archive — rebuild your
  installer with `npm run package:win` to pick this up.

## What's new in v2.1 (bug fixes)

- **Steps land in chronological order** — events are now processed through a serial queue, so a slow screen capture for one event no longer lets the next event's step jump ahead.
- **Click dot stays glued to the click point** — was previously rendered with absolute pixel positioning over a responsive image, causing it to drift as the container resized. Now rendered as an SVG circle that scales with the screenshot.
- **Highlights and drawings stay where you put them** — the editor now displays the cropped image (the same view shown in the guide) for draw/highlight tools, so coordinates match. Switching to re-crop mode swaps in the full screenshot for crop selection.
- **Inline description editing** — `Ctrl+Enter` saves, `Esc` cancels, and the textarea no longer shows a stale value when an AI-generated description arrives after mount.
- **Screenshot dimensions persisted** — fixes alignment of all SVG annotations against the actual image (was previously falling back to a 900×600 viewBox).

## Upgrading from v1.x, v2.0, v2.1, or v2.2.0

1. Download `releases/SOP-Builder-Setup-2.2.1.exe`
2. Run it — **no need to uninstall the previous version first.** It overwrites the app files in place.
3. SmartScreen may warn again. Click **More info → Run anyway**.
4. Your existing guides and settings are preserved automatically.
5. Steps recorded in v1 won't support re-cropping (full screenshots weren't stored in v1). Re-record those steps to enable re-cropping. Steps recorded in v2.0 will work normally; click-dots and existing annotations on those steps may need a one-time refresh by reopening the project.

## Installation (Windows 11 — no admin required)

**Latest installer:** [`releases/SOP-Builder-Setup-2.2.1.exe`](releases/SOP-Builder-Setup-2.2.1.exe)

1. Download the `.exe` (85 MB)
2. Double-click to run — **no UAC prompt, no admin required**
3. Windows SmartScreen may warn "Windows protected your PC" (the installer isn't code-signed). Click **More info** → **Run anyway**
4. Installer places the app at `%LOCALAPPDATA%\Programs\SOP Builder\`
5. Creates Start Menu and Desktop shortcuts in your user profile only
6. Registers in **Add/Remove Programs** (per-user) so you can uninstall cleanly

### First run
1. Launch **SOP Builder** from the Start Menu or Desktop
2. Go to **Settings** → paste your Anthropic API key → **Save**
3. Click **New Recording** → configure → **Start Recording**
4. Work through your process — the app captures silently in the background
5. Click the floating red **Stop** button (or press `Ctrl+Shift+R`)
6. Click **AI Descriptions** to generate step descriptions automatically
7. Click **Export** to save as PDF, HTML, or Markdown

### Known Windows considerations
- **Input hooks**: some enterprise Group Policy settings block low-level keyboard/mouse hooks. If recording produces zero steps, your IT department has this locked down.
- **Unsigned binary**: we don't ship a code-signing certificate. SmartScreen will warn the first time; after running once it stops.
- **Antivirus**: rare false positives on the `uiohook-napi.node` binary (it's a low-level input hook, which AV products sometimes flag). Whitelist the install folder if needed.

## Requirements

- **Anthropic API key** — get one at https://console.anthropic.com/settings/keys
- Node.js 18+ and npm (only for development/building from source)

## Development

```bash
npm install
npm run dev        # Start in dev mode (Linux / Mac)
```

## Build for Windows (from Windows machine)

```bash
npm install
npm run package:win
```

The installer (`SOP Builder-Setup-1.0.0.exe`) will be in the `dist/` folder.

**Per-user install** — the NSIS installer is configured with `perMachine: false`, so it installs to `%LOCALAPPDATA%\Programs\SOP Builder\` without requiring admin privileges.

## Windows 11 Input Permissions

On Windows, capturing global mouse/keyboard events uses `SetWindowsHookEx` which works without admin rights. However, some enterprise IT policies may block input hooks. If recording captures no steps, check with your IT department.

## First Run

1. Open the app and go to **Settings**
2. Enter your Anthropic API key
3. Click **New Recording** in the sidebar
4. Configure options and click **Start Recording**
5. Work through your process — the app captures in the background
6. Click the floating **Stop** button (or press `Ctrl+Shift+R`)
7. Click **AI Descriptions** to generate descriptions automatically
8. **Export** your guide as PDF, HTML, or Markdown

## Project Structure

```
src/
  main/         Electron main process (recording, AI, DB, exports)
  preload/      Context bridge (IPC bridge to renderer)
  renderer/     React UI (dashboard, document editor, settings)
  shared/       Shared types and IPC channel constants
```
