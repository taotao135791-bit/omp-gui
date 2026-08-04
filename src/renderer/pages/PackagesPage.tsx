import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Puzzle,
  Plus,
  RotateCcw,
  FolderOpen,
  FileCode,
  Trash2,
  ArrowUpCircle,
  Sparkles,
  MessageSquareText,
  Palette,
  Wrench,
  Info
} from 'lucide-react'
import { PackageInfo, PackageResource } from '@shared/types'
import { useAppStore } from '../store'
import { useT } from '../i18n'

type PendingAction =
  | { kind: 'install' }
  | { kind: 'remove' | 'update' | 'toggle'; source: string }
  | null

const RESOURCE_ICONS: Record<PackageResource['type'], typeof Wrench> = {
  extension: Wrench,
  skill: Sparkles,
  prompt: MessageSquareText,
  theme: Palette
}

export default function PackagesPage() {
  const { packages, setPackages, updatePackageEnabled } = useAppStore()
  const t = useT()
  const [source, setSource] = useState('')
  const [pending, setPending] = useState<PendingAction>(null)
  const [log, setLog] = useState<{ ok: boolean; text: string } | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refresh = useCallback(async () => {
    setPackages(await window.electronAPI.listPackages())
  }, [setPackages])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    return () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current)
    }
  }, [])

  const run = async (action: PendingAction, fn: () => Promise<{ ok: boolean; log: string }>) => {
    setPending(action)
    const result = await fn()
    setLog(result.log ? { ok: result.ok, text: result.log } : { ok: result.ok, text: '' })
    await refresh()
    setPending(null)
  }

  const handleInstall = async (target?: string) => {
    const value = (target ?? source).trim()
    if (!value || pending) return
    setSource('')
    await run({ kind: 'install' }, () => window.electronAPI.installPackage(value))
  }

  const handlePick = async (kind: 'folder' | 'file') => {
    const picked =
      kind === 'folder'
        ? await window.electronAPI.selectFolder()
        : await window.electronAPI.selectFile()
    if (picked) handleInstall(picked)
  }

  const handleRemove = async (pkg: PackageInfo) => {
    if (confirmRemove !== pkg.source) {
      setConfirmRemove(pkg.source)
      if (confirmTimer.current) clearTimeout(confirmTimer.current)
      confirmTimer.current = setTimeout(() => setConfirmRemove(null), 3000)
      return
    }
    setConfirmRemove(null)
    if (confirmTimer.current) clearTimeout(confirmTimer.current)
    await run({ kind: 'remove', source: pkg.source }, () =>
      window.electronAPI.removePackage(pkg.source)
    )
  }

  const handleUpdate = async (pkg: PackageInfo) => {
    await run({ kind: 'update', source: pkg.source }, () =>
      window.electronAPI.updatePackage(pkg.source)
    )
  }

  const handleToggle = async (pkg: PackageInfo) => {
    const next = !pkg.enabled
    updatePackageEnabled(pkg.source, next)
    const result = await window.electronAPI.setPackageEnabled(pkg.source, next)
    if (!result.ok) {
      updatePackageEnabled(pkg.source, !next)
      setLog({ ok: false, text: result.log })
    }
  }

  const isPending = (kind: string, pkg?: PackageInfo) =>
    pending !== null &&
    pending.kind === kind &&
    (pkg === undefined || ('source' in pending && pending.source === pkg.source))

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="app-drag flex h-12 shrink-0 items-center justify-between border-b border-line px-4">
        <div className="flex items-center gap-2.5">
          <Puzzle size={15} className="text-accent" />
          <span className="text-[13px] font-medium text-cream">{t('plugins.title')}</span>
          <span className="text-xs text-cream-faint">{t('plugins.subtitle')}</span>
        </div>
        <button
          onClick={refresh}
          className="app-no-drag flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs text-cream-dim transition hover:border-ink-600 hover:text-cream"
        >
          <RotateCcw size={11} />
          {t('plugins.refresh')}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-5">
        <div className="mx-auto max-w-2xl space-y-4">
          {/* Install */}
          <section className="rounded-lg border border-line bg-ink-850 p-4">
            <div className="mb-2.5 text-[11px] font-medium uppercase tracking-wider text-cream-faint">
              {t('plugins.installTitle')}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleInstall()
                }}
                placeholder={t('plugins.installPlaceholder')}
                disabled={pending !== null}
                className="flex-1 rounded-md border border-line bg-ink-900 px-3 py-2 font-mono text-xs text-cream outline-none transition placeholder:text-cream-faint focus:border-accent/40 disabled:opacity-50"
              />
              <button
                onClick={() => handlePick('folder')}
                disabled={pending !== null}
                title={t('plugins.browseFolder')}
                className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-2 text-xs text-cream-dim transition hover:border-ink-600 hover:text-cream disabled:opacity-50"
              >
                <FolderOpen size={12} />
                {t('plugins.browseFolder')}
              </button>
              <button
                onClick={() => handlePick('file')}
                disabled={pending !== null}
                title={t('plugins.browseFile')}
                className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-2 text-xs text-cream-dim transition hover:border-ink-600 hover:text-cream disabled:opacity-50"
              >
                <FileCode size={12} />
                {t('plugins.browseFile')}
              </button>
              <button
                onClick={() => handleInstall()}
                disabled={!source.trim() || pending !== null}
                className="flex items-center gap-1.5 rounded-md bg-cream px-3 py-2 text-xs font-medium text-ink-950 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus size={12} />
                {isPending('install') ? t('plugins.installing') : t('plugins.install')}
              </button>
            </div>
            {log && log.text && (
              <pre
                className={`mt-3 max-h-36 overflow-y-auto rounded-md border px-3 py-2 font-mono text-[11px] leading-5 whitespace-pre-wrap ${
                  log.ok
                    ? 'border-line bg-ink-900 text-cream-dim'
                    : 'border-red-500/30 bg-red-500/5 text-red-600 dark:text-red-300'
                }`}
              >
                {log.text}
              </pre>
            )}
          </section>

          {/* How to use */}
          <section className="rounded-lg border border-line bg-ink-850 px-4 py-3">
            <div className="flex items-start gap-2.5">
              <Info size={13} className="mt-0.5 shrink-0 text-accent" />
              <div className="space-y-1 text-xs leading-5 text-cream-dim">
                <div className="font-medium text-cream">{t('plugins.usageTitle')}</div>
                <div>· {t('plugins.usage1')}</div>
                <div>· {t('plugins.usage2')}</div>
                <div>· {t('plugins.usage3')}</div>
              </div>
            </div>
          </section>

          {/* Installed */}
          <section>
            <div className="mb-2 flex items-center gap-2 px-1">
              <span className="text-[11px] font-medium uppercase tracking-wider text-cream-faint">
                {t('plugins.installed')}
              </span>
              <span className="rounded-full bg-overlay-strong px-2 py-0.5 font-mono text-[10px] text-cream-dim">
                {packages.length}
              </span>
            </div>
            {packages.length === 0 ? (
              <div className="rounded-lg border border-dashed border-line p-8 text-center">
                <Puzzle size={20} className="mx-auto mb-2 text-cream-faint" />
                <div className="text-[13px] text-cream-dim">{t('plugins.empty')}</div>
                <div className="mt-1 text-xs text-cream-faint">{t('plugins.emptyHint')}</div>
              </div>
            ) : (
              <div className="space-y-2.5">
                {packages.map((pkg) => (
                  <PackageCard
                    key={pkg.source}
                    pkg={pkg}
                    pending={pending}
                    confirmRemove={confirmRemove === pkg.source}
                    onToggle={() => handleToggle(pkg)}
                    onUpdate={() => handleUpdate(pkg)}
                    onRemove={() => handleRemove(pkg)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

function PackageCard({
  pkg,
  pending,
  confirmRemove,
  onToggle,
  onUpdate,
  onRemove
}: {
  pkg: PackageInfo
  pending: PendingAction
  confirmRemove: boolean
  onToggle: () => void
  onUpdate: () => void
  onRemove: () => void
}) {
  const t = useT()
  const busy =
    pending !== null && 'source' in pending && pending.source === pkg.source
  const removing = busy && pending?.kind === 'remove'
  const updating = busy && pending?.kind === 'update'
  const updatable = pkg.kind !== 'local' && !pkg.pinned

  return (
    <div
      className={`rounded-lg border border-line bg-ink-850 p-4 transition ${
        pkg.enabled ? '' : 'opacity-60'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-semibold text-cream">{pkg.name}</span>
            {pkg.version && (
              <span className="rounded-full bg-overlay-strong px-1.5 py-0.5 font-mono text-[10px] text-cream-dim">
                {pkg.version}
              </span>
            )}
            <span className="rounded-full bg-accent/15 px-1.5 py-0.5 font-mono text-[10px] uppercase text-accent">
              {pkg.kind === 'local' ? t('plugins.kind.local') : pkg.kind}
            </span>
            {pkg.pinned && (
              <span className="rounded-full bg-overlay-strong px-1.5 py-0.5 text-[10px] text-cream-faint">
                {t('plugins.pinned')}
              </span>
            )}
          </div>
          {pkg.description && (
            <div className="mt-1 text-xs leading-5 text-cream-dim">{pkg.description}</div>
          )}
          {pkg.resources.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {pkg.resources.map((res, i) => {
                const Icon = RESOURCE_ICONS[res.type]
                return (
                  <span
                    key={`${res.type}-${res.name}-${i}`}
                    className="flex items-center gap-1 rounded-md bg-overlay px-1.5 py-0.5 text-[10.5px] text-cream-dim"
                  >
                    <Icon size={10} className="text-cream-faint" />
                    {t(`plugins.resource.${res.type}`)} · {res.name}
                  </span>
                )
              })}
            </div>
          )}
          {pkg.path && (
            <div className="mt-2 truncate font-mono text-[10.5px] text-cream-faint">{pkg.path}</div>
          )}
        </div>

        {/* Enable switch */}
        <button
          role="switch"
          aria-checked={pkg.enabled}
          onClick={onToggle}
          disabled={pending !== null}
          title={pkg.enabled ? t('plugins.enabled') : t('plugins.disabled')}
          className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition disabled:opacity-50 ${
            pkg.enabled ? 'bg-accent' : 'bg-overlay-strong'
          }`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
              pkg.enabled ? 'left-[18px]' : 'left-0.5'
            }`}
          />
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
        {updatable && (
          <button
            onClick={onUpdate}
            disabled={pending !== null}
            className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs text-cream-dim transition hover:border-ink-600 hover:text-cream disabled:opacity-50"
          >
            <ArrowUpCircle size={11} />
            {updating ? t('plugins.updating') : t('plugins.update')}
          </button>
        )}
        <button
          onClick={onRemove}
          disabled={pending !== null}
          className={`ml-auto flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition disabled:opacity-50 ${
            confirmRemove
              ? 'border-red-500/50 bg-red-500/10 font-medium text-red-600 dark:text-red-300'
              : 'border-line text-cream-dim hover:border-red-500/40 hover:text-red-500'
          }`}
        >
          <Trash2 size={11} />
          {removing
            ? t('plugins.removing')
            : confirmRemove
              ? t('plugins.uninstallConfirm')
              : t('plugins.uninstall')}
        </button>
      </div>
    </div>
  )
}
