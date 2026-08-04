import { SessionEvent } from '../shared/types'

/**
 * Parse one line of omp/pi `--mode rpc` stdout into a session event.
 * Pure function so it can be unit-tested without Electron.
 */
export function parseRpcLine(line: string, sessionId: string): SessionEvent {
  try {
    const payload = JSON.parse(line)
    if (payload.type === 'tool_call') {
      return {
        type: 'tool_call',
        sessionId,
        tool: payload.tool,
        input: payload.input,
        output: payload.output
      }
    }
    if (payload.type === 'message') {
      return {
        type: 'message',
        sessionId,
        role: payload.role || 'assistant',
        content: payload.content
      }
    }
  } catch {
    // not JSON — fall through to plain-text message
  }
  return {
    type: 'message',
    sessionId,
    role: 'assistant',
    content: line
  }
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
