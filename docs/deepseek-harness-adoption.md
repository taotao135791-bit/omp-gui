# DeepSeek Harness Adoption

This file records how DeepSeek Harness was used as an architecture / UI / reuse
reference for OMP GUI, and — critically — what was **not** imported. It is the
adoption matrix required before any cross-project reuse.

> **Guiding rule:** Oh My Pi is the only agent runtime. DeepSeek Harness is a
> reference and a source of reusable MIT code, never a second runtime. The goal
> is a desktop GUI that makes Oh My Pi's real capabilities observable — not a
> "DeepSeek Harness wearing OMP".

## Pinned reference snapshot

| | |
|---|---|
| Repository | `deepseek-ai/deepseek-harness` |
| Branch | `master` |
| Commit SHA | `47f943859bef60e4160492346772ded9b24f765a` |
| Commit date | 2026-08-13 |
| License | MIT (`Copyright (c) 2026 DeepSeek`) |

All source reuse, architecture comparison and test comparison in this pass are
based on this snapshot. Do not follow upstream `master` while developing.

## Adoption matrix

Reuse modes: `DIRECT_DEPENDENCY`, `VENDORED_SOURCE`, `ADAPTED_SOURCE`,
`REFERENCE_ONLY`, `SKIP`.

| Capability | DSH source | OMP equivalent | Reuse mode | Runtime owner | Decision |
|---|---|---|---|---|---|
| Atomic file write | `packages/util/atomic-write` | `electron-store` + ad-hoc `writeFileSync` | VENDORED_SOURCE | OMP GUI | Vendored `writeFileAtomic` for GUI-owned metadata sidecars (`src/main/lib/atomicWrite.ts`). |
| Output retention / spill | `packages/util/output-retention` | renderer renders full tool output | ADAPTED_SOURCE | OMP GUI | Adapted `TextRetainer` head/tail to line-oriented `headTailLines` (`src/renderer/lib/retention.ts`). |
| Timeout helpers | `packages/util/timeout` | Node `setTimeout` inline | SKIP | OMP GUI | No current gap its `AbortSignal` fusion solves. |
| Branded id types | `packages/util/brand` | plain string ids | SKIP | OMP GUI | Type-only nicety, no runtime benefit here. |
| Session projection | `packages/session/*` | renderer `SessionEvent` stream | REFERENCE_ONLY | OMP GUI | Borrowed the *fold + view* pattern; reimplemented as `src/renderer/lib/execution.ts`. |
| Subagent runtime | `packages/subagent/*` | OMP `subagent_*` RPC events | REFERENCE_ONLY | **Oh My Pi** | Only OMP subagents are used. DSH subagent runtime is never imported. |
| Subagent UI | `packages/client/ui-subagent` | (new) Agent Hub | REFERENCE_ONLY | OMP GUI | UX reference; the Agent Hub is built on `execution.ts`. |
| Trajectory UI | `packages/client/ui-trajectory` | (new) trajectory overview | REFERENCE_ONLY | OMP GUI | Borrowed grouping/timing concepts; reimplemented on OMP events. |
| Plan / Todo | `packages/plan`, `packages/todo`, `ui-plan` | OMP `todo_*`/`goal_*` events | REFERENCE_ONLY | **Oh My Pi** | OMP plan/todo events are the truth; no GUI-only task planner. |
| Jobs | `packages/jobs`, `ui-jobs` | OMP async work (subagents/commands) | REFERENCE_ONLY | **Oh My Pi** | No second job runtime; project OMP async work only. |
| Session query / search | `packages/session-query` | sidebar session search | REFERENCE_ONLY | OMP GUI | FTS/index design reference; implementation stays local-only over OMP session files. |
| Terminal | `packages/terminal` | OMP DAP/REPL (if any) | REFERENCE_ONLY | **Oh My Pi** | Not introduced; no second agent terminal runtime. |
| Agent loop / LLM / tools / LSP / sandbox / shell | `packages/core`, `llm`, `tool-*`, `code-runtime`, `lsp`, `sandbox`, `fs`, `shell` | OMP runtime | SKIP | **Oh My Pi** | Forbidden — OMP owns all of this. |
| Cordis DI/plugin kernel | `@deepseek-ai/cordis` | — | SKIP | — | Forbidden — no second plugin/DI kernel. |
| Credentials / settings / session persistence | `packages/credentials`, `settings`, `session/*` | OMP native auth + `~/.omp/agent` | SKIP | **Oh My Pi** | Forbidden — OMP owns credential/settings/session truth. |
## Code reused directly / adapted

