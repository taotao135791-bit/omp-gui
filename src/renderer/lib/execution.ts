/**
 * Execution projection — the GUI-owned fold that turns a session's normalized
 * `SessionEvent` stream into ONE source of truth for the Agent Hub, the
 * trajectory overview and the per-turn tool summary.
 *
 * This is NOT a second runtime. Oh My Pi still owns execution; this module only
 * *projects* the already-normalized events (see src/main/omp/OmpProtocol.ts)
 * into UI-facing shapes. One fold, many selectors — no per-UI copies.
 *
 * Lifecycle model (the important split):
 *   - Agents are SESSION-scoped. A subagent persists across the turns that use
 *     it (its lifecycle is driven by `subagent_lifecycle` / `subagent_progress`
 *     frames and hydrated by `get_subagents`). OMP exposes a FLAT roster (each
 *     agent links to its spawner via `parentToolCallId`, not a parent-agent id),
 *     so the graph is root + children — never a guessed tree.
 *   - Turns are PROMPT-scoped. Each `agent_start` opens a fresh TurnProjection;
 *     each terminal `agent_end` closes it. Tool counts, reasoning coalescing and
 *     trajectory are per-turn; a session total is DERIVED (sum over turns), never
 *     a second increment.
 *
 * Pure functions, no React, no Electron — unit-testable in isolation.
 */

import type { SessionEvent, SubagentSnapshot, SubagentStatus } from '@shared/types'

export type AgentStatus = SubagentStatus | 'unknown'

export type ToolCategory = 'read' | 'search' | 'edit' | 'command' | 'subagent' | 'other'

export interface ToolStats {
  read: number
  search: number
  edit: number
  command: number
  subagent: number
  other: number
}

export function emptyToolStats(): ToolStats {
  return { read: 0, search: 0, edit: 0, command: 0, subagent: 0, other: 0 }
}

/**
 * The SINGLE tool-category classifier. Chat turn summaries, the trajectory and
 * any future surface all derive from this one function — never per-surface
 * switches that drift apart.
 */
export function classifyToolCall(tool: string): ToolCategory {
  const name = tool.toLowerCase()
  if (name === 'read' || name === 'ls' || name === 'cat' || name === 'head' || name === 'tail') {
    return 'read'
  }
  if (name === 'grep' || name === 'find' || name === 'rg' || name === 'search' || name === 'glob') {
    return 'search'
  }
  if (name === 'bash' || name === 'run' || name === 'exec') return 'command'
  if (name === 'edit' || name === 'write' || name === 'patch') return 'edit'
  if (name === 'subagent' || name === 'agent' || name === 'task' || name === 'spawn') {
    return 'subagent'
  }
  return 'other'
}

function addTool(stats: ToolStats, tool: string): ToolStats {
  const category = classifyToolCall(tool)
  return { ...stats, [category]: stats[category] + 1 }
}

/**
 * EXACT upstream status normalization. Only the `AgentProgress.status` /
 * lifecycle values are recognized; anything else is 'unknown' — never guessed,
 * never substring-matched, and never folded into a lossy 'cancelled'.
 */
export function normalizeOmpAgentStatus(raw: unknown): AgentStatus {
  switch (raw) {
    case 'pending':
    case 'running':
    case 'completed':
    case 'failed':
    case 'aborted':
      return raw
    default:
      return 'unknown'
  }
}

export interface AgentNode {
  /** OMP's stable registry id (or ROOT_AGENT_ID for the main agent). */
  id: string
  /** Agent definition name (e.g. 'explore', 'review'); root is 'main'. */
  agent: string
  agentSource: 'bundled' | 'user' | 'project'
  status: AgentStatus
  description?: string
  task?: string
  assignment?: string
  sessionFile?: string
  /** The tool call that spawned this agent (not a parent-agent id). */
  parentToolCallId?: string
  index?: number
  /** Arrival timestamp of first observation — a UI estimate, not durable. */
  startedAt?: number
  /** Arrival timestamp of the terminal observation — a UI estimate, not durable. */
  endedAt?: number
  /** Runtime-reported `lastUpdate` (ms epoch). */
  lastUpdate?: number
  lastIntent?: string
  currentTool?: string
  toolCount?: number
}

export interface TrajectoryEntry {
  seq: number
  kind: 'reasoning' | 'message' | 'tool' | 'subagent' | 'steer'
  label: string
  agentId?: string
}

export type TurnStatus = 'running' | 'completed' | 'failed' | 'interrupted'

export interface TurnProjection {
  id: string
  startedAt?: number
  endedAt?: number
  status: TurnStatus
  tools: ToolStats
  trajectory: TrajectoryEntry[]
}

export interface ExecutionProjection {
  agents: Record<string, AgentNode>
  rootAgentId: string
  turns: Record<string, TurnProjection>
  turnOrder: string[]
  currentTurnId?: string
  /** Monotonic per-session turn counter — the source of stable turn ids. */
  turnCounter: number
}

