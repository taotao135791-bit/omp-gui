import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { scanModuleDirs, builtinModules, ModuleLocation } from '../moduleScanner'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-gui-test-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function loc(sub: string, source: 'global' | 'local' = 'local'): ModuleLocation {
  return { source, base: path.join(tmpDir, sub) }
}

describe('scanModuleDirs', () => {
  it('always includes the builtin modules, honoring enabled ids', () => {
    const modules = scanModuleDirs([], new Set(['builtin:lsp']))
    const ids = modules.map((m) => m.id)
    expect(ids).toEqual(builtinModules().map((m) => m.id))
    expect(modules.find((m) => m.id === 'builtin:lsp')?.enabled).toBe(true)
    expect(modules.find((m) => m.id === 'builtin:browser')?.enabled).toBe(false)
  })

  it('discovers single-file extensions', () => {
    fs.mkdirSync(loc('ext').base, { recursive: true })
    fs.writeFileSync(path.join(loc('ext').base, 'my-tool.ts'), '// ext')
    fs.writeFileSync(path.join(loc('ext').base, 'other.js'), '// ext')
    fs.writeFileSync(path.join(loc('ext').base, 'README.md'), 'nope')

    const modules = scanModuleDirs([loc('ext')], new Set())
    const ids = modules.map((m) => m.id)
    expect(ids).toContain('local:my-tool.ts')
    expect(ids).toContain('local:other.js')
    expect(ids).not.toContain('local:README.md')
  })

  it('discovers directory modules with package.json metadata', () => {
    const dir = path.join(loc('ext').base, 'cool-ext')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'index.ts'), '// entry')
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ displayName: 'Cool Ext', description: 'Does things', version: '1.2.3' })
    )

    const modules = scanModuleDirs([loc('ext')], new Set())
    const mod = modules.find((m) => m.id === 'local:cool-ext')
    expect(mod).toBeDefined()
    expect(mod?.name).toBe('Cool Ext')
    expect(mod?.description).toBe('Does things')
    expect(mod?.version).toBe('1.2.3')
  })

  it('skips directories without an index entry file', () => {
    const dir = path.join(loc('ext').base, 'no-entry')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'helper.ts'), '// not an entry')

    const modules = scanModuleDirs([loc('ext')], new Set())
    expect(modules.find((m) => m.id === 'local:no-entry')).toBeUndefined()
  })

  it('skips missing directories without throwing', () => {
    expect(() => scanModuleDirs([loc('does-not-exist')], new Set())).not.toThrow()
  })

  it('marks discovered modules enabled when their id is in the set', () => {
    fs.mkdirSync(loc('ext').base, { recursive: true })
    fs.writeFileSync(path.join(loc('ext').base, 'on.ts'), '// ext')
    fs.writeFileSync(path.join(loc('ext').base, 'off.ts'), '// ext')

    const modules = scanModuleDirs([loc('ext')], new Set(['local:on.ts']))
    expect(modules.find((m) => m.id === 'local:on.ts')?.enabled).toBe(true)
    expect(modules.find((m) => m.id === 'local:off.ts')?.enabled).toBe(false)
  })

  it('dedupes modules seen across locations', () => {
    for (const sub of ['a', 'b']) {
      fs.mkdirSync(loc(sub).base, { recursive: true })
      fs.writeFileSync(path.join(loc(sub).base, 'dup.ts'), '// ext')
    }
    const modules = scanModuleDirs([loc('a'), loc('b')], new Set())
    expect(modules.filter((m) => m.id === 'local:dup.ts')).toHaveLength(1)
  })
})
