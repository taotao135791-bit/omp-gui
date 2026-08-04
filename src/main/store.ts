import Store from 'electron-store'
import { AppSettings, DEFAULT_SETTINGS } from '../shared/types'

const store = new Store<AppSettings>({
  name: 'omp-gui-settings',
  defaults: DEFAULT_SETTINGS
})

export function getStore<K extends keyof AppSettings>(key: K): AppSettings[K] {
  return store.get(key)
}

export function setStore<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
  store.set(key, value)
}
