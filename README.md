# OMP GUI

A Codex-style desktop GUI for [Oh My Pi](https://omp.sh) (omp), the fork of [Pi](https://github.com/badlogic/pi-mono) that brings IDE-level capabilities into a terminal AI coding agent.

The main differentiator is the **"Assemble your Pi"** customization page, where you can visually enable, disable, and arrange omp extension modules.

## Features

- **Codex-like layout**: left sidebar for sessions/projects, center chat panel, right panel for file tree and preview.
- **Chat with Oh My Pi**: spawn sessions in any project folder, send prompts, and stream back responses and tool calls.
- **Tool call visualization**: `read`, `bash`, `edit`, and custom tool calls rendered as expandable cards.
- **File tree & preview**: browse the project directory and preview file contents in the right panel.
- **Assemble your Pi**: enable/disable installed extensions; the GUI passes `-e <path>` to omp so only assembled modules load for new sessions.

## Tech Stack

- Electron + Vite
- React + TypeScript
- Tailwind CSS
- Zustand
- Lucide icons

## Prerequisites

- Node.js 18+
- pnpm
- [Oh My Pi](https://omp.sh) or Pi CLI installed and available on `PATH`

## Install

```bash
pnpm install
```

## Development

> Important: the shell environment may set `ELECTRON_RUN_AS_NODE=1`, which breaks Electron. The `dev` script unsets it automatically.

```bash
pnpm dev
```

## Build

```bash
pnpm build
```

## Package

```bash
pnpm package
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
│   │   ├── omp.ts             # omp CLI session manager
│   │   ├── modules.ts         # extension scanner
│   │   ├── preload.ts         # contextBridge API
│   │   └── store.ts           # electron-store persistence
│   ├── renderer/              # React frontend
│   │   ├── components/        # Layout, Sidebar, ChatPanel, etc.
│   │   ├── pages/             # ChatPage, CustomizePage
│   │   ├── store/             # Zustand store
│   │   └── types/             # renderer type declarations
│   └── shared/                # constants + types shared across processes
└── tailwind.config.js
```

## Notes

- The GUI detects `omp` first and falls back to `pi` if omp is not installed.
- If no CLI is found, the "New Chat" button is disabled and a warning is shown.
