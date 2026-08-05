import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { PiModel } from '../shared/types'
import { detectCli, executableSearchDirs } from './omp'
import { drainLines } from './protocol'

/**
 * Ask pi itself which models are usable: spawn a short-lived RPC session,
 * send `get_available_models`, read the response, kill the process.
 * pi only lists models whose provider has credentials (auth.json or env),
 * which is exactly the set the GUI should offer.
 *
 * Results are cached briefly — spawning pi costs ~0.5s and the set only
 * changes when keys or pi's registry change.
 */

const CACHE_TTL_MS = 30_000
const QUERY_TIMEOUT_MS = 15_000

let cache: { at: number; models: PiModel[] } | null = null
let inFlight: Promise<PiModel[]> | null = null

/** Drop the cache (e.g. after an API key was added or removed). */
export function invalidateModelCache(): void {
  cache = null
}

export async function listAvailableModels(): Promise<PiModel[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.models
  if (inFlight) return inFlight
  inFlight = queryModels()
    .then((models) => {
      cache = { at: Date.now(), models }
      return models
    })
    .finally(() => {
      inFlight = null
    })
  return inFlight
}

function queryModels(): Promise<PiModel[]> {
  const cli = detectCli()
  if (!cli.available) return Promise.resolve([])

  return new Promise((resolve) => {
    const proc = spawn(cli.path ?? cli.command, ['--mode', 'rpc', '--no-extensions'], {
      env: {
        ...process.env,
        PATH: executableSearchDirs().join(':'),
        HOME: homedir(),
        FORCE_COLOR: '0'
      }
    })

    let buffer = ''
    let done = false
    const finish = (models: PiModel[]) => {
      if (done) return
      done = true
      clearTimeout(timer)
      proc.kill()
      resolve(models)
    }
    const timer = setTimeout(() => finish([]), QUERY_TIMEOUT_MS)

    proc.on('error', () => finish([]))
    proc.stdout?.on('data', (chunk: Buffer) => {
      const { lines, rest } = drainLines(buffer, chunk.toString('utf-8'))
      buffer = rest
      for (const line of lines) {
        try {
          const payload = JSON.parse(line)
          if (payload.type !== 'response' || payload.command !== 'get_available_models') continue
          const raw = payload.data?.models ?? payload.data
          if (!payload.success || !Array.isArray(raw)) {
            finish([])
            return
          }
          finish(
            raw
              .filter((m) => m && typeof m.id === 'string' && typeof m.provider === 'string')
              .map((m) => ({
                id: m.id,
                name: typeof m.name === 'string' ? m.name : m.id,
                provider: m.provider,
                reasoning: Boolean(m.reasoning)
              }))
          )
          return
        } catch {
          // partial JSON line — keep buffering
        }
      }
    })
    proc.on('exit', () => finish([]))

    proc.stdin?.write(JSON.stringify({ id: 'models', type: 'get_available_models' }) + '\n')
  })
}
