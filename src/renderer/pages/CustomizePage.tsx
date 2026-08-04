import { useEffect, useState } from 'react'
import { Puzzle, Plus, RotateCcw, Cpu, Package, Layers } from 'lucide-react'
import { ModuleInfo } from '@shared/types'
import { useAppStore } from '../store'
import { useT, translate } from '../i18n'

export default function CustomizePage() {
  const { currentProject, modules, setModules, updateModuleEnabled } = useAppStore()
  const [installUrl, setInstallUrl] = useState('')
  const t = useT()

  useEffect(() => {
    window.electronAPI.scanModules(currentProject || undefined).then((scanned) => {
      setModules(scanned)
    })
  }, [currentProject, setModules])

  const handleToggle = async (mod: ModuleInfo) => {
    const next = !mod.enabled
    updateModuleEnabled(mod.id, next)
    await window.electronAPI.setModuleEnabled(mod.id, next)
  }

  const handleInstall = async () => {
    if (!installUrl.trim()) return
    // Placeholder: real implementation would call omp install
    alert(translate(useAppStore.getState().language, 'customize.installAlert', { url: installUrl }))
    setInstallUrl('')
  }

  const enabledModules = modules.filter((m) => m.enabled)
  const availableModules = modules.filter((m) => !m.enabled)

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.06] px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-accent">
            <Puzzle size={17} />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight text-cream">{t('customize.title')}</div>
            <div className="text-xs text-cream-faint">{t('customize.subtitle')}</div>
          </div>
        </div>
        <button
          onClick={() => window.electronAPI.scanModules(currentProject || undefined).then(setModules)}
          className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 py-1.5 text-xs font-medium text-cream-dim transition hover:bg-white/[0.06] hover:text-cream"
        >
          <RotateCcw size={12} />
          {t('customize.refresh')}
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Available modules */}
        <div className="flex w-1/2 flex-col border-r border-white/[0.06]">
          <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
            <Package size={15} className="text-cream-dim" />
            <span className="text-sm font-medium text-cream">{t('customize.available')}</span>
            <span className="ml-auto rounded-full bg-white/[0.07] px-2 py-0.5 font-mono text-[10px] text-cream-dim">
              {availableModules.length}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <div className="mb-4 flex gap-2">
              <input
                type="text"
                value={installUrl}
                onChange={(e) => setInstallUrl(e.target.value)}
                placeholder={t('customize.installPlaceholder')}
                className="flex-1 rounded-lg border border-white/[0.08] bg-ink-950 px-3 py-2 font-mono text-xs text-cream outline-none transition placeholder:text-cream-faint focus:border-accent/40"
              />
              <button
                onClick={handleInstall}
                className="flex items-center gap-1.5 rounded-lg bg-cream px-3 py-2 text-xs font-medium text-ink-950 transition hover:bg-white"
              >
                <Plus size={12} />
                {t('customize.install')}
              </button>
            </div>
            <div className="grid gap-2.5">
              {availableModules.map((mod) => (
                <ModuleCard key={mod.id} mod={mod} onToggle={() => handleToggle(mod)} />
              ))}
              {availableModules.length === 0 && (
                <div className="rounded-xl border border-dashed border-white/[0.08] p-6 text-center text-xs text-cream-faint">
                  {t('customize.allEnabled')}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Assembled Pi */}
        <div className="flex w-1/2 flex-col bg-ink-900/40">
          <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
            <Layers size={15} className="text-cream-dim" />
            <span className="text-sm font-medium text-cream">{t('customize.assembled')}</span>
            <span className="ml-auto rounded-full bg-accent/15 px-2 py-0.5 font-mono text-[10px] text-accent">
              {enabledModules.length}
            </span>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto p-6">
            <div className="relative flex flex-col items-center gap-5">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10 text-accent">
                <Cpu size={34} />
              </div>
              <div className="text-center">
                <div className="text-sm font-semibold text-cream">{t('customize.piCore')}</div>
                <div className="mt-0.5 text-xs text-cream-faint">
                  {t('customize.modulesAttached', { count: enabledModules.length })}
                </div>
              </div>
              <div className="grid w-full max-w-sm gap-2.5">
                {enabledModules.map((mod) => (
                  <div
                    key={mod.id}
                    className="flex items-center justify-between rounded-xl border border-accent/20 bg-ink-900 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-cream">{mod.name}</div>
                      <div className="truncate font-mono text-[10px] uppercase text-cream-faint">{mod.source}</div>
                    </div>
                    <button
                      onClick={() => handleToggle(mod)}
                      className="ml-2 rounded-lg bg-red-500/15 px-2 py-1 text-xs font-medium text-red-300 transition hover:bg-red-500/25"
                    >
                      {t('customize.remove')}
                    </button>
                  </div>
                ))}
                {enabledModules.length === 0 && (
                  <div className="text-center text-xs text-cream-faint">
                    {t('customize.empty')}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ModuleCard({ mod, onToggle }: { mod: ModuleInfo; onToggle: () => void }) {
  const t = useT()
  return (
    <div className="flex items-start justify-between rounded-xl border border-white/[0.06] bg-ink-900 p-3 transition hover:border-white/[0.12]">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-cream">{mod.name}</span>
          {mod.version && (
            <span className="rounded-full bg-white/[0.07] px-1.5 py-0.5 font-mono text-[10px] text-cream-dim">
              {mod.version}
            </span>
          )}
        </div>
        <div className="mt-1 text-xs leading-5 text-cream-dim">{mod.description}</div>
        <div className="mt-2 flex items-center gap-2 font-mono text-[10px] uppercase text-cream-faint">
          <span>{mod.source}</span>
          {mod.author && <span className="normal-case">· {mod.author}</span>}
        </div>
      </div>
      <button
        onClick={onToggle}
        className="ml-3 shrink-0 rounded-lg bg-accent/15 px-2.5 py-1.5 text-xs font-medium text-accent transition hover:bg-accent hover:text-ink-950"
      >
        {t('customize.enable')}
      </button>
    </div>
  )
}
