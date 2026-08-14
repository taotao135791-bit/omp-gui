import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

// packages.ts pulls in ./omp (CLI detection) — the tests never spawn anything,
// so stub it out to keep the module graph electron-free.
vi.mock('../omp', () => ({
  detectCli: () => ({ command: 'pi', path: '/usr/local/bin/pi', available: true }),
  executableSearchDirs: () => []
}))

import {
  classifySource,
  isPinned,
  packageEnabled,
  resolvePackagePath,
  canonicalSourceForCommand,
  parsePackages,
  listPackages,
  setPackageEnabled,
  resourceEntries
} from '../packages'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'omp-gui-pkg-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function writeSettings(settings: unknown) {
  writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(settings, null, 2))
}

describe('classifySource', () => {
  it('classifies npm sources', () => {
    expect(classifySource('npm:pi-web-access')).toBe('npm')
    expect(classifySource('npm:@scope/pkg@1.0.0')).toBe('npm')
    expect(classifySource('pi-web-access')).toBe('npm')
    expect(classifySource('@scope/pkg')).toBe('npm')
  })

  it('classifies git sources', () => {
    expect(classifySource('git:github.com/user/repo@v1')).toBe('git')
    expect(classifySource('https://github.com/user/repo')).toBe('git')
    expect(classifySource('ssh://git@github.com/user/repo')).toBe('git')
    expect(classifySource('git@github.com:user/repo')).toBe('git')
  })

  it('classifies local sources', () => {
    expect(classifySource('/abs/path/pkg')).toBe('local')
    expect(classifySource('./rel/pkg')).toBe('local')
    expect(classifySource('../../../../tmp/pi-demo-ext')).toBe('local')
    expect(classifySource('~/packages/foo')).toBe('local')
  })
})

describe('isPinned', () => {
  it('detects pinned npm versions', () => {
    expect(isPinned('npm:pkg@1.2.3', 'npm')).toBe(true)
    expect(isPinned('@scope/pkg@1.0.0', 'npm')).toBe(true)
    expect(isPinned('npm:pkg', 'npm')).toBe(false)
    expect(isPinned('@scope/pkg', 'npm')).toBe(false)
  })

  it('detects git refs', () => {
    expect(isPinned('git:github.com/user/repo@v1', 'git')).toBe(true)
    expect(isPinned('https://github.com/user/repo', 'git')).toBe(false)
  })

  it('never pins local paths', () => {
    expect(isPinned('/abs/path', 'local')).toBe(false)
  })
})

describe('packageEnabled', () => {
  it('treats string entries as enabled', () => {
    expect(packageEnabled('npm:pkg')).toBe(true)
  })

  it('treats all-empty object form as disabled', () => {
    expect(
      packageEnabled({ source: 'npm:pkg', extensions: [], skills: [], prompts: [], themes: [] })
    ).toBe(false)
  })

  it('treats partial filters as enabled', () => {
    expect(packageEnabled({ source: 'npm:pkg', skills: ['a'] })).toBe(true)
    expect(packageEnabled({ source: 'npm:pkg', extensions: [] })).toBe(true)
  })
})

describe('resolvePackagePath', () => {
  it('resolves npm packages under agent npm dir', () => {
    expect(resolvePackagePath('npm:pi-web-access', 'npm', dir)).toBe(
      path.join(dir, 'npm', 'node_modules', 'pi-web-access')
    )
    expect(resolvePackagePath('npm:@scope/pkg@1.0.0', 'npm', dir)).toBe(
      path.join(dir, 'npm', 'node_modules', '@scope', 'pkg')
    )
  })

  it('resolves git packages under agent git dir', () => {
    expect(resolvePackagePath('git:github.com/user/repo@v1', 'git', dir)).toBe(
      path.join(dir, 'git', 'github.com', 'user', 'repo')
    )
    expect(resolvePackagePath('https://github.com/user/repo.git', 'git', dir)).toBe(
      path.join(dir, 'git', 'github.com', 'user', 'repo')
    )
    expect(resolvePackagePath('git@github.com:user/repo', 'git', dir)).toBe(
      path.join(dir, 'git', 'github.com', 'user', 'repo')
    )
  })

  it('resolves local paths relative to the settings dir', () => {
    expect(resolvePackagePath('./my-ext', 'local', dir)).toBe(path.join(dir, 'my-ext'))
  })
})

