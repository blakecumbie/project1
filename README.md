# SOP Builder

An AI-powered screen recording SOP (Standard Operating Procedure) document builder — a full-featured Scribe AI duplicate.

## Features

- **Screen recording** — captures every click, keystroke, and scroll across any application
- **Auto screenshots** — takes a cropped screenshot at each action point with a click indicator
- **AI descriptions** — uses Claude (Anthropic API) to generate clear, specific step descriptions
- **Drag-to-reorder** — reorganize steps with drag-and-drop
- **Inline editing** — double-click any description to edit it
- **Export** — PDF, HTML (self-contained), and Markdown formats
- **Per-user install on Windows** — no admin privileges required

## Requirements

- **Anthropic API key** — get one at https://console.anthropic.com/settings/keys
- Node.js 18+ and npm (for development/building)

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
