import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { FsGuard } from '../fsGuard'

describe('FsGuard', () => {
  it('allows files directly under a registered root', () => {
    const guard = new FsGuard()
    guard.addRoot('/project')
    expect(guard.isAllowed('/project/src/index.ts')).toBe(true)
    expect(guard.isAllowed('/project')).toBe(true)
  })

  it('denies paths outside all roots', () => {
    const guard = new FsGuard()
    guard.addRoot('/project')
    expect(guard.isAllowed('/etc/passwd')).toBe(false)
    expect(guard.isAllowed('/other/file.txt')).toBe(false)
  })

  it('denies sibling directories that share a name prefix', () => {
    const guard = new FsGuard()
    guard.addRoot('/project')
    expect(guard.isAllowed('/project-evil/x')).toBe(false)
  })

  it('denies traversal outside the root', () => {
    const guard = new FsGuard()
    guard.addRoot('/project')
    expect(guard.isAllowed(path.join('/project', '..', 'etc', 'passwd'))).toBe(false)
  })

  it('supports multiple roots and removal', () => {
    const guard = new FsGuard()
    guard.addRoot('/a')
    guard.addRoot('/b')
    expect(guard.isAllowed('/a/f')).toBe(true)
    expect(guard.isAllowed('/b/f')).toBe(true)
    guard.removeRoot('/a')
    expect(guard.isAllowed('/a/f')).toBe(false)
    expect(guard.isAllowed('/b/f')).toBe(true)
  })

  it('normalizes non-resolved roots', () => {
    const guard = new FsGuard()
    guard.addRoot('/project/./sub/../sub')
    expect(guard.isAllowed('/project/sub/f')).toBe(true)
  })
})