describe('parsePackages', () => {
  it('reads metadata and resources from a local package dir', () => {
    const pkgDir = path.join(dir, 'demo')
    mkdirSync(path.join(pkgDir, 'extensions'), { recursive: true })
    mkdirSync(path.join(pkgDir, 'skills', 'hello'), { recursive: true })
    mkdirSync(path.join(pkgDir, 'prompts'), { recursive: true })
    writeFileSync(
      path.join(pkgDir, 'package.json'),
      JSON.stringify({
        name: 'demo',
        displayName: 'Demo Pack',
        description: 'demo package',
        version: '1.2.3'
      })
    )
    writeFileSync(path.join(pkgDir, 'extensions', 'demo.ts'), 'export default () => {}')
    writeFileSync(path.join(pkgDir, 'skills', 'hello', 'SKILL.md'), '---\nname: hello\n---\n')
    writeFileSync(path.join(pkgDir, 'prompts', 'review.md'), '# review')

    const packages = parsePackages({ packages: ['./demo'] }, dir)
    expect(packages).toHaveLength(1)
    const pkg = packages[0]
    expect(pkg.name).toBe('Demo Pack')
    expect(pkg.version).toBe('1.2.3')
    expect(pkg.enabled).toBe(true)
    expect(pkg.kind).toBe('local')
    expect(pkg.resources).toEqual(
      expect.arrayContaining([
        { type: 'extension', name: 'demo' },
        { type: 'skill', name: 'hello' },
        { type: 'prompt', name: 'review' }
      ])
    )
  })

  it('dedupes manifest dirs that overlap with conventions', () => {
    const pkgDir = path.join(dir, 'demo2')
    mkdirSync(path.join(pkgDir, 'extensions'), { recursive: true })
    mkdirSync(path.join(pkgDir, 'skills', 'hello'), { recursive: true })
    writeFileSync(
      path.join(pkgDir, 'package.json'),
      JSON.stringify({
        name: 'demo2',
        pi: { extensions: ['./extensions'], skills: ['./skills/'] }
      })
    )
    writeFileSync(path.join(pkgDir, 'extensions', 'demo.ts'), 'export default () => {}')
    writeFileSync(path.join(pkgDir, 'skills', 'hello', 'SKILL.md'), '---\nname: hello\n---\n')

    const packages = parsePackages({ packages: ['./demo2'] }, dir)
    expect(packages[0].resources).toEqual([
      { type: 'extension', name: 'demo' },
      { type: 'skill', name: 'hello' }
    ])
  })

  it('lists manifest entries that point at files', () => {
    const pkgDir = path.join(dir, 'filepkg')
    mkdirSync(pkgDir, { recursive: true })
    writeFileSync(
      path.join(pkgDir, 'package.json'),
      JSON.stringify({ name: 'filepkg', pi: { extensions: ['./index.ts'] } })
    )
    writeFileSync(path.join(pkgDir, 'index.ts'), 'export default () => {}')

    const packages = parsePackages({ packages: ['./filepkg'] }, dir)
    expect(packages[0].resources).toEqual([{ type: 'extension', name: 'filepkg' }])
  })

  it('marks all-empty object entries as disabled', () => {
    const packages = parsePackages(
      {
        packages: [
          { source: 'npm:pkg', extensions: [], skills: [], prompts: [], themes: [] }
        ]
      },
      dir
    )
    expect(packages[0].enabled).toBe(false)
  })

  it('treats a lone local file as a single extension', () => {
    writeFileSync(path.join(dir, 'single.ts'), 'export default () => {}')
    const packages = parsePackages({ packages: ['./single.ts'] }, dir)
    expect(packages[0].resources).toEqual([{ type: 'extension', name: 'single' }])
  })

  it('skips duplicate entries', () => {
    const packages = parsePackages({ packages: ['npm:a', 'npm:a'] }, dir)
    expect(packages).toHaveLength(1)
  })
})

describe('canonicalSourceForCommand', () => {
  it('resolves relative local sources against the settings dir', () => {
    expect(canonicalSourceForCommand('../../../../tmp/pi-demo-ext', '/Users/x/.pi/agent')).toBe(
      '/tmp/pi-demo-ext'
    )
    expect(canonicalSourceForCommand('./my-ext', dir)).toBe(path.join(dir, 'my-ext'))
  })

  it('leaves npm and git sources untouched', () => {
    expect(canonicalSourceForCommand('npm:pkg', dir)).toBe('npm:pkg')
    expect(canonicalSourceForCommand('git:github.com/u/r@v1', dir)).toBe('git:github.com/u/r@v1')
  })
})

describe('setPackageEnabled', () => {
  it('rewrites a string entry to the disabled object form and back', () => {
    writeSettings({ theme: 'dark', packages: ['npm:pkg'] })

    expect(setPackageEnabled('npm:pkg', false, dir).ok).toBe(true)
    let packages = listPackages(dir)
    expect(packages[0].enabled).toBe(false)

    expect(setPackageEnabled('npm:pkg', true, dir).ok).toBe(true)
    packages = listPackages(dir)
    expect(packages[0].enabled).toBe(true)
    // unrelated settings survive the rewrite
    expect(listPackages(dir)).toHaveLength(1)
  })

  it('preserves unrelated settings keys', () => {
    writeSettings({ theme: 'dark', packages: ['npm:pkg'] })
    setPackageEnabled('npm:pkg', false, dir)
    const raw = JSON.parse(readFileSync(path.join(dir, 'settings.json'), 'utf-8'))
    expect(raw.theme).toBe('dark')
  })

  it('fails for unknown sources', () => {
    writeSettings({ packages: [] })
    expect(setPackageEnabled('npm:nope', false, dir).ok).toBe(false)
  })
})

describe('resourceEntries (manifest path traversal)', () => {
  it('keeps valid nested resource paths inside the package dir', () => {
    const entries = resourceEntries(
      '/pkg',
      { pi: { extensions: ['src/ext', 'dist/index.js'] } },
      'extensions',
      'extensions'
    )
    expect(entries).toContain('/pkg/src/ext')
    expect(entries).toContain('/pkg/dist/index.js')
  })

  it('rejects manifest resource paths that escape the package dir', () => {
    const entries = resourceEntries(
      '/pkg',
      { pi: { extensions: ['../../secret', '../..', '/etc'] } },
      'extensions',
      'extensions'
    )
    // Every escaping path is dropped; only the convention remains.
    expect(entries.some((e) => e.includes('secret') || e.startsWith('/etc'))).toBe(false)
    expect(entries).toContain('/pkg/extensions')
  })
})
