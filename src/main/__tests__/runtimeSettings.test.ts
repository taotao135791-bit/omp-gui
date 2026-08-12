import { describe, it, expect } from 'vitest'
import { RuntimeSettings, PROVIDER_ID_PATTERN } from '../omp/settings/RuntimeSettings'
import { CliRunner } from '../omp/settings/OmpConfigCli'
import { RuntimeRpcClient } from '../omp/settings/RuntimeRpcClient'
import { CliInfo } from '../../shared/types'

/**
 * RuntimeSettings with fully injected runner + probe spawner — no real omp
 * process, no real config files. Verifies profile dispatch, the bootstrap
 * placeholder mask, and read-after-write semantics.
 */

const OMP_CLI: CliInfo = { command: 'omp', path: '/usr/local/bin/omp', available: true }
const PI_CLI: CliInfo = { command: 'pi', path: '/usr/local/bin/pi', available: true }

interface ProbeScript {
  providers?: { id: string; name: string; available: boolean; authenticated: boolean }[]
  probeFails?: boolean
  bootstrap?: boolean
}

function fakeProbe(script: ProbeScript) {
  const spawnProbe: typeof RuntimeRpcClient.spawnWithBootstrap = async () => {
    if (script.probeFails) return null
    const client = {
      query: async (cmd: Record<string, unknown>) => {
        if (cmd.type === 'get_login_providers') {
          return {
            type: 'response',
            command: 'get_login_providers',
            success: true,
            data: { providers: script.providers ?? [] }
          }
        }
        return null
      },
      respond: () => true,
      kill: () => {}
    }
    return { client: client as unknown as RuntimeRpcClient, bootstrap: script.bootstrap === true }
  }
  return spawnProbe
}

function fakeRunner(map: Record<string, { ok?: boolean; stdout?: string }>) {
  const calls: string[][] = []
  const run: CliRunner = async (args) => {
    calls.push(args)
    const hit = map[args.join(' ')]
    if (!hit) return { ok: false, stdout: '', stderr: 'unscripted' }
    return { ok: hit.ok !== false, stdout: hit.stdout ?? '', stderr: '' }
  }
  return { run, calls }
}

const PROVIDERS = [
  { id: 'deepseek', name: 'DeepSeek', available: true, authenticated: true },
  { id: 'openai', name: 'OpenAI', available: true, authenticated: false }
]

describe('RuntimeSettings · current profile overview', () => {
  it('reads providers from the runtime probe and config defaults via omp config', async () => {
    const { run } = fakeRunner({
      'config get enabledModels --json': {
        stdout: JSON.stringify({ key: 'enabledModels', value: ['deepseek/deepseek-v4-pro'] })
      },
      'config get defaultThinkingLevel --json': {
        stdout: JSON.stringify({ key: 'defaultThinkingLevel', value: 'high' })
      },
      'config get skills.enableAgentsUser --json': {
        stdout: JSON.stringify({ key: 'skills.enableAgentsUser', value: false })
      }
    })
    const svc = new RuntimeSettings({
      cli: OMP_CLI,
      runner: run,
      spawnProbe: fakeProbe({ providers: PROVIDERS })
    })
    const overview = await svc.getOverview()
    expect(overview.profile).toBe('current')
    expect(overview.providers).toEqual(PROVIDERS)
    expect(overview.modelState).toEqual({
      defaultModel: 'deepseek/deepseek-v4-pro',
      defaultThinkingLevel: 'high'
    })
    expect(overview.machineSkillsEnabled).toBe(false)
    expect(overview.capabilities.providers).toBe('supported')
    expect(overview.capabilities.nativeLogin).toBe('supported')
    expect(overview.capabilities.defaultModelConfig).toBe('supported')
  })

  it('masks the bootstrap placeholder provider as not authenticated', async () => {
    const { run } = fakeRunner({})
    const svc = new RuntimeSettings({
      cli: OMP_CLI,
      runner: run,
      spawnProbe: fakeProbe({ providers: PROVIDERS, bootstrap: true })
    })
    const overview = await svc.getOverview()
    expect(overview.providers.find((p) => p.id === 'deepseek')?.authenticated).toBe(false)
    expect(overview.providers.find((p) => p.id === 'openai')?.authenticated).toBe(false)
  })

  it('reports providers unsupported when the runtime will not start', async () => {
    const svc = new RuntimeSettings({
      cli: OMP_CLI,
      runner: fakeRunner({}).run,
      spawnProbe: fakeProbe({ probeFails: true })
    })
    const overview = await svc.getOverview()
    expect(overview.capabilities.providers).toBe('unsupported')
    expect(overview.capabilities.nativeLogin).toBe('unsupported')
    expect(overview.providers).toEqual([])
  })

  it('caches the overview and force-refreshes', async () => {
    const probe = fakeProbe({ providers: PROVIDERS })
    const svc = new RuntimeSettings({
      cli: OMP_CLI,
      runner: fakeRunner({}).run,
      spawnProbe: probe
    })
    const first = await svc.getOverview()
    const second = await svc.getOverview()
    expect(second).toBe(first) // same cached object
    const third = await svc.getOverview(true)
    expect(third).not.toBe(first)
  })
})

