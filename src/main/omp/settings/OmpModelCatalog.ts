import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { RuntimeModelInfo } from '../../../shared/types'
import { detectCli } from '../OmpCapabilities'

/**
 * Current Oh My Pi's static model catalog — the bundled `models.json` shipped
 * inside the omp install (`@oh-my-pi/pi-catalog/src/models.json`). Unlike
 * `omp models --json` it is NOT credential-filtered, so the Settings →
 * Models dropdown can offer every concrete model a provider supports even
 * before an API key is stored.
 *
 * This is the full catalog (64 providers), NOT the live session's
 * credential-filtered availability (`omp models --json` / get_available_models).
 * The two stay separate.
 */

let catalogCache: RuntimeModelInfo[] | null = null

interface CatalogEntry {
  id?: unknown
  name?: unknown
  provider?: unknown
  reasoning?: unknown
  thinking?: { efforts?: unknown }
}

/**
 * Load the bundled static catalog, keyed by provider id → model id → entry.
 * `entry.id` is already `provider/model` (the selector form), while
 * `entry.provider` is the provider id.
 */
export async function listOmpModelCatalog(providerId?: string): Promise<RuntimeModelInfo[]> {
  if (!catalogCache) catalogCache = loadCatalog()
  return providerId ? catalogCache.filter((m) => m.provider === providerId) : catalogCache
}

function loadCatalog(): RuntimeModelInfo[] {
  const file = findCatalogFile()
  if (!file) return []
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf-8')) as Record<
      string,
      Record<string, CatalogEntry>
    >
    const models: RuntimeModelInfo[] = []
    for (const providerId of Object.keys(parsed)) {
      const byProvider = parsed[providerId]
      if (!byProvider || typeof byProvider !== 'object') continue
      for (const entry of Object.values(byProvider)) {
        const e = entry as CatalogEntry | undefined
        if (!e || typeof e.id !== 'string') continue
        const provider = typeof e.provider === 'string' ? e.provider : providerId
        const selector = e.id.includes('/') ? e.id : `${provider}/${e.id}`
        const efforts =
          e.thinking && typeof e.thinking === 'object'
            ? ((e.thinking as { efforts?: unknown }).efforts ?? [])
            : []
        models.push({
          provider,
          id: e.id.slice(e.id.lastIndexOf('/') + 1),
          selector,
          name: typeof e.name === 'string' ? e.name : e.id,
          reasoning: e.reasoning === true,
          thinking: Array.isArray(efforts)
            ? (efforts as unknown[]).filter((t): t is string => typeof t === 'string')
            : []
        })
      }
    }
    return models.sort(
      (a, b) => a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name)
    )
  } catch {
    return []
  }
}

/** Walk up from the cli's realpath to find the bundled pi-catalog models.json. */
export function findCatalogFile(): string | null {
  const cli = detectCli()
  if (!cli.available || !cli.path) return null
  const rel = join('node_modules', '@oh-my-pi', 'pi-catalog', 'src', 'models.json')
  try {
    let dir = dirname(realpathSync(cli.path))
    for (let i = 0; i < 8; i++) {
      const candidate = join(dir, rel)
      if (existsSync(candidate)) return candidate
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  } catch {
    // fall through
  }
  return null
}