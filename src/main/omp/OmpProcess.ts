import { spawn, ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { app } from 'electron'
import { CliInfo, Language, PermissionMode } from '../../shared/types'
import { getStore } from '../store'
import { buildLanguageArgs } from '../languageArgs'
import { executableSearchDirs } from './OmpCapabilities'

// The stderr ring buffer lives in OmpTransport (pure, stream-level utility)
// so OmpSession's module graph stays electron-free and unit-testable; it is
// re-exported here because stderr capture is a process-assembly concern.
export { StderrRing } from './OmpTransport'

/**
 * Process assembly for `pi --mode rpc` sessions: CLI argument construction
 * (permission-mode flags, approval extension, session resume, language
 * steering), the spawn environment, per-session approval config files, and
 * the bounded stderr capture used for crash diagnostics.
 */

/** Path of the bundled per-tool approval extension shipped with the GUI. */
function approvalExtensionPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'omp-approval', 'index.ts')
    : path.join(app.getAppPath(), 'resources', 'omp-approval', 'index.ts')
}

export interface ApprovalConfig {
  mode: 'off' | 'writes' | 'all'
  locale?: 'zh' | 'en'
}

/** Per-session approval config file path (one per session — see below). */
export function approvalConfigPath(sessionId: string): string {
  return path.join(app.getPath('userData'), `omp-approval-config-${sessionId}.json`)
}

/**
 * Write the approval extension config for a new session. Each session gets
 * its own file so concurrently running sessions with different modes never
 * clobber each other; the extension re-reads it (mtime-cached) on every
 * tool call.
 */
export function writeApprovalConfig(sessionId: string, config: ApprovalConfig): string {
  const file = approvalConfigPath(sessionId)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(config, null, 2))
  return file
}

/** Drop a session's approval config file (already gone is fine). */
export function removeApprovalConfig(sessionId: string): void {
  try {
    unlinkSync(approvalConfigPath(sessionId))
  } catch {
    // already gone — fine
  }
}

/**
 * Map the permission mode to CLI flags plus an approval config:
 * - full:      every tool enabled, approval extension inert
 * - no-bash:   bash excluded, approval extension inert
 * - readonly:  bash/edit/write excluded, approval extension inert
 * - ask:       every tool enabled, extension asks before bash/edit/write
 */
export function resolvePermissionMode(mode: PermissionMode): {
  excludeTools: string | null
  approval: ApprovalConfig
} {
  switch (mode) {
    case 'no-bash':
      return { excludeTools: 'bash', approval: { mode: 'off' } }
    case 'readonly':
      return { excludeTools: 'bash,edit,write', approval: { mode: 'off' } }
    case 'ask':
      return { excludeTools: null, approval: { mode: 'writes', locale: getStore('language') } }
    case 'full':
    default:
      return { excludeTools: null, approval: { mode: 'off' } }
  }
}

export interface SpawnOptions {
  permissionMode: PermissionMode
  language: Language
  /** Persisted session file to resume (history panel). */
  resumeSessionPath?: string
}

export interface SpawnPlan {
  /** Resolved executable path (falls back to the bare command name). */
  command: string
  args: string[]
  env: NodeJS.ProcessEnv
  /** Side effect of planning: the config file written for this session. */
  approvalConfigFile: string
}

/**
 * Assemble everything needed to spawn a session process. Planning writes
 * the per-session approval config file as a side effect (the path goes into
 * the environment).
 */
export function planSpawn(sessionId: string, cli: CliInfo, opts: SpawnOptions): SpawnPlan {
  // pi loads installed packages (settings.json) and auto-discovered extension
  // dirs itself on startup; the GUI manages them through the Packages page.
  const args = ['--mode', 'rpc']
  // pi has no built-in tool approval; coarse-grained gating goes through
  // --exclude-tools, per-call approval through the bundled extension.
  const { excludeTools, approval } = resolvePermissionMode(opts.permissionMode)
  if (excludeTools) {
    args.push('--exclude-tools', excludeTools)
  }
  const approvalExtension = approvalExtensionPath()
  if (existsSync(approvalExtension)) {
    args.push('-e', approvalExtension)
  }
  // Resume a persisted session file when requested (history panel).
  if (opts.resumeSessionPath) {
    args.push('--session', opts.resumeSessionPath)
  }
  // Steer the reply language to the UI language (no flag for English).
  args.push(...buildLanguageArgs(opts.language))

  const approvalConfigFile = writeApprovalConfig(sessionId, approval)
  return {
    command: cli.path ?? cli.command,
    args,
    env: {
      ...process.env,
      PATH: executableSearchDirs().join(path.delimiter),
      HOME: homedir(),
      FORCE_COLOR: '0',
      OMP_APPROVAL_CONFIG: approvalConfigFile
    },
    approvalConfigFile
  }
}

/** Spawn the session process described by a SpawnPlan. */
export function spawnProcess(plan: SpawnPlan, cwd: string): ChildProcess {
  return spawn(plan.command, plan.args, { cwd, env: plan.env })
}
