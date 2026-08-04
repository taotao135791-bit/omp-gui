import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { homedir } from 'node:os'
import { ModuleInfo } from '../shared/types'

export interface ModuleLocation {
  source: 'global' | 'local'
  base: string
}

export function globalExtensionDirs(): ModuleLocation[] {
  return [
    { source: 'global', base: path.join(homedir(), '.omp', 'agent', 'extensions') },
    { source: 'global', base: path.join(homedir(), '.pi', 'agent', 'extensions') }
  ]
}

export function localExtensionDirs(cwd: string): ModuleLocation[] {
  return [
    { source: 'local', base: path.join(cwd, '.omp', 'extensions') },
    { source: 'local', base: path.join(cwd, '.pi', 'extensions') }
  ]
}

// Built-in conceptual modules that users can toggle
export function builtinModules(): ModuleInfo[] {
  return [
    {
      id: 'builtin:lsp',
      name: 'LSP',
      description: 'Language Server Protocol integration for code intelligence.',
      source: 'builtin',
      path: '',
      enabled: false
    },
    {
      id: 'builtin:debugger',
      name: 'Debugger',
      description: 'DAP debugger control for running and inspecting programs.',
      source: 'builtin',
      path: '',
      enabled: false
    },
    {
      id: 'builtin:browser',
      name: 'Browser',
      description: 'Headless browser control for web automation.',
      source: 'builtin',
      path: '',
      enabled: false
    }
  ]
}

/**
 * Scan the given extension directories for modules.
 * Pure (no Electron / store dependencies) so it can be unit-tested.
 */
export function scanModuleDirs(
  locations: ModuleLocation[],
  enabledIds: Set<string>
): ModuleInfo[] {
  const seen = new Set<string>()
  const modules: ModuleInfo[] = []

  for (const mod of builtinModules()) {
    modules.push({ ...mod, enabled: enabledIds.has(mod.id) })
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
          info = readModuleFromDir(full, source)
        } else if (entry.endsWith('.ts') || entry.endsWith('.js')) {
          const id = `${source}:${entry}`
          info = {
            id,
            name: entry.replace(/\.(ts|js)$/, ''),
            description: 'Custom extension.',
            source,
            path: full,
            enabled: false
          }
        }
      } catch {
        continue
      }

      if (info && !seen.has(info.id)) {
        modules.push({ ...info, enabled: enabledIds.has(info.id) })
        seen.add(info.id)
      }
    }
  }

  return modules
}

function readModuleFromDir(
  dir: string,
  source: 'global' | 'local'
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
      // ignore malformed package.json
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
    enabled: false
  }
}
