import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  reconstructSessionMetadata,
  reconstructHistoricalAgents,
  parseSessionEntries,
  resolveActivePath
} from '../sessionMetadata'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'omp-gui-meta-'))
  n = 0
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

let n = 0
function entry(type: string, parentId: string | null, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ type, id: `e${n++}`, parentId, ...extra })
}

function writeSession(lines: string[]): string {
  const file = path.join(dir, 'session.jsonl')
  writeFileSync(file, lines.join('\n') + '\n')
  return file
}

describe('resolveActivePath', () => {
  it('walks leaf → root and reverses', () => {
    const lines = [
      entry('session', null),
      entry('message', 'e0'),
      entry('message', 'e0')
    ]
    const path = resolveActivePath(parseSessionEntries(lines.join('\n')))
    expect(path[0].id).toBe('e0')
    expect(path[path.length - 1].id).toBe('e2')
  })
})

describe('reconstructSessionMetadata (branch-aware)', () => {
  it('replays model_change / thinking_level_change per user prompt on the active path', async () => {
    const file = writeSession([
      entry('session', null),
      entry('model_change', 'e0', { model: 'openai/gpt-a' }),
      entry('thinking_level_change', 'e1', { thinkingLevel: 'high' }),
      entry('message', 'e2', { message: { role: 'user', content: 'prompt 1' } }),
      entry('model_change', 'e3', { model: 'openai/gpt-b' }),
      entry('message', 'e4', { message: { role: 'user', content: 'prompt 2' } }),
      entry('thinking_level_change', 'e5', { thinkingLevel: 'medium' }),
      entry('message', 'e6', { message: { role: 'user', content: 'prompt 3' } })
    ])
    const meta = await reconstructSessionMetadata(file)
    expect(meta).toEqual([
      { model: 'openai/gpt-a', thinking: 'high' },
      { model: 'openai/gpt-b', thinking: 'high' },
      { model: 'openai/gpt-b', thinking: 'medium' }
    ])
  })

  it('ignores an abandoned branch after a rollback', async () => {
    // Linear: r0(session) → r1(model A) → r2(prompt 1) → r3(model B) → r4(prompt 2, abandoned)
    // Rollback to after prompt 1 (r2): r5(model C) → r6(prompt 3, active)
    const file = writeSession([
      JSON.stringify({ type: 'session', id: 'r0', parentId: null }),
      JSON.stringify({ type: 'model_change', id: 'r1', parentId: 'r0', model: 'openai/gpt-a' }),
      JSON.stringify({ type: 'message', id: 'r2', parentId: 'r1', message: { role: 'user', content: 'prompt 1' } }),
      JSON.stringify({ type: 'model_change', id: 'r3', parentId: 'r2', model: 'openai/gpt-b' }),
      JSON.stringify({ type: 'message', id: 'r4', parentId: 'r3', message: { role: 'user', content: 'prompt 2' } }),
      JSON.stringify({ type: 'model_change', id: 'r5', parentId: 'r2', model: 'openai/gpt-c' }),
      JSON.stringify({ type: 'message', id: 'r6', parentId: 'r5', message: { role: 'user', content: 'prompt 3' } })
    ])
    const meta = await reconstructSessionMetadata(file)
    expect(meta).toEqual([
      { model: 'openai/gpt-a', thinking: undefined },
      { model: 'openai/gpt-c', thinking: undefined }
    ])
  })

  it('returns [] for an unreadable file', async () => {
    expect(await reconstructSessionMetadata(path.join(dir, 'missing.jsonl'))).toEqual([])
  })
})

describe('reconstructHistoricalAgents', () => {
  it('reconstructs completed/failed/aborted children from task tool results', async () => {
    const file = writeSession([
      entry('session', null),
      entry('message', 'e0', {
        message: {
          role: 'toolResult',
          toolName: 'task',
          details: {
            results: [
              { id: 'a1', agent: 'explore', agentSource: 'bundled', exitCode: 0, resolvedModel: 'openai/gpt-a', durationMs: 12000, tokens: 9000, output: 'ok' },
              { id: 'a2', agent: 'security', agentSource: 'bundled', aborted: true, durationMs: 3000 },
              { id: 'a3', agent: 'tests', agentSource: 'bundled', error: 'boom', exitCode: 1 }
            ]
          }
        }
      })
    ])
    const agents = await reconstructHistoricalAgents(file)
    expect(agents.map((a) => [a.id, a.status])).toEqual([
      ['a1', 'completed'],
      ['a2', 'aborted'],
      ['a3', 'failed']
    ])
    expect(agents[0].resolvedModel).toBe('openai/gpt-a')
    expect(agents[0].durationMs).toBe(12000)
    expect(agents[0].tokens).toBe(9000)
  })

  it('ignores non-task tool results and returns [] when none', async () => {
    const file = writeSession([
      entry('session', null),
      entry('message', 'e0', { message: { role: 'toolResult', toolName: 'bash', details: { results: [{ id: 'x' }] } } })
    ])
    expect(await reconstructHistoricalAgents(file)).toEqual([])
  })
})
