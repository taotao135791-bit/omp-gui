import { describe, it, expect } from 'vitest'
import { parseRpcLine, drainLines, extensionUiCancel, extensionUiResponse } from '../protocol'

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

  it('maps thinking_delta message updates to thinking events', () => {
    const line = JSON.stringify({
      type: 'message_update',
      message: {},
      assistantMessageEvent: { type: 'thinking_delta', contentIndex: 0, delta: 'hmm' }
    })
    expect(parseRpcLine(line, 's1')).toEqual({
      kind: 'event',
      event: { type: 'thinking', sessionId: 's1', delta: 'hmm' }
    })
  })

  it('ignores non-text message updates (thinking start/end, toolcall)', () => {
    for (const type of ['thinking_start', 'thinking_end', 'toolcall_delta']) {
      const line = JSON.stringify({
        type: 'message_update',
        assistantMessageEvent: { type, contentIndex: 0 }
      })
      expect(parseRpcLine(line, 's1')).toEqual({ kind: 'none' })
    }
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

  it('flags interactive extension requests with their full payload', () => {
    const line = JSON.stringify({
      type: 'extension_ui_request',
      id: 'x2',
      method: 'confirm',
      title: 'Proceed?',
      message: 'Run rm -rf build?'
    })
    expect(parseRpcLine(line, 's1')).toEqual({
      kind: 'extension_ui',
      id: 'x2',
      method: 'confirm',
      title: 'Proceed?',
      message: 'Run rm -rf build?'
    })
  })

  it('carries select options and input placeholders', () => {
    const select = JSON.stringify({
      type: 'extension_ui_request',
      id: 'x3',
      method: 'select',
      title: 'Pick one',
      options: ['a', 'b']
    })
    expect(parseRpcLine(select, 's1')).toEqual({
      kind: 'extension_ui',
      id: 'x3',
      method: 'select',
      title: 'Pick one',
      options: ['a', 'b']
    })

    const input = JSON.stringify({
      type: 'extension_ui_request',
      id: 'x4',
      method: 'input',
      title: 'Name?',
      placeholder: 'type here'
    })
    expect(parseRpcLine(input, 's1')).toEqual({
      kind: 'extension_ui',
      id: 'x4',
      method: 'input',
      title: 'Name?',
      placeholder: 'type here'
    })
  })

  it('ignores fire-and-forget extension UI methods', () => {
    for (const method of ['setStatus', 'setWidget', 'setTitle', 'set_editor_text']) {
      const line = JSON.stringify({ type: 'extension_ui_request', id: 'x9', method })
      expect(parseRpcLine(line, 's1')).toEqual({ kind: 'none' })
    }
  })

  it('maps agent lifecycle events to working status', () => {
    expect(parseRpcLine(JSON.stringify({ type: 'agent_start' }), 's1')).toEqual({
      kind: 'event',
      event: { type: 'status', sessionId: 's1', status: 'working' }
    })
    expect(parseRpcLine(JSON.stringify({ type: 'agent_end' }), 's1')).toEqual({
      kind: 'event',
      event: { type: 'status', sessionId: 's1', status: 'idle' }
    })
  })

  it('maps compaction lifecycle events to compaction phases', () => {
    expect(parseRpcLine(JSON.stringify({ type: 'compaction_start' }), 's1')).toEqual({
      kind: 'event',
      event: { type: 'compaction', sessionId: 's1', phase: 'start' }
    })
    expect(parseRpcLine(JSON.stringify({ type: 'compaction_end' }), 's1')).toEqual({
      kind: 'event',
      event: { type: 'compaction', sessionId: 's1', phase: 'end' }
    })
  })

  it('ignores turn and queue events', () => {
    for (const type of ['turn_start', 'turn_end', 'queue_update']) {
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

describe('extensionUiResponse', () => {
  it('builds value, confirmed and cancelled response lines', () => {
    expect(extensionUiResponse('a', { value: 'yes' })).toBe(
      '{"type":"extension_ui_response","id":"a","value":"yes"}\n'
    )
    expect(extensionUiResponse('b', { confirmed: false })).toBe(
      '{"type":"extension_ui_response","id":"b","confirmed":false}\n'
    )
    expect(extensionUiResponse('c', { cancelled: true })).toBe(
      '{"type":"extension_ui_response","id":"c","cancelled":true}\n'
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
