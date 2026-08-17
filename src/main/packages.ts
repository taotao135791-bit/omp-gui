import { spawn } from 'node:child_process'
import {
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync
} from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import {
  PackageActionResult,
  PackageInfo,
  PackageResource,
  PackageSourceKind
} from '../shared/types'
import { detectCli, executableSearchDirs } from './omp'
import { defaultPiAgentDir, readPiSettings, writePiSettings, PiSettings } from './piSettings'

export { defaultPiAgentDir } from './piSettings'

/**
 * pi package management, backed by the CLI's native mechanisms:
 * - install/remove/update shell out to `pi install|remove|update`
 * - listing reads `packages` from ~/.pi/agent/settings.json (same as `pi list`)
 * - enable/disable rewrites the entry between the string form (load everything)
 *   and the object form with all resource arrays empty (load nothing) — the
 *   documented settings filter format, applied by pi on the next launch.
 */

// ---------------------------------------------------------------------------
// Source classification (pure)
// ---------------------------------------------------------------------------

export function classifySource(source: string): PackageSourceKind {
  if (source.startsWith('npm:')) return 'npm'
  if (source.startsWith('git:')) return 'git'
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(source)) return 'git' // https:// ssh:// git:// …
  if (/^(git@|[^/\s]+@)[^/\s]+:/.test(source)) return 'git' // git@host:user/repo shorthand
  if (source.startsWith('/') || source.startsWith('./') || source.startsWith('../')) return 'local'
  if (source.startsWith('~')) return 'local'
  if (source.startsWith('.')) return 'local'
  // Anything left is a bare npm package name, e.g. "pi-web-access" or "@scope/pkg@1.0.0"
  return 'npm'
}

/** npm specs with an explicit version and git refs are skipped by `pi update`. */
export function isPinned(source: string, kind: PackageSourceKind): boolean {
  if (kind === 'local') return false
  if (kind === 'npm') {
    const spec = source.replace(/^npm:/, '')
    const atCount = (spec.match(/@/g) || []).length
    return spec.startsWith('@') ? atCount >= 2 : atCount >= 1
  }
  // git: ref lives after the last '@' (absent in protocol URLs without ref)
  const body = source.replace(/^git:/, '')
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(body)) {
    return /@[^/@]+$/.test(body)
  }
  return /@[^/@]+$/.test(body)
}

// ---------------------------------------------------------------------------
// Settings parsing (pure, fs-injected)
// ---------------------------------------------------------------------------

type PackageEntry = string | { source?: string; [key: string]: unknown }

function entrySource(entry: PackageEntry): string | null {
  if (typeof entry === 'string') return entry
  if (entry && typeof entry.source === 'string') return entry.source
  return null
}

const RESOURCE_KEYS = ['extensions', 'skills', 'prompts', 'themes'] as const

/**
 * An entry is disabled when every resource array is present and empty.
 * Partial custom filters count as enabled; toggling them normalizes the entry
 * to the plain string form (enable) or the all-empty object form (disable).
 */
export function packageEnabled(entry: PackageEntry): boolean {
  if (typeof entry === 'string') return true
  return !RESOURCE_KEYS.every(
    (key) => Array.isArray(entry[key]) && (entry[key] as unknown[]).length === 0
  )
}

// ---------------------------------------------------------------------------
// Install location + metadata (pure-ish, fs reads with injected roots)
// ---------------------------------------------------------------------------

function npmPackageName(source: string): string {
  const spec = source.replace(/^npm:/, '')
  if (spec.startsWith('@')) {
    const secondAt = spec.indexOf('@', 1)
    return secondAt === -1 ? spec : spec.slice(0, secondAt)
  }
  const at = spec.indexOf('@')
  return at === -1 ? spec : spec.slice(0, at)
}

