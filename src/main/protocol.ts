import { ExtensionUiAnswer, SessionEvent } from '../shared/types'

/**
 * Parser for pi/omp `--mode rpc` JSONL output.
 *
 * Protocol (verified against pi-coding-agent dist/modes/rpc/rpc-types.d.ts):
 * - Commands (stdin):   { id?, type: 'prompt', message: string, images? }
 * - Responses (stdout): { type: 'response', command, success, data | error }
 * - Events (stdout):    AgentSessionEvent objects streamed as they occur
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

    case 'tool_execution_start':
      return {
        kind: 'event',
        event: {
          type: 'tool_call',
          sessionId,
          tool: String(payload.toolName ?? 'tool'),
          input: payload.args
        }
      }

    case 'tool_execution_end':
      return {
        kind: 'event',
        event: {
          type: 'tool_result',
          sessionId,
          tool: String(payload.toolName ?? 'tool'),
          output: payload.result,
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
        event: { type: 'status', sessionId, status: 'idle' }
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

/**
 * Split a stream chunk into complete lines, keeping the remainder in `buffer`.
 * Returns the complete lines and the new buffer content.
 */
export function drainLines(buffer: string, chunk: string): { lines: string[]; rest: string } {
  const combined = buffer + chunk
  const parts = combined.split('\n')
  const rest = parts.pop() || ''
  return { lines: parts.filter((l) => l.trim().length > 0), rest }
}
