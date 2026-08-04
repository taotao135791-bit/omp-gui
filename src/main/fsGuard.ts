import path from 'node:path'

/**
 * Path allowlist for fs:* IPC handlers. Pure logic, unit-testable.
 * The renderer can only list/read files under registered roots
 * (selected project folders and session working directories).
 */
export class FsGuard {
  private roots = new Set<string>()

  addRoot(root: string): void {
    const resolved = path.resolve(root)
    this.roots.add(resolved)
  }

  removeRoot(root: string): void {
    this.roots.delete(path.resolve(root))
  }

  isAllowed(target: string): boolean {
    const resolved = path.resolve(target)
    for (const root of this.roots) {
      if (resolved === root || resolved.startsWith(root + path.sep)) {
        return true
      }
    }
    return false
  }

  getRoots(): string[] {
    return Array.from(this.roots)
  }
}
