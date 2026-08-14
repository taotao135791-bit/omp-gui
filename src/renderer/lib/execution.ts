/**
 * Execution projection — the GUI-owned fold that turns a session's normalized
 * `SessionEvent` stream into ONE source of truth for the Agent Hub, the
 * trajectory overview and the per-turn tool summary.
 *
 * This is NOT a second runtime. Oh My Pi still owns execution; this module only
 * *projects* the already-normalized events (see src/main/omp/OmpProtocol.ts)
 * into UI-facing shapes. The design rule: the same fact is never copied into a
 * Chat state, a Trajectory state, an Agent-Hub state and a Jobs state — the
 * store holds this single projection and every surface derives via selectors.
 *
 * Pure functions, no React, no Electron — unit-testable in isolation.
 */

import type { SessionEvent } from '@shared/types'

export type AgentStatus =
  | 'queued'
  | 'running'
  | 'waiting'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted'

/** Normalized agent node (the Agent Hub tree). Fields follow what OMP exposes. */
export interface AgentNode {
  id: string
  parentId?: string
  rootSessionId: string
  label?: string
  purpose?: string
  depth: number
  status: AgentStatus
  provider?: string
  model?: string
  startedAt?: number
  endedAt?: number
  resultSummary?: string
  /** Latest normalized activity text (never a raw RPC event). */
  activity?: string
}

export interface ToolCounts {
  filesRead: number
  commands: number
  edits: number
  other: number
}

/** One entry in the chronological trajectory ledger. */
export interface TrajectoryEntry {
  seq: number
  kind: 'reasoning' | 'message' | 'tool' | 'subagent'
  label: string
  agentId?: string
}

export interface ExecutionProjection {
  agents: Record<string, AgentNode>
  rootAgentId: string
  turnActive: boolean
  turnStartedAt?: number
  turnEndedAt?: number
  tools: ToolCounts
  trajectory: TrajectoryEntry[]
}

/** Stable root-agent id within one session's projection. */
export const ROOT_AGENT_ID = 'main'

export function emptyToolCounts(): ToolCounts {
  return { filesRead: 0, commands: 0, edits: 0, other: 0 }
}

export function emptyProjection(sessionId: string): ExecutionProjection {
  return {
    agents: {
      [ROOT_AGENT_ID]: {
        id: ROOT_AGENT_ID,
        rootSessionId: sessionId,
        depth: 0,
        status: 'queued'
      }
    },
    rootAgentId: ROOT_AGENT_ID,
    turnActive: false,
    tools: emptyToolCounts(),
    trajectory: []
  }
}

function classifyTool(tool: string): keyof ToolCounts {
  const name = tool.toLowerCase()
  if (name === 'read' || name === 'ls') return 'filesRead'
  if (name === 'bash') return 'commands'
  if (name === 'edit' || name === 'write') return 'edits'
  return 'other'
}

const START_TOKENS = ['start', 'started', 'creat', 'spawn', 'launch', 'queued', 'running', 'begin']
const END_TOKENS = ['complete', 'finished', 'succeed', 'done', 'success', 'end']
const FAIL_TOKENS = ['fail', 'error']
const CANCEL_TOKENS = ['cancel', 'abort', 'kill', 'interrupt']

/** Tolerant upstream phase/status string → normalized AgentStatus (undefined if unknown). */
export function toAgentStatus(phase?: string, status?: string): AgentStatus | undefined {
  const token = `${phase ?? ''} ${status ?? ''}`.toLowerCase()
  if (CANCEL_TOKENS.some((t) => token.includes(t))) return 'cancelled'
  if (FAIL_TOKENS.some((t) => token.includes(t))) return 'failed'
  if (START_TOKENS.some((t) => token.includes(t))) return 'running'
  if (END_TOKENS.some((t) => token.includes(t))) return 'completed'
  return undefined
}

function isTerminalStatus(status: AgentStatus): boolean {
  return (
    status === 'completed' ||
    status === 'failed' ||
    status === 'cancelled' ||
    status === 'interrupted'
  )
}

/**
 * Fold one normalized SessionEvent into the projection. Returns a NEW projection
 * (never mutates the input) so the store's selector layer can memoize on
 * reference equality. Uninteresting events return the same reference.
 */
export function foldExecutionEvent(
  state: ExecutionProjection,
  event: SessionEvent,
  now = Date.now()
): ExecutionProjection {
  switch (event.type) {
    case 'status': {
      if (event.status === 'working') {
        const root = state.agents[state.rootAgentId]
        const agents = {
          ...state.agents,
          [state.rootAgentId]: {
            ...root,
            status: 'running' as const,
            startedAt: root.startedAt ?? now
          }
        }
        return {
          ...state,
          agents,
          turnActive: true,
          turnStartedAt: state.turnStartedAt ?? now
        }
      }
      // agent_end (idle) with isTerminal !== false closes the turn.
      if (event.status === 'idle' && event.isTerminal !== false && state.turnActive) {
        return endTurn(state, now)
      }
      return state
    }

    case 'tool_call': {
      const key = classifyTool(event.tool)
      return {
        ...state,
        tools: { ...state.tools, [key]: state.tools[key] + 1 },
        trajectory: [
          ...state.trajectory,
          { seq: state.trajectory.length, kind: 'tool', label: event.tool }
        ]
      }
    }

    case 'thinking': {
      // Coalesce the stream: one reasoning entry per turn, not per delta.
      if (state.trajectory.some((e) => e.kind === 'reasoning')) return state
      return {
        ...state,
        trajectory: [
          ...state.trajectory,
          { seq: state.trajectory.length, kind: 'reasoning', label: 'Thinking' }
        ]
      }
    }

    case 'message': {
      if (event.role !== 'assistant') return state
      const label = event.content.split('\n')[0].slice(0, 80) || 'Message'
      return {
        ...state,
        trajectory: [
          ...state.trajectory,
          { seq: state.trajectory.length, kind: 'message', label }
        ]
      }
    }

    case 'subagent': {
      return foldSubagent(state, event, now)
    }

    case 'subagent_progress': {
      const id = event.agentId
      if (!id || !state.agents[id]) return state
      return {
        ...state,
        agents: {
          ...state.agents,
          [id]: { ...state.agents[id], activity: event.text?.slice(0, 120) }
        }
      }
    }

    default:
      return state
  }
}

