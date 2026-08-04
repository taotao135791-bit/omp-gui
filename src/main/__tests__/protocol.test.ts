import { describe, it, expect } from 'vitest'
import { parseRpcLine, drainLines } from '../protocol'

describe('parseRpcLine', () => {
  it('parses tool_call payloads', () => {
    const line = JSON.stringify({
      type: 'tool_call',
      tool: 'bash',
      input: { command: 'ls' },
      output: 'ok'
    })
    const ev = parseRpcLine(line, 's1')
    expect(ev).toEqual({
      type: 'tool_call',
      sessionId: 's1',
      tool: 'bash',
      input: { command: 'ls' },
      output: 'ok'
    })
  })

  it('parses message payloads and defaults role to assistant', () => {
    const ev = parseRpcLine(JSON.stringify({ type: 'message', content: 'hi' }), 's1')
    expect(ev).toEqual({
      type: 'message',
      sessionId: 's1',
      role: 'assistant',
      content: 'hi'
    })
  })

  it('keeps an explicit role', () => {
    const ev = parseRpcLine(
      JSON.stringify({ type: 'message', role: 'user', content: 'yo' }),
      's1'
    )
    expect(ev).toMatchObject({ role: 'user', content: 'yo' })
  })

  it('falls back to a plain-text message for non-JSON lines', () => {
    const ev = parseRpcLine('not json at all', 's1')
    expect(ev).toEqual({
      type: 'message',
      sessionId: 's1',
      role: 'assistant',
      content: 'not json at all'
    })
  })

  it('falls back for unknown JSON payload types', () => {
    const line = JSON.stringify({ type: 'something_else', foo: 1 })
    const ev = parseRpcLine(line, 's1')
    expect(ev).toEqual({
      type: 'message',
      sessionId: 's1',
      role: 'assistant',
      content: line
    })
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
