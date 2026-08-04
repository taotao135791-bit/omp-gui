import { useEffect, useState } from 'react'
import { Check, FolderCog, Languages, Moon, RefreshCw, Sun, Trash2 } from 'lucide-react'
import { CliInfo } from '@shared/types'
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

export default function SettingsPage() {
  const { theme, language, setTheme, setLanguage } = useAppStore()
  const t = useT()
  const [cli, setCli] = useState<CliInfo | null>(null)
  const [detecting, setDetecting] = useState(false)
  const [cleared, setCleared] = useState(false)

  useEffect(() => {
    window.electronAPI.detectCli().then(setCli)
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
              <span className="font-mono text-xs text-cream-dim">0.1.0</span>
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
