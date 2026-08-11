import { ExtensionUiAnswer, SessionEvent } from '../../shared/types'

/**
 * Parser for pi/omp `--mode rpc` JSONL output (moved from src/main/protocol.ts).
 *
 * Protocol (verified against the installed pi-coding-agent 0.80.3, see
 * docs/protocol-facts.md):
 * - Commands (stdin):   { id?, type: 'prompt', message: string, images? }
 * - Responses (stdout): { type: 'response', command, success, data | error }
 * - Events (stdout):    AgentSessionEvent objects streamed as they occur
 * - Tool events carry a stable `toolCallId` and run parallel by default —
 *   match call/result pairs by id, never by name+recency.
 * - `agent_end` IS the terminal event of a run in 0.80.3 (no isTerminal
 *   field); the parser surfaces `isTerminal: true` by default and passes an
 *   explicit upstream `false` through for future versions.
 * - Extension UI:       { type: 'extension_ui_request', id, method, ... }
 *   - select:  title, options[], timeout?
 *   - confirm: title, message, timeout?
 *   - input:   title, placeholder?, timeout?
 *   - editor:  title, prefill?
 *   - notify / setStatus / setWidget / setTitle / set_editor_text: no response
 *
 * Pure functions so they can be unit-tested without Electron.
 */

export type ExtensionUiMethod = 'select' | 'confirm' | 'input' | 'editor'

/**
 * Tool results arrive structured: `{content: [{type:'text', text}, ...]}`.
 * Renderers want text — extract the text blocks; fall back to a compact
 * JSON string for shapes we don't know (never "[object Object]").
 */
export function extractToolOutput(result: unknown): string {
  if (result == null) return ''
  if (typeof result === 'string') return result
  if (typeof result === 'object') {
    const content = (result as { content?: unknown }).content
    if (Array.isArray(content)) {
      const text = content
        .map((c) => (c && typeof c === 'object' ? (c as { text?: unknown }).text : undefined))
        .filter((t): t is string => typeof t === 'string')
        .join('\n')
      if (text) return text
    }
    try {
      return JSON.stringify(result, null, 2)
    } catch {
      return String(result)
    }
  }
  return String(result)
}

export type RpcParseResult =
  | { kind: 'event'; event: SessionEvent }
  /** Interactive extension UI request — the host should answer or cancel it */
  | {
      kind: 'extension_ui'
      id: string
      method: ExtensionUiMethod
      title: string
      message?: string
      options?: string[]
      placeholder?: string
      prefill?: string
      timeout?: number
    }
  /** Line consumed, nothing to surface */
  | { kind: 'none' }

