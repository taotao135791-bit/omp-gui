import {
  CapabilityState,
  CliInfo,
  RuntimeCapabilities,
  RuntimeModelInfo,
  RuntimeModelState,
  RuntimeOverview,
  RuntimeProfile
} from '../../../shared/types'
import { detectCli } from '../OmpCapabilities'
import {
  authBrokerLogout,
  CliRunner,
  configGet,
  configReset,
  configSet,
  makeExecRunner,
  OmpConfigEntry
} from './OmpConfigCli'
import { BOOTSTRAP_PROVIDER_ID, RuntimeRpcClient } from './RuntimeRpcClient'

/**
 * Unified runtime-settings facade for the IPC layer: one API, two adapters.
 * The renderer never branches on `omp` vs `pi` — it reads profile +
 * capabilities from the overview and renders what the runtime supports.
 *
 * Current profile (omp): everything rides official interfaces —
 * `omp config` (typed config API), RPC get_login_providers / login,
 * `omp auth-broker logout`. Every write is read-after-write verified; a
 * write that the runtime does not confirm is a failure, never a fake "saved".
 *
 * Legacy profile (pi): the legacy file-based mechanisms keep working, just
 * reported through the same shape so the UI can label them honestly.
 */

export interface RuntimeSettingsDeps {
  cli?: CliInfo
  runner?: CliRunner
  spawnProbe?: typeof RuntimeRpcClient.spawnWithBootstrap
}

const OVERVIEW_TTL_MS = 15_000

function currentCapabilities(patch: Partial<RuntimeCapabilities> = {}): RuntimeCapabilities {
  return {
    providers: 'unknown',
    nativeLogin: 'unknown',
    logout: 'unknown',
    modelCatalog: 'unknown',
    defaultModelConfig: 'unknown',
    defaultThinkingConfig: 'unknown',
    machineSkillsConfig: 'unknown',
    ...patch
  }
}

export class RuntimeSettings {
  private overviewCache: { at: number; overview: RuntimeOverview } | null = null
  private modelsCache: { at: number; models: RuntimeModelInfo[] } | null = null
  private readonly cli: CliInfo
  private readonly run: CliRunner
  private readonly spawnProbe: typeof RuntimeRpcClient.spawnWithBootstrap

  constructor(deps: RuntimeSettingsDeps = {}) {
    this.cli = deps.cli ?? detectCli()
    this.run = deps.runner ?? makeExecRunner(this.cli.path ?? this.cli.command)
    this.spawnProbe = deps.spawnProbe ?? RuntimeRpcClient.spawnWithBootstrap
  }

  get profile(): RuntimeProfile {
    return this.cli.command === 'omp' ? 'current' : 'legacy'
  }

  /** Drop every cache (login/logout/writes/external changes/redetect). */
  invalidate(): void {
    this.overviewCache = null
    this.modelsCache = null
  }

  // ------------------------------------------------------------- overview

  async getOverview(force = false): Promise<RuntimeOverview> {
    if (!force && this.overviewCache && Date.now() - this.overviewCache.at < OVERVIEW_TTL_MS) {
      return this.overviewCache.overview
    }
    const overview =
      this.profile === 'current' ? await this.currentOverview() : this.legacyOverview()
    this.overviewCache = { at: Date.now(), overview }
    return overview
  }

  private async currentOverview(): Promise<RuntimeOverview> {
    const capabilities = currentCapabilities()
    let providers: RuntimeOverview['providers'] = []

    const spawned = await this.spawnProbe(this.cli, { args: ['--no-extensions'] })
    if (spawned) {
      const res = await spawned.client.query({ type: 'get_login_providers' }, 10_000)
      spawned.client.kill()
      if (res?.success === true && res.data && typeof res.data === 'object') {
        capabilities.providers = 'supported'
        capabilities.nativeLogin = 'supported'
        const raw = (res.data as { providers?: unknown }).providers
        if (Array.isArray(raw)) {
          providers = raw
            .map((p) => {
              const o = p as { id?: unknown; name?: unknown; available?: unknown; authenticated?: unknown }
              return {
                id: typeof o.id === 'string' ? o.id : '',
                name: typeof o.name === 'string' ? o.name : '',
                available: o.available !== false,
                authenticated: o.authenticated === true
              }
            })
            .filter((p) => p.id)
        }
        if (spawned.bootstrap) {
          // The bootstrap env key makes its provider look authenticated —
          // that is our placeholder, not real auth (read: fake-state guard).
          providers = providers.map((p) =>
            p.id === BOOTSTRAP_PROVIDER_ID ? { ...p, authenticated: false } : p
          )
        }
      } else {
        capabilities.providers = 'unsupported'
        capabilities.nativeLogin = 'unsupported'
      }
    } else {
      // Runtime won't start at all (no models and bootstrap failed).
      capabilities.providers = 'unsupported'
      capabilities.nativeLogin = 'unsupported'
    }
    capabilities.logout = 'supported' // auth-broker CLI, official

    const [enabledModels, defaultThinking, machineSkills] = await Promise.all([
      configGet(this.run, 'enabledModels'),
      configGet(this.run, 'defaultThinkingLevel'),
      configGet(this.run, 'skills.enableAgentsUser')
    ])
    const modelState: RuntimeModelState = {
      defaultModel: firstSelector(enabledModels),
      defaultThinkingLevel:
        typeof defaultThinking?.value === 'string' ? defaultThinking.value : ''
    }
    capabilities.defaultModelConfig = enabledModels ? 'supported' : 'unsupported'
    capabilities.defaultThinkingConfig = defaultThinking ? 'supported' : 'unsupported'
    capabilities.machineSkillsConfig = machineSkills ? 'supported' : 'unsupported'
    capabilities.modelCatalog = 'supported' // omp models / get_available_models

    return {
      profile: 'current',
      capabilities,
      providers,
      modelState,
      machineSkillsEnabled: machineSkills?.value !== false
    }
  }

