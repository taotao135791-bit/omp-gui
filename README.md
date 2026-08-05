# OMP GUI

A desktop GUI for [Oh My Pi](https://omp.sh) / [Pi](https://github.com/badlogic/pi-mono) — a Codex-style coding agent you assemble yourself.

## Download

**macOS** — download, open the DMG, drag OMP GUI into Applications:

- [Apple Silicon (M1/M2/M3/M4)](https://github.com/taotao135791-bit/omp-gui/releases/latest/download/OMP-GUI-arm64.dmg)
- [Intel](https://github.com/taotao135791-bit/omp-gui/releases/latest/download/OMP-GUI-x64.dmg)

> The app is not notarized. On first launch macOS may say it can't be opened: right-click the app → **Open** → **Open**, or run `xattr -cr "/Applications/OMP GUI.app"`.

The app auto-detects an installed `omp`/`pi` CLI, or offers to install Oh My Pi on first run.

## Features

- **Codex-style layout** — sidebar with sessions & projects, streaming chat in the middle, file tree + preview on the right. Chinese/English UI, light & dark themes.
- **Model & API keys** — pick from 26 providers (Anthropic, OpenAI, Gemini, DeepSeek, Kimi, MiniMax, ZAI, OpenRouter, …) and paste your API key in Settings. Keys are written to pi's own `~/.pi/agent/auth.json` (chmod 600) — the CLI and the GUI share them. The model dropdown is fed by pi itself (`get_available_models`), so you only ever see models your keys can actually run; switch models live from the composer picker mid-session.
- **Permissions** — tool access modes (full access / no Bash / read-only) applied to new sessions, plus project-trust control for project-local plugins.
- **Assemble your Pi** — the plugin page works like a mecha bay: drag parts onto the core to mount them, drag back to the rack to detach, drop to the red zone to uninstall. Install npm/git/local packages or drop a folder straight from Finder. Only mounted parts load into new chats, keeping pi lean.
- **Interactive plugin dialogs** — when an extension asks (select / confirm / input / editor), a real dialog pops up in the chat instead of hanging the agent.
- **Tool call visualization** — `read`, `bash`, `edit` and custom tool calls rendered as expandable cards.

## Tech Stack

- Electron + Vite
- React + TypeScript
- Tailwind CSS
- Zustand
- Lucide icons

## Development

Prerequisites: Node.js 18+, pnpm, and [Oh My Pi](https://omp.sh) or Pi CLI on `PATH`.

> Important: the shell environment may set `ELECTRON_RUN_AS_NODE=1`, which breaks Electron. The `dev` script unsets it automatically.

```bash
pnpm install
pnpm dev
```

## Test & Build

```bash
pnpm test        # vitest unit tests
pnpm build       # type-check + bundle
pnpm package     # electron-builder → release/
```

## Project Structure

```
omp-gui/
├── electron.vite.config.ts    # electron-vite configuration
├── package.json
├── src/
│   ├── main/                  # Electron main process
│   │   ├── index.ts           # window lifecycle
│   │   ├── ipc.ts             # IPC handlers
│   │   ├── omp.ts             # pi/omp RPC session manager
│   │   ├── protocol.ts        # RPC JSONL parser (pure)
│   │   ├── packages.ts        # pi package management
│   │   ├── piSettings.ts      # pi settings.json / auth.json
│   │   ├── preload.ts         # contextBridge API
│   │   └── store.ts           # electron-store persistence
│   ├── renderer/              # React frontend
│   │   ├── components/        # Layout, Sidebar, ChatPanel, ExtensionUiDialog, …
│   │   ├── pages/             # ChatPage, PackagesPage, SettingsPage, SetupWizard
│   │   ├── store/             # Zustand store
│   │   └── i18n.ts            # Chinese/English dictionaries
│   └── shared/                # constants + types shared across processes
└── tailwind.config.js
```

## Notes

- The GUI detects `omp` first and falls back to `pi` if omp is not installed.
- If no CLI is found, the "New Chat" button is disabled and a setup wizard offers auto-install.
- pi itself has no built-in tool approval prompts; the GUI's permission modes work by passing `--exclude-tools` to new sessions.