describe('RuntimeSettings · current profile writes (read-after-write)', () => {
  it('setDefaultModel writes enabledModels and verifies the read-back', async () => {
    const { run, calls } = fakeRunner({
      'config set enabledModels ["deepseek/deepseek-v4-flash"] --json': { stdout: '{}' },
      'config get enabledModels --json': {
        stdout: JSON.stringify({ key: 'enabledModels', value: ['deepseek/deepseek-v4-flash'] })
      }
    })
    const svc = new RuntimeSettings({ cli: OMP_CLI, runner: run, spawnProbe: fakeProbe({}) })
    const r = await svc.setDefaultModel('deepseek/deepseek-v4-flash')
    expect(r.ok).toBe(true)
    expect(calls.some((c) => c[1] === 'set' && c[2] === 'enabledModels')).toBe(true)
  })

  it('setDefaultModel fails when the runtime does not confirm', async () => {
    const { run } = fakeRunner({
      'config set enabledModels ["deepseek/deepseek-v4-flash"] --json': { stdout: '{}' },
      // Read-back shows a different value — the write silently did not apply.
      'config get enabledModels --json': {
        stdout: JSON.stringify({ key: 'enabledModels', value: [] })
      }
    })
    const svc = new RuntimeSettings({ cli: OMP_CLI, runner: run, spawnProbe: fakeProbe({}) })
    const r = await svc.setDefaultModel('deepseek/deepseek-v4-flash')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/did not confirm/)
  })

  it('setDefaultThinking verifies the level', async () => {
    const { run } = fakeRunner({
      'config set defaultThinkingLevel max --json': { stdout: '{}' },
      'config get defaultThinkingLevel --json': {
        stdout: JSON.stringify({ key: 'defaultThinkingLevel', value: 'max' })
      }
    })
    const svc = new RuntimeSettings({ cli: OMP_CLI, runner: run, spawnProbe: fakeProbe({}) })
    expect((await svc.setDefaultThinking('max')).ok).toBe(true)
  })

  it('logout uses auth-broker and fails when the credential persists', async () => {
    const { run, calls } = fakeRunner({
      'auth-broker logout deepseek': { stdout: 'Logged out' }
    })
    // After "logout" the probe still reports authenticated (e.g. env var).
    const svc = new RuntimeSettings({
      cli: OMP_CLI,
      runner: run,
      spawnProbe: fakeProbe({ providers: PROVIDERS })
    })
    const r = await svc.logout('deepseek')
    expect(calls.some((c) => c.join(' ').startsWith('auth-broker logout deepseek'))).toBe(true)
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/still present/)
  })

  it('logout succeeds when the runtime confirms removal', async () => {
    const { run } = fakeRunner({
      'auth-broker logout deepseek': { stdout: 'Logged out' }
    })
    const svc = new RuntimeSettings({
      cli: OMP_CLI,
      runner: run,
      spawnProbe: fakeProbe({
        providers: [{ ...PROVIDERS[0], authenticated: false }, PROVIDERS[1]]
      })
    })
    expect((await svc.logout('deepseek')).ok).toBe(true)
  })

  it('rejects invalid provider ids', async () => {
    const svc = new RuntimeSettings({ cli: OMP_CLI, runner: fakeRunner({}).run, spawnProbe: fakeProbe({}) })
    expect((await svc.logout('deep seek; rm -rf /')).ok).toBe(false)
    expect(PROVIDER_ID_PATTERN.test('deepseek')).toBe(true)
    expect(PROVIDER_ID_PATTERN.test('zai-coding-plan')).toBe(true)
    expect(PROVIDER_ID_PATTERN.test('-bad')).toBe(false)
  })
})

