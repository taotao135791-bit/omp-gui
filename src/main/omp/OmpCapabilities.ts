import { execFile } from 'node:child_process'
import { accessSync, constants, existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { CliCapabilities, CliInfo, SessionState } from '../../shared/types'

/**
 * CLI detection and capability probing.
 *
 * Detection finds the `omp`/`pi` executable (GUI apps get a minimal PATH, so
 * well-known package-manager bin dirs are searched too). Capabilities come
 * from two probes:
 * - `pi --version` (or omp) at detect time → cliVersion;
 * - a live session's get_state response at runtime → confirms the RPC
 *   command surface even when the version probe fails (shim wrappers…).
 *
 * The feature matrix itself is static, verified against the installed pi
 * 0.80.3 (docs/protocol-facts.md): steer/follow_up/images/compact/
 * extension_ui/fork/set_thinking_level all exist in this version.
 */

// Only successful detections are cached; a negative result is re-checked
// every time so the app picks up a CLI installed after launch.
let cliInfoCache: CliInfo | null = null
let capabilitiesCache: CliCapabilities | null = null

export function detectCli(): CliInfo {
  if (cliInfoCache) return cliInfoCache

  for (const cmd of ['omp', 'pi']) {
    const candidate = findExecutable(cmd)
    if (candidate) {
      cliInfoCache = { command: cmd, path: candidate, available: true }
      return cliInfoCache
    }
  }

  return { command: 'omp', available: false }
}

/** Clear the cached CLI info and capabilities (e.g. after a successful install). */
export function invalidateCliCache(): void {
  cliInfoCache = null
  capabilitiesCache = null
}

/**
 * GUI apps on macOS/Linux are launched with a minimal PATH that usually
 * excludes package-manager bin dirs, so check well-known locations too.
 */
export function executableSearchDirs(): string[] {
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean)
  const home = homedir()
  dirs.push(
    '/opt/homebrew/bin',
    '/usr/local/bin',
    path.join(home, '.local', 'bin'),
    path.join(home, '.npm-global', 'bin'),
    path.join(home, 'bin')
  )
  return Array.from(new Set(dirs))
}

function findExecutable(cmd: string): string | null {
  for (const dir of executableSearchDirs()) {
    const full = path.join(dir, cmd)
    try {
      if (!existsSync(full) || !statSync(full).isFile()) continue
      accessSync(full, constants.X_OK)
      return full
    } catch {
      continue
    }
  }
  return null
}

const VERSION_PROBE_TIMEOUT_MS = 5_000

/** Run `<cli> --version` and parse the first semver-ish token from its output. */
export function probeCliVersion(cli: CliInfo): Promise<string | null> {
  if (!cli.available) return Promise.resolve(null)
  return new Promise((resolve) => {
    execFile(
      cli.path ?? cli.command,
      ['--version'],
      { timeout: VERSION_PROBE_TIMEOUT_MS, maxBuffer: 64 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          resolve(null)
          return
        }
        const match = `${stdout}\n${stderr}`.match(/\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?/)
        resolve(match ? match[0] : null)
      }
    )
  })
}

function featureMatrix(enabled: boolean): Omit<CliCapabilities, 'cliVersion' | 'protocol'> {
  return {
    steering: enabled,
    followUp: enabled,
    images: enabled,
    compaction: enabled,
    extensionUi: enabled,
    fork: enabled,
    thinking: enabled
  }
}

/**
 * Capabilities of the detected CLI, cached for the process lifetime.
 * Feature flags are only advertised once the CLI proved responsive — via
 * the --version probe here, or via a runtime get_state (noteSessionState).
 */
export async function getCapabilities(): Promise<CliCapabilities> {
  if (capabilitiesCache) return capabilitiesCache
  const cli = detectCli()
  const cliVersion = await probeCliVersion(cli)
  capabilitiesCache = {
    cliVersion,
    protocol: 1,
    ...featureMatrix(cliVersion !== null)
  }
  return capabilitiesCache
}

/**
 * Runtime probe: a successful get_state response proves this build answers
 * the 0.80.x RPC command surface (get_state rides with the rest of the
 * command set), so flip every feature flag on even when --version probing
 * failed. Called with the parsed get_state payload.
 */
export function noteSessionState(_state: SessionState): void {
  if (!capabilitiesCache) return
  capabilitiesCache = { ...capabilitiesCache, ...featureMatrix(true) }
}