export const ROOT_AGENT_ID = 'main'

export function emptyProjection(_sessionId?: string): ExecutionProjection {
  return {
    agents: {
      [ROOT_AGENT_ID]: {
        id: ROOT_AGENT_ID,
        agent: 'main',
        agentSource: 'bundled',
        status: 'pending'
      }
    },
    rootAgentId: ROOT_AGENT_ID,
    turns: {},
    turnOrder: [],
    turnCounter: 0
  }
}

function isTerminalAgent(status: AgentStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'aborted'
}

function isBusyAgent(status: AgentStatus): boolean {
  return status === 'pending' || status === 'running'
}
// --------------------------------------------------------------------- fold

/**
 * Fold one normalized SessionEvent into the projection. Returns a NEW projection
 * (never mutates the input) so Zustand selectors can memoize on reference
 * equality; uninteresting events return the same reference.
 */
export function foldExecutionEvent(
  state: ExecutionProjection,
  event: SessionEvent,
  now = Date.now()
): ExecutionProjection {
  switch (event.type) {
    case 'status': {
      if (event.status === 'working') return startTurn(state, now)
      if (event.status === 'idle' && event.isTerminal !== false && state.currentTurnId) {
        return endTurn(state, now, 'completed')
      }
      return state
    }

    case 'error': {
      // A non-recoverable error ends the current turn (mirrors OmpSession).
      if (event.recoverable === true || !state.currentTurnId) return state
      return endTurn(state, now, 'failed')
    }

    case 'tool_call': {
      const turn = state.currentTurnId ? state.turns[state.currentTurnId] : undefined
      if (!turn) return state
      return {
        ...state,
        turns: {
          ...state.turns,
          [turn.id]: {
            ...turn,
            tools: addTool(turn.tools, event.tool),
            trajectory: appendEntry(turn.trajectory, { kind: 'tool', label: event.tool })
          }
        }
      }
    }

    case 'thinking': {
      const turn = state.currentTurnId ? state.turns[state.currentTurnId] : undefined
      if (!turn) return state
      // Reasoning coalesces PER TURN — turn 2 gets its own Thinking entry.
      if (turn.trajectory.some((e) => e.kind === 'reasoning')) return state
      return {
        ...state,
        turns: {
          ...state.turns,
          [turn.id]: {
            ...turn,
            trajectory: appendEntry(turn.trajectory, { kind: 'reasoning', label: 'Thinking' })
          }
        }
      }
    }

    case 'message': {
      if (event.role !== 'assistant') return state
      const turn = state.currentTurnId ? state.turns[state.currentTurnId] : undefined
      if (!turn) return state
      return {
        ...state,
        turns: {
          ...state.turns,
          [turn.id]: {
            ...turn,
            trajectory: appendEntry(turn.trajectory, {
              kind: 'message',
              label: event.content.split('\n')[0].slice(0, 80) || 'Message'
            })
          }
        }
      }
    }

    case 'subagent': {
      return upsertAgent(state, toAgentNode(event, now), now)
    }

    default:
      return state
  }
}

/** Append a steer interaction to the ACTIVE turn's trajectory (never a new turn). */
export function foldUserSteer(
  state: ExecutionProjection,
  text: string
): ExecutionProjection {
  const turn = state.currentTurnId ? state.turns[state.currentTurnId] : undefined
  if (!turn) return state
  return {
    ...state,
    turns: {
      ...state.turns,
      [turn.id]: {
        ...turn,
        trajectory: appendEntry(turn.trajectory, {
          kind: 'steer',
          label: text.split('\n')[0].slice(0, 80) || 'Steer'
        })
      }
    }
  }
}

function appendEntry(list: TrajectoryEntry[], entry: Omit<TrajectoryEntry, 'seq'>): TrajectoryEntry[] {
  return [...list, { ...entry, seq: list.length }]
}

function startTurn(state: ExecutionProjection, now: number): ExecutionProjection {
  const turnId = `turn-${state.turnCounter + 1}`
  const turn: TurnProjection = {
    id: turnId,
    startedAt: now,
    status: 'running',
    tools: emptyToolStats(),
    trajectory: []
  }
  return {
    ...state,
    turnCounter: state.turnCounter + 1,
    currentTurnId: turnId,
    turns: { ...state.turns, [turnId]: turn },
    turnOrder: [...state.turnOrder, turnId],
    agents: {
      ...state.agents,
      [state.rootAgentId]: {
        ...state.agents[state.rootAgentId],
        status: 'running',
        startedAt: state.agents[state.rootAgentId].startedAt ?? now
      }
    }
  }
}