describe('RuntimeSettings · model catalog', () => {
  it('parses omp models --json including per-model thinking levels', async () => {
    const { run } = fakeRunner({
      'models --json': {
        stdout: JSON.stringify({
          models: [
            {
              provider: 'deepseek',
              id: 'deepseek-v4-flash',
              selector: 'deepseek/deepseek-v4-flash',
              name: 'DeepSeek V4 Flash',
              contextWindow: 1000000,
              reasoning: true,
              thinking: ['low', 'high', 'max']
            }
          ]
        })
      }
    })
    const svc = new RuntimeSettings({ cli: OMP_CLI, runner: run, spawnProbe: fakeProbe({}) })
    const models = await svc.listModels()
    expect(models).toHaveLength(1)
    expect(models[0].selector).toBe('deepseek/deepseek-v4-flash')
    expect(models[0].thinking).toEqual(['low', 'high', 'max'])
    expect(models[0].reasoning).toBe(true)
  })

  it('returns an empty catalog on CLI failure without throwing', async () => {
    const svc = new RuntimeSettings({ cli: OMP_CLI, runner: fakeRunner({}).run, spawnProbe: fakeProbe({}) })
    expect(await svc.listModels()).toEqual([])
  })
})

describe('RuntimeSettings · legacy profile', () => {
  it('reports the legacy profile with file-based capabilities', async () => {
    const svc = new RuntimeSettings({ cli: PI_CLI, runner: fakeRunner({}).run })
    const overview = await svc.getOverview()
    expect(overview.profile).toBe('legacy')
    expect(overview.capabilities.nativeLogin).toBe('unsupported')
    expect(overview.capabilities.providers).toBe('supported')
  })

  it('refuses current-profile writes on the legacy profile', async () => {
    const svc = new RuntimeSettings({ cli: PI_CLI, runner: fakeRunner({}).run })
    expect((await svc.setDefaultModel('a/b')).ok).toBe(false)
    expect((await svc.setDefaultThinking('max')).ok).toBe(false)
    expect((await svc.logout('deepseek')).ok).toBe(false)
  })
})

