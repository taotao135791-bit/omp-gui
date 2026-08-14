import { describe, it, expect } from 'vitest'
import { normalizeRpcFrame } from '../omp/OmpProtocol'

describe('subagent RPC normalization (tolerant)', () => {
  it('maps subagent_lifecycle onto a normalized subagent event', () => {
    const result = normalizeRpcFrame(
      {
        type: 'subagent_lifecycle',
        agentId: 'agent-1',
        parentId: 'agent-0',
        name: 'Security Review',
        status: 'running',
        phase: 'started',
        provider: 'openrouter',
        model: 'deepseek/deepseek-v4'
      },
      'session-1'
    )
    expect(result.kind).toBe('event')
    if (result.kind !== 'event') throw new Error('unreachable')
    expect(result.event).toMatchObject({
      type: 'subagent',
      sessionId: 'session-1',
      agentId: 'agent-1',
      parentAgentId: 'agent-0',
      name: 'Security Review',
      phase: 'started',
      provider: 'openrouter',
      model: 'deepseek/deepseek-v4'
    })
  })

  it('accepts alternate upstream field names', () => {
    const result = normalizeRpcFrame(
      { type: 'subagent_event', id: 'x', title: 'Tests', state: 'completed' },
      'session-1'
    )
    expect(result.kind).toBe('event')
    if (result.kind !== 'event') throw new Error('unreachable')
    expect(result.event).toMatchObject({
      type: 'subagent',
      agentId: 'x',
      name: 'Tests',
      status: 'completed'
    })
  })

  it('maps subagent_progress to a progress event', () => {
    const result = normalizeRpcFrame(
      { type: 'subagent_progress', agentId: 'x', text: 'Reading files' },
      'session-1'
    )
    expect(result.kind).toBe('event')
    if (result.kind !== 'event') throw new Error('unreachable')
    expect(result.event).toEqual({
      type: 'subagent_progress',
      sessionId: 'session-1',
      agentId: 'x',
      text: 'Reading files'
    })
  })

  it('ignores unknown frames by construction', () => {
    expect(normalizeRpcFrame({ type: 'totally_unknown_frame' }, 'session-1').kind).toBe('none')
  })
})
