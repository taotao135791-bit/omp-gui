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
- **Checkpoints & rollback** — every prompt snapshots the git worktree (no touch to your index, stash or refs). Hover any user message to roll the code back to before that message; the chat history stays put.
- **Message queue & steering** — keep typing while the agent works: Enter queues, each queued card can steer mid-turn or be deleted; the queue drains automatically when the turn ends.
- **Per-tool approval** — the bundled omp-approval extension asks before bash/edit/write in the new "Ask" permission mode (Allow once / Always allow / Deny), with per-session config files so parallel sessions never clobber each other. Classic modes (full / no-bash / read-only) remain.
- **Changes view & git chip** — a Changes tab in the right panel lists worktree changes with +add/−del and a full diff per file (untracked files synthesized); the chat header shows the current branch and total diffstat, refreshing after every turn.
- **Session list that scales** — search, pin, archive, working/unread status dots, and a system notification when a turn finishes in the background (click to jump to the session).
- **Composer power-ups** — `@` fuzzy file references, image paste & attach (up to 4×10MB), a thinking-level picker (off/low/medium/high) synced with the live session, and self-teaching placeholders.
- **Auto-update** — checks GitHub Releases on launch and from Settings → About; downloads in the background and installs on restart.
- **Session export** — one click exports the transcript to a styled HTML file in ~/Downloads.
- **Model & API keys** — pick from 26 providers (Anthropic, OpenAI, Gemini, DeepSeek, Kimi, MiniMax, ZAI, OpenRouter, …) and paste your API key in Settings. Keys are written to pi's own `~/.pi/agent/auth.json` (chmod 600) — the CLI and the GUI share them. The default-model dropdown is fed by pi's built-in model registry (1,000+ models), so every model a provider supports is selectable even before its key is stored; the composer picker lists the models your keys can actually run and switches the live session mid-chat.
- **Permissions** — tool access modes (full access / no Bash / read-only) applied to new sessions, plus project-trust control for project-local plugins.
- **Assemble your Pi** — the plugin page works like a mecha bay: drag parts onto the core to mount them, drag back to the rack to detach, drop to the red zone to uninstall. Install npm/git/local packages or drop a folder straight from Finder. Only mounted parts load into new chats, keeping pi lean.
- **Discover & build plugins** — curated picks and a live search of the npm `pi-package` ecosystem sit right on the plugin page, one click to install. Nothing fits? The "build your own" entry starts a chat that scaffolds a pi extension or skill for you.
- **Clean skill scope** — chats load only pi's own abilities plus your mounted packages. Skills other agents installed on this machine (`~/.agents/skills`) are excluded by default via pi's `!<name>` override list, with an opt-in toggle in Settings.
- **Usage monitor** — a corner chip tracks the live session: total tokens, prompt-cache hit rate, context-window fill (amber/red as it fills) and cost. Compaction shows a live indicator in the header and the chip; `/compact` squeezes the context on demand.
- **Slash commands** — type `/` in the composer for a searchable menu of everything the session offers (extension commands, prompt templates, skills from your installed packages), with keyboard navigation.
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
- pi itself has no built-in tool approval prompts; coarse permission modes work by passing `--exclude-tools` to new sessions, and the "Ask" mode's per-call prompts come from the bundled `resources/omp-approval` extension, which hooks pi's `tool_call` event and asks through the GUI's dialog bridge.
- Auto-update runs through electron-updater against GitHub Releases. The dmgs are unsigned (no Apple Developer ID), so macOS refuses in-app installs — when that happens Settings → About offers the download page as a one-click fallback.
- Completion and approval-waiting notifications are standard macOS notifications; the first one triggers the system's permission prompt, which decides whether later ones arrive.
