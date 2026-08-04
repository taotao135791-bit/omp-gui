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
  Info,
  GripVertical,
  PackageOpen
} from 'lucide-react'
import { PackageInfo, PackageResource } from '@shared/types'
import { useAppStore } from '../store'
import { useT } from '../i18n'

type PendingAction =
  | { kind: 'install' }
  | { kind: 'remove' | 'update' | 'toggle'; source: string }
  | null

type DropZone = 'chassis' | 'rack' | 'trash'

const PKG_DRAG_TYPE = 'application/x-omp-package'

const RESOURCE_ICONS: Record<PackageResource['type'], typeof Wrench> = {
  extension: Wrench,
  skill: Sparkles,
  prompt: MessageSquareText,
  theme: Palette
}

function hasPackageDrag(e: React.DragEvent): boolean {
  return e.dataTransfer.types.includes(PKG_DRAG_TYPE)
}

function hasFileDrag(e: React.DragEvent | DragEvent): boolean {
  return e.dataTransfer?.types.includes('Files') ?? false
}

export default function PackagesPage() {
  const { packages, setPackages, updatePackageEnabled } = useAppStore()
  const t = useT()
  const [source, setSource] = useState('')
  const [pending, setPending] = useState<PendingAction>(null)
  const [log, setLog] = useState<{ ok: boolean; text: string } | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const [dragSource, setDragSource] = useState<string | null>(null)
  const [overZone, setOverZone] = useState<DropZone | null>(null)
  const [fileDrag, setFileDrag] = useState(false)
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fileDragDepth = useRef(0)

  const mounted = packages.filter((p) => p.enabled)
  const parts = packages.filter((p) => !p.enabled)

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
    await run({ kind: 'remove', source: pkg.source }, () =>
      window.electronAPI.removePackage(pkg.source)
    )
  }

  const handleRemoveClick = async (pkg: PackageInfo) => {
    if (confirmRemove !== pkg.source) {
      setConfirmRemove(pkg.source)
      if (confirmTimer.current) clearTimeout(confirmTimer.current)
      confirmTimer.current = setTimeout(() => setConfirmRemove(null), 3000)
      return
    }
    setConfirmRemove(null)
    if (confirmTimer.current) clearTimeout(confirmTimer.current)
    await handleRemove(pkg)
  }

  const handleUpdate = async (pkg: PackageInfo) => {
    await run({ kind: 'update', source: pkg.source }, () =>
      window.electronAPI.updatePackage(pkg.source)
    )
  }

  const handleToggle = async (pkg: PackageInfo, next: boolean) => {
    if (pending || pkg.enabled === next) return
    updatePackageEnabled(pkg.source, next)
    const result = await window.electronAPI.setPackageEnabled(pkg.source, next)
    if (!result.ok) {
      updatePackageEnabled(pkg.source, !next)
      setLog({ ok: false, text: result.log })
    }
  }

  const installDroppedFiles = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      const filePath = window.electronAPI.getPathForFile(file)
      if (filePath) {
        // eslint-disable-next-line no-await-in-loop
        await handleInstall(filePath)
      }
    }
  }

  // Finder file drags get a full-window overlay; card drags use the zones.
  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      if (!hasFileDrag(e)) return
      e.preventDefault()
      fileDragDepth.current += 1
      setFileDrag(true)
    }
    const onDragOver = (e: DragEvent) => {
      if (hasFileDrag(e)) e.preventDefault()
    }
    const onDragLeave = (e: DragEvent) => {
      if (!hasFileDrag(e)) return
      fileDragDepth.current = Math.max(0, fileDragDepth.current - 1)
      if (fileDragDepth.current === 0) setFileDrag(false)
    }
    const onDrop = (e: DragEvent) => {
      if (!hasFileDrag(e)) return
      e.preventDefault()
      fileDragDepth.current = 0
      setFileDrag(false)
      if (e.dataTransfer?.files.length) installDroppedFiles(e.dataTransfer.files)
    }
    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending])

  const zoneDropProps = (zone: DropZone) => ({
    onDragOver: (e: React.DragEvent) => {
      if (pending || !hasPackageDrag(e)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = zone === 'trash' ? 'move' : 'move'
      setOverZone(zone)
    },
    onDragLeave: () => {
      setOverZone((current) => (current === zone ? null : current))
    },
    onDrop: (e: React.DragEvent) => {
      setOverZone(null)
      setDragSource(null)
      if (pending || !hasPackageDrag(e)) return
      e.preventDefault()
      const dragged = e.dataTransfer.getData(PKG_DRAG_TYPE)
      const pkg = packages.find((p) => p.source === dragged)
      if (!pkg) return
      if (zone === 'chassis') handleToggle(pkg, true)
      else if (zone === 'rack') handleToggle(pkg, false)
      else handleRemove(pkg)
    }
  })

  const zoneClass = (zone: DropZone, base: string) =>
    `${base} transition ${
      overZone === zone
        ? zone === 'trash'
          ? 'border-red-500/60 bg-red-500/10'
          : 'border-accent bg-accent/5'
        : ''
    }`

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
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

      <div className="flex-1 overflow-y-auto p-5 pb-20">
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
                {pending?.kind === 'install' ? t('plugins.installing') : t('plugins.install')}
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

          {/* How to assemble */}
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

          {/* Chassis — mounted parts */}
          <section
            {...zoneDropProps('chassis')}
            className={zoneClass(
              'chassis',
              'rounded-xl border border-dashed border-line bg-ink-850/60 p-4'
            )}
          >
            <div className="mb-3 flex items-center gap-2.5">
              <div className="brand-mark flex h-7 w-7 items-center justify-center rounded-lg text-[13px] font-bold">
                π
              </div>
              <span className="text-[13px] font-semibold text-cream">{t('plugins.core')}</span>
              <span className="rounded-full bg-accent/15 px-2 py-0.5 font-mono text-[10px] text-accent">
                {t('plugins.mounted', { count: mounted.length })}
              </span>
            </div>
            {mounted.length === 0 ? (
              <div className="flex flex-col items-center gap-1.5 py-6 text-center">
                <PackageOpen size={18} className="text-cream-faint" />
                <span className="text-xs text-cream-dim">
                  {packages.length === 0 ? t('plugins.empty') : t('plugins.emptyMounted')}
                </span>
                {packages.length === 0 && (
                  <span className="text-[11px] text-cream-faint">{t('plugins.emptyHint')}</span>
                )}
              </div>
            ) : (
              <div className="grid gap-2.5">
                {mounted.map((pkg) => (
                  <PartCard
                    key={pkg.source}
                    pkg={pkg}
                    pending={pending}
                    confirmRemove={confirmRemove === pkg.source}
                    onDragStateChange={setDragSource}
                    onUpdate={() => handleUpdate(pkg)}
                    onRemove={() => handleRemoveClick(pkg)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Rack — detached parts */}
          <section
            {...zoneDropProps('rack')}
            className={zoneClass('rack', 'rounded-xl border border-dashed border-line p-4')}
          >
            <div className="mb-3 flex items-center gap-2 px-1">
              <span className="text-[11px] font-medium uppercase tracking-wider text-cream-faint">
                {t('plugins.rack')}
              </span>
              <span className="rounded-full bg-overlay-strong px-2 py-0.5 font-mono text-[10px] text-cream-dim">
                {parts.length}
              </span>
            </div>
            {parts.length === 0 ? (
              <div className="py-4 text-center text-xs text-cream-faint">
                {t('plugins.emptyParts')}
              </div>
            ) : (
              <div className="grid gap-2.5">
                {parts.map((pkg) => (
                  <PartCard
                    key={pkg.source}
                    pkg={pkg}
                    pending={pending}
                    confirmRemove={confirmRemove === pkg.source}
                    onDragStateChange={setDragSource}
                    onUpdate={() => handleUpdate(pkg)}
                    onRemove={() => handleRemoveClick(pkg)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Uninstall drop zone — appears while dragging a part */}
      {dragSource !== null && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-5">
          <div
            {...zoneDropProps('trash')}
            className={zoneClass(
              'trash',
              'pointer-events-auto flex items-center gap-2 rounded-xl border border-dashed border-red-500/40 bg-ink-850 px-6 py-3 text-xs font-medium text-red-600 dark:text-red-300'
            )}
          >
            <Trash2 size={14} />
            {t('plugins.trashZone')}
          </div>
        </div>
      )}

      {/* Finder file drop overlay */}
      {fileDrag && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-ink-950/40 backdrop-blur-sm">
          <div className="flex items-center gap-2.5 rounded-xl border-2 border-dashed border-accent bg-ink-850 px-8 py-5 text-sm font-medium text-accent">
            <PackageOpen size={18} />
            {t('plugins.dropToInstall')}
          </div>
        </div>
      )}
    </div>
  )
}

function PartCard({
  pkg,
  pending,
  confirmRemove,
  onDragStateChange,
  onUpdate,
  onRemove
}: {
  pkg: PackageInfo
  pending: PendingAction
  confirmRemove: boolean
  onDragStateChange: (source: string | null) => void
  onUpdate: () => void
  onRemove: () => void
}) {
  const t = useT()
  const busy = pending !== null && 'source' in pending && pending.source === pkg.source
  const removing = busy && pending?.kind === 'remove'
  const updating = busy && pending?.kind === 'update'
  const updatable = pkg.kind !== 'local' && !pkg.pinned
  const [dragging, setDragging] = useState(false)

  return (
    <div
      draggable={pending === null}
      onDragStart={(e) => {
        e.dataTransfer.setData(PKG_DRAG_TYPE, pkg.source)
        e.dataTransfer.effectAllowed = 'move'
        setDragging(true)
        onDragStateChange(pkg.source)
      }}
      onDragEnd={() => {
        setDragging(false)
        onDragStateChange(null)
      }}
      className={`group rounded-lg border bg-ink-850 p-3.5 transition ${
        dragging ? 'border-accent/50 opacity-50' : 'border-line hover:border-ink-600'
      } ${pkg.enabled ? '' : 'opacity-70'}`}
    >
      <div className="flex items-start gap-2.5">
        <GripVertical
          size={14}
          className="mt-0.5 shrink-0 cursor-grab text-cream-faint transition group-hover:text-cream-dim active:cursor-grabbing"
        />
        <div className="min-w-0 flex-1">
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
            <div className="mt-1 line-clamp-2 text-xs leading-5 text-cream-dim">
              {pkg.description}
            </div>
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
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {updatable && (
            <button
              onClick={onUpdate}
              disabled={pending !== null}
              title={updating ? t('plugins.updating') : t('plugins.update')}
              className="rounded-md border border-line p-1.5 text-cream-dim transition hover:border-ink-600 hover:text-cream disabled:opacity-50"
            >
              <ArrowUpCircle size={13} />
            </button>
          )}
          <button
            onClick={onRemove}
            disabled={pending !== null}
            title={
              removing
                ? t('plugins.removing')
                : confirmRemove
                  ? t('plugins.uninstallConfirm')
                  : t('plugins.uninstall')
            }
            className={`rounded-md border p-1.5 transition disabled:opacity-50 ${
              confirmRemove
                ? 'border-red-500/50 bg-red-500/10 text-red-600 dark:text-red-300'
                : 'border-line text-cream-dim hover:border-red-500/40 hover:text-red-500'
            }`}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}
