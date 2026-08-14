import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { writeFileAtomic } from './atomicWrite'

let root: string

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'omp-gui-atomic-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('writeFileAtomic', () => {
  it('creates the file and its parent directories', async () => {
    const target = path.join(root, 'a', 'b', 'meta.json')
    await writeFileAtomic(target, '{"x":1}', { mode: 0o600, dirMode: 0o700 })
    expect(readFileSync(target, 'utf-8')).toBe('{"x":1}')
  })

  it('replaces an existing file atomically', async () => {
    const target = path.join(root, 'meta.json')
    writeFileSync(target, 'old')
    await writeFileAtomic(target, 'new', { mode: 0o600 })
    expect(readFileSync(target, 'utf-8')).toBe('new')
  })

  it('never leaves a .tmp sibling behind', async () => {
    const target = path.join(root, 'meta.json')
    await writeFileAtomic(target, 'data', { mode: 0o600 })
    const { readdirSync } = await import('node:fs')
    const names = readdirSync(root)
    expect(names).toEqual(['meta.json'])
  })
})
