import { readFile } from 'node:fs/promises'

/**
 * Reconstruct per-turn model / thinking metadata from OMP's durable session
 * JSONL. OMP writes `model_change` and `thinking_level_change` entries
 * interspersed with `message` entries; replaying them in order yields the exact
 * model/thinking in effect at each user prompt — so a resumed session shows
 * "Turn 1 → model A" and "Turn 2 → model B", never the last model everywhere.
 *
 * This is a linear replay (single pass), tolerant of any entry we don't care
 * about, and it NEVER fabricates: a turn with no recorded model/thinking is left
 * undefined (unknown historical truth stays unknown). Steer is NOT handled here
 * — it is reconstructed from the `steering` flag on the `get_messages` output.
 */

export interface TurnExecutionMetadata {
  /** `provider/modelId` in effect at this user prompt, if recorded. */
  model?: string
  /** Session thinking level in effect at this user prompt, if recorded. */
  thinking?: string
}

/**
 * Parse a session JSONL and return one metadata record per USER message, in
 * chronological order (aligned with the user messages `get_messages` returns).
 * An unreadable/corrupt file returns [] — the caller degrades to unknown.
 */
export async function reconstructSessionMetadata(sessionFile: string): Promise<TurnExecutionMetadata[]> {
  let text: string
  try {
    text = await readFile(sessionFile, 'utf8')
  } catch {
    return []
  }

  const out: TurnExecutionMetadata[] = []
  let currentModel: string | undefined
  let currentThinking: string | undefined

  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    let entry: Record<string, unknown>
    try {
      entry = JSON.parse(line) as Record<string, unknown>
    } catch {
      continue
    }

    if (entry.type === 'model_change') {
      if (typeof entry.model === 'string' && entry.model) currentModel = entry.model
    } else if (entry.type === 'thinking_level_change') {
      currentThinking = typeof entry.thinkingLevel === 'string' ? entry.thinkingLevel : undefined
    } else if (entry.type === 'message') {
      const msg = entry.message as { role?: unknown } | undefined
      if (msg?.role === 'user') {
        out.push({ model: currentModel, thinking: currentThinking })
      }
    }
  }

  return out
}
