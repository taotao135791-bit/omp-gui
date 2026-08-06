import { useEffect, useState } from 'react'
import {
  Check,
  FolderCog,
  KeyRound,
  Languages,
  Moon,
  RefreshCw,
  ShieldCheck,
  Sun,
  Trash2
} from 'lucide-react'
import { CliInfo, ModelConfig, PermissionMode, PI_PROVIDERS, PiModel, UpdaterStatus } from '@shared/types'
import { useAppStore } from '../store'
import { I18nKey, useT } from '../i18n'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-line bg-ink-850 shadow-card">
      <div className="border-b border-line px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.08em] text-cream-faint">
        {title}
      </div>
      <div className="divide-y divide-line">{children}</div>
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <span className="text-[13px] text-cream">{label}</span>
      {children}
    </div>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-2.5 text-[11px] leading-5 text-cream-faint">{children}</p>
}

const selectCls =
  'h-8 rounded-lg border border-line bg-ink-900 px-2 text-xs text-cream outline-none transition-colors focus:border-accent dark:bg-ink-800'

const inputCls =
  'h-8 w-56 rounded-lg border border-line bg-ink-900 px-2.5 text-xs text-cream outline-none transition-colors placeholder:text-cream-faint focus:border-accent dark:bg-ink-800'

const buttonCls =
  'flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs text-cream-dim transition-colors hover:border-line-strong hover:text-cream disabled:opacity-50'

const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const

const PERMISSION_MODES: { value: PermissionMode; label: I18nKey; note: I18nKey }[] = [
  { value: 'ask', label: 'settings.permissions.ask', note: 'settings.permissionsNote.ask' },
  { value: 'full', label: 'settings.permissions.full', note: 'settings.permissionsNote.full' },
  { value: 'no-bash', label: 'settings.permissions.noBash', note: 'settings.permissionsNote.noBash' },
  { value: 'readonly', label: 'settings.permissions.readonly', note: 'settings.permissionsNote.readonly' }
]