describe('RuntimeSettings · machine skills strict verification', () => {
  const writeOk = { 'config set skills.enableAgentsUser false --json': { stdout: '{}' } }

  it('write success + read-back missing → failure, not truthiness', async () => {
    // config get returns an entry WITHOUT a value key (unset/unknown).
    const { run } = fakeRunner({
      ...writeOk,
      'config get skills.enableAgentsUser --json': {
        stdout: JSON.stringify({ key: 'skills.enableAgentsUser' })
      }
    })
    const svc = new RuntimeSettings({ cli: OMP_CLI, runner: run, spawnProbe: fakeProbe({}) })
    expect((await svc.setMachineSkills(false)).ok).toBe(false)
  })

  it('write success + read-back wrong value → failure', async () => {
    const { run } = fakeRunner({
      ...writeOk,
      'config get skills.enableAgentsUser --json': {
        stdout: JSON.stringify({ key: 'skills.enableAgentsUser', value: true })
      }
    })
    const svc = new RuntimeSettings({ cli: OMP_CLI, runner: run, spawnProbe: fakeProbe({}) })
    expect((await svc.setMachineSkills(false)).ok).toBe(false)
  })

  it('write success + exact boolean read-back → success', async () => {
    const { run } = fakeRunner({
      'config set skills.enableAgentsUser false --json': { stdout: '{}' },
      'config get skills.enableAgentsUser --json': {
        stdout: JSON.stringify({ key: 'skills.enableAgentsUser', value: false })
      },
      'config set skills.enableAgentsUser true --json': { stdout: '{}' }
    })
    const svc = new RuntimeSettings({ cli: OMP_CLI, runner: run, spawnProbe: fakeProbe({}) })
    expect((await svc.setMachineSkills(false)).ok).toBe(true)
  })

  it('consecutive mutations are serialized (write-verify pairs never interleave)', async () => {
    const order: string[] = []
    const run = async (args: string[]) => {
      order.push(args.join(' '))
      const key = args.join(' ')
      if (key === 'config set defaultThinkingLevel high --json') return { ok: true, stdout: '{}', stderr: '' }
      if (key === 'config set defaultThinkingLevel max --json') return { ok: true, stdout: '{}', stderr: '' }
      if (key === 'config get defaultThinkingLevel --json') {
        // Read-back reflects the LAST write — without serialization the
        // first write's verify would see 'max' and fail.
        const lastSet = [...order].reverse().find((o) => o.startsWith('config set defaultThinkingLevel'))
        const value = lastSet?.endsWith(' max --json') ? 'max' : 'high'
        return { ok: true, stdout: JSON.stringify({ key: 'defaultThinkingLevel', value }), stderr: '' }
      }
      return { ok: false, stdout: '', stderr: 'unscripted' }
    }
    const svc = new RuntimeSettings({ cli: OMP_CLI, runner: run, spawnProbe: fakeProbe({}) })
    const [a, b] = await Promise.all([svc.setDefaultThinking('high'), svc.setDefaultThinking('max')])
    expect(a.ok).toBe(true)
    expect(b.ok).toBe(true)
    // Each set is immediately followed by its own get.
    const sets = order.map((o, i) => ({ o, i })).filter((x) => x.o.startsWith('config set'))
    const gets = order.map((o, i) => ({ o, i })).filter((x) => x.o.startsWith('config get'))
    expect(sets).toHaveLength(2)
    expect(gets).toHaveLength(2)
    expect(gets[0].i).toBe(sets[0].i + 1)
    expect(sets[1].i).toBe(gets[0].i + 1)
    expect(gets[1].i).toBe(sets[1].i + 1)
  })
})

describe('RuntimeSettings · selector safety', () => {
  it('accepts slash-containing selectors and writes them verbatim as argv', async () => {
    const selector = 'openrouter/deepseek/deepseek-v4-flash-0731'
    const { run, calls } = fakeRunner({
      [`config set enabledModels ["${selector}"] --json`]: { stdout: '{}' },
      'config get enabledModels --json': {
        stdout: JSON.stringify({ key: 'enabledModels', value: [selector] })
      }
    })
    const svc = new RuntimeSettings({ cli: OMP_CLI, runner: run, spawnProbe: fakeProbe({}) })
    expect((await svc.setDefaultModel(selector)).ok).toBe(true)
    const setCall = calls.find((c) => c[1] === 'set')
    expect(setCall?.[3]).toBe(JSON.stringify([selector]))
  })

  it('rejects unsafe selectors before any CLI call', async () => {
    const { run, calls } = fakeRunner({})
    const svc = new RuntimeSettings({ cli: OMP_CLI, runner: run, spawnProbe: fakeProbe({}) })
    expect((await svc.setDefaultModel('-rf')).ok).toBe(false)
    expect((await svc.setDefaultModel('a\0b')).ok).toBe(false)
    expect(calls).toHaveLength(0)
  })
})