### VENDORED_SOURCE — `src/main/lib/atomicWrite.ts`

- **Source:** `packages/util/atomic-write/src/index.ts`
- **Why not a dependency:** the npm package's `invariant.ts` companion depends
  on `@deepseek-ai/cordis`; the useful `writeFileAtomic` core is self-contained
  (`node:crypto`, `node:fs/promises`, `node:path`) and too small to justify a
  dependency edge.
- **Changes:** removed `withFileLock` (unused) and the Cordis companion; kept
  `writeFileAtomic` verbatim with an MIT header.
- **License:** MIT notice retained (header + `THIRD_PARTY_NOTICES.md`).

### ADAPTED_SOURCE — `src/renderer/lib/retention.ts`

- **Source:** `packages/util/output-retention/src/index.ts` (`TextRetainer`)
- **Why not verbatim:** upstream is byte-oriented (`Uint8Array` + `TextDecoder`)
  for process/body safety; the renderer already holds a decoded JS string, so a
  line-oriented head/tail is the natural fit and is UTF-8-safe by construction.
- **Changes:** `headTailLines(text, headLines, tailLines)` with an exact
  hidden-line count and a `formatHiddenLines` notice.
- **License:** MIT notice retained (header + `THIRD_PARTY_NOTICES.md`).

### ADAPTED_SOURCE — `src/renderer/lib/execution.ts` (pattern only)

- **Source:** `packages/session/session-stats/src/projection.ts` (fold + view)
- **Why not verbatim:** DSH folds DSH events (`step/start`, `tool/call`, …); OMP
  GUI folds its own normalized `SessionEvent` surface. The *pattern* — a pure
  `apply` fold with a `view` selector, `Object.is`-gated change feed — was
  borrowed, not the code.

## Runtime boundaries

```
Oh My Pi (omp|pi --mode rpc)
  = agent loop · reasoning · models · tools · subagents · LSP/DAP · memory ·
    skills · extensions · compaction · permissions · runtime state · sessions
        │  (OMP RPC: ready → negotiate_protocol → prompt/steer/tool_* …)
        ▼
OMP GUI Desktop Host (Electron main)
  = process lifecycle · transport · handshake · IPC · fsGuard · native auth UI ·
    settings adapters · approval · checkpoints · updater
        │  (typed contextBridge IPC, contextIsolation + sandbox)
        ▼
OMP GUI Renderer (React + Zustand)
  = visualization · interaction · projection · observability · workspace UX ·
    persistence of GUI-owned metadata
```

OMP GUI never spawns an agent, never calls a model, never runs a tool, and never
persists a session transcript itself — it only **projects** what OMP emits.
The new execution projection (`src/renderer/lib/execution.ts`) is part of the
renderer's projection layer, **not** a runtime.

## New architecture (projection layer)
## Capability gating (what OMP actually exposes)