export function parseRpcLine(line: string, sessionId: string): RpcParseResult {
  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(line)
  } catch {
    // Not JSON — surface as plain assistant text
    return {
      kind: 'event',
      event: { type: 'message', sessionId, role: 'assistant', content: line }
    }
  }

  switch (payload.type) {
    case 'response': {
      if (payload.success === false) {
        return {
          kind: 'event',
          event: {
            type: 'error',
            sessionId,
            message: String(payload.error ?? 'Unknown RPC error')
          }
        }
      }
      return { kind: 'none' }
    }

    case 'message_update': {
      const ev = payload.assistantMessageEvent as { type?: string; delta?: string } | undefined
      if (ev?.type === 'text_delta' && typeof ev.delta === 'string') {
        return {
          kind: 'event',
          event: { type: 'message', sessionId, role: 'assistant', content: ev.delta }
        }
      }
      if (ev?.type === 'thinking_delta' && typeof ev.delta === 'string') {
        return {
          kind: 'event',
          event: { type: 'thinking', sessionId, delta: ev.delta }
        }
      }
      return { kind: 'none' }
    }

    case 'message_end': {
      // Provider/transport failures don't produce an error event and pi exits
      // 0 regardless — the failure only shows up as stopReason:'error' with
      // errorMessage on the final assistant message. Surface it or the user
      // sees a silent dead turn.
      const msg = payload.message as
        | { role?: string; stopReason?: string; errorMessage?: string }
        | undefined
      if (msg?.role === 'assistant' && msg.stopReason === 'error' && msg.errorMessage) {
        return {
          kind: 'event',
          event: {
            type: 'error',
            sessionId,
            // First line only — provider errors often append a raw JSON body.
            message: msg.errorMessage.split('\n')[0].slice(0, 300)
          }
        }
      }
      return { kind: 'none' }
    }

    case 'tool_execution_start':
      return {
        kind: 'event',
        event: {
          type: 'tool_call',
          sessionId,
          id: typeof payload.toolCallId === 'string' ? payload.toolCallId : undefined,
          tool: String(payload.toolName ?? 'tool'),
          input: payload.args
        }
      }

    case 'tool_execution_update':
      // partialResult streaming — noise for the GUI; the final result arrives
      // via tool_execution_end.
      return { kind: 'none' }

    case 'tool_execution_end':
      return {
        kind: 'event',
        event: {
          type: 'tool_result',
          sessionId,
          id: typeof payload.toolCallId === 'string' ? payload.toolCallId : undefined,
          tool: String(payload.toolName ?? 'tool'),
          output: extractToolOutput(payload.result),
          isError: Boolean(payload.isError)
        }
      }

    case 'extension_ui_request': {
      const method = String(payload.method ?? '')
      if (method === 'notify') {
        return {
          kind: 'event',
          event: {
            type: 'message',
            sessionId,
            role: 'system',
            content: String(payload.message ?? '')
          }
        }
      }
      if (
        method === 'select' ||
        method === 'confirm' ||
        method === 'input' ||
        method === 'editor'
      ) {
        // Interactive requests need a response from the user
        return {
          kind: 'extension_ui',
          id: String(payload.id ?? ''),
          method,
          title: String(payload.title ?? ''),
          message: typeof payload.message === 'string' ? payload.message : undefined,
          options: Array.isArray(payload.options)
            ? payload.options.map((o) => String(o))
            : undefined,
          placeholder: typeof payload.placeholder === 'string' ? payload.placeholder : undefined,
          prefill: typeof payload.prefill === 'string' ? payload.prefill : undefined,
          timeout: typeof payload.timeout === 'number' ? payload.timeout : undefined
        }
      }
      // setStatus / setWidget / setTitle / set_editor_text — fire and forget
      return { kind: 'none' }
    }

    case 'extension_error':
      return {
        kind: 'event',
        event: {
          type: 'error',
          sessionId,
          message: `Extension error: ${String(payload.error ?? 'unknown')}`
        }
      }

    case 'agent_start':
      return {
        kind: 'event',
        event: { type: 'status', sessionId, status: 'working' }
      }

    case 'agent_end':
      return {
        kind: 'event',
        event: {
          type: 'status',
          sessionId,
          status: 'idle',
          // pi 0.80.3: agent_end IS terminal and carries no such field —
          // default true, pass an explicit upstream false through untouched.
          isTerminal: payload.isTerminal === false ? false : true
        }
      }

    case 'compaction_start':
      return {
        kind: 'event',
        event: { type: 'compaction', sessionId, phase: 'start' }
      }

    case 'compaction_end':
      return {
        kind: 'event',
        event: { type: 'compaction', sessionId, phase: 'end' }
      }

    default:
      // turn_*/queue_update/… — not surfaced
      return { kind: 'none' }
  }
}

/** Build a cancel response for an interactive extension UI request. */
export function extensionUiCancel(id: string): string {
  return JSON.stringify({ type: 'extension_ui_response', id, cancelled: true }) + '\n'
}

/** Build the response line for an answered extension UI request. */
export function extensionUiResponse(id: string, answer: ExtensionUiAnswer): string {
  return JSON.stringify({ type: 'extension_ui_response', id, ...answer }) + '\n'
}
