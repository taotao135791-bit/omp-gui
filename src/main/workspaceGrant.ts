import fs from 'node:fs'
import path from 'node:path'
import { WorkspaceGrant } from '../shared/types'
import { FsGuard } from './fsGuard'

/**
 * Main-owned workspace authority.
 *
 * The renderer can never create a filesystem grant by itself. It can only:
 *   - ask the user to pick a folder via the native dialog
 *   - ask Main to activate a persisted recent workspace
 *   - ask Main to activate an existing workspace it already holds a grant for
 *
 * Main validates the path (exists, is a directory, realpath) and mints a
 * WorkspaceGrant. The canonical realPath is registered with FsGuard; workspace-
 * sensitive IPC handlers require a grant id and resolve it to realPath internally.
 */

export type GrantSource = WorkspaceGrant['source']

export interface GrantManagerOptions {
  fsGuard: FsGuard
}

export class WorkspaceGrantManager {
  private grants = new Map<string, WorkspaceGrant>()
  private fsGuard: FsGuard

  constructor(opts: GrantManagerOptions) {
    this.fsGuard = opts.fsGuard
  }

  /** Create a grant from a trusted source. Returns null if the path is invalid. */
  async createGrant(displayPath: string, source: GrantSource): Promise<WorkspaceGrant | null> {
    const normalized = path.resolve(displayPath)
    let realPath: string
    try {
      const st = await fs.promises.stat(normalized)
      if (!st.isDirectory()) return null
      realPath = fs.realpathSync(normalized)
    } catch {
      return null
    }

    // If an equivalent realPath grant already exists, reuse it (new displayPath).
    const existing = this.findByRealPath(realPath)
    if (existing) {
      const refreshed: WorkspaceGrant = {
        ...existing,
        displayPath,
        source
      }
      this.grants.set(existing.id, refreshed)
      return refreshed
    }

    const grant: WorkspaceGrant = {
      id: `grant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      realPath,
      displayPath,
      source,
      createdAt: Date.now()
    }
    this.grants.set(grant.id, grant)
    this.fsGuard.addRoot(realPath)
    return grant
  }

  /** Validate a persisted recent path and mint a fresh grant for it. */
  async activateRecent(displayPath: string): Promise<WorkspaceGrant | null> {
    return this.createGrant(displayPath, 'recent-project')
  }

  /** Re-create a grant from an existing session's durable cwd (used on resume). */
  async activateSessionPath(cwd: string): Promise<WorkspaceGrant | null> {
    return this.createGrant(cwd, 'session')
  }

  /** Look up a grant by id. */
  get(id: string): WorkspaceGrant | undefined {
    return this.grants.get(id)
  }

  /** Resolve a grant id to its canonical realPath, or null if unknown. */
  resolve(id: string): string | null {
    return this.grants.get(id)?.realPath ?? null
  }

  /** All active grants. */
  list(): WorkspaceGrant[] {
    return Array.from(this.grants.values())
  }

  /** Remove a grant and its FsGuard root. */
  revoke(id: string): boolean {
    const grant = this.grants.get(id)
    if (!grant) return false
    this.grants.delete(id)
    this.fsGuard.removeRoot(grant.realPath)
    return true
  }

  private findByRealPath(realPath: string): WorkspaceGrant | undefined {
    for (const g of this.grants.values()) {
      if (g.realPath === realPath) return g
    }
    return undefined
  }
}
