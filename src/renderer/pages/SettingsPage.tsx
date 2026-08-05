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
import { CliInfo, ModelConfig, PI_PROVIDERS, ToolAccess } from '@shared/types'
import { useAppStore } from '../store'
import { useT } from '../i18n'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-ink-850">
      <div className="border-b border-line px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-cream-faint">
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
  'rounded-md border border-line bg-ink-900 px-2 py-1.5 text-xs text-cream outline-none transition focus:border-accent dark:bg-ink-800'

const inputCls =
  'w-56 rounded-md border border-line bg-ink-900 px-2.5 py-1.5 text-xs text-cream outline-none transition placeholder:text-cream-faint focus:border-accent dark:bg-ink-800'

const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const

const TOOL_ACCESS_NOTE = {
  full: 'settings.toolAccessNote.full',
  'no-bash': 'settings.toolAccessNote.noBash',
  readonly: 'settings.toolAccessNote.readonly'
} as const

export default function SettingsPage() {
  const { theme, language, setTheme, setLanguage } = useAppStore()
  const t = useT()
  const [cli, setCli] = useState<CliInfo | null>(null)
  const [detecting, setDetecting] = useState(false)
  const [cleared, setCleared] = useState(false)
  const [version, setVersion] = useState('')

  const [modelCfg, setModelCfg] = useState<ModelConfig | null>(null)
  const [keyInput, setKeyInput] = useState('')
  const [keyState, setKeyState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [keyError, setKeyError] = useState('')
  const [modelInput, setModelInput] = useState('')
  const [toolAccess, setToolAccessState] = useState<ToolAccess>('full')

  const provider = modelCfg?.defaultProvider ?? ''
  const providerConfigured = provider ? (modelCfg?.authProviders ?? []).includes(provider) : false

  useEffect(() => {
    window.electronAPI.detectCli().then(setCli)
    window.electronAPI.getAppVersion().then(setVersion)
    window.electronAPI.getModelConfig().then((cfg) => {
      setModelCfg(cfg)
      setModelInput(cfg.defaultModel)
    })
    window.electronAPI.getStore('toolAccess').then((v) => setToolAccessState(v ?? 'full'))
  }, [])

  const refreshModelCfg = () => window.electronAPI.getModelConfig().then(setModelCfg)

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

  const changeProvider = async (id: string) => {
    setKeyInput('')
    setKeyState('idle')
    setModelCfg((cfg) => (cfg ? { ...cfg, defaultProvider: id } : cfg))
    await window.electronAPI.setModelConfig({ defaultProvider: id })
    refreshModelCfg()
  }

  const saveKey = async () => {
    if (!provider || !keyInput.trim()) return
    setKeyState('saving')
    const result = await window.electronAPI.setApiKey(provider, keyInput.trim())
    if (result.ok) {
      setKeyInput('')
      setKeyState('saved')
      setTimeout(() => setKeyState('idle'), 2000)
      refreshModelCfg()
    } else {
      setKeyError(result.log)
      setKeyState('error')
    }
  }

  const removeKey = async () => {
    if (!provider) return
    await window.electronAPI.clearApiKey(provider)
    setKeyState('idle')
    refreshModelCfg()
  }

  const saveDefaultModel = async () => {
    if (modelInput === (modelCfg?.defaultModel ?? '')) return
    await window.electronAPI.setModelConfig({ defaultModel: modelInput })
    refreshModelCfg()
  }

  const changeThinking = async (level: string) => {
    setModelCfg((cfg) =>
      cfg ? { ...cfg, defaultThinkingLevel: level as ModelConfig['defaultThinkingLevel'] } : cfg
    )
    await window.electronAPI.setModelConfig({
      defaultThinkingLevel: level as ModelConfig['defaultThinkingLevel']
    })
    refreshModelCfg()
  }

  const changeToolAccess = async (value: ToolAccess) => {
    setToolAccessState(value)
    await window.electronAPI.setStore('toolAccess', value)
  }

  const changeTrust = async (value: ModelConfig['projectTrust']) => {
    setModelCfg((cfg) => (cfg ? { ...cfg, projectTrust: value } : cfg))
    await window.electronAPI.setModelConfig({ projectTrust: value })
    refreshModelCfg()
  }

  const seg = (active: boolean) =>
    `rounded px-2.5 py-1 text-xs font-medium transition ${
      active ? 'bg-ink-900 text-cream shadow-sm dark:bg-ink-800' : 'text-cream-dim hover:text-cream'
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
                    {(modelCfg?.authProviders ?? []).includes(p.id) ? ' ✓' : ''}
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
                        className="rounded-md border border-line px-2.5 py-1.5 text-xs text-cream-dim transition hover:border-red-500/40 hover:text-red-500"
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
                        className="flex items-center gap-1 rounded-md border border-line px-2.5 py-1.5 text-xs text-cream-dim transition hover:border-ink-600 hover:text-cream disabled:opacity-50"
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
            <Row label={t('settings.defaultModel')}>
              <input
                value={modelInput}
                onChange={(e) => setModelInput(e.target.value)}
                onBlur={saveDefaultModel}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveDefaultModel()
                }}
                placeholder={t('settings.defaultModelPlaceholder')}
                className={inputCls}
              />
            </Row>
            <Row label={t('settings.thinking')}>
              <select
                value={modelCfg?.defaultThinkingLevel ?? ''}
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
            <Row label={t('settings.toolAccess')}>
              <div className="flex rounded-md bg-overlay p-0.5">
                <button onClick={() => changeToolAccess('full')} className={seg(toolAccess === 'full')}>
                  {t('settings.toolAccessFull')}
                </button>
                <button
                  onClick={() => changeToolAccess('no-bash')}
                  className={seg(toolAccess === 'no-bash')}
                >
                  {t('settings.toolAccessNoBash')}
                </button>
                <button
                  onClick={() => changeToolAccess('readonly')}
                  className={seg(toolAccess === 'readonly')}
                >
                  {t('settings.toolAccessReadonly')}
                </button>
              </div>
            </Row>
            <Note>{t(TOOL_ACCESS_NOTE[toolAccess])}</Note>
            <Row label={t('settings.projectTrust')}>
              <div className="flex items-center gap-2">
                <ShieldCheck size={13} className="text-cream-faint" />
                <div className="flex rounded-md bg-overlay p-0.5">
                  <button
                    onClick={() => changeTrust('ask')}
                    className={seg((modelCfg?.projectTrust ?? 'ask') === 'ask')}
                  >
                    {t('settings.trustAsk')}
                  </button>
                  <button
                    onClick={() => changeTrust('always')}
                    className={seg((modelCfg?.projectTrust ?? 'ask') === 'always')}
                  >
                    {t('settings.trustAlways')}
                  </button>
                  <button
                    onClick={() => changeTrust('never')}
                    className={seg((modelCfg?.projectTrust ?? 'ask') === 'never')}
                  >
                    {t('settings.trustNever')}
                  </button>
                </div>
              </div>
            </Row>
            <Note>{t('settings.trustNote')}</Note>
          </Section>

          <Section title={t('settings.appearance')}>
            <Row label={t('settings.theme')}>
              <div className="flex rounded-md bg-overlay p-0.5">
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
                <div className="flex rounded-md bg-overlay p-0.5">
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
                className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs text-cream-dim transition hover:border-ink-600 hover:text-cream disabled:opacity-50"
              >
                <RefreshCw size={11} className={detecting ? 'animate-spin' : ''} />
                {detecting ? t('settings.detecting') : t('settings.redetect')}
              </button>
            </Row>
            <Row label={t('settings.cliSettingsFile')}>
              <button
                onClick={() => window.electronAPI.showCliSettings()}
                className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs text-cream-dim transition hover:border-ink-600 hover:text-cream"
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
                className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs text-cream-dim transition hover:border-red-500/40 hover:text-red-500"
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
            <Row label="Oh My Pi">
              <span className="text-xs text-cream-dim">omp.sh · pi.dev</span>
            </Row>
          </Section>
        </div>
      </div>
    </div>
  )
}
