import { describe, it, expect } from 'vitest'
import { CliRunner, configGet, configList, configSet, configReset, authBrokerLogout } from '../omp/settings/OmpConfigCli'

/** Fake omp CLI: records argv, answers from a script map. */
function fakeRunner(script: Record<string, { ok?: boolean; stdout?: string; stderr?: string }>) {
  const calls: string[][] = []
  const run: CliRunner = async (args) => {
    calls.push(args)
    const key = args.join(' ')
    const hit = script[key]
    if (!hit) return { ok: false, stdout: '', stderr: `unscripted: ${key}` }
    return { ok: hit.ok !== false, stdout: hit.stdout ?? '', stderr: hit.stderr ?? '' }
  }
  return { run, calls }
}

describe('OmpConfigCli', () => {
  it('configList parses the key → entry map', async () => {
    const { run } = fakeRunner({
      'config list --json': {
        stdout: JSON.stringify({
          defaultThinkingLevel: { value: 'high', type: 'enum', description: 'depth' },
          enabledModels: { type: 'array' }
        })
      }
    })
    const list = await configList(run)
    expect(list?.get('defaultThinkingLevel')).toEqual({
      key: 'defaultThinkingLevel',
      value: 'high',
      type: 'enum',
      description: 'depth'
    })
    expect(list?.get('enabledModels')?.value).toBeUndefined()
  })

  it('configList returns null on failure and on garbage output', async () => {
    expect(await configList(fakeRunner({ 'config list --json': { ok: false } }).run)).toBeNull()
    expect(
      await configList(fakeRunner({ 'config list --json': { stdout: 'not json' } }).run)
    ).toBeNull()
  })

  it('configGet parses a single entry', async () => {
    const { run } = fakeRunner({
      'config get defaultThinkingLevel --json': {
        stdout: JSON.stringify({ key: 'defaultThinkingLevel', value: 'max', type: 'enum' })
      }
    })
    const entry = await configGet(run, 'defaultThinkingLevel')
    expect(entry?.value).toBe('max')
  })

  it('configSet serializes arrays/objects as JSON, strings verbatim', async () => {
    const { run, calls } = fakeRunner({
      'config set enabledModels ["deepseek/deepseek-v4-flash"] --json': { stdout: '{}' },
      'config set defaultThinkingLevel max --json': { stdout: '{}' },
      'config set skills.enableAgentsUser false --json': { stdout: '{}' }
    })
    expect(await configSet(run, 'enabledModels', ['deepseek/deepseek-v4-flash'])).toBe(true)
    expect(await configSet(run, 'defaultThinkingLevel', 'max')).toBe(true)
    expect(await configSet(run, 'skills.enableAgentsUser', false)).toBe(true)
    expect(calls.map((c) => c[3])).toEqual([
      '["deepseek/deepseek-v4-flash"]',
      'max',
      'false'
    ])
  })

  it('configSet uses argv, never a shell string', async () => {
    const { run, calls } = fakeRunner({
      'config set x y --json': { stdout: '{}' }
    })
    await configSet(run, 'x', 'y')
    expect(calls[0]).toEqual(['config', 'set', 'x', 'y', '--json'])
  })

  it('configReset and authBrokerLogout return the process result', async () => {
    const { run } = fakeRunner({
      'config reset defaultThinkingLevel --json': { stdout: '{}' },
      'auth-broker logout deepseek': { stdout: 'Logged out' }
    })
    expect(await configReset(run, 'defaultThinkingLevel')).toBe(true)
    expect(await authBrokerLogout(run, 'deepseek')).toBe(true)
    expect(await authBrokerLogout(run, 'nope')).toBe(false)
  })
})
