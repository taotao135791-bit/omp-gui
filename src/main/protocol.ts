import { SessionEvent } from '../shared/types'

/**
 * Parser for pi/omp `--mode rpc` JSONL output.
 *
 * Protocol (verified against pi-coding-agent dist/modes/rpc):
 * - Commands (stdin):   { id?, type: 'prompt', message: string, images? }
 * - Responses (stdout): { type: 'response', command, success, data | error }
 * - Events (stdout):    AgentSessionEvent objects streamed as they occur
 * - Extension UI:       { type: 'extension_ui_request', id, method, ... }
 *
 * Pure functions so they can be unit-tested without Electron.
 */

export type RpcParseResult =
  | { kind: 'event'; event: SessionEvent }
  /** Interactive extension UI request — the host should answer or cancel it */
  | { kind: 'extension_ui'; id: string; method: string }
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
      // Interactive requests (select/confirm/input/editor) need a response
      return { kind: 'extension_ui', id: String(payload.id ?? ''), method }
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

    default:
      // turn_*/queue_update/compaction_*/… — not surfaced
      return { kind: 'none' }
  }
}

/** Build a cancel response for an interactive extension UI request. */
export function extensionUiCancel(id: string): string {
  return JSON.stringify({ type: 'extension_ui_response', id, cancelled: true }) + '\n'
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
