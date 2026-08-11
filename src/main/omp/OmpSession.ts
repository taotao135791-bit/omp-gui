import {
  ExtensionUiAnswer,
  PromptImage,
  Session,
  SessionEvent,
  SessionRuntimeState,
  StreamingBehavior
} from '../../shared/types'
import { LineReader, serializeCommand, StderrRing } from './OmpTransport'
import { extensionUiResponse, parseRpcLine } from './OmpProtocol'

/**
 * One live `pi --mode rpc` session: the child process, its JSONL transport,
 * in-flight RPC queries and an explicit runtime state machine.
 *
 * The process is injected (a real ChildProcess in production, an
 * EventEmitter-based fake in tests); this class never spawns by itself —
 * assembly lives in OmpProcess.
 *
 * State machine (SessionRuntimeState):
 *
 * | from                          | trigger                                | to               | emitted                     |
 * |-------------------------------|----------------------------------------|------------------|-----------------------------|
 * | starting                      | constructor (process wired)            | idle             | connected                   |
 * | idle                          | agent_start                            | working          | status:working              |
 * | working                       | interactive extension_ui_request       | waiting_for_user | ui_request                  |
 * | waiting_for_user              | respondExtensionUi                     | working          | — (renderer stays busy)     |
 * | working / waiting_for_user    | abort()                                | aborting         | —                           |
 * | aborting / working            | agent_end (isTerminal !== false)       | idle             | status:idle                 |
 * | working                       | agent_end with isTerminal === false    | working          | — (suppressed, future-proof)|
 * | working / aborting / waiting… | error event (failed cmd / provider)    | idle             | error + status:idle         |
 * | any (not closed)              | process exit, code ≠ 0                 | failed → closed  | error(+stderr tail) → closed|
 * | any (not closed)              | process exit, code 0 / null            | closed           | closed                      |
 * | any (not closed)              | process 'error' (spawn failure)        | failed → closed  | error → closed              |
 * | any                           | kill()                                 | closed           | — (renderer initiated)      |
 *
 * Duplicate status events are suppressed (e.g. a second agent_end after an
 * error already ended the turn) so the renderer never drains its queue
 * twice for one turn. Pending RPC queries all resolve(null) on failed/closed.
 */
export class OmpSession {
  readonly session: Session
  private readonly id: string
  private state: SessionRuntimeState = 'starting'
  private readonly pending = new Map<string, PendingQuery>()
  private readonly reader = new LineReader()
  private readonly stderrRing = new StderrRing()
  /** Assistant text of the in-flight turn, accumulated from text deltas. */
  private draftText = ''
  /** Finalized assistant text of the last completed turn (for notifications). */
  private assistantText = ''

  constructor(
    session: Session,
    private readonly proc: OmpProcessLike,
    private readonly options: OmpSessionOptions
  ) {
    this.session = session
    this.id = session.id
    proc.stdout?.on('data', (chunk: Buffer) => this.handleChunk(chunk))
    proc.stderr?.on('data', (chunk: Buffer) => this.stderrRing.push(chunk))
    proc.on('error', (err: Error) => this.handleProcessError(err))
    proc.on('exit', (code: number | null) => this.handleExit(code))
    this.state = 'idle'
    this.emit({ type: 'connected', sessionId: this.id })
  }

  get runtimeState(): SessionRuntimeState {
    return this.state
  }

  /** Assistant text produced by the session's last completed turn ('' if none). */
  get lastAssistantText(): string {
    return this.assistantText
  }

  private get alive(): boolean {
    return this.state !== 'closed' && this.state !== 'failed'
  }

  private emit(event: SessionEvent): void {
    this.options.onEvent(event)
  }

  // ---------------------------------------------------------------- stdin

  private write(payload: Record<string, unknown>): boolean {
    if (!this.alive) return false
    this.proc.stdin?.write(serializeCommand(payload))
    return true
  }

  /** Send a user prompt. */
  sendPrompt(text: string, images?: PromptImage[], streamingBehavior?: StreamingBehavior): boolean {
    return this.write({
      id: crypto.randomUUID(),
      type: 'prompt',
      message: text,
      ...(images?.length ? { images } : {}),
      ...(streamingBehavior ? { streamingBehavior } : {})
    })
  }

  /** Ask the agent to abort the current turn; converges at agent_end/exit. */
  abort(): boolean {
    const ok = this.write({ id: crypto.randomUUID(), type: 'abort' })
    if (ok && (this.state === 'working' || this.state === 'waiting_for_user')) {
      this.state = 'aborting'
    }
    return ok
  }

  /** Answer (or cancel) a pending interactive extension UI dialog. */
  respondExtensionUi(requestId: string, answer: ExtensionUiAnswer): boolean {
    if (!this.alive) return false
    this.proc.stdin?.write(extensionUiResponse(requestId, answer))
    if (this.state === 'waiting_for_user') {
      this.state = 'working'
    }
    return true
  }

  /** Hot-switch the model via the RPC set_model command. */
  setModel(provider: string, modelId: string): boolean {
    return this.write({ id: crypto.randomUUID(), type: 'set_model', provider, modelId })
  }

