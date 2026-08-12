import { execFile } from 'node:child_process'

/**
 * Thin wrapper over `omp config list|get|set|reset --json` — the official
 * configuration interface of current Oh My Pi (verified against 17.2.12;
 * see docs/settings-auth.md). Never touches config.yml / *.db directly:
 * storage is the runtime's business, the CLI is the contract.
 *
 * Pure Node + injected runner for unit tests.
 */

export interface OmpConfigEntry {
  key: string
  value?: unknown
  type?: string
  description?: string
}

export type CliRunner = (
  args: string[]
) => Promise<{ ok: boolean; stdout: string; stderr: string }>

const DEFAULT_TIMEOUT_MS = 10_000

/** Default runner: execFile with argv (never a shell string). */
export function makeExecRunner(executable: string, timeoutMs = DEFAULT_TIMEOUT_MS): CliRunner {
  return (args) =>
    new Promise((resolve) => {
      execFile(
        executable,
        args,
        { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 },
        (err, stdout, stderr) => {
          resolve({
            ok: !err,
            stdout: typeof stdout === 'string' ? stdout : '',
            stderr: typeof stderr === 'string' ? stderr : ''
          })
        }
      )
    })
}

function parseJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/** `omp config list --json` → key → entry. Null on failure. */
export async function configList(run: CliRunner): Promise<Map<string, OmpConfigEntry> | null> {
  const res = await run(['config', 'list', '--json'])
  if (!res.ok) return null
  const parsed = parseJson(res.stdout)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const out = new Map<string, OmpConfigEntry>()
  for (const [key, entry] of Object.entries(parsed as Record<string, unknown>)) {
    const e = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {}
    out.set(key, {
      key,
      value: 'value' in e ? e.value : undefined,
      type: typeof e.type === 'string' ? e.type : undefined,
      description: typeof e.description === 'string' ? e.description : undefined
    })
  }
  return out
}

/** `omp config get <key> --json` → entry. Null on failure/unknown key. */
export async function configGet(run: CliRunner, key: string): Promise<OmpConfigEntry | null> {
  const res = await run(['config', 'get', key, '--json'])
  if (!res.ok) return null
  const parsed = parseJson(res.stdout)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const e = parsed as Record<string, unknown>
  return {
    key: typeof e.key === 'string' ? e.key : key,
    value: 'value' in e ? e.value : undefined,
    type: typeof e.type === 'string' ? e.type : undefined,
    description: typeof e.description === 'string' ? e.description : undefined
  }
}

/**
 * `omp config set <key> <value> --json`. Values are serialized exactly as
 * the CLI expects: scalars verbatim, objects/arrays as JSON.
 */
export async function configSet(run: CliRunner, key: string, value: unknown): Promise<boolean> {
  const serialized =
    typeof value === 'string' ? value : JSON.stringify(value ?? null)
  const res = await run(['config', 'set', key, serialized, '--json'])
  return res.ok
}

/** `omp config reset <key>` — back to the runtime default. */
export async function configReset(run: CliRunner, key: string): Promise<boolean> {
  const res = await run(['config', 'reset', key, '--json'])
  return res.ok
}

/** `omp auth-broker logout <provider>` — official credential removal. */
export async function authBrokerLogout(run: CliRunner, providerId: string): Promise<boolean> {
  const res = await run(['auth-broker', 'logout', providerId])
  return res.ok
}
