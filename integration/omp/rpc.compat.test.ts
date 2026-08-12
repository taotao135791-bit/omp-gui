import { describe, it, expect, beforeAll } from 'vitest'
import { spawn, ChildProcess, execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { OmpSession, OmpProcessLike } from '../../src/main/omp/OmpSession'
import { SessionEvent } from '../../src/shared/types'
import { makeExecRunner, configGet, configSet, configReset } from '../../src/main/omp/settings/OmpConfigCli'
import { RuntimeSettings } from '../../src/main/omp/settings/RuntimeSettings'

/**
 * Real-binary RPC compatibility suite — the GUI's own OmpSession driving
 * the actual installed omp (current profile) and pi (legacy profile).
 *
 * Covered against the real wire:
 * - ready frame → negotiate_protocol → v2 activation (current)
 * - no ready frame → legacy v1 detection (legacy)
 * - get_state on both profiles
 * - local-only prompt: agentInvoked:false + command_output, no agent_end
 * - agent prompt: agent_start → streamed text → terminal agent_end
 * - rpc_chunk: >1 MiB get_messages reassembled byte-exactly (current)
 *
 * Binaries: OMP_BIN / PI_BIN env overrides, else `omp` / `pi` on PATH.
 * A suite skips (does not fail) when its binary is absent or the runtime
 * cannot start (e.g. no model configured).
 */

const OMP_BIN = process.env.OMP_BIN || 'omp'
const PI_BIN = process.env.PI_BIN || 'pi'

function binaryAvailable(bin: string): boolean {
  try {
    execFileSync(bin, ['--version'], { timeout: 10_000, stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

interface LiveSession {
  session: OmpSession
  proc: ChildProcess
  events: SessionEvent[]
  stderrTail: () => string
}

/** Spawn the real binary in a temp cwd and wire it to a real OmpSession. */
function startSession(
  bin: string,
  extraArgs: string[] = [],
  cwd?: string
): LiveSession {
  const dir = cwd ?? mkdtempSync(path.join(tmpdir(), 'omp-gui-it-'))
  const proc = spawn(bin, ['--mode', 'rpc', ...extraArgs], {
    cwd: dir,
    env: process.env,
    stdio: ['pipe', 'pipe', 'pipe']
  })
  const events: SessionEvent[] = []
  let stderr = ''
  proc.stderr?.on('data', (c: Buffer) => {
    stderr = (stderr + c.toString('utf8')).slice(-4000)
  })
  const session = new OmpSession(
    { id: 'it', cwd: dir, title: 'it', createdAt: Date.now(), status: 'idle' },
    proc as unknown as OmpProcessLike,
    { label: bin, onEvent: (e) => events.push(e) }
  )
  return { session, proc, events, stderrTail: () => stderr }
}

function waitFor(cond: () => boolean, timeoutMs: number, what: string): Promise<void> {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (cond()) return resolve()
      if (Date.now() - start > timeoutMs) return reject(new Error(`timed out waiting for ${what}`))
      setTimeout(tick, 25)
    }
    tick()
  })
}

/** The process died before RPC mode engaged (usually: no model configured). */
function diedEarly(live: LiveSession): boolean {
  return live.events.some((e) => e.type === 'closed')
}

describe('current Oh My Pi (omp) — RPC v2 profile', () => {
  let available = false
  beforeAll(() => {
    available = binaryAvailable(OMP_BIN)
    if (!available) console.warn(`[test:omp] '${OMP_BIN}' not found — skipping current-profile suite`)
  })

  it('bootstraps: ready → negotiate → v2, then get_state answers', async () => {
    if (!available) return
    const live = startSession(OMP_BIN)
    try {
      await waitFor(() => live.session.handshakeOutcome !== null, 15_000, 'handshake')
      if (diedEarly(live)) {
        console.warn('[test:omp] runtime exited before handshake (no model?) — skipping')
        return
      }
      const outcome = live.session.handshakeOutcome!
      expect(outcome.profile).toBe('current')
      expect(outcome.protocolVersion).toBe(2)
      expect(outcome.runtimeProtocols).toContain(2)
      expect(outcome.maxFrameBytes).toBeGreaterThanOrEqual(1024 * 1024)

      const state = await live.session.query({ type: 'get_state' })
      expect(state?.success).toBe(true)
      expect(state?.command).toBe('get_state')
      expect(state?.data).toBeTruthy()
    } finally {
      live.session.kill()
    }
  })

  it('local-only prompt: command_output surfaces, no agent_end needed', async () => {
    if (!available) return
    const live = startSession(OMP_BIN)
    try {
      await waitFor(() => live.session.handshakeOutcome !== null, 15_000, 'handshake')
      if (diedEarly(live)) return
      live.session.sendPrompt('/model')
      await waitFor(
        () =>
          live.events.some(
            (e) => e.type === 'message' && e.role === 'system' && /model/i.test(e.content)
          ),
        15_000,
        'command_output'
      )
      // The prompt settles without any agent lifecycle.
      await waitFor(
        () => live.events.some((e) => e.type === 'status' && e.status === 'idle'),
        10_000,
        'idle settle'
      )
      expect(live.events.some((e) => e.type === 'status' && e.status === 'working')).toBe(false)
    } finally {
      live.session.kill()
    }
  })

  it('agent prompt: streams text and reaches a terminal agent_end', async () => {
    if (!available) return
    const live = startSession(OMP_BIN)
    try {
      await waitFor(() => live.session.handshakeOutcome !== null, 15_000, 'handshake')
      if (diedEarly(live)) return
      live.session.sendPrompt('Reply with exactly: PONG')
      await waitFor(
        () => live.events.some((e) => e.type === 'status' && e.status === 'working'),
        15_000,
        'agent_start'
      )
      await waitFor(
        () => live.events.some((e) => e.type === 'status' && e.status === 'idle'),
        60_000,
        'terminal agent_end'
      )
      expect(live.session.lastAssistantText).toContain('PONG')
      expect(live.session.runtimeState).toBe('idle')
    } finally {
      live.session.kill()
    }
  })

  it('permission flags: --tools allowlist + --approval-mode spawn cleanly', async () => {
    if (!available) return
    // The GUI's readonly/no-bash modes ride these flags on current omp
    // (its --exclude-tools predecessor is a hard error since 17.x).
    const live = startSession(OMP_BIN, [
      '--tools',
      'read,grep,glob,lsp,inspect_image,web_search,todo',
      '--approval-mode',
      'always-ask'
    ])
    try {
      await waitFor(() => live.session.handshakeOutcome !== null, 15_000, 'handshake')
      if (diedEarly(live)) return
      const state = await live.session.query({ type: 'get_state' })
      expect(state?.success).toBe(true)
    } finally {
      live.session.kill()
    }
  })

  it('runtime settings: providers, config roundtrip and model catalog are real', async () => {
    if (!available) return
    const run = makeExecRunner(OMP_BIN)

    // Providers: get_login_providers via a live RPC probe — at least one
    // provider is authenticated (the suite only runs when one exists).
    const live = startSession(OMP_BIN)
    try {
      await waitFor(() => live.session.handshakeOutcome !== null, 15_000, 'handshake')
      if (diedEarly(live)) return
      const res = await live.session.query({ type: 'get_login_providers' })
      expect(res?.success).toBe(true)
      const providers = (res?.data as { providers: { id: string; authenticated: boolean }[] })
        .providers
      expect(providers.length).toBeGreaterThan(10)
      expect(providers.some((p) => p.authenticated)).toBe(true)
    } finally {
      live.session.kill()
    }

    // Config: defaultThinkingLevel set → read-back confirms → reset.
    const before = await configGet(run, 'defaultThinkingLevel')
    expect(before).not.toBeNull()
    expect(await configSet(run, 'defaultThinkingLevel', 'max')).toBe(true)
    const after = await configGet(run, 'defaultThinkingLevel')
    expect(after?.value).toBe('max')
    expect(await configReset(run, 'defaultThinkingLevel')).toBe(true)
    const restored = await configGet(run, 'defaultThinkingLevel')
    expect(typeof restored?.value === 'string').toBe(true)
    if (before?.value && restored?.value !== before.value) {
      // best-effort restore of the user's original value
      await configSet(run, 'defaultThinkingLevel', before.value)
    }

    // Catalog: omp models --json parses with per-model thinking levels.
    const modelsRes = await run(['models', '--json'])
    expect(modelsRes.ok).toBe(true)
    const parsed = JSON.parse(modelsRes.stdout) as {
      models: { selector: string; thinking?: string[] }[]
    }
    expect(parsed.models.length).toBeGreaterThan(0)
    expect(parsed.models[0].selector).toContain('/')
    expect(Array.isArray(parsed.models[0].thinking)).toBe(true)

    // The full service facade over the real binary agrees.
    const svc = new RuntimeSettings({ cli: { command: 'omp', path: OMP_BIN, available: true } })
    const overview = await svc.getOverview(true)
    expect(overview.profile).toBe('current')
    expect(overview.capabilities.providers).toBe('supported')
    expect(overview.providers.some((p) => p.authenticated)).toBe(true)
  })

  it('rpc_chunk: a >1 MiB get_messages response reassembles byte-exactly', async () => {
    if (!available) return
    // Craft a session file whose single user message exceeds the physical
    // frame limit; the get_messages response must then arrive chunked.
    const dir = mkdtempSync(path.join(tmpdir(), 'omp-gui-chunk-'))
    const bigText = 'B'.repeat(1_200_000)
    const sessionFile = path.join(dir, 'big.jsonl')
    const ts = new Date().toISOString()
    const entries = [
      { type: 'session', version: '3', id: crypto.randomUUID(), timestamp: ts, cwd: dir },
      {
        type: 'message',
        id: 'm1',
        parentId: null,
        timestamp: ts,
        message: {
          role: 'user',
          content: [{ type: 'text', text: bigText }],
          attribution: 'user',
          timestamp: Date.now()
        }
      }
    ]
    writeFileSync(sessionFile, entries.map((e) => JSON.stringify(e)).join('\n') + '\n')

    const live = startSession(OMP_BIN, ['--session', sessionFile], dir)
    try {
      await waitFor(() => live.session.handshakeOutcome !== null, 15_000, 'handshake')
      if (diedEarly(live)) return
      expect(live.session.handshakeOutcome!.protocolVersion).toBe(2)

      const res = await live.session.query({ type: 'get_messages' }, 30_000)
      expect(res?.success).toBe(true)
      const messages = (res?.data as { messages: { content: { text: string }[] }[] }).messages
      expect(messages).toHaveLength(1)
      expect(messages[0].content[0].text).toBe(bigText)
    } finally {
      live.session.kill()
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('legacy Pi (pi ≤ 0.84) — RPC v1 profile', () => {
  let available = false
  beforeAll(() => {
    available = binaryAvailable(PI_BIN)
    if (!available) console.warn(`[test:omp] '${PI_BIN}' not found — skipping legacy suite`)
  })

  it('no ready frame: first real frame settles the legacy v1 profile', async () => {
    if (!available) return
    const live = startSession(PI_BIN)
    try {
      const statePromise = live.session.query({ type: 'get_state' }, 15_000)
      await waitFor(() => live.session.handshakeOutcome !== null, 15_000, 'legacy detection')
      if (diedEarly(live)) {
        console.warn('[test:omp] legacy runtime exited early — skipping')
        return
      }
      expect(live.session.handshakeOutcome!.profile).toBe('legacy')
      expect(live.session.handshakeOutcome!.protocolVersion).toBe(1)
      const state = await statePromise
      expect(state?.success).toBe(true)
    } finally {
      live.session.kill()
    }
  })

  it('negotiate_protocol on legacy fails cleanly and the session survives', async () => {
    if (!available) return
    const live = startSession(PI_BIN)
    try {
      const res = await live.session.query(
        { type: 'negotiate_protocol', protocolVersion: 2 },
        15_000
      )
      if (diedEarly(live)) return
      expect(res?.success).toBe(false)
      // Still answers afterwards.
      const state = await live.session.query({ type: 'get_state' }, 15_000)
      expect(state?.success).toBe(true)
    } finally {
      live.session.kill()
    }
  })

  it('agent prompt on legacy completes with a terminal agent_end', async () => {
    if (!available) return
    const live = startSession(PI_BIN)
    try {
      live.session.sendPrompt('Reply with exactly: PONG')
      await waitFor(
        () => live.events.some((e) => e.type === 'status' && e.status === 'idle'),
        60_000,
        'terminal agent_end'
      )
      if (diedEarly(live)) return
      expect(live.session.lastAssistantText).toContain('PONG')
    } finally {
      live.session.kill()
    }
  })
})
