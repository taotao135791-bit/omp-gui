import { app } from 'electron'
import Store from 'electron-store'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { AppSettings, DEFAULT_SETTINGS, ToolAccess } from '../shared/types'

// electron-store persists defaults on construction, so capture the raw file
// first to tell a user's own choice apart from a fresh default.
const settingsFile = path.join(app.getPath('userData'), 'omp-gui-settings.json')
let persisted: Record<string, unknown> = {}
try {
  persisted = JSON.parse(readFileSync(settingsFile, 'utf-8'))
} catch {
  persisted = {}
}

const store = new Store<AppSettings>({
  name: 'omp-gui-settings',
  defaults: DEFAULT_SETTINGS
})

// First run: pick the UI language from the OS locale
if (!store.has('language')) {
  store.set('language', app.getLocale().startsWith('zh') ? 'zh' : 'en')
}

// One-time migration: a legacy toolAccess choice becomes the permissionMode,
// so existing users keep their tier instead of dropping to the 'ask' default.
const legacyToolAccess = persisted.toolAccess
if (
  !('permissionMode' in persisted) &&
  (legacyToolAccess === 'full' || legacyToolAccess === 'no-bash' || legacyToolAccess === 'readonly')
) {
  store.set('permissionMode', legacyToolAccess as ToolAccess)
}

export function getStore<K extends keyof AppSettings>(key: K): AppSettings[K] {
  return store.get(key)
}

export function setStore<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
  store.set(key, value)
}
