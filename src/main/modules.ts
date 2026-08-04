import { ModuleInfo } from '../shared/types'
import { getStore } from './store'
import {
  globalExtensionDirs,
  localExtensionDirs,
  scanModuleDirs,
  ModuleLocation
} from './moduleScanner'

export function scanModules(cwd?: string): ModuleInfo[] {
  const enabled = new Set(getStore('enabledModules'))
  const locations: ModuleLocation[] = [...globalExtensionDirs()]
  if (cwd) {
    locations.push(...localExtensionDirs(cwd))
  }
  return scanModuleDirs(locations, enabled)
}
