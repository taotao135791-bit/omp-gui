import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { homedir } from 'node:os'
import { ModuleInfo } from '../shared/types'
import { getStore } from './store'

const EXTENSION_GLOBS = [
  { source: 'global' as const, base: path.join(homedir(), '.omp', 'agent', 'extensions') },
  { source: 'global' as const, base: path.join(homedir(), '.pi', 'agent', 'extensions') }
]

export function scanModules(cwd?: string): ModuleInfo[] {
  const enabled = new Set(getStore('enabledModules'))
  const seen = new Set<string>()
  const modules: ModuleInfo[] = []

  const locations = [...EXTENSION_GLOBS]
  if (cwd) {
    locations.push(
      { source: 'local' as const, base: path.join(cwd, '.omp', 'extensions') },
      { source: 'local' as const, base: path.join(cwd, '.pi', 'extensions') }
    )
  }

  // Built-in conceptual modules that users can toggle
  const builtins: ModuleInfo[] = [
    {
      id: 'builtin:lsp',
      name: 'LSP',
      description: 'Language Server Protocol integration for code intelligence.',
      source: 'builtin',
      path: '',
      enabled: enabled.has('builtin:lsp')
    },
    {
      id: 'builtin:debugger',
      name: 'Debugger',
      description: 'DAP debugger control for running and inspecting programs.',
      source: 'builtin',
      path: '',
      enabled: enabled.has('builtin:debugger')
    },
    {
      id: 'builtin:browser',
      name: 'Browser',
      description: 'Headless browser control for web automation.',
      source: 'builtin',
      path: '',
      enabled: enabled.has('builtin:browser')
    }
  ]

  for (const mod of builtins) {
    modules.push(mod)
    seen.add(mod.id)
  }

  for (const { source, base } of locations) {
    if (!existsSync(base)) continue
    let entries: string[] = []
    try {
      entries = readdirSync(base)
    } catch {
      continue
    }

    for (const entry of entries) {
      const full = path.join(base, entry)
      let info: ModuleInfo | null = null

      try {
        const st = statSync(full)
        if (st.isDirectory()) {
          info = readModuleFromDir(full, source, enabled)
        } else if (entry.endsWith('.ts') || entry.endsWith('.js')) {
          const id = `${source}:${entry}`
          if (seen.has(id)) continue
          info = {
            id,
            name: entry.replace(/\.(ts|js)$/, ''),
            description: 'Custom extension.',
            source,
            path: full,
            enabled: enabled.has(id)
          }
        }
      } catch {
        continue
      }

      if (info && !seen.has(info.id)) {
        modules.push(info)
        seen.add(info.id)
      }
    }
  }

  return modules
}

function readModuleFromDir(
  dir: string,
  source: 'global' | 'local',
  enabled: Set<string>
): ModuleInfo | null {
  const pkgPath = path.join(dir, 'package.json')
  const indexPath = path.join(dir, 'index.ts')
  const id = `${source}:${path.basename(dir)}`

  let name = path.basename(dir)
  let description = 'Pi extension.'
  let version: string | undefined
  let author: string | undefined

  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
      name = pkg.displayName || pkg.name || name
      description = pkg.description || description
      version = pkg.version
      author = pkg.author
    } catch {
      // ignore
    }
  }

  if (!existsSync(indexPath) && !existsSync(path.join(dir, 'index.js'))) {
    return null
  }

  return {
    id,
    name,
    description,
    version,
    author,
    source,
    path: dir,
    enabled: enabled.has(id)
  }
}
