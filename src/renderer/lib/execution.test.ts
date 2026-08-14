import { describe, it, expect } from 'vitest'
import type { SessionEvent } from '@shared/types'
import {
  emptyProjection,
  foldExecutionEvent,
  orderedAgents,
  agentHubSummary,
  turnSummary,
  toAgentStatus,
  ROOT_AGENT_ID
} from './execution'

function subagent(
  sessionId: string,
  patch: Partial<Extract<SessionEvent, { type: 'subagent' }>>
): SessionEvent {
  return { type: 'subagent', sessionId, ...patch }
}

const S = 'session-1'

describe('toAgentStatus', () => {
  it('maps upstream tokens to normalized statuses', () => {
    expect(toAgentStatus('started')).toBe('running')
    expect(toAgentStatus(undefined, 'completed')).toBe('completed')
    expect(toAgentStatus(undefined, 'failed')).toBe('failed')
    expect(toAgentStatus(undefined, 'cancelled')).toBe('cancelled')
    expect(toAgentStatus('unknown-thing')).toBeUndefined()
  })
})

describe('execution projection — agent tree', () => {
  it('builds root → child → grandchild with correct depths', () => {
    let p = emptyProjection(S)
    p = foldExecutionEvent(p, { type: 'status', sessionId: S, status: 'working' }, 0)
    p = foldExecutionEvent(p, subagent(S, { agentId: 'A', name: 'Explore', phase: 'started' }), 1)
    p = foldExecutionEvent(p, subagent(S, { agentId: 'B', parentAgentId: 'A', name: 'Security', phase: 'started' }), 2)

    const nodes = orderedAgents(p)
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]))
    expect(byId[ROOT_AGENT_ID].depth).toBe(0)
    expect(byId.A.depth).toBe(1)
    expect(byId.A.parentId).toBe(ROOT_AGENT_ID)
    expect(byId.B.depth).toBe(2)
    expect(byId.B.parentId).toBe('A')
  })

  it('handles out-of-order completion (B ends before A)', () => {
    let p = emptyProjection(S)
    p = foldExecutionEvent(p, { type: 'status', sessionId: S, status: 'working' }, 0)
    p = foldExecutionEvent(p, subagent(S, { agentId: 'A', phase: 'started' }), 1)
    p = foldExecutionEvent(p, subagent(S, { agentId: 'B', phase: 'started' }), 2)
    p = foldExecutionEvent(p, subagent(S, { agentId: 'B', phase: 'completed' }), 3)
    p = foldExecutionEvent(p, subagent(S, { agentId: 'A', phase: 'completed' }), 4)

    expect(p.agents.A.status).toBe('completed')
    expect(p.agents.B.status).toBe('completed')
    expect(p.agents.A.endedAt).toBe(4)
  })

  it('marks a still-running subagent interrupted at turn end (reconcile)', () => {
    let p = emptyProjection(S)
    p = foldExecutionEvent(p, { type: 'status', sessionId: S, status: 'working' }, 0)
    p = foldExecutionEvent(p, subagent(S, { agentId: 'A', phase: 'started' }), 1)
    p = foldExecutionEvent(p, { type: 'status', sessionId: S, status: 'idle', isTerminal: true }, 5)

    expect(p.agents.A.status).toBe('interrupted')
    expect(p.agents[ROOT_AGENT_ID].status).toBe('completed')
  })

  it('tracks a failed child agent', () => {
    let p = emptyProjection(S)
    p = foldExecutionEvent(p, { type: 'status', sessionId: S, status: 'working' }, 0)
    p = foldExecutionEvent(p, subagent(S, { agentId: 'A', phase: 'started' }), 1)
    p = foldExecutionEvent(p, subagent(S, { agentId: 'A', phase: 'failed', resultSummary: 'boom' }), 2)
    expect(p.agents.A.status).toBe('failed')
    expect(p.agents.A.resultSummary).toBe('boom')
  })
})

describe('execution projection — tool counts & summary', () => {
  it('classifies tools and reports the turn summary', () => {
    let p = emptyProjection(S)
    p = foldExecutionEvent(p, { type: 'status', sessionId: S, status: 'working' }, 1000)
    p = foldExecutionEvent(p, { type: 'tool_call', sessionId: S, tool: 'read', input: {} }, 1100)
    p = foldExecutionEvent(p, { type: 'tool_call', sessionId: S, tool: 'bash', input: {} }, 1200)
    p = foldExecutionEvent(p, { type: 'tool_call', sessionId: S, tool: 'edit', input: {} }, 1300)
    p = foldExecutionEvent(p, { type: 'tool_call', sessionId: S, tool: 'some-ext', input: {} }, 1400)
    p = foldExecutionEvent(p, { type: 'status', sessionId: S, status: 'idle', isTerminal: true }, 2000)

    const summary = turnSummary(p)
    expect(summary.elapsedMs).toBe(1000)
    expect(summary.tools).toEqual({ filesRead: 1, commands: 1, edits: 1, other: 1 })
    expect(summary.agentCount).toBe(1) // just the root agent
  })

  it('reports agent hub counts', () => {
    let p = emptyProjection(S)
    p = foldExecutionEvent(p, { type: 'status', sessionId: S, status: 'working' }, 0)
    p = foldExecutionEvent(p, subagent(S, { agentId: 'A', phase: 'started' }), 1)
    p = foldExecutionEvent(p, subagent(S, { agentId: 'B', phase: 'started' }), 1)
    p = foldExecutionEvent(p, subagent(S, { agentId: 'A', phase: 'completed' }), 2)
    p = foldExecutionEvent(p, { type: 'status', sessionId: S, status: 'idle', isTerminal: true }, 3)

    const hub = agentHubSummary(p)
    expect(hub.total).toBe(3) // main + A + B
    expect(hub.running).toBe(0)
    expect(hub.done).toBe(2) // main completed + A completed
    expect(hub.failed).toBe(1) // B interrupted at reconcile
  })
})