  private legacyOverview(): RuntimeOverview {
    // Legacy profile: file-based auth/settings remain the mechanism. The UI
    // keeps using the legacy IPC for detail; the overview just reports the
    // profile and that native flows are file-based (not runtime-login).
    return {
      profile: 'legacy',
      capabilities: {
        providers: 'supported',
        nativeLogin: 'unsupported',
        logout: 'supported',
        modelCatalog: 'supported',
        defaultModelConfig: 'supported',
        defaultThinkingConfig: 'supported',
        machineSkillsConfig: 'supported'
      },
      providers: [],
      modelState: { defaultModel: '', defaultThinkingLevel: '' },
      machineSkillsEnabled: true
    }
  }

  // --------------------------------------------------------------- models

  /** Runtime model catalog (credential-filtered by the runtime itself). */
  async listModels(): Promise<RuntimeModelInfo[]> {
    if (this.modelsCache && Date.now() - this.modelsCache.at < OVERVIEW_TTL_MS) {
      return this.modelsCache.models
    }
    if (this.profile !== 'current') {
      // Legacy catalog rides the legacy registry/probe path (piModels).
      const { listAvailableModels } = await import('../../piModels')
      const models = (await listAvailableModels()).map((m) => ({
        provider: m.provider,
        id: m.id,
        selector: `${m.provider}/${m.id}`,
        name: m.name,
        reasoning: m.reasoning,
        thinking: []
      }))
      this.modelsCache = { at: Date.now(), models }
      return models
    }
    const res = await this.run(['models', '--json'])
    let models: RuntimeModelInfo[] = []
    if (res.ok) {
      try {
        const parsed = JSON.parse(res.stdout) as { models?: unknown }
        const raw = Array.isArray(parsed.models) ? parsed.models : []
        models = raw
          .map((m) => {
            const o = m as Record<string, unknown>
            const provider = typeof o.provider === 'string' ? o.provider : ''
            const id = typeof o.id === 'string' ? o.id : ''
            return {
              provider,
              id,
              selector:
                typeof o.selector === 'string' ? o.selector : provider && id ? `${provider}/${id}` : '',
              name: typeof o.name === 'string' ? o.name : id,
              contextWindow: typeof o.contextWindow === 'number' ? o.contextWindow : undefined,
              maxTokens: typeof o.maxTokens === 'number' ? o.maxTokens : undefined,
              reasoning: o.reasoning === true,
              thinking: Array.isArray(o.thinking)
                ? (o.thinking as unknown[]).filter((t): t is string => typeof t === 'string')
                : []
            }
          })
          .filter((m) => m.provider && m.id)
      } catch {
        models = []
      }
    }
    this.modelsCache = { at: Date.now(), models }
    return models
  }

  // ---------------------------------------------------------------- writes
  // Every write is read-after-write verified against the runtime, and all
  // mutations are serialized: rapid A→B changes cannot interleave their
  // write/read-back pairs, and a slow first write can never overwrite the
  // second one's confirmation.