  /**
   * Send an RPC command and await its response, matched by request id.
   * Resolves null on timeout, dead session, or process exit.
   */
  query(command: Record<string, unknown>, timeoutMs = 8000): Promise<Record<string, unknown> | null> {
    if (!this.alive) return Promise.resolve(null)
    const id = crypto.randomUUID()
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        resolve(null)
      }, timeoutMs)
      this.pending.set(id, { resolve, timer })
      this.proc.stdin?.write(serializeCommand({ id, ...command }))
    })
  }

  /** Kill the process and close the session (renderer-initiated; no events). */
  kill(): void {
    if (this.state === 'closed') return
    this.state = 'closed'
    this.resolvePending(null)
    try {
      this.proc.kill()
    } catch {
      // already dead — fine
    }
    this.options.onGone?.()
  }

  // --------------------------------------------------------------- stdout

  private handleChunk(chunk: Buffer): void {
    for (const event of this.reader.push(chunk)) {
      if (event.kind === 'line') {
        this.handleLine(event.line)
      } else {
        // Transport-level problem (oversize line); the session stays alive.
        this.emit({ type: 'error', sessionId: this.id, message: event.message, recoverable: true })
      }
    }
  }

  private handleLine(line: string): void {
    // Query responses are claimed by id before the generic parser sees them.
    let raw: Record<string, unknown> | null = null
    try {
      raw = JSON.parse(line)
    } catch {
      raw = null
    }
    if (raw && raw.type === 'response' && typeof raw.id === 'string') {
      const query = this.pending.get(raw.id)
      if (query) {
        this.pending.delete(raw.id)
        clearTimeout(query.timer)
        query.resolve(raw)
        return
      }
    }

    const result = parseRpcLine(line, this.id)
    if (result.kind === 'event') {
      this.handleEvent(result.event)
    } else if (result.kind === 'extension_ui') {
      // Forward interactive extension dialogs to the renderer; the answer
      // comes back through respondExtensionUi().
      this.emit({
        type: 'ui_request',
        sessionId: this.id,
        id: result.id,
        method: result.method,
        title: result.title,
        message: result.message,
        options: result.options,
        placeholder: result.placeholder,
        prefill: result.prefill,
        timeout: result.timeout
      })
      if (this.state === 'working') {
        this.state = 'waiting_for_user'
      }
    }
  }

  private handleEvent(event: SessionEvent): void {
    if (event.type === 'message' && event.role === 'assistant') {
      this.draftText += event.content
    }

    if (event.type === 'status' && event.status === 'working') {
      // agent_start — duplicate starts are suppressed (they would reset the
      // renderer's turn counters).
      if (this.state !== 'working') {
        this.state = 'working'
        this.emit(event)
      }
      return
    }

    if (event.type === 'status' && event.status === 'idle') {
      // agent_end — a future pi may mark it non-terminal (isTerminal: false,
      // never sent by 0.80.3); honor that and keep the turn open.
      if (event.isTerminal === false) return
      if (this.state !== 'idle') {
        this.state = 'idle'
        this.finalizeDraft()
        this.emit(event)
      }
      return
    }

    if (event.type === 'error') {
      this.emit(event)
      this.finalizeDraft()
      // A failed command response or provider error ends the turn even
      // without agent_end.
      if (
        this.state === 'working' ||
        this.state === 'aborting' ||
        this.state === 'waiting_for_user'
      ) {
        this.state = 'idle'
        this.emit({ type: 'status', sessionId: this.id, status: 'idle' })
      }
      return
    }

    this.emit(event)
  }

  private finalizeDraft(): void {
    this.assistantText = this.draftText
    this.draftText = ''
  }

  // --------------------------------------------------------- process end

  private resolvePending(value: Record<string, unknown> | null): void {
    for (const query of this.pending.values()) {
      clearTimeout(query.timer)
      query.resolve(value)
    }
    this.pending.clear()
  }

  /** Spawn failure (ENOENT, EACCES, …). */
  private handleProcessError(err: Error): void {
    if (this.state === 'closed') return
    this.resolvePending(null)
    this.state = 'failed'
    this.emit({
      type: 'error',
      sessionId: this.id,
      message: `Failed to start ${this.options.label ?? 'omp'}: ${err.message}`,
      recoverable: false
    })
    this.state = 'closed'
    this.emit({ type: 'closed', sessionId: this.id })
    this.options.onGone?.()
  }

  private handleExit(code: number | null): void {
    if (this.state === 'closed') return
    // Surface a trailing line that never got its LF before wrapping up.
    for (const event of this.reader.flush()) {
      if (event.kind === 'line') this.handleLine(event.line)
    }
    this.resolvePending(null)
    if (code !== 0 && code !== null) {
      this.state = 'failed'
      const detail = this.stderrRing.tail(3)
      this.emit({
        type: 'error',
        sessionId: this.id,
        message: `omp exited with code ${code}${detail ? `\n${detail}` : ''}`,
        recoverable: false
      })
    }
    this.state = 'closed'
    this.emit({ type: 'closed', sessionId: this.id })
    this.options.onGone?.()
  }
}

interface PendingQuery {
  resolve: (payload: Record<string, unknown> | null) => void
  timer: ReturnType<typeof setTimeout>
}

/**
 * Structural subset of ChildProcess this class relies on — an
 * EventEmitter-based fake satisfies it in tests.
 */
export interface OmpProcessLike {
  stdin: { write(data: string): unknown } | null
  stdout: { on(event: 'data', cb: (chunk: Buffer) => void): unknown } | null
  stderr: { on(event: 'data', cb: (chunk: Buffer) => void): unknown } | null
  kill(): void
  on(event: 'error', cb: (err: Error) => void): unknown
  on(event: 'exit', cb: (code: number | null) => void): unknown
}

export interface OmpSessionOptions {
  onEvent: (event: SessionEvent) => void
  /** CLI command name, used in spawn-failure messages. */
  label?: string
  /** Registry cleanup once the session is gone (exit/error/kill). */
  onGone?: () => void
}