| Capability | Status | Basis |
|---|---|---|
| Subagents | **supported** | OMP `subagent_lifecycle` / `subagent_event` / `subagent_progress` (gated by `set_subagent_subscription`, default off). Normalized tolerantly in `OmpProtocol.ts`. |
| Interrupt/kill a child agent | **unknown** | Requires OMP to expose an interrupt/kill RPC. No fake Stop button is shown until it exists. |
| Plan / Todo | **unknown → supported when events appear** | OMP emits `todo_*` / `goal_updated`; the GUI does **not** invent a plan from Markdown checklists. |
| Background jobs | **unknown** | Project OMP async work (long commands / subagents) only when a real lifecycle event exists. |
| Persistent terminal | **unsupported in this pass** | No second terminal runtime; OMP's DAP/REPL surface was not confirmed. |
| Session full-text search | **future** | Local-only FTS over OMP session files; design borrows `session-query`, no DSH query runtime imported. |

Anything `unknown`/`unsupported` is rendered honestly (no dead buttons), never
faked. The GUI degrades gracefully to the current behavior.

## Stage 1 — Core truth cleanup (done this pass)

1. **Hermetic subprocess env** — `envMode: 'inherit' | 'replace'` added to
   `makeExecRunner` (OmpConfigCli), `RuntimeRpcClient.spawn`, `planSpawn`
   (OmpProcess). Production inherits; integration replaces (never re-merges
   `process.env`, so test isolation cannot leak real credentials).
2. **Role selector thinking suffix** — `src/shared/modelSelector.ts`
   (`parseModelSelector` / `switchModelSelector`): `provider/model:high` parses
   to `{ modelSelector, thinkingOverride }`, and switching the default model
   preserves the role-level override (`A:high → B:high`).
3. **Steer explicit modeling** — `MessageLike.kind: 'prompt' | 'steer'`; a
   steered message is rendered as a user-like bubble with a `Steer` badge and
   belongs to the active turn, never a new prompt turn.
4. **recentProjects bootstrap race** — the persisted list is hydrated once
   (`recentProjectsLoaded`), and `setCurrentProject` no longer re-reads/re-writes
   the persistence store on every change.
5. **Per-turn metadata persistence** — `runtimeModel`/`runtimeThinking` remain
   reconstructed from the official OMP session where possible; a GUI sidecar is
   the fallback for GUI-only metadata (documented, not yet needed for model /
   thinking since `get_state`/`get_messages` carry them).

## License compliance

See `THIRD_PARTY_NOTICES.md`. Every reused source file carries its own MIT
header with the source commit, and no upstream header was deleted.

## Performance

- The projection is an immutable fold gated by `Object.is` (no-op events return
  the same reference), so Zustand selectors can memoize.
- Trajectory virtualization and search indexing remain future work; the current
  projection keeps a single chronological ledger (O(n) memory, no per-event
  deep re-copy of history).

## Remaining OMP upstream limitations

These are strictly **OMP runtime does not expose it** — not OMP GUI missing:

- Subagent interrupt/kill/revive (no confirmed RPC command).
- A durable child-agent transcript independent of the root session (read from
  OMP child sessions if/when they exist).
- Plan/todo as first-class runtime events (events exist; their exact schema was
  not confirmed against a live runtime in this pass).
- Persistent per-agent PTY (no confirmed terminal tool surface).

These are **OMP GUI missing** (future work in this repo):

- The Agent Hub **UI** (tree panel, focus mode, breadcrumb) on top of
  `execution.ts` — the projection is in place and tested; the component is next.
- The trajectory overview UI and virtualization.
- Session full-text search index.


```
Oh My Pi
   │  OMP RPC (SessionEvent — normalized by src/main/omp/OmpProtocol.ts)
   ▼
Normalized Runtime Events
   │  foldExecutionEvent (one fold, pure)
   ▼
Execution Projection  (sessionId → { agents, tools, trajectory })
   ┌────┼────┬────┬─────┐
 Chat  Agents Trajectory Plan Jobs
               │
            Session Query (future)
```

The same normalized fact stream feeds every surface; no surface keeps its own
copy of history. Chat continues to use the existing message list; the Agent Hub
and trajectory overview derive from `executions[sessionId]` selectors.

