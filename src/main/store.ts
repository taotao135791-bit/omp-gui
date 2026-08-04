import { app } from 'electron'
import Store from 'electron-store'
import { AppSettings, DEFAULT_SETTINGS } from '../shared/types'

const store = new Store<AppSettings>({
  name: 'omp-gui-settings',
  defaults: DEFAULT_SETTINGS
})

// First run: pick the UI language from the OS locale
if (!store.has('language')) {
  store.set('language', app.getLocale().startsWith('zh') ? 'zh' : 'en')
}

export function getStore<K extends keyof AppSettings>(key: K): AppSettings[K] {
  return store.get(key)
}

export function setStore<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
  store.set(key, value)
}
