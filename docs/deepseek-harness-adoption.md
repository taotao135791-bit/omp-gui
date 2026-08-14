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
## Capability gating (what OMP actually exposes — verified 17.2.12)

| Capability | Status | Basis |
|---|---|---|
| Subagent roster | **supported** | `get_subagents` answers (live-only roster). Verified live in `integration/omp/subagent.compat.test.ts`. |
| Subagent progress events | **supported** | `set_subagent_subscription('progress')` accepted; `subagent_lifecycle`/`subagent_progress` normalize onto one `subagent` event. |
| Child transcript | **supported** | `get_subagent_messages` answers (incremental `fromByte`/`nextByte`); never merged into the root transcript. |
| Subagent control (kill/revive/park/steer) | **unsupported** | No such RPC exists in 17.2.12 (`subagentControl` stays `unsupported`). |
| Plan / Todo | **unknown** | OMP emits `todo_*` / `goal_updated`; the GUI does **not** invent a plan from Markdown. |
| Persistent terminal | **unsupported in this pass** | No second terminal runtime. |
| Session full-text search | **future** | Local-only FTS over OMP session files. |

Anything `unknown`/`unsupported` is rendered honestly (no dead buttons), never
faked.

## Stage 1 — Core truth cleanup

1. **Hermetic subprocess env** — `envMode: 'inherit' | 'replace'` on
   `makeExecRunner`, `RuntimeRpcClient.spawn`, `planSpawn`; integration replaces.
2. **Role selector thinking suffix** — `src/shared/modelSelector.ts`
   (`parseModelSelector` / `switchModelSelector`): `provider/model:high` →
   `{ modelSelector, thinkingOverride }`, and switching the default model keeps
   the role-level override (`A:high → B:high`).
3. **Steer explicit modeling** — `MessageLike.kind: 'prompt' | 'steer'`; steer
   also records a trajectory entry INSIDE the active turn (`foldUserSteer`).
4. **recentProjects bootstrap race** — hydrated once, MRU write guarded.
5. **Per-turn metadata** — `runtimeModel`/`runtimeThinking` reconstructed from
   OMP `get_state`/`get_messages` where possible; a GUI sidecar is the fallback
   for GUI-only metadata (documented, not yet needed).

## Stage 2/3 — Subagent bridge + multi-turn projection (this round)

**Host (main process):**
- Typed `OmpSession` methods + facade wrappers for `set_subagent_subscription`,
  `get_subagents`, `get_subagent_messages`.
- Post-handshake bootstrap: on a `current`-profile session the host subscribes
  at `progress` and hydrates the roster — a subscription failure never fails the
  session.
- `CliCapabilities` gains `subagents` / `subagentProgress` / `subagentMessages` /
  `subagentControl`, flipped only by REAL RPC responses (never guessed).
- Typed IPC + preload for `getSubagents` / `getSubagentMessages` (no arbitrary
  command passthrough; no kill/revive since none exists).

**Projection (renderer):**
- `execution.ts` rewritten to multi-turn: `ExecutionProjection = { agents,
  turns, turnOrder, currentTurnId }`. Agents are session-scoped (flat roster +
  root); turns are prompt-scoped (fresh `TurnProjection` per `agent_start`,
  per-turn tool counts / reasoning / trajectory).
- EXACT status mapping `normalizeOmpAgentStatus` (no substring guessing; unknown
  → `unknown`).
- `classifyToolCall` is the single tool classifier; the legacy chat row maps onto
  it (one classification source).
- `applyAgentRoster` merges `get_subagents` snapshots through the SAME
  `upsertAgent` reducer as live events — one graph, not two.

**Output retention:** `RetainedOutput` now wraps bash/read/generic tool output —
large outputs render head + hidden-count + tail by default, with a
keyboard-reachable expand to the full text. `retention.ts` is now actually used.

**Not yet (next round — Agent Hub + Trajectory product UI):** the Agent Hub tree
panel, child navigation, trajectory timeline/summary, interrupt/revive controls
(upstream doesn't expose them anyway), and search index. The projection + bridge
data layer for all of it is in place and tested.

## License compliance

See `THIRD_PARTY_NOTICES.md`. Every reused source file carries its own MIT
header with the source commit, and no upstream header was deleted. `retention.ts`
(adapted) and `atomicWrite.ts` (vendored) are in active use.

## Performance

- The projection is an immutable fold gated by `Object.is` (no-op events return
  the same reference), so Zustand selectors can memoize.
- The multi-turn fold only touches the current turn / the changed agent; it never
  deep-clones whole-session history per event.
- Large tool outputs are head/tail retained in the DOM by default, so a 4 MB
  output never materializes as tens of thousands of nodes.

## Remaining OMP upstream limitations

These are strictly **OMP runtime does not expose it** — not OMP GUI missing:

- Subagent kill/revive/park/unpark/steer (no RPC in 17.2.12; `idle`/`parked`
  exist only in the internal registry, not the RPC surface).
- A durable roster of already-completed subagents (`get_subagents` is live-only;
  terminal agents are dropped from the registry).
- Plan/todo as first-class runtime events (events exist; exact schema not yet
  confirmed against a live runtime).
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