function gitRepoSlug(source: string): { host: string; repo: string } | null {
  let body = source.replace(/^git:/, '')
  body = body.replace(/@[^/@]+$/, '') // strip ref
  body = body.replace(/\.git$/, '')
  const proto = body.match(/^[a-z][a-z0-9+.-]*:\/\//i)
  if (proto) {
    try {
      const url = new URL(body)
      return { host: url.hostname, repo: url.pathname.replace(/^\//, '') }
    } catch {
      return null
    }
  }
  const scp = body.match(/^(?:git@)?([^:/]+):(.+)$/) // git@host:user/repo
  if (scp) return { host: scp[1], repo: scp[2] }
  const slash = body.indexOf('/')
  if (slash > 0) return { host: body.slice(0, slash), repo: body.slice(slash + 1) }
  return null
}

/** Where pi places the package on disk; null when it cannot be determined. */
export function resolvePackagePath(
  source: string,
  kind: PackageSourceKind,
  piAgentDir: string
): string | null {
  if (kind === 'npm') {
    return path.join(piAgentDir, 'npm', 'node_modules', npmPackageName(source))
  }
  if (kind === 'git') {
    const slug = gitRepoSlug(source)
    if (!slug) return null
    return path.join(piAgentDir, 'git', slug.host, slug.repo)
  }
  let p = source
  if (p.startsWith('~')) p = path.join(homedir(), p.slice(1))
  return path.resolve(piAgentDir, p)
}

interface PkgManifest {
  name?: string
  displayName?: string
  description?: string
  version?: string
  pi?: Partial<Record<'extensions' | 'skills' | 'prompts' | 'themes', string[]>>
}

function readManifest(dir: string): PkgManifest | null {
  try {
    return JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf-8')) as PkgManifest
  } catch {
    return null
  }
}

function safeReaddir(dir: string): string[] {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

/** Declared resource entries: manifest `pi.*` paths (glob suffixes stripped) + conventions. */
export function resourceEntries(dir: string, manifest: PkgManifest | null, key: 'extensions' | 'skills' | 'prompts' | 'themes', convention: string): string[] {
  const entries = new Set<string>()
  const root = path.resolve(dir)
  let rootReal: string | null = null
  try {
    rootReal = realpathSync(root)
  } catch {
    // If the package root itself cannot be resolved, fall back to lexical only
    // (the caller already verified the dir exists).
    rootReal = root
  }
  const add = (entry: string) => {
    const cleaned = entry.split(/[*!]/)[0].replace(/\/+$/, '').replace(/^\.(\/|$)/, '')
    if (!cleaned) return
    const resolved = path.resolve(root, cleaned)
    // Lexical reject first (cheap).
    if (resolved !== root && !resolved.startsWith(root + path.sep)) return
    // Physical containment: symlinks inside the package must not point outside it.
    let candidateReal: string | null
    try {
      candidateReal = realpathSync(resolved)
    } catch {
      // Resource path does not exist or is a broken symlink: treat as missing.
      return
    }
    if (candidateReal !== rootReal && !candidateReal.startsWith(rootReal + path.sep)) return
    entries.add(path.normalize(resolved))
  }
  add(convention)
  for (const entry of manifest?.pi?.[key] ?? []) {
    if (typeof entry === 'string') add(entry)
  }
  return Array.from(entries)
}

function isFile(p: string): boolean {
  try {
    return statSync(p).isFile()
  } catch {
    return false
  }
}

function listResources(target: string): PackageResource[] {
  const resources: PackageResource[] = []
  let st
  try {
    st = statSync(target)
  } catch {
    return resources
  }
  if (!st.isDirectory()) {
    // A lone local file loads as a single extension
    resources.push({ type: 'extension', name: path.basename(target).replace(/\.(ts|js)$/, '') })
    return resources
  }

  const manifest = readManifest(target)

  for (const entry of resourceEntries(target, manifest, 'extensions', 'extensions')) {
    if (isFile(entry)) {
      if (/\.(ts|js)$/.test(entry)) {
        // "index" says nothing — prefer the package name for lone entry files
        const base = path.basename(entry).replace(/\.(ts|js)$/, '')
        resources.push({ type: 'extension', name: base === 'index' ? (manifest?.name ?? base) : base })
      }
      continue
    }
    for (const child of safeReaddir(entry)) {
      const full = path.join(entry, child)
      if (/\.(ts|js)$/.test(child)) {
        resources.push({ type: 'extension', name: child.replace(/\.(ts|js)$/, '') })
      } else if (
        existsSync(path.join(full, 'index.ts')) ||
        existsSync(path.join(full, 'index.js'))
      ) {
        resources.push({ type: 'extension', name: child })
      }
    }
  }

  for (const entry of resourceEntries(target, manifest, 'skills', 'skills')) {
    if (isFile(entry)) {
      if (entry.endsWith('.md')) {
        resources.push({ type: 'skill', name: path.basename(entry).replace(/\.md$/, '') })
      }
      continue
    }
    if (existsSync(path.join(entry, 'SKILL.md'))) {
      resources.push({ type: 'skill', name: skillName(entry) ?? path.basename(entry) })
      continue
    }
    for (const child of safeReaddir(entry)) {
      const full = path.join(entry, child)
      if (child.endsWith('.md')) {
        resources.push({ type: 'skill', name: child.replace(/\.md$/, '') })
      } else if (existsSync(path.join(full, 'SKILL.md'))) {
        resources.push({ type: 'skill', name: skillName(full) ?? child })
      }
    }
  }

  for (const entry of resourceEntries(target, manifest, 'prompts', 'prompts')) {
    if (isFile(entry)) {
      if (entry.endsWith('.md')) {
        resources.push({ type: 'prompt', name: path.basename(entry).replace(/\.md$/, '') })
      }
      continue
    }
    for (const child of safeReaddir(entry)) {
      if (child.endsWith('.md')) {
        resources.push({ type: 'prompt', name: child.replace(/\.md$/, '') })
      }
    }
  }

  for (const entry of resourceEntries(target, manifest, 'themes', 'themes')) {
    if (isFile(entry)) {
      if (entry.endsWith('.json')) {
        resources.push({ type: 'theme', name: path.basename(entry).replace(/\.json$/, '') })
      }
      continue
    }
    for (const child of safeReaddir(entry)) {
      if (child.endsWith('.json')) {
        resources.push({ type: 'theme', name: child.replace(/\.json$/, '') })
      }
    }
  }

  return resources
}

function skillName(skillDir: string): string | null {
  try {
    const head = readFileSync(path.join(skillDir, 'SKILL.md'), 'utf-8').slice(0, 2000)
    const match = head.match(/^name:\s*(.+)$/m)
    return match ? match[1].trim() : null
  } catch {
    return null
  }
}

export function parsePackages(settings: PiSettings, piAgentDir: string): PackageInfo[] {
  const seen = new Set<string>()
  const out: PackageInfo[] = []
  for (const entry of (settings.packages ?? []) as PackageEntry[]) {
    const source = entrySource(entry)
    if (!source || seen.has(source)) continue
    seen.add(source)

    const kind = classifySource(source)
    const target = resolvePackagePath(source, kind, piAgentDir)
    const onDisk = target ? existsSync(target) : false
    const manifest = onDisk && target && statSync(target).isDirectory() ? readManifest(target) : null

    out.push({
      source,
      kind,
      name: manifest?.displayName || manifest?.name || fallbackName(source, kind),
      description: manifest?.description,
      version: manifest?.version,
      enabled: packageEnabled(entry),
      path: onDisk && target ? target : undefined,
      resources: onDisk && target ? listResources(target) : [],
      pinned: isPinned(source, kind)
    })
  }
  return out
}

function fallbackName(source: string, kind: PackageSourceKind): string {
  if (kind === 'npm') return npmPackageName(source)
  if (kind === 'git') return gitRepoSlug(source)?.repo.split('/').pop() ?? source
  return path.basename(source)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function listPackages(piAgentDir: string = defaultPiAgentDir()): PackageInfo[] {
  return parsePackages(readPiSettings(piAgentDir), piAgentDir)
}

export function setPackageEnabled(
  source: string,
  enabled: boolean,
  piAgentDir: string = defaultPiAgentDir()
): PackageActionResult {
  // The enabled/disabled flag lives in pi's legacy settings.json — a file
  // current Oh My Pi does not read. Toggling it there would be a fake
  // success, so the operation is legacy-profile-only.
  if (detectCli().command === 'omp') {
    return {
      ok: false,
      log: 'Package enable/disable uses the legacy Pi configuration and is not supported by this Oh My Pi version.'
    }
  }
  const settings = readPiSettings(piAgentDir)
  const packages = (settings.packages ?? []) as PackageEntry[]
  const idx = packages.findIndex((entry) => entrySource(entry) === source)
  if (idx === -1) {
    return { ok: false, log: `package not found in settings: ${source}` }
  }
  packages[idx] = enabled
    ? source
    : { source, extensions: [], skills: [], prompts: [], themes: [] }
  settings.packages = packages
  try {
    writePiSettings(piAgentDir, settings)
    return { ok: true, log: '' }
  } catch (err) {
    return { ok: false, log: err instanceof Error ? err.message : String(err) }
  }
}

const PI_COMMAND_TIMEOUT_MS = 5 * 60 * 1000

function runPi(args: string[]): Promise<PackageActionResult> {
  const cli = detectCli()
  if (!cli.available) {
    return Promise.resolve({ ok: false, log: 'omp/pi CLI not found' })
  }
  return new Promise((resolve) => {
    const proc = spawn(cli.path ?? cli.command, args, {
      env: {
        ...process.env,
        PATH: executableSearchDirs().join(path.delimiter),
        HOME: homedir(),
        FORCE_COLOR: '0'
      }
    })
    let log = ''
    const append = (chunk: Buffer) => {
      log += chunk.toString('utf-8')
      if (log.length > 20_000) log = log.slice(-20_000)
    }
    proc.stdout?.on('data', append)
    proc.stderr?.on('data', append)
    const timer = setTimeout(() => {
      proc.kill()
      resolve({ ok: false, log: log.trim() || 'timed out' })
    }, PI_COMMAND_TIMEOUT_MS)
    proc.on('error', (err) => {
      clearTimeout(timer)
      resolve({ ok: false, log: err.message })
    })
    proc.on('exit', (code) => {
      clearTimeout(timer)
      resolve({ ok: code === 0, log: log.trim() })
    })
  })
}

/**
 * Relative local sources in settings resolve against the settings dir, but pi
 * resolves CLI arguments against its own cwd — canonicalize to absolute paths
 * before shelling out, otherwise remove/update cannot find the package.
 */
export function canonicalSourceForCommand(source: string, piAgentDir: string): string {
  if (classifySource(source) !== 'local') return source
  return resolvePackagePath(source, 'local', piAgentDir) ?? source
}

export function installPackage(source: string): Promise<PackageActionResult> {
  return runPi(['install', source])
}

export function removePackage(source: string): Promise<PackageActionResult> {
  return runPi(['remove', canonicalSourceForCommand(source, defaultPiAgentDir())])
}

export function updatePackage(source: string): Promise<PackageActionResult> {
  return runPi(['update', canonicalSourceForCommand(source, defaultPiAgentDir())])
}
