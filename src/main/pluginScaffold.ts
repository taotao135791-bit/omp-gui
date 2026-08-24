/**
 * Filesystem half of the plugin scaffold. All content and validation lives in
 * src/shared/pluginScaffold.ts; this module only resolves paths and writes.
 */
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { PluginScaffoldResult, PluginScaffoldSpec } from '../shared/types'
import { planPluginFiles, validatePluginSpec } from '../shared/pluginScaffold'

/**
 * Create <spec.parentDir>/<spec.name>/ with the planned files.
 * Refuses to write into an existing non-empty directory.
 */
export function scaffoldPlugin(spec: PluginScaffoldSpec): PluginScaffoldResult {
  const invalid = validatePluginSpec(spec)
  if (invalid) return { ok: false, error: invalid }

  const parentDir = path.resolve(spec.parentDir)
  try {
    if (!statSync(parentDir).isDirectory()) return { ok: false, error: 'dir-missing' }
  } catch {
    return { ok: false, error: 'dir-missing' }
  }

  // spec.name passed the npm-name pattern, so its segments are safe path parts.
  const dir = path.join(parentDir, ...spec.name.split('/'))
  try {
    if (existsSync(dir) && readdirSync(dir).length > 0) {
      return { ok: false, error: 'dir-not-empty' }
    }
  } catch {
    return { ok: false, error: 'dir-missing' }
  }

  const planned = planPluginFiles(spec)
  try {
    for (const file of planned) {
      const target = path.join(dir, ...file.relativePath.split('/'))
      mkdirSync(path.dirname(target), { recursive: true })
      writeFileSync(target, file.content, 'utf-8')
    }
  } catch (err) {
    return {
      ok: false,
      error: 'write-failed',
      detail: err instanceof Error ? err.message : String(err)
    }
  }
  return { ok: true, dir, files: planned.map((f) => f.relativePath) }
}