function endTurn(
  state: ExecutionProjection,
  now: number,
  status: TurnStatus
): ExecutionProjection {
  const turnId = state.currentTurnId
  if (!turnId) return state
  const turn = state.turns[turnId]
  const agents: Record<string, AgentNode> = {}
  for (const [id, node] of Object.entries(state.agents)) {
    agents[id] =
      id !== state.rootAgentId && isBusyAgent(node.status)
        ? { ...node, status: 'unknown', endedAt: node.endedAt ?? now }
        : node
  }
  agents[state.rootAgentId] = { ...agents[state.rootAgentId], status: 'completed', endedAt: now }
  return {
    ...state,
    agents,
    currentTurnId: undefined,
    turns: {
      ...state.turns,
      [turnId]: { ...turn, status, endedAt: now }
    }
  }
}

function toAgentNode(event: Extract<SessionEvent, { type: 'subagent' }>, now: number): AgentNode {
  return {
    id: event.id,
    agent: event.agent,
    agentSource: event.agentSource,
    status: normalizeOmpAgentStatus(event.status),
    description: event.description,
    task: event.task,
    assignment: event.assignment,
    sessionFile: event.sessionFile,
    parentToolCallId: event.parentToolCallId,
    index: event.index,
    lastUpdate: now,
    lastIntent: event.lastIntent,
    currentTool: event.currentTool,
    toolCount: event.toolCount
  }
}

function upsertAgent(
  state: ExecutionProjection,
  incoming: AgentNode,
  now: number
): ExecutionProjection {
  const existing = state.agents[incoming.id]
  const startedAt = existing?.startedAt ?? now
  const endedAt = isTerminalAgent(incoming.status) ? existing?.endedAt ?? now : existing?.endedAt
  const node: AgentNode = { ...existing, ...incoming, startedAt, endedAt }
  return {
    ...state,
    agents: { ...state.agents, [incoming.id]: node }
  }
}

/**
 * Upsert a `get_subagents` roster snapshot. Uses the SAME `upsertAgent` reducer
 * as live events, so snapshot hydration and incremental events converge on one
 * graph — never two state machines. Terminal agents that only existed before the
 * GUI attached are simply absent from the roster (upstream drops them).
 */
export function applyAgentRoster(
  state: ExecutionProjection,
  snapshots: readonly SubagentSnapshot[],
  now = Date.now()
): ExecutionProjection {
  let next = state
  for (const s of snapshots) {
    next = upsertAgent(next, snapshotToAgentNode(s, now), now)
  }
  return next
}

function snapshotToAgentNode(s: SubagentSnapshot, now: number): AgentNode {
  return {
    id: s.id,
    agent: s.agent,
    agentSource: s.agentSource,
    status: normalizeOmpAgentStatus(s.status),
    description: s.description,
    task: s.task,
    assignment: s.assignment,
    sessionFile: s.sessionFile,
    parentToolCallId: s.parentToolCallId,
    index: s.index,
    lastUpdate: s.lastUpdate,
    lastIntent: s.lastIntent,
    currentTool: s.currentTool,
    toolCount: s.toolCount,
    startedAt: now
  }
}

// ------------------------------------------------------------------ selectors

/** Agents ordered root-first then by spawn index (flat roster — no guessed tree). */
export function orderedAgents(projection: ExecutionProjection): AgentNode[] {
  const root = projection.agents[projection.rootAgentId]
  const children = Object.values(projection.agents)
    .filter((n) => n.id !== projection.rootAgentId)
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0) || a.id.localeCompare(b.id))
  return [root, ...children]
}

export interface AgentHubSummary {
  running: number
  done: number
  failed: number
  total: number
}

export function agentHubSummary(projection: ExecutionProjection): AgentHubSummary {
  const nodes = Object.values(projection.agents)
  return {
    running: nodes.filter((n) => isBusyAgent(n.status)).length,
    done: nodes.filter((n) => n.status === 'completed').length,
    failed: nodes.filter((n) => n.status === 'failed' || n.status === 'aborted').length,
    total: nodes.length
  }
}

/** The current (in-flight) turn, or undefined. */
export function currentTurn(projection: ExecutionProjection): TurnProjection | undefined {
  return projection.currentTurnId ? projection.turns[projection.currentTurnId] : undefined
}

/** Elapsed wall time of a turn (arrival-based; non-durable across resume). */
export function turnElapsedMs(turn: TurnProjection): number {
  const start = turn.startedAt ?? turn.endedAt ?? 0
  const end = turn.endedAt ?? start
  return Math.max(0, end - start)
}

/** Session-wide tool totals DERIVED by summing turns — never a second counter. */
export function sessionToolTotals(projection: ExecutionProjection): ToolStats {
  const totals = emptyToolStats()
  for (const turn of Object.values(projection.turns)) {
    for (const key of Object.keys(totals) as (keyof ToolStats)[]) {
      totals[key] += turn.tools[key]
    }
  }
  return totals
}

