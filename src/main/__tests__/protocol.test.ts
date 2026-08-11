import { describe, it, expect } from 'vitest'
import { parseRpcLine, extensionUiCancel, extensionUiResponse } from '../omp/OmpProtocol'

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

  it('maps tool_execution_start to tool_call with its toolCallId', () => {
    const line = JSON.stringify({
      type: 'tool_execution_start',
      toolCallId: 't1',
      toolName: 'bash',
      args: { command: 'ls' }
    })
    expect(parseRpcLine(line, 's1')).toEqual({
      kind: 'event',
      event: { type: 'tool_call', sessionId: 's1', id: 't1', tool: 'bash', input: { command: 'ls' } }
    })
  })

  it('maps tool_execution_end to tool_result with toolCallId and error flag', () => {
    const line = JSON.stringify({
      type: 'tool_execution_end',
      toolCallId: 't1',
      toolName: 'bash',
      result: { content: [{ type: 'text', text: 'done\n' }] },
      isError: false
    })
    expect(parseRpcLine(line, 's1')).toEqual({
      kind: 'event',
      event: {
        type: 'tool_result',
        sessionId: 's1',
        id: 't1',
        tool: 'bash',
        output: 'done\n',
        isError: false
      }
    })
  })

  it('extracts text from structured tool results and never emits [object Object]', () => {
    const structured = JSON.stringify({
      type: 'tool_execution_end',
      toolCallId: 't2',
      toolName: 'bash',
      result: { content: [{ type: 'text', text: 'line1' }, { type: 'text', text: 'line2' }] },
      isError: false
    })
    const ev = parseRpcLine(structured, 's1')
    expect(ev.kind).toBe('event')
    if (ev.kind === 'event' && ev.event.type === 'tool_result') {
      expect(ev.event.output).toBe('line1\nline2')
    }
    // Unknown object shapes fall back to JSON text, not [object Object]
    const odd = JSON.stringify({
      type: 'tool_execution_end',
      toolName: 'custom',
      result: { weird: true },
      isError: false
    })
    const ev2 = parseRpcLine(odd, 's1')
    if (ev2.kind === 'event' && ev2.event.type === 'tool_result') {
      expect(String(ev2.event.output)).toContain('weird')
      expect(String(ev2.event.output)).not.toContain('[object Object]')
    }
  })

  it('omits the toolCallId when upstream does not send one', () => {
    const line = JSON.stringify({ type: 'tool_execution_start', toolName: 'read', args: {} })
    expect(parseRpcLine(line, 's1')).toEqual({
      kind: 'event',
      event: { type: 'tool_call', sessionId: 's1', tool: 'read', input: {} }
    })
  })

  it('ignores tool_execution_update partial results', () => {
    const line = JSON.stringify({
      type: 'tool_execution_update',
      toolCallId: 't1',
      toolName: 'bash',
      partialResult: { output: 'half' }
    })
    expect(parseRpcLine(line, 's1')).toEqual({ kind: 'none' })
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
    // pi 0.80.3: agent_end is terminal and carries no isTerminal field.
    expect(parseRpcLine(JSON.stringify({ type: 'agent_end' }), 's1')).toEqual({
      kind: 'event',
      event: { type: 'status', sessionId: 's1', status: 'idle', isTerminal: true }
    })
  })

  it('passes an explicit agent_end isTerminal through (future upstream)', () => {
    expect(parseRpcLine(JSON.stringify({ type: 'agent_end', isTerminal: false }), 's1')).toEqual({
      kind: 'event',
      event: { type: 'status', sessionId: 's1', status: 'idle', isTerminal: false }
    })
    expect(parseRpcLine(JSON.stringify({ type: 'agent_end', isTerminal: true }), 's1')).toEqual({
      kind: 'event',
      event: { type: 'status', sessionId: 's1', status: 'idle', isTerminal: true }
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

  it('surfaces provider errors from the final assistant message', () => {
    const line = JSON.stringify({
      type: 'message_end',
      message: {
        role: 'assistant',
        content: [],
        stopReason: 'error',
        errorMessage: 'OpenAI API error (401): invalid_api_key'
      }
    })
    expect(parseRpcLine(line, 's1')).toEqual({
      kind: 'event',
      event: { type: 'error', sessionId: 's1', message: 'OpenAI API error (401): invalid_api_key' }
    })
  })

  it('ignores message_end for normal and aborted turns', () => {
    for (const stopReason of ['stop', 'length', 'aborted']) {
      const line = JSON.stringify({
        type: 'message_end',
        message: { role: 'assistant', content: [], stopReason }
      })
      expect(parseRpcLine(line, 's1')).toEqual({ kind: 'none' })
    }
    // user message_end
    expect(
      parseRpcLine(
        JSON.stringify({ type: 'message_end', message: { role: 'user', content: [] } }),
        's1'
      )
    ).toEqual({ kind: 'none' })
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