export default function SettingsPage() {
  const { theme, language, setTheme, setLanguage, models, modelConfig, loadModelState, selectModel } =
    useAppStore()
  const t = useT()
  const [cli, setCli] = useState<CliInfo | null>(null)
  const [detecting, setDetecting] = useState(false)
  const [cleared, setCleared] = useState(false)
  const [version, setVersion] = useState('')

  const [keyInput, setKeyInput] = useState('')
  const [keyState, setKeyState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [keyError, setKeyError] = useState('')
  const [modelSaved, setModelSaved] = useState(false)
  const [permissionMode, setPermissionModeState] = useState<PermissionMode>('ask')
  const [notifications, setNotificationsState] = useState(true)
  const [updater, setUpdater] = useState<UpdaterStatus>({ status: 'idle' })
  const [machineSkills, setMachineSkillsState] = useState(false)
  const [machineSkillCount, setMachineSkillCount] = useState(0)

  const provider = modelConfig?.defaultProvider ?? ''
  const providerConfigured = provider ? (modelConfig?.authProviders ?? []).includes(provider) : false
  const providerModels = provider ? models.filter((m) => m.provider === provider) : []
  const [catalog, setCatalog] = useState<PiModel[]>([])
  // The full registry lets the picker offer models before a key is stored;
  // the credential-filtered list is only a fallback if the registry is unreadable.
  const catalogForProvider = provider ? catalog.filter((m) => m.provider === provider) : []
  const selectableModels = catalogForProvider.length > 0 ? catalogForProvider : providerModels

  useEffect(() => {
    window.electronAPI.detectCli().then(setCli)
    window.electronAPI.getAppVersion().then(setVersion)
    window.electronAPI.listCatalogModels().then(setCatalog)
    loadModelState()
    window.electronAPI.getStore('permissionMode').then((v) => setPermissionModeState(v ?? 'ask'))
    window.electronAPI.getStore('notifications').then((v) => setNotificationsState(v ?? true))
    window.electronAPI.getStore('machineSkills').then((v) => {
      const enabled = v ?? false
      setMachineSkillsState(enabled)
      // Idempotent re-sync doubles as the machine-skill count probe
      window.electronAPI.setMachineSkills(enabled).then((r) => setMachineSkillCount(r.available.length))
    })
  }, [loadModelState])

  useEffect(() => {
    window.electronAPI.updaterGetStatus().then(setUpdater)
    return window.electronAPI.onUpdaterStatus(setUpdater)
  }, [])

  const redetect = async () => {
    setDetecting(true)
    const info = await window.electronAPI.detectCli(true)
    setCli(info)
    useAppStore.getState().setCliAvailable(info.available)
    setDetecting(false)
  }

  const clearRecent = async () => {
    await window.electronAPI.setStore('recentProjects', [])
    setCleared(true)
    setTimeout(() => setCleared(false), 1500)
  }

  const flashModelSaved = () => {
    setModelSaved(true)
    setTimeout(() => setModelSaved(false), 1500)
  }

  const changeProvider = async (id: string) => {
    setKeyInput('')
    setKeyState('idle')
    // A model id only makes sense within its provider — reset it on switch
    await window.electronAPI.setModelConfig({ defaultProvider: id, defaultModel: '' })
    loadModelState()
  }

  const changeModel = async (modelId: string) => {
    if (!provider) return
    await selectModel(provider, modelId)
    flashModelSaved()
  }

  const saveCustomModel = async (value: string) => {
    if (!provider || value === (modelConfig?.defaultModel ?? '')) return
    await selectModel(provider, value)
    flashModelSaved()
  }

  const saveKey = async () => {
    if (!provider || !keyInput.trim()) return
    setKeyState('saving')
    const result = await window.electronAPI.setApiKey(provider, keyInput.trim())
    if (result.ok) {
      setKeyInput('')
      setKeyState('saved')
      setTimeout(() => setKeyState('idle'), 2000)
      loadModelState()
    } else {
      setKeyError(result.log)
      setKeyState('error')
    }
  }

  const removeKey = async () => {
    if (!provider) return
    await window.electronAPI.clearApiKey(provider)
    setKeyState('idle')
    loadModelState()
  }

  const changeThinking = async (level: string) => {
    await window.electronAPI.setModelConfig({
      defaultThinkingLevel: level as ModelConfig['defaultThinkingLevel']
    })
    loadModelState()
  }

  const changePermissionMode = async (value: PermissionMode) => {
    setPermissionModeState(value)
    await window.electronAPI.setStore('permissionMode', value)
  }

  const changeNotifications = async (value: boolean) => {
    setNotificationsState(value)
    await window.electronAPI.setStore('notifications', value)
  }

  const checkUpdates = async () => {
    setUpdater(await window.electronAPI.updaterCheck())
  }

  const downloadUpdate = async () => {
    setUpdater(await window.electronAPI.updaterDownload())
  }

  const changeTrust = async (value: ModelConfig['projectTrust']) => {
    await window.electronAPI.setModelConfig({ projectTrust: value })
    loadModelState()
  }

  const changeMachineSkills = async (enabled: boolean) => {
    setMachineSkillsState(enabled)
    const r = await window.electronAPI.setMachineSkills(enabled)
    setMachineSkillCount(r.available.length)
  }

  const seg = (active: boolean) =>
    `rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
      active ? 'bg-ink-850 text-cream shadow-card dark:bg-ink-800' : 'text-cream-dim hover:text-cream'
    }`

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="app-drag flex h-12 shrink-0 items-center border-b border-line px-4">
        <span className="text-[13px] font-medium text-cream">{t('settings.title')}</span>
      </header>

      <div className="flex-1 overflow-y-auto p-5">
        <div className="mx-auto max-w-xl space-y-4">
          <Section title={t('settings.model')}>
            <Row label={t('settings.provider')}>
              <select
                value={provider}
                onChange={(e) => changeProvider(e.target.value)}
                className={selectCls}
              >
                <option value="">{t('settings.providerAuto')}</option>
                {PI_PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                    {(modelConfig?.authProviders ?? []).includes(p.id) ? ' ✓' : ''}
                  </option>
                ))}
              </select>
            </Row>
            {provider && (
              <Row label={t('settings.apiKey')}>
                <div className="flex items-center gap-2">
                  {providerConfigured && keyState !== 'saved' ? (
                    <>
                      <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        <KeyRound size={11} />
                        {t('settings.providerConfigured')}
                      </span>
                      <button
                        onClick={removeKey}
                        className="flex h-8 items-center gap-1 rounded-lg border border-line px-2.5 text-xs text-cream-dim transition-colors hover:border-red-500/40 hover:text-red-500"
                      >
                        {t('settings.clearKey')}
                      </button>
                    </>
                  ) : (
                    <>
                      <input
                        type="password"
                        value={keyInput}
                        onChange={(e) => {
                          setKeyInput(e.target.value)
                          if (keyState === 'error') setKeyState('idle')
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveKey()
                        }}
                        placeholder={t('settings.apiKeyPlaceholder')}
                        className={inputCls}
                      />
                      <button
                        onClick={saveKey}
                        disabled={!keyInput.trim() || keyState === 'saving'}
                        className={buttonCls}
                      >
                        {keyState === 'saved' ? (
                          <>
                            <Check size={11} className="text-emerald-500" />
                            {t('settings.saved')}
                          </>
                        ) : keyState === 'saving' ? (
                          t('settings.saving')
                        ) : (
                          t('settings.saveKey')
                        )}
                      </button>
                    </>
                  )}
                </div>
              </Row>
            )}
            {keyState === 'error' && (
              <Note>
                <span className="text-red-500">{t('settings.saveFailed', { error: keyError })}</span>
              </Note>
            )}
            {provider && (
              <Row label={t('settings.defaultModel')}>
                <div className="flex items-center gap-2">
                  {selectableModels.length > 0 ? (
                    <select
                      value={modelConfig?.defaultModel ?? ''}
                      onChange={(e) => changeModel(e.target.value)}
                      className={`${selectCls} max-w-64`}
                    >
                      <option value="">{t('settings.modelAuto')}</option>
                      {selectableModels.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      key={provider}
                      defaultValue={modelConfig?.defaultModel ?? ''}
                      onBlur={(e) => saveCustomModel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveCustomModel((e.target as HTMLInputElement).value)
                      }}
                      placeholder={t('settings.defaultModelPlaceholder')}
                      className={inputCls}
                    />
                  )}
                  {modelSaved && (
                    <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      <Check size={11} />
                      {t('settings.saved')}
                    </span>
                  )}
                </div>
              </Row>
            )}
            <Row label={t('settings.thinking')}>
              <select
                value={modelConfig?.defaultThinkingLevel ?? ''}
                onChange={(e) => changeThinking(e.target.value)}
                className={selectCls}
              >
                <option value="">{t('settings.thinkingDefault')}</option>
                {THINKING_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </Row>
            <Note>{t('settings.modelNote')}</Note>
          </Section>

          <Section title={t('settings.permissions')}>
            <Row label={t('settings.permissionMode')}>
              <div className="flex rounded-lg border border-line bg-overlay p-0.5">
                {PERMISSION_MODES.map((mode) => (
                  <button
                    key={mode.value}
                    onClick={() => changePermissionMode(mode.value)}
                    className={seg(permissionMode === mode.value)}
                  >
                    {t(mode.label)}
                  </button>
                ))}
              </div>
            </Row>
            <Note>{t(PERMISSION_MODES.find((m) => m.value === permissionMode)?.note ?? 'settings.permissionsNote.ask')}</Note>
            <Row label={t('settings.projectTrust')}>
              <div className="flex items-center gap-2">
                <ShieldCheck size={13} className="text-cream-faint" />
                <div className="flex rounded-lg border border-line bg-overlay p-0.5">
                  <button
                    onClick={() => changeTrust('ask')}
                    className={seg((modelConfig?.projectTrust ?? 'ask') === 'ask')}
                  >
                    {t('settings.trustAsk')}
                  </button>
                  <button
                    onClick={() => changeTrust('always')}
                    className={seg((modelConfig?.projectTrust ?? 'ask') === 'always')}
                  >
                    {t('settings.trustAlways')}
                  </button>
                  <button
                    onClick={() => changeTrust('never')}
                    className={seg((modelConfig?.projectTrust ?? 'ask') === 'never')}
                  >
                    {t('settings.trustNever')}
                  </button>
                </div>
              </div>
            </Row>
            <Note>{t('settings.trustNote')}</Note>
          </Section>

          <Section title={t('settings.skills')}>
            <Row label={t('settings.machineSkills')}>
              <div className="flex rounded-lg border border-line bg-overlay p-0.5">
                <button onClick={() => changeMachineSkills(true)} className={seg(machineSkills)}>
                  {t('settings.on')}
                </button>
                <button onClick={() => changeMachineSkills(false)} className={seg(!machineSkills)}>
                  {t('settings.off')}
                </button>
              </div>
            </Row>
            <Note>
              {machineSkillCount > 0
                ? t('settings.machineSkillsNoteCount', { count: machineSkillCount })
                : t('settings.machineSkillsNote')}
            </Note>
          </Section>

          <Section title={t('settings.appearance')}>
            <Row label={t('settings.theme')}>
              <div className="flex rounded-lg border border-line bg-overlay p-0.5">
                <button onClick={() => setTheme('light')} className={seg(theme === 'light')}>
                  <span className="flex items-center gap-1">
                    <Sun size={11} />
                    {t('settings.themeLight')}
                  </span>
                </button>
                <button onClick={() => setTheme('dark')} className={seg(theme === 'dark')}>
                  <span className="flex items-center gap-1">
                    <Moon size={11} />
                    {t('settings.themeDark')}
                  </span>
                </button>
              </div>
            </Row>
            <Row label={t('settings.language')}>
              <div className="flex items-center gap-2">
                <Languages size={13} className="text-cream-faint" />
                <div className="flex rounded-lg border border-line bg-overlay p-0.5">
                  <button onClick={() => setLanguage('zh')} className={seg(language === 'zh')}>
                    中文
                  </button>
                  <button onClick={() => setLanguage('en')} className={seg(language === 'en')}>
                    English
                  </button>
                </div>
              </div>
            </Row>
          </Section>

          <Section title={t('settings.notifications')}>
            <Row label={t('settings.notifyCompletion')}>
              <div className="flex rounded-lg border border-line bg-overlay p-0.5">
                <button onClick={() => changeNotifications(true)} className={seg(notifications)}>
                  {t('settings.on')}
                </button>
                <button onClick={() => changeNotifications(false)} className={seg(!notifications)}>
                  {t('settings.off')}
                </button>
              </div>
            </Row>
            <Note>{t('settings.notifyCompletionNote')}</Note>
          </Section>

          <Section title="Oh My Pi CLI">
            <Row label={t('settings.cliStatus')}>
              <span
                className={`flex items-center gap-1.5 text-xs font-medium ${
                  cli?.available ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    cli?.available ? 'bg-emerald-500' : 'bg-red-500'
                  }`}
                />
                {cli?.available ? t('settings.cliAvailable') : t('settings.cliMissing')}
              </span>
            </Row>
            <Row label={t('settings.cliPath')}>
              <span className="max-w-[280px] truncate font-mono text-xs text-cream-dim">
                {cli?.path || '—'}
              </span>
            </Row>
            <Row label={t('settings.redetect')}>
              <button
                onClick={redetect}
                disabled={detecting}
                className={buttonCls}
              >
                <RefreshCw size={11} className={detecting ? 'animate-spin' : ''} />
                {detecting ? t('settings.detecting') : t('settings.redetect')}
              </button>
            </Row>
            <Row label={t('settings.cliSettingsFile')}>
              <button
                onClick={() => window.electronAPI.showCliSettings()}
                className={buttonCls}
              >
                <FolderCog size={11} />
                {t('settings.showInFinder')}
              </button>
            </Row>
          </Section>

          <Section title={t('settings.data')}>
            <Row label={t('settings.clearRecent')}>
              <button
                onClick={clearRecent}
                className="flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs text-cream-dim transition-colors hover:border-red-500/40 hover:text-red-500"
              >
                {cleared ? (
                  <>
                    <Check size={11} className="text-emerald-500" />
                    {t('settings.cleared')}
                  </>
                ) : (
                  <>
                    <Trash2 size={11} />
                    {t('settings.clear')}
                  </>
                )}
              </button>
            </Row>
          </Section>

          <Section title={t('settings.about')}>
            <Row label={t('settings.version')}>
              <span className="font-mono text-xs text-cream-dim">{version || '—'}</span>
            </Row>
            <Row label={t('settings.update')}>
              <div className="flex items-center gap-2">
                {updater.status === 'idle' && (
                  <button onClick={checkUpdates} className={buttonCls}>
                    <RefreshCw size={11} />
                    {t('settings.checkUpdate')}
                  </button>
                )}
                {updater.status === 'checking' && (
                  <span className="flex items-center gap-1.5 text-xs text-cream-dim">
                    <RefreshCw size={11} className="animate-spin" />
                    {t('settings.checking')}
                  </span>
                )}
                {updater.status === 'available' && (
                  <>
                    <span className="text-xs text-cream-dim">
                      {t('settings.updateAvailable', { version: updater.version })}
                    </span>
                    <button onClick={downloadUpdate} className={buttonCls}>
                      {t('settings.downloadUpdate')}
                    </button>
                  </>
                )}
                {(updater.status === 'downloading' || updater.status === 'progress') && (
                  <span className="flex items-center gap-1.5 text-xs text-cream-dim">
                    <RefreshCw size={11} className="animate-spin" />
                    {t('settings.downloading')}
                    {updater.status === 'progress' ? ` ${updater.percent}%` : ''}
                  </span>
                )}
                {updater.status === 'downloaded' && (
                  <>
                    <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      {t('settings.updateReady', { version: updater.version })}
                    </span>
                    <button
                      onClick={() => window.electronAPI.updaterQuitAndInstall()}
                      className={buttonCls}
                    >
                      {t('settings.restartInstall')}
                    </button>
                  </>
                )}
                {updater.status === 'error' && (
                  <>
                    <span className="text-xs text-red-500">{t('settings.updateError')}</span>
                    <button onClick={checkUpdates} className={buttonCls}>
                      {t('settings.updateRetry')}
                    </button>
                    <button
                      onClick={() => window.electronAPI.updaterOpenReleasePage()}
                      className={buttonCls}
                    >
                      {t('settings.updateOpenPage')}
                    </button>
                  </>
                )}
                {updater.status === 'dev' && (
                  <span className="text-xs text-cream-faint">{t('settings.updateDevMode')}</span>
                )}
              </div>
            </Row>
            {updater.status === 'error' && (
              <Note>
                <span className="text-red-500">{updater.message}</span>
              </Note>
            )}
            <Row label="Oh My Pi">
              <span className="text-xs text-cream-dim">omp.sh · pi.dev</span>
            </Row>
          </Section>
        </div>
      </div>
    </div>
  )
}