  /** Serialize mutations through one chain so write+verify pairs never race. */
  private mutationChain: Promise<unknown> = Promise.resolve()

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.mutationChain.then(fn, fn)
    this.mutationChain = next.catch(() => {})
    return next
  }

  async setDefaultModel(selector: string): Promise<{ ok: boolean; error?: string }> {
    if (this.profile !== 'current') return { ok: false, error: 'legacy-profile' }
    if (selector && !isValidModelSelector(selector)) {
      return { ok: false, error: 'invalid model selector' }
    }
    return this.enqueue(async () => {
      const value = selector ? [selector] : []
      if (!(await configSet(this.run, 'enabledModels', value))) {
        return { ok: false, error: 'omp config set failed' }
      }
      const verify = await configGet(this.run, 'enabledModels')
      const actual = firstSelector(verify)
      this.invalidate()
      // Exact match only — a missing/unknown read-back is a failure.
      if (!verify || actual !== selector) {
        return { ok: false, error: `runtime did not confirm the change (got "${actual || 'default'}")` }
      }
      return { ok: true }
    })
  }

  async setDefaultThinking(level: string): Promise<{ ok: boolean; error?: string }> {
    if (this.profile !== 'current') return { ok: false, error: 'legacy-profile' }
    return this.enqueue(async () => {
      if (level) {
        if (!(await configSet(this.run, 'defaultThinkingLevel', level))) {
          return { ok: false, error: 'omp config set failed' }
        }
        const verify = await configGet(this.run, 'defaultThinkingLevel')
        const actual = verify?.value
        this.invalidate()
        // Exact match only.
        if (actual !== level) {
          return { ok: false, error: `runtime did not confirm the change (got "${typeof actual === 'string' ? actual : 'unset'}")` }
        }
        return { ok: true }
      }
      // '' = reset to the runtime default. Verification: the key must exist
      // afterwards with its (runtime-chosen) default value.
      if (!(await configReset(this.run, 'defaultThinkingLevel'))) {
        return { ok: false, error: 'omp config reset failed' }
      }
      const verify = await configGet(this.run, 'defaultThinkingLevel')
      this.invalidate()
      if (typeof verify?.value !== 'string') {
        return { ok: false, error: 'runtime did not confirm the reset' }
      }
      return { ok: true }
    })
  }

  async setMachineSkills(enabled: boolean): Promise<{ ok: boolean; error?: string }> {
    if (this.profile !== 'current') return { ok: false, error: 'legacy-profile' }
    return this.enqueue(async () => {
      if (!(await configSet(this.run, 'skills.enableAgentsUser', enabled))) {
        return { ok: false, error: 'omp config set failed' }
      }
      const verify = await configGet(this.run, 'skills.enableAgentsUser')
      this.invalidate()
      // Exact boolean match only — missing/null/undefined is a failure,
      // never truthiness.
      if (verify?.value !== enabled) {
        return { ok: false, error: 'runtime did not confirm the change' }
      }
      return { ok: true }
    })
  }

  async logout(providerId: string): Promise<{ ok: boolean; error?: string }> {
    if (this.profile !== 'current') return { ok: false, error: 'legacy-profile' }
    if (!PROVIDER_ID_PATTERN.test(providerId)) {
      return { ok: false, error: 'invalid provider id' }
    }
    return this.enqueue(async () => {
      if (!(await authBrokerLogout(this.run, providerId))) {
        return { ok: false, error: 'omp auth-broker logout failed' }
      }
      this.invalidate()
      // Read-after-write: the runtime must agree the credential is gone.
      const overview = await this.getOverview(true)
      const still = overview.providers.find((p) => p.id === providerId)
      if (still?.authenticated) {
        return { ok: false, error: 'credential still present (e.g. also set as an environment variable)' }
      }
      return { ok: true }
    })
  }
}

/** First selector of the enabledModels array ('' when the runtime default applies). */
function firstSelector(entry: OmpConfigEntry | null): string {
  const value = entry?.value
  if (!Array.isArray(value) || value.length === 0) return ''
  const first = value[0]
  return typeof first === 'string' ? first : ''
}

/**
 * Model selector validation. The GUI deliberately does NOT replicate the
 * runtime's naming rules — existence is the runtime's call. We only guarantee
 * argv/IPC safety: non-empty, bounded, no control characters, and not
 * flag-like (leading '-'). Slashes are fine everywhere: real selectors look
 * like `openrouter/deepseek/deepseek-v4-flash-0731`.
 */
export function isValidModelSelector(selector: string): boolean {
  if (typeof selector !== 'string') return false
  if (selector.length === 0 || selector.length > 300) return false
  if (selector.startsWith('-')) return false
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(selector)) return false
  return true
}

/**
 * Split a selector into provider + modelId: provider is the first segment,
 * modelId is everything after it (may itself contain slashes).
 */
export function splitModelSelector(selector: string): { provider: string; modelId: string } | null {
  if (!isValidModelSelector(selector)) return null
  const slash = selector.indexOf('/')
  if (slash === -1) return null
  const provider = selector.slice(0, slash)
  const modelId = selector.slice(slash + 1)
  if (!provider || !modelId) return null
  return { provider, modelId }
}

/** Provider-id shape shared with the login/logout IPC validators. */
export const PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/

/** Capabilities helper for tests. */
export function capabilitiesForTest(patch: Partial<RuntimeCapabilities>): RuntimeCapabilities {
  return currentCapabilities(patch)
}

export type { CapabilityState }
