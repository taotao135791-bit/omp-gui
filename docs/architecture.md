# Architecture

OMP GUI is a **Desktop Host** for Oh My Pi (pi). It deliberately does **not**
reimplement the agent runtime — it owns the process, the wire, the desktop UX,
and the security boundary.

```
Electron Renderer (React)
    ↓ contextBridge IPC (typed, contextIsolation + sandbox)
Electron Main
    ↓ src/main/omp/*
Oh My Pi RPC  (pi --mode rpc, strict LF JSONL)
    ↓
OMP Runtime (agent, models, tools, extensions, sessions)
```

## Desktop Host responsibilities

- **Process lifecycle** — spawn/kill pi per session, stderr ring buffer, crash
  recovery (pending queries resolve, dialogs cancel, transcript survives on disk
  and can be resumed from History).
- **RPC transport** — `OmpTransport`: strict LF-only JSONL with a StringDecoder
  (multi-byte safe), 16 MB frame guard, and the seam for future protocol
  negotiation / chunked frames (pi 0.80.3 has neither — see
  `docs/protocol-facts.md`).
- **Session routing** — every event carries the stable GUI session id; the
  explicit `SessionRuntimeState` machine
  (`starting/idle/working/waiting_for_user/aborting/failed/closed`) decides when
  a turn is truly terminal — the queue only drains then.
- **IPC & security boundary** — `fsGuard` canonicalizes roots and targets with
  realpath so symlinks can't escape the project; API keys live only in pi's own
  `auth.json` (0600), never in the renderer.
- **Desktop UX** — composer, sessions, plugins, permissions, notifications,
  updates, i18n.

## OMP (pi) responsibilities

agent reasoning · model registry · tool execution (parallel by default, with
stable `toolCallId`) · extensions/skills/prompts · session persistence ·
compaction · provider auth.

> The GUI must not reimplement OMP runtime capabilities. When a capability is
> missing upstream, the UI degrades honestly instead of faking it.

## Rendering pipeline

```
Assistant Markdown
  ↓ fenced code language
Rich Renderer Registry (src/renderer/lib/richRenderers.ts)
  ↓ known language
Mermaid Renderer (src/renderer/lib/mermaid.ts — lazy import, serialized
  theme-aware renders, sandbox cleanup, error → source fallback)
  ↓ otherwise
CodeBlock
```

Tool calls render through `ToolRendererRegistry`
(`src/renderer/components/tools/`): bash (terminal panel), read, edit/write
(diff-colored), generic JSON fallback for extension tools.

## Error surfacing

Provider/transport failures surface from `message_end.errorMessage` (pi exits 0
on provider errors — see protocol facts). Process crashes surface with the
stderr tail and leave the session resumable. Transport errors (oversize frame,
malformed JSON) are contained to the session, never crash the app.
