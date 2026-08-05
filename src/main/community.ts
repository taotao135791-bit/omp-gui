/**
 * Community pi packages, searched live from the npm registry.
 * pi packages self-declare with the `pi-package` keyword, so the registry
 * search doubles as the ecosystem index (pi.dev/packages points there too).
 */
import { CommunityPackageInfo } from '../shared/types'

export type CommunityPackage = CommunityPackageInfo

const SEARCH_URL = 'https://registry.npmjs.org/-/v1/search'
const REGISTRY_URL = 'https://registry.npmjs.org'
const TIMEOUT_MS = 10_000

/** Well-known packages highlighted at the top of the community list. */
export const CURATED_PACKAGES = [
  'pi-subagents',
  'pi-mcp-adapter',
  'pi-web-access',
  'pi-lens',
  '@plannotator/pi-extension',
  '@narumitw/pi-goal'
]

export async function searchCommunityPackages(
  query: string,
  curatedOnly = false
): Promise<CommunityPackage[]> {
  if (curatedOnly) return fetchCurated()
  const text = `keywords:pi-package ${query.trim()}`.trim()
  const url = `${SEARCH_URL}?text=${encodeURIComponent(text)}&size=20`
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' }
    })
    clearTimeout(timer)
    if (!res.ok) return []
    const data = (await res.json()) as {
      objects?: { package?: { name?: string; description?: string; version?: string } }[]
    }
    const out: CommunityPackage[] = []
    for (const o of data.objects ?? []) {
      const p = o.package
      if (!p?.name) continue
      out.push({
        name: p.name,
        description: typeof p.description === 'string' ? p.description : '',
        version: typeof p.version === 'string' ? p.version : ''
      })
    }
    return out
  } catch {
    return []
  }
}

/**
 * The curated set is fetched from each package's registry document — the
 * search endpoint can't disjunct multiple `name:` terms in one query.
 * Order follows CURATED_PACKAGES.
 */
async function fetchCurated(): Promise<CommunityPackage[]> {
  const one = async (name: string): Promise<CommunityPackage | null> => {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
      const res = await fetch(`${REGISTRY_URL}/${encodeURIComponent(name)}/latest`, {
        signal: controller.signal,
        headers: { accept: 'application/json' }
      })
      clearTimeout(timer)
      if (!res.ok) return null
      const d = (await res.json()) as { name?: unknown; description?: unknown; version?: unknown }
      if (typeof d.name !== 'string') return null
      return {
        name: d.name,
        description: typeof d.description === 'string' ? d.description : '',
        version: typeof d.version === 'string' ? d.version : ''
      }
    } catch {
      return null
    }
  }
  const all = await Promise.all(CURATED_PACKAGES.map(one))
  return all.filter((p): p is CommunityPackage => p !== null)
}
