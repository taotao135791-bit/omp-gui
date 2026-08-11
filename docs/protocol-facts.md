# OMP GUI ↔ Oh My Pi (pi) RPC — Verified Protocol Facts

Ground truth, verified against the installed `@earendil-works/pi-coding-agent` **0.80.3**
source (`dist/modes/rpc/*`, `node_modules/@earendil-works/pi-agent-core/dist/types.d.ts`).
Do not assume features from newer/older docs — check the installed binary first.

## Transport (pi 0.80.3)

- Session spawn: `pi --mode rpc` (plus flags: `--session`, `-e <ext>`, `--exclude-tools`, `--append-system-prompt`, `--model`, …).
- Framing: **strict LF-only JSONL** — one line == one JSON object. pi's own reader
  (`jsonl.js`) uses `StringDecoder` so multi-byte UTF-8 chars split across stream
  chunks are safe; it strips a trailing `\r`.
- There is **no** `ready` frame, **no** protocol negotiation, **no** `rpc_chunk`
  framing, **no** advertised frame-size limit in this version. The transport must
  keep a seam for these (see OmpTransport), but must not fabricate them.
- Commands (stdin) and responses (`{type:'response', command, success, data|error}`)
  correlate by optional command `id`.

## Commands (stdin, one JSON per line)

`prompt {message, images?, streamingBehavior?: 'steer'|'followUp'}` · `steer` · `follow_up` ·
`abort` · `get_state` · `set_model {provider, modelId}` · `set_thinking_level {level}` ·
`compact {customInstructions?}` · `set_auto_compaction` · `bash {command, excludeFromContext?}` ·
`get_session_stats` · `export_html {outputPath?}` · `switch_session` · `fork {entryId}` ·
`get_messages` · `get_entries` · `get_fork_messages` · `get_last_assistant_text` ·
`set_session_name {name}` · `get_commands` · `new_session`

`images`: `[{type:'image', data: base64, mimeType}]`.

## Events (stdout)

- `agent_start` / `agent_end {messages}` — `agent_end` **is** the terminal event of a
  run in this version (no `isTerminal` field). Design lifecycle code to honor
  `isTerminal` when upstream adds it; treat absent as terminal.
- `turn_start` / `turn_end {message, toolResults}` — per model round-trip.
- `message_start` / `message_update {assistantMessageEvent}` / `message_end {message}`:
  - `assistantMessageEvent`: `text_delta {delta}` and `thinking_delta {delta}` are the
    streamed payloads (start/end/toolcall variants exist and are noise for us).
  - `message_end.message.stopReason === 'error'` carries `errorMessage` — the ONLY
    place provider/transport failures surface (pi exits 0 on provider errors!).
- `tool_execution_start {toolCallId, toolName, args}` ·
  `tool_execution_update {toolCallId, toolName, args, partialResult}` ·
  `tool_execution_end {toolCallId, toolName, result, isError}` —
  **`toolCallId` is present and stable**; upstream runs tools **parallel by default**,
  so results arrive in completion order. Never match by name+recency.
- `compaction_start` / `compaction_end`.
- `extension_ui_request {id, method, ...}` — interactive: `select|confirm|input|editor`
  (answer with `extension_ui_response {id, value|confirmed|cancelled}`); fire-and-forget:
  `notify|setStatus|setWidget|setTitle|set_editor_text`.
- `extension_error {error}`.

## Session files

`~/.pi/agent/sessions/--<realpath(cwd) with / → ->--/<ISO-ts>_<uuid>.jsonl`;
first line `{type:'session', id, timestamp, cwd}`, then append-only entries
(`message`, `model_change`, `thinking_level_change`, `compaction`, …).
Resume: `pi --mode rpc --session <path>` appends to the same file.

## Approval extension contract (resources/omp-approval)

pi extensions load via `-e file.ts` (jiti). `api.on('tool_call', (event, ctx) => …)`
may return `{block: true, reason}`; `ctx.ui.select/confirm/input` surface as
`extension_ui_request` over RPC. Config via `OMP_APPROVAL_CONFIG` env → per-session
JSON `{mode: 'off'|'writes'|'all', locale}` re-read (mtime-cached) per tool call.