function foldSubagent(
  state: ExecutionProjection,
  event: Extract<SessionEvent, { type: 'subagent' }>,
  now: number
): ExecutionProjection {
  const id = event.agentId
  const status = toAgentStatus(event.phase, event.status)

  // No stable id → nothing to key the tree on; surface as a trajectory entry only.
  if (!id) {
    if (!status) return state
    return {
      ...state,
      trajectory: [
        ...state.trajectory,
        { seq: state.trajectory.length, kind: 'subagent', label: event.name ?? 'Subagent' }
      ]
    }
  }

  const existing = state.agents[id]
  const parentId = event.parentAgentId ?? state.rootAgentId
  const parent = state.agents[parentId] ?? state.agents[state.rootAgentId]
  const depth = parent ? parent.depth + 1 : 1

  // Status unknown → update metadata only (label/purpose/model) without guessing.
  const nextStatus = status ?? existing?.status ?? 'running'

  const node: AgentNode = {
    id,
    parentId,
    rootSessionId: event.sessionId,
    label: event.name ?? existing?.label,
    purpose: event.purpose ?? existing?.purpose,
    depth: existing?.depth ?? depth,
    status: nextStatus,
    provider: event.provider ?? existing?.provider,
    model: event.model ?? existing?.model,
    startedAt: event.startedAt ?? existing?.startedAt ?? now,
    endedAt: isTerminalStatus(nextStatus)
      ? event.endedAt ?? existing?.endedAt ?? now
      : existing?.endedAt,
    resultSummary: event.resultSummary ?? existing?.resultSummary
  }

  const isFirstSeen = !existing
  return {
    ...state,
    agents: { ...state.agents, [id]: node },
    trajectory:
      status && isFirstSeen
        ? [
            ...state.trajectory,
            {
              seq: state.trajectory.length,
              kind: 'subagent',
              label: node.label ?? 'Subagent',
              agentId: id
            }
          ]
        : state.trajectory
  }
}

function endTurn(state: ExecutionProjection, now: number): ExecutionProjection {
  // Reconcile: any subagent still running at turn end cannot be running anymore
  // (its process is gone) — mark it interrupted, never fabricate a "running".
  const agents: Record<string, AgentNode> = {}
  for (const [id, node] of Object.entries(state.agents)) {
    agents[id] =
      id !== state.rootAgentId && node.status === 'running'
        ? { ...node, status: 'interrupted', endedAt: node.endedAt ?? now }
        : node
  }
  agents[state.rootAgentId] = {
    ...agents[state.rootAgentId],
    status: 'completed',
    endedAt: now
  }
  return {
    ...state,
    agents,
    turnActive: false,
    turnEndedAt: now
  }
}


// --------------------------------------------------------------------- selectors

/** Agents ordered depth-first (root first), for the Agent Hub tree. */
export function orderedAgents(projection: ExecutionProjection): AgentNode[] {
  const byParent = new Map<string | undefined, AgentNode[]>()
  for (const node of Object.values(projection.agents)) {
    const list = byParent.get(node.parentId) ?? []
    list.push(node)
    byParent.set(node.parentId, list)
  }
  const out: AgentNode[] = []
  const visit = (id: string | undefined): void => {
    for (const node of byParent.get(id) ?? []) {
      out.push(node)
      visit(node.id)
    }
  }
  visit(undefined)
  return out
}

export interface AgentHubSummary {
  running: number
  done: number
  failed: number
  total: number
}

export function agentHubSummary(projection: ExecutionProjection): AgentHubSummary {
  const nodes = Object.values(projection.agents)
  const isBusy = (s: AgentStatus): boolean =>
    s === 'running' || s === 'waiting' || s === 'queued'
  return {
    running: nodes.filter((n) => isBusy(n.status)).length,
    done: nodes.filter((n) => n.status === 'completed').length,
    failed: nodes.filter(
      (n) => n.status === 'failed' || n.status === 'cancelled' || n.status === 'interrupted'
    ).length,
    total: nodes.length
  }
}

/** "Worked 1m42s · 14 files · 6 commands · 3 agents" summary data. */
export function turnSummary(projection: ExecutionProjection): {
  elapsedMs: number
  tools: ToolCounts
  agentCount: number
} {
  const start = projection.turnStartedAt ?? projection.turnEndedAt ?? 0
  const end = projection.turnEndedAt ?? start
  return {
    elapsedMs: Math.max(0, end - start),
    tools: projection.tools,
    agentCount: Object.keys(projection.agents).length
  }
}
