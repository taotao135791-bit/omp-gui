import { readFile } from 'node:fs/promises'
import { HistoricalAgentRecord, SubagentStatus } from '../shared/types'

/**
 * OMP session reconstruction. The session JSONL is an append-only TREE, not a
 * linear chat log: every entry carries `id` / `parentId`, and a rollback/fork
 * appends a new branch whose parent is an earlier entry — so physical file order
 * ≠ the active conversation. Reconstruction must therefore walk the ACTIVE path
 * (leaf → root via parentId), mirroring OMP's own `buildSessionContext`.
 *
 * Everything here is defensive and forward-compatible: unknown entries are
 * skipped, a corrupt/cyclic parent chain terminates safely (visited set), and a
 * missing parent recovers what it can.
 */

export interface TurnExecutionMetadata {
  /** `provider/modelId` in effect at this user prompt, if recorded. */
  model?: string
  /** Session thinking level in effect at this user prompt, if recorded. */
  thinking?: string
}

interface SessionEntry {
  type?: string
  id?: string
  parentId?: string | null
  model?: unknown
  thinkingLevel?: unknown
  message?: Record<string, unknown>
  [key: string]: unknown
}

/** Parse a session JSONL string into entries, skipping malformed lines. */
export function parseSessionEntries(content: string): SessionEntry[] {
  const entries: SessionEntry[] = []
  for (const line of content.split('\n')) {
    if (!line.trim()) continue
    try {
      entries.push(JSON.parse(line) as SessionEntry)
    } catch {
      // skip malformed line
    }
  }
  return entries
}

/**
 * Resolve the active path (leaf → root, reversed) with cycle protection.
 * The active leaf is the LAST entry — matching OMP's session index, which sets
 * the leaf to the last inserted entry on rebuild (a resumed session's active
 * branch always continues from the last appended entry).
 */
export function resolveActivePath(entries: SessionEntry[]): SessionEntry[] {
  const byId = new Map<string, SessionEntry>()
  for (const entry of entries) {
    if (typeof entry.id === 'string') byId.set(entry.id, entry)
  }
  const leaf = entries.length > 0 ? entries[entries.length - 1] : undefined
  if (!leaf) return []

  const path: SessionEntry[] = []
  const seen = new Set<string>()
  let cursor: SessionEntry | undefined = leaf
  while (cursor && typeof cursor.id === 'string' && !seen.has(cursor.id)) {
    seen.add(cursor.id)
    path.push(cursor)
    cursor = typeof cursor.parentId === 'string' ? byId.get(cursor.parentId) : undefined
  }
  path.reverse()
  return path
}

/**
 * Reconstruct per-turn model/thinking from the ACTIVE path only. Replaying in
 * path order gives the exact model/thinking in effect at each user prompt — so a
 * rolled-back turn never contributes its (abandoned) metadata. Unknown stays
 * unknown (never the last model).
 */
export async function reconstructSessionMetadata(sessionFile: string): Promise<TurnExecutionMetadata[]> {
  let text: string
  try {
    text = await readFile(sessionFile, 'utf8')
  } catch {
    return []
  }

  const path = resolveActivePath(parseSessionEntries(text))
  const out: TurnExecutionMetadata[] = []
  let currentModel: string | undefined
  let currentThinking: string | undefined

  for (const entry of path) {
    if (entry.type === 'model_change') {
      if (typeof entry.model === 'string' && entry.model) currentModel = entry.model
    } else if (entry.type === 'thinking_level_change') {
      currentThinking = typeof entry.thinkingLevel === 'string' ? entry.thinkingLevel : undefined
    } else if (entry.type === 'message') {
      if (entry.message?.role === 'user') {
        out.push({ model: currentModel, thinking: currentThinking })
      }
    }
  }

  return out
}

/** Derive a subagent status from a durable `SingleResult` (no live state). */
function statusFromResult(result: Record<string, unknown>): SubagentStatus {
  if (result.aborted === true) return 'aborted'
  if (result.error !== undefined) return 'failed'
  if (result.exitCode === 0) return 'completed'
  return 'failed'
}

/**
 * Reconstruct completed/failed/aborted subagents from the ACTIVE path's `task`
 * tool results. OMP stores `SingleResult[]` under the task tool result's
 * `details.results`; each carries id / agent / model / duration / tokens /
 * context / final status. This lets a resumed session show its historical
 * children even when `get_subagents` returns [].
 */
export async function reconstructHistoricalAgents(sessionFile: string): Promise<HistoricalAgentRecord[]> {
  let text: string
  try {
    text = await readFile(sessionFile, 'utf8')
  } catch {
    return []
  }

  const path = resolveActivePath(parseSessionEntries(text))
  const out: HistoricalAgentRecord[] = []

  for (const entry of path) {
    if (entry.type !== 'message') continue
    const msg = entry.message
    if (!msg || msg.role !== 'toolResult') continue
    if (msg.toolName !== 'task' && msg.name !== 'task') continue
    const details = msg.details as { results?: unknown } | undefined
    if (!details || !Array.isArray(details.results)) continue

    for (const raw of details.results as Record<string, unknown>[]) {
      if (!raw || typeof raw.id !== 'string') continue
      const agentSource =
        raw.agentSource === 'user' || raw.agentSource === 'project' ? raw.agentSource : 'bundled'
      const summary =
        typeof raw.output === 'string' && raw.output
          ? raw.output.slice(0, 200)
          : typeof raw.error === 'string'
            ? raw.error.slice(0, 200)
            : undefined
      out.push({
        id: raw.id,
        agent: typeof raw.agent === 'string' ? raw.agent : 'task',
        agentSource,
        status: statusFromResult(raw),
        task: typeof raw.task === 'string' ? raw.task : undefined,
        assignment: typeof raw.assignment === 'string' ? raw.assignment : undefined,
        description: typeof raw.description === 'string' ? raw.description : undefined,
        lastIntent: typeof raw.lastIntent === 'string' ? raw.lastIntent : undefined,
        resolvedModel: typeof raw.resolvedModel === 'string' ? raw.resolvedModel : undefined,
        resolvedModelIsFallback: raw.resolvedModelIsFallback === true ? true : undefined,
        durationMs: typeof raw.durationMs === 'number' ? raw.durationMs : undefined,
        tokens: typeof raw.tokens === 'number' ? raw.tokens : undefined,
        requests: typeof raw.requests === 'number' ? raw.requests : undefined,
        contextTokens: typeof raw.contextTokens === 'number' ? raw.contextTokens : undefined,
        contextWindow: typeof raw.contextWindow === 'number' ? raw.contextWindow : undefined,
        resultSummary: summary
      })
    }
  }

  return out
}
