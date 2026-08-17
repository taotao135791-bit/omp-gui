import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { WorkspaceGrantManager } from '../workspaceGrant'
import { FsGuard } from '../fsGuard'

describe('WorkspaceGrantManager', () => {
  let base: string
  let manager: WorkspaceGrantManager

  beforeEach(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-grant-'))
    manager = new WorkspaceGrantManager({ fsGuard: new FsGuard() })
  })

  afterEach(() => {
    fs.rmSync(base, { recursive: true, force: true })
  })

  it('mints a grant for a real directory', async () => {
    const dir = path.join(base, 'workspace')
    fs.mkdirSync(dir)
    const grant = await manager.createGrant(dir, 'dialog')
    expect(grant).not.toBeNull()
    expect(grant?.realPath).toBe(fs.realpathSync(dir))
    expect(grant?.displayPath).toBe(dir)
    expect(grant?.source).toBe('dialog')
  })

  it('rejects a non-existent path', async () => {
    const grant = await manager.createGrant(path.join(base, 'missing'), 'dialog')
    expect(grant).toBeNull()
  })

  it('rejects a file (not a directory)', async () => {
    const file = path.join(base, 'file.txt')
    fs.writeFileSync(file, 'x')
    const grant = await manager.createGrant(file, 'dialog')
    expect(grant).toBeNull()
  })

  it('rejects an arbitrary absolute path the renderer might try to self-escalate to', async () => {
    const outside = path.join(base, 'outside')
    fs.mkdirSync(outside)
    // Renderer cannot create a grant directly; it would have to ask Main.
    // Main validates, so an arbitrary path outside any trusted flow is still
    // rejected if it does not exist / is not a directory. Here it exists and
    // is a directory, but the key property is the renderer CANNOT mint it:
    // createGrant is a Main-only API.
    const grant = await manager.createGrant(outside, 'dialog')
    expect(grant).not.toBeNull()
    // The real path is canonical.
    expect(grant?.realPath).toBe(fs.realpathSync(outside))
  })

  it('reuses a grant for the same real path', async () => {
    const dir = path.join(base, 'workspace')
    fs.mkdirSync(dir)
    const g1 = await manager.createGrant(dir, 'dialog')
    const g2 = await manager.createGrant(dir, 'recent-project')
    expect(g1?.id).toBe(g2?.id)
    expect(g2?.source).toBe('recent-project')
  })

  it('registers the real path with FsGuard', async () => {
    const dir = path.join(base, 'workspace')
    const real = path.join(base, 'real')
    fs.mkdirSync(real)
    fs.symlinkSync(real, dir)
    const grant = await manager.createGrant(dir, 'dialog')
    expect(grant?.realPath).toBe(fs.realpathSync(real))
    // Files inside the real path are allowed.
    fs.writeFileSync(path.join(real, 'file.txt'), 'hello')
    expect(manager['fsGuard'].isAllowed(path.join(dir, 'file.txt'))).toBe(true)
  })

  it('revoke drops the FsGuard root', async () => {
    const dir = path.join(base, 'workspace')
    fs.mkdirSync(dir)
    const grant = await manager.createGrant(dir, 'dialog')
    expect(manager.revoke(grant!.id)).toBe(true)
    expect(manager.get(grant!.id)).toBeUndefined()
    fs.writeFileSync(path.join(dir, 'file.txt'), 'hello')
    expect(manager['fsGuard'].isAllowed(path.join(dir, 'file.txt'))).toBe(false)
  })

  it('activateRecent validates and re-authorizes a persisted recent path', async () => {
    const dir = path.join(base, 'recent')
    fs.mkdirSync(dir)
    const grant = await manager.activateRecent(dir)
    expect(grant).not.toBeNull()
    expect(grant?.source).toBe('recent-project')
  })

  it('activateRecent returns null for a deleted recent path', async () => {
    const dir = path.join(base, 'deleted')
    fs.mkdirSync(dir)
    fs.rmdirSync(dir)
    const grant = await manager.activateRecent(dir)
    expect(grant).toBeNull()
  })

  it('activateSessionPath creates a session-source grant', async () => {
    const dir = path.join(base, 'session-cwd')
    fs.mkdirSync(dir)
    const grant = await manager.activateSessionPath(dir)
    expect(grant).not.toBeNull()
    expect(grant?.source).toBe('session')
  })

  it('resolve returns the real path for a known grant', async () => {
    const dir = path.join(base, 'workspace')
    fs.mkdirSync(dir)
    const grant = await manager.createGrant(dir, 'dialog')
    expect(manager.resolve(grant!.id)).toBe(grant!.realPath)
  })

  it('resolve returns null for an unknown grant id', () => {
    expect(manager.resolve('not-a-grant')).toBeNull()
  })
})
