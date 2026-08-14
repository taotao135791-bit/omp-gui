import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { reconstructSessionMetadata } from '../sessionMetadata'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'omp-gui-meta-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function writeSession(lines: string[]): string {
  const file = path.join(dir, 'session.jsonl')
  writeFileSync(file, lines.join('\n') + '\n')
  return file
}

describe('reconstructSessionMetadata', () => {
  it('replays model_change / thinking_level_change per user prompt by event time', async () => {
    const file = writeSession([
      JSON.stringify({ type: 'session', id: 's', timestamp: 't', cwd: '/' }),
      JSON.stringify({ type: 'model_change', model: 'openai/gpt-a' }),
      JSON.stringify({ type: 'thinking_level_change', thinkingLevel: 'high' }),
      JSON.stringify({ type: 'message', message: { role: 'user', content: 'prompt 1' } }),
      JSON.stringify({ type: 'model_change', model: 'openai/gpt-b' }),
      JSON.stringify({ type: 'message', message: { role: 'user', content: 'prompt 2' } }),
      JSON.stringify({ type: 'thinking_level_change', thinkingLevel: 'medium' }),
      JSON.stringify({ type: 'message', message: { role: 'user', content: 'prompt 3' } })
    ])
    const meta = await reconstructSessionMetadata(file)
    expect(meta).toEqual([
      { model: 'openai/gpt-a', thinking: 'high' },
      { model: 'openai/gpt-b', thinking: 'high' },
      { model: 'openai/gpt-b', thinking: 'medium' }
    ])
  })

  it('leaves unknown metadata unknown (never falls back to the last model)', async () => {
    const file = writeSession([
      JSON.stringify({ type: 'session', id: 's', timestamp: 't', cwd: '/' }),
      JSON.stringify({ type: 'message', message: { role: 'user', content: 'prompt 1' } }),
      JSON.stringify({ type: 'model_change', model: 'openai/gpt-b' }),
      JSON.stringify({ type: 'message', message: { role: 'user', content: 'prompt 2' } })
    ])
    const meta = await reconstructSessionMetadata(file)
    expect(meta).toEqual([
      { model: undefined, thinking: undefined },
      { model: 'openai/gpt-b', thinking: undefined }
    ])
  })

  it('skips non-user messages and returns [] for an unreadable file', async () => {
    const meta = await reconstructSessionMetadata(path.join(dir, 'missing.jsonl'))
    expect(meta).toEqual([])
  })
})
