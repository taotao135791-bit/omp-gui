import { describe, it, expect } from 'vitest'
import { parseRpcLine, drainLines, extensionUiCancel } from '../protocol'

describe('parseRpcLine', () => {
  it('maps failed responses to error events', () => {
    const line = JSON.stringify({
      type: 'response',
      command: 'prompt',
      success: false,
      error: 'model not configured'
    })
    expect(parseRpcLine(line, 's1')).toEqual({
      kind: 'event',
      event: { type: 'error', sessionId: 's1', message: 'model not configured' }
    })
  })

  it('ignores successful responses', () => {
    const line = JSON.stringify({ type: 'response', command: 'prompt', success: true })
    expect(parseRpcLine(line, 's1')).toEqual({ kind: 'none' })
  })

  it('maps text_delta message updates to assistant messages', () => {
    const line = JSON.stringify({
      type: 'message_update',
      message: {},
      assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: 'Hello' }
    })
    expect(parseRpcLine(line, 's1')).toEqual({
      kind: 'event',
      event: { type: 'message', sessionId: 's1', role: 'assistant', content: 'Hello' }
    })
  })

  it('ignores non-text message updates (thinking, toolcall)', () => {
    const line = JSON.stringify({
      type: 'message_update',
      assistantMessageEvent: { type: 'thinking_delta', contentIndex: 0, delta: 'hmm' }
    })
    expect(parseRpcLine(line, 's1')).toEqual({ kind: 'none' })
  })

  it('maps tool_execution_start to tool_call', () => {
    const line = JSON.stringify({
      type: 'tool_execution_start',
      toolCallId: 't1',
      toolName: 'bash',
      args: { command: 'ls' }
    })
    expect(parseRpcLine(line, 's1')).toEqual({
      kind: 'event',
      event: { type: 'tool_call', sessionId: 's1', tool: 'bash', input: { command: 'ls' } }
    })
  })

  it('maps tool_execution_end to tool_result with error flag', () => {
    const line = JSON.stringify({
      type: 'tool_execution_end',
      toolCallId: 't1',
      toolName: 'bash',
      result: { output: 'done' },
      isError: false
    })
    expect(parseRpcLine(line, 's1')).toEqual({
      kind: 'event',
      event: {
        type: 'tool_result',
        sessionId: 's1',
        tool: 'bash',
        output: { output: 'done' },
        isError: false
      }
    })
  })

  it('maps extension notify requests to system messages', () => {
    const line = JSON.stringify({
      type: 'extension_ui_request',
      id: 'x1',
      method: 'notify',
      message: 'hello from extension'
    })
    expect(parseRpcLine(line, 's1')).toEqual({
      kind: 'event',
      event: { type: 'message', sessionId: 's1', role: 'system', content: 'hello from extension' }
    })
  })

  it('flags interactive extension requests for cancellation', () => {
    const line = JSON.stringify({
      type: 'extension_ui_request',
      id: 'x2',
      method: 'confirm',
      title: 'Proceed?'
    })
    expect(parseRpcLine(line, 's1')).toEqual({ kind: 'extension_ui', id: 'x2', method: 'confirm' })
  })

  it('ignores agent lifecycle events', () => {
    for (const type of ['agent_start', 'agent_end', 'turn_start', 'turn_end', 'queue_update']) {
      expect(parseRpcLine(JSON.stringify({ type }), 's1')).toEqual({ kind: 'none' })
    }
  })

  it('falls back to a plain-text message for non-JSON lines', () => {
    expect(parseRpcLine('not json at all', 's1')).toEqual({
      kind: 'event',
      event: { type: 'message', sessionId: 's1', role: 'assistant', content: 'not json at all' }
    })
  })
})

describe('extensionUiCancel', () => {
  it('builds a cancel response line', () => {
    expect(extensionUiCancel('abc')).toBe(
      '{"type":"extension_ui_response","id":"abc","cancelled":true}\n'
    )
  })
})

describe('drainLines', () => {
  it('splits complete lines and keeps the remainder', () => {
    const { lines, rest } = drainLines('', 'a\nb\npart')
    expect(lines).toEqual(['a', 'b'])
    expect(rest).toBe('part')
  })

  it('combines with the previous buffer', () => {
    const { lines, rest } = drainLines('hel', 'lo\nworld\n')
    expect(lines).toEqual(['hello', 'world'])
    expect(rest).toBe('')
  })

  it('skips blank lines', () => {
    const { lines } = drainLines('', 'a\n\n  \nb\n')
    expect(lines).toEqual(['a', 'b'])
  })

  it('handles a chunk with no newline', () => {
    const { lines, rest } = drainLines('x', 'yz')
    expect(lines).toEqual([])
    expect(rest).toBe('xyz')
  })
})
