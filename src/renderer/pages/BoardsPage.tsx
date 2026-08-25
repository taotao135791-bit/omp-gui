import { useEffect, useMemo, useRef, useState } from 'react'
import GridLayout, { Layout, WidthProvider } from 'react-grid-layout'
import {
  ChartBar,
  ChartLine,
  Check,
  Clock,
  Database,
  FileSpreadsheet,
  FileUp,
  Gauge,
  Hash,
  LayoutGrid,
  Link2,
  ListTodo,
  Maximize,
  Minimize,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Settings2,
  Sparkles,
  SquareKanban,
  StickyNote,
  Trash2,
  X,
  type LucideIcon
} from 'lucide-react'
import { BoardDataset, BoardWidget, KanbanBoard, WidgetType } from '@shared/types'
import {
  BOARD_LIMITS,
  GRID_COLS,
  WIDGET_DEFAULT_SIZES,
  compactWidgets,
  composeBoard,
  createBoard,
  createWidget,
  findFreeSlot,
  reflowWidgets,
  type BoardPresetId
} from '@shared/boards'
import { DatasetImportError } from '@shared/datasets'
import { useT, I18nKey } from '../i18n'
import { WidgetBody } from './boards/WidgetBody'
import { WidgetConfigPanel } from './boards/WidgetConfigPanel'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'

/**
 * Widget-grid boards page. Local-first: every committed mutation is
 * persisted immediately as a whole-board upsert (boards are small; drag and
 * resize hover never save — only dragStop/resizeStop do). Widgets are always
 * draggable/resizable. The bottom capsule toolbar mirrors the reference
 * recording: describe-a-board, add widget, tidy, refresh, fullscreen, more.
 */

const Grid = WidthProvider(GridLayout)

const WIDGET_GALLERY: { type: WidgetType; Icon: LucideIcon }[] = [
  { type: 'clock', Icon: Clock },
  { type: 'note', Icon: StickyNote },
  { type: 'counter', Icon: Hash },
  { type: 'gauge', Icon: Gauge },
  { type: 'chart-line', Icon: ChartLine },
  { type: 'chart-bar', Icon: ChartBar },
  { type: 'todo', Icon: ListTodo },
  { type: 'link', Icon: Link2 }
]

/** Types that get their config panel opened right after being added. */
const CONFIG_ON_ADD: readonly WidgetType[] = ['note', 'counter', 'gauge', 'chart-line', 'chart-bar', 'link']

function widgetNameKey(type: WidgetType): I18nKey {
  return `boards.widget.${type}` as I18nKey
}

/** Stable dataset-import error codes → i18n (see shared/datasets.ts). */
const DATASET_ERROR_KEYS: Record<DatasetImportError, I18nKey> = {
  'invalid-path': 'boards.datasets.error.invalidPath',
  'unsupported-type': 'boards.datasets.error.unsupportedType',
  'file-too-large': 'boards.datasets.error.tooLarge',
  'read-failed': 'boards.datasets.error.readFailed',
  'parse-failed': 'boards.datasets.error.parseFailed',
  empty: 'boards.datasets.error.empty',
  'dataset-limit': 'boards.datasets.error.limit',
  'write-failed': 'boards.datasets.error.writeFailed'
}

function hasFileDrag(e: DragEvent): boolean {
  return e.dataTransfer?.types.includes('Files') ?? false
}

function ToolButton({
  title,
  active,
  onClick,
  children
}: {
  title: string
  active?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex h-8 w-8 items-center justify-center rounded-full transition ${
        active ? 'bg-cream text-ink-950' : 'text-cream-dim hover:bg-overlay hover:text-cream'
      }`}
    >
      {children}
    </button>
  )
}

export default function BoardsPage() {
  const t = useT()
  const [boards, setBoards] = useState<KanbanBoard[] | null>(null)
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newBoardName, setNewBoardName] = useState('')
  const [composeOpen, setComposeOpen] = useState(false)
  const [composeText, setComposeText] = useState('')
  const [boardMenuOpen, setBoardMenuOpen] = useState(false)
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailName, setDetailName] = useState('')
  const [detailDesc, setDetailDesc] = useState('')
  const [configWidgetId, setConfigWidgetId] = useState<string | null>(null)
  const [confirmDeleteBoard, setConfirmDeleteBoard] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const [datasets, setDatasets] = useState<BoardDataset[]>([])
  const [datasetsOpen, setDatasetsOpen] = useState(false)
  const [fileDrag, setFileDrag] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [confirmDeleteDatasetId, setConfirmDeleteDatasetId] = useState<string | null>(null)
  const boardAreaRef = useRef<HTMLDivElement>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const confirmDeleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const confirmClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const confirmDatasetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveFailedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fileDragDepth = useRef(0)

  const current = boards?.find((b) => b.id === currentId) ?? null

  useEffect(() => {
    let alive = true
    window.electronAPI.listBoards().then((list) => {
      if (!alive) return
      setBoards(list)
      setCurrentId((id) => (id && list.some((b) => b.id === id) ? id : (list[0]?.id ?? null)))
    })
    window.electronAPI.listBoardDatasets().then((list) => {
      if (alive) setDatasets(list)
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement !== null)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current)
      if (confirmDeleteTimer.current) clearTimeout(confirmDeleteTimer.current)
      if (confirmClearTimer.current) clearTimeout(confirmClearTimer.current)
      if (confirmDatasetTimer.current) clearTimeout(confirmDatasetTimer.current)
      if (saveFailedTimer.current) clearTimeout(saveFailedTimer.current)
    }
  }, [])

  const flashSaveFailed = () => {
    setSaveFailed(true)
    if (saveFailedTimer.current) clearTimeout(saveFailedTimer.current)
    saveFailedTimer.current = setTimeout(() => setSaveFailed(false), 3000)
  }

  const flashToast = (text: string, ok = true) => {
    setToast({ ok, text })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2500)
  }

  const persist = (board: KanbanBoard) => {
    void window.electronAPI.saveBoard(board).then((result) => {
      if (!result.ok) flashSaveFailed()
    })
  }

  /** Apply a pure mutation to one board, update state and persist the whole board. */
  const mutateBoard = (boardId: string, fn: (board: KanbanBoard) => KanbanBoard) => {
    const board = boards?.find((b) => b.id === boardId)
    if (!board) return
    const next = { ...fn(board), updatedAt: Date.now() }
    setBoards((prev) => (prev ?? []).map((b) => (b.id === boardId ? next : b)))
    persist(next)
  }

  const closeMenus = () => {
    setBoardMenuOpen(false)
    setToolsMenuOpen(false)
    setGalleryOpen(false)
    setConfirmDeleteBoard(false)
    setConfirmClear(false)
  }

  const switchBoard = (id: string) => {
    closeMenus()
    setConfigWidgetId(null)
    setCurrentId(id)
  }

  // ------------------------------------------------------------------ boards

  const commitCreate = () => {
    const name = newBoardName.trim()
    setCreating(false)
    setNewBoardName('')
    if (!name) return
    const board = createBoard(name)
    setBoards((prev) => [...(prev ?? []), board])
    setCurrentId(board.id)
    persist(board)
  }

  /** Describe-a-board submit: deterministic local preset, added as a new board. */
  const handleCompose = (preset?: BoardPresetId) => {
    const composed = composeBoard(composeText.trim(), (key) => t(key as I18nKey), preset)
    const board = { ...createBoard(composed.name), widgets: composed.widgets }
    setComposeOpen(false)
    setComposeText('')
    setBoards((prev) => [...(prev ?? []), board])
    setCurrentId(board.id)
    persist(board)
  }

  const openDetail = () => {
    if (!current) return
    setDetailName(current.name)
    setDetailDesc(current.description ?? '')
    setBoardMenuOpen(false)
    setDetailOpen(true)
  }

  const saveDetail = () => {
    const name = detailName.trim()
    if (!name || !current) return
    const description = detailDesc.trim()
    mutateBoard(current.id, (b) => ({ ...b, name, description: description || undefined }))
    setDetailOpen(false)
  }

  // Two-stage confirm, same pattern as the old page / PackagesPage.
  const handleDeleteBoard = async () => {
    if (!current) return
    if (!confirmDeleteBoard) {
      setConfirmDeleteBoard(true)
      if (confirmDeleteTimer.current) clearTimeout(confirmDeleteTimer.current)
      confirmDeleteTimer.current = setTimeout(() => setConfirmDeleteBoard(false), 3000)
      return
    }
    setConfirmDeleteBoard(false)
    if (confirmDeleteTimer.current) clearTimeout(confirmDeleteTimer.current)
    setBoardMenuOpen(false)
    const id = current.id
    const result = await window.electronAPI.deleteBoard(id)
    if (!result.ok) {
      flashSaveFailed()
      return
    }
    const next = (boards ?? []).filter((b) => b.id !== id)
    setBoards(next)
    setCurrentId(next[0]?.id ?? null)
  }

  // ----------------------------------------------------------------- widgets

  const addWidget = (type: WidgetType) => {
    if (!current) return
    const size = WIDGET_DEFAULT_SIZES[type]
    const widget = createWidget(type, t(widgetNameKey(type)), findFreeSlot(current.widgets, size.w, size.h))
    setGalleryOpen(false)
    mutateBoard(current.id, (b) => ({ ...b, widgets: [...b.widgets, widget] }))
    if (CONFIG_ON_ADD.includes(type)) setConfigWidgetId(widget.id)
  }

  const removeWidget = (widgetId: string) => {
    if (!currentId) return
    setConfigWidgetId((id) => (id === widgetId ? null : id))
    mutateBoard(currentId, (b) => ({ ...b, widgets: b.widgets.filter((w) => w.id !== widgetId) }))
  }

  const updateWidgetConfig = (widgetId: string, config: Record<string, unknown>) => {
    if (!currentId) return
    mutateBoard(currentId, (b) => ({
      ...b,
      widgets: b.widgets.map((w) => (w.id === widgetId ? { ...w, config } : w))
    }))
  }

  const saveWidgetConfig = (
    widgetId: string,
    patch: { title: string; config: Record<string, unknown> }
  ) => {
    if (!currentId) return
    setConfigWidgetId(null)
    mutateBoard(currentId, (b) => ({
      ...b,
      widgets: b.widgets.map((w) =>
        w.id === widgetId ? { ...w, title: patch.title, config: patch.config } : w
      )
    }))
  }

  /** RGL fires this with the full layout on drag/resize stop; persist only real changes. */
  const handleLayoutStop = (layout: Layout[]) => {
    if (!current) return
    const byId = new Map(layout.map((l) => [l.i, l]))
    let changed = false
    const widgets = current.widgets.map((w) => {
      const l = byId.get(w.id)
      if (!l) return w
      if (l.x === w.layout.x && l.y === w.layout.y && l.w === w.layout.w && l.h === w.layout.h) {
        return w
      }
      changed = true
      return { ...w, layout: { x: l.x, y: l.y, w: l.w, h: l.h } }
    })
    if (!changed) return
    const next = { ...current, widgets, updatedAt: Date.now() }
    setBoards((prev) => (prev ?? []).map((b) => (b.id === next.id ? next : b)))
    persist(next)
  }

  // ----------------------------------------------------------------- toolbar

  const handleTidy = () => {
    if (!current) return
    mutateBoard(current.id, (b) => ({ ...b, widgets: compactWidgets(b.widgets) }))
    flashToast(t('boards.tidied'))
  }

  const handleRefresh = () => {
    setRefreshTick((n) => n + 1)
    flashToast(t('boards.refreshed'))
  }

  const handleResetLayout = () => {
    if (!current) return
    setToolsMenuOpen(false)
    mutateBoard(current.id, (b) => ({ ...b, widgets: reflowWidgets(b.widgets) }))
  }

  const handleClearWidgets = () => {
    if (!current) return
    if (!confirmClear) {
      setConfirmClear(true)
      if (confirmClearTimer.current) clearTimeout(confirmClearTimer.current)
      confirmClearTimer.current = setTimeout(() => setConfirmClear(false), 3000)
      return
    }
    setConfirmClear(false)
    if (confirmClearTimer.current) clearTimeout(confirmClearTimer.current)
    setToolsMenuOpen(false)
    setConfigWidgetId(null)
    mutateBoard(current.id, (b) => ({ ...b, widgets: [] }))
  }

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void boardAreaRef.current?.requestFullscreen()
  }

  // ---------------------------------------------------------------- datasets

  const refreshDatasets = async () => {
    setDatasets(await window.electronAPI.listBoardDatasets())
  }

  /** Import one picked/dropped file; the result toast names the outcome. */
  const importDatasetFile = async (filePath: string) => {
    const result = await window.electronAPI.importBoardDataset(filePath)
    if (result.ok) {
      await refreshDatasets()
      const rows = result.dataset.rows.length
      const cols = result.dataset.columns.length
      flashToast(
        t('boards.datasets.imported', { name: result.dataset.name, rows, cols }) +
          (result.truncated ? t('boards.datasets.truncatedNote') : '')
      )
    } else {
      flashToast(t(DATASET_ERROR_KEYS[result.error] ?? 'boards.datasets.error.parseFailed'), false)
    }
  }

  const handleImportPick = async () => {
    setToolsMenuOpen(false)
    const picked = await window.electronAPI.selectFile([
      { name: 'CSV / Excel', extensions: ['csv', 'xlsx', 'xls'] }
    ])
    if (picked) await importDatasetFile(picked)
  }

  // Finder file drags get a full-page overlay (same pattern as PackagesPage).
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
      const files = e.dataTransfer?.files
      if (!files?.length) return
      void (async () => {
        for (const file of Array.from(files)) {
          const filePath = window.electronAPI.getPathForFile(file)
          // eslint-disable-next-line no-await-in-loop
          if (filePath) await importDatasetFile(filePath)
        }
      })()
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
  }, [])

  const openDatasetsPanel = () => {
    setToolsMenuOpen(false)
    setRenamingId(null)
    setConfirmDeleteDatasetId(null)
    setDatasetsOpen(true)
  }

  const commitRenameDataset = async () => {
    const id = renamingId
    const name = renameDraft.trim()
    setRenamingId(null)
    if (!id || !name) return
    const result = await window.electronAPI.renameBoardDataset(id, name)
    if (!result.ok) {
      flashToast(t('boards.datasets.renameFailed'), false)
      return
    }
    await refreshDatasets()
  }

  // Two-stage confirm, same as board/widget deletes.
  const handleDeleteDataset = async (id: string) => {
    if (confirmDeleteDatasetId !== id) {
      setConfirmDeleteDatasetId(id)
      if (confirmDatasetTimer.current) clearTimeout(confirmDatasetTimer.current)
      confirmDatasetTimer.current = setTimeout(() => setConfirmDeleteDatasetId(null), 3000)
      return
    }
    setConfirmDeleteDatasetId(null)
    if (confirmDatasetTimer.current) clearTimeout(confirmDatasetTimer.current)
    const result = await window.electronAPI.deleteBoardDataset(id)
    if (!result.ok) {
      flashToast(t('boards.datasets.deleteFailed'), false)
      return
    }
    await refreshDatasets()
  }

  // ------------------------------------------------------------------ render

  const gridLayout: Layout[] = useMemo(
    () =>
      (current?.widgets ?? []).map((w) => ({
        i: w.id,
        x: w.layout.x,
        y: w.layout.y,
        w: w.layout.w,
        h: w.layout.h,
        minW: 2,
        minH: 2
      })),
    [current]
  )

  const renderWidget = (widget: BoardWidget) => (
    <div
      key={widget.id}
      className="group/widget relative flex flex-col overflow-hidden rounded-[16px] border border-line bg-ink-850 shadow-card"
    >
      <div className="flex shrink-0 items-center gap-1 px-3 pb-0.5 pt-2">
        <span className="min-w-0 flex-1 truncate text-[10px] font-semibold uppercase tracking-[0.1em] text-cream-faint">
          {widget.title || t(widgetNameKey(widget.type))}
        </span>
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover/widget:opacity-100">
          <button
            onClick={() => setConfigWidgetId(widget.id)}
            title={t('boards.widgetSettings')}
            className="rounded-md p-1 text-cream-faint transition hover:bg-overlay hover:text-cream"
          >
            <Settings2 size={11} />
          </button>
          <button
            onClick={() => removeWidget(widget.id)}
            title={t('boards.deleteWidget')}
            className="rounded-md p-1 text-cream-faint transition hover:bg-red-500/15 hover:text-red-500"
          >
            <X size={11} />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 px-3 pb-2.5 pt-0.5">
        <WidgetBody
          key={`${widget.id}:${refreshTick}`}
          widget={widget}
          datasets={datasets}
          onConfigChange={(config) => updateWidgetConfig(widget.id, config)}
        />
      </div>
      {configWidgetId === widget.id && (
        <WidgetConfigPanel
          key={widget.id}
          widget={widget}
          datasets={datasets}
          onClose={() => setConfigWidgetId(null)}
          onSave={(patch) => saveWidgetConfig(widget.id, patch)}
        />
      )}
    </div>
  )

  const menuItemClass =
    'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] transition'

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <header className="app-drag relative z-30 flex h-12 shrink-0 items-center gap-2 border-b border-line px-4">
        <SquareKanban size={15} className="shrink-0 text-accent" />
        <span className="shrink-0 text-[13px] font-medium text-cream">{t('boards.title')}</span>
        <div className="app-no-drag ml-1 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {(boards ?? []).map((b) => (
            <button
              key={b.id}
              onClick={() => switchBoard(b.id)}
              className={`flex max-w-[160px] shrink-0 items-center rounded-full border px-3 py-1 text-[12px] transition ${
                b.id === currentId
                  ? 'border-line bg-ink-850 text-cream shadow-card'
                  : 'border-transparent text-cream-faint hover:bg-overlay hover:text-cream-dim'
              }`}
            >
              <span className="truncate">{b.name}</span>
            </button>
          ))}
          {creating ? (
            <input
              autoFocus
              value={newBoardName}
              onChange={(e) => setNewBoardName(e.target.value)}
              onBlur={commitCreate}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitCreate()
                if (e.key === 'Escape') {
                  setCreating(false)
                  setNewBoardName('')
                }
              }}
              maxLength={BOARD_LIMITS.maxNameLength}
              placeholder={t('boards.newBoardPlaceholder')}
              className="w-32 shrink-0 rounded-full border border-line bg-ink-850 px-3 py-1 text-[12px] text-cream outline-none transition placeholder:text-cream-faint focus:border-accent/50"
            />
          ) : (
            <button
              onClick={() => setCreating(true)}
              title={t('boards.newTab')}
              className="shrink-0 rounded-full p-1.5 text-cream-faint transition hover:bg-overlay hover:text-cream"
            >
              <Plus size={13} />
            </button>
          )}
        </div>
        {saveFailed && (
          <span className="shrink-0 text-[11px] text-red-500">{t('boards.saveFailed')}</span>
        )}
        {current && (
          <div className="app-no-drag relative shrink-0">
            <button
              onClick={() => {
                closeMenus()
                setBoardMenuOpen(!boardMenuOpen)
              }}
              title={t('boards.boardMenu')}
              className="rounded-md p-1.5 text-cream-faint transition hover:bg-overlay hover:text-cream"
            >
              <MoreHorizontal size={14} />
            </button>
            {boardMenuOpen && (
              <div className="absolute right-0 top-9 z-30 w-44 rounded-xl border border-line bg-ink-900 p-1 shadow-pop">
                <button
                  onClick={openDetail}
                  className={`${menuItemClass} text-cream-dim hover:bg-overlay hover:text-cream`}
                >
                  <Pencil size={12} />
                  {t('boards.editDetail')}
                </button>
                <button
                  onClick={() => void handleDeleteBoard()}
                  className={`${menuItemClass} ${
                    confirmDeleteBoard
                      ? 'bg-red-500/15 text-red-500'
                      : 'text-red-500/80 hover:bg-red-500/10 hover:text-red-500'
                  }`}
                >
                  <Trash2 size={12} />
                  {confirmDeleteBoard ? t('boards.deleteBoardConfirm') : t('boards.deleteBoard')}
                </button>
              </div>
            )}
          </div>
        )}
      </header>

      <div ref={boardAreaRef} className="relative flex-1 overflow-hidden bg-ink-950">
        <div className="h-full overflow-y-auto">
          {boards === null ? (
            <div className="flex h-full items-center justify-center text-sm text-cream-faint">
              {t('app.loading')}
            </div>
          ) : !current ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <SquareKanban size={28} className="text-cream-faint" />
              <div className="text-sm text-cream-dim">{t('boards.empty')}</div>
              <div className="text-xs text-cream-faint">{t('boards.emptyHint')}</div>
              <button
                onClick={() => setCreating(true)}
                className="mt-1 flex items-center gap-1.5 rounded-full bg-cream px-4 py-2 text-[12px] font-medium text-ink-950 transition hover:opacity-90"
              >
                <Plus size={12} />
                {t('boards.newTab')}
              </button>
            </div>
          ) : (
            <div className="px-4 pb-24 pt-4">
              <Grid
                className="layout"
                layout={gridLayout}
                cols={GRID_COLS}
                rowHeight={48}
                margin={[12, 12]}
                compactType="vertical"
                isDraggable
                isResizable
                draggableCancel="input, textarea, select, a, button, .widget-config"
                onDragStop={handleLayoutStop}
                onResizeStop={handleLayoutStop}
              >
                {current.widgets.map(renderWidget)}
              </Grid>
              {current.widgets.length === 0 && (
                <div className="flex h-[55vh] flex-col items-center justify-center gap-3 text-center">
                  <LayoutGrid size={26} className="text-cream-faint" />
                  <div className="text-sm text-cream-dim">{t('boards.noWidgets')}</div>
                  <button
                    onClick={() => setGalleryOpen(true)}
                    className="mt-1 flex items-center gap-1.5 rounded-full bg-cream px-4 py-2 text-[12px] font-medium text-ink-950 transition hover:opacity-90"
                  >
                    <Plus size={12} />
                    {t('boards.addWidget')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {toast && (
          <div className="fade-in absolute left-1/2 top-3 z-40 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-line bg-ink-900 px-3 py-1.5 shadow-pop">
            {toast.ok ? (
              <Check size={12} className="shrink-0 text-green-500" />
            ) : (
              <X size={12} className="shrink-0 text-red-500" />
            )}
            <span className="text-[12px] text-cream">{toast.text}</span>
          </div>
        )}

        {fileDrag && (
          <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-ink-950/40 backdrop-blur-sm">
            <div className="flex items-center gap-2.5 rounded-xl border-2 border-dashed border-accent bg-ink-850 px-8 py-5 text-sm font-medium text-accent">
              <FileSpreadsheet size={18} />
              {t('boards.datasets.dropHint')}
            </div>
          </div>
        )}

        {current && (
          <div className="absolute bottom-4 left-1/2 z-30 -translate-x-1/2">
            {galleryOpen && (
              <div className="fade-in absolute bottom-full left-1/2 mb-2 w-[300px] -translate-x-1/2 rounded-2xl border border-line bg-ink-900 p-2 shadow-pop">
                <div className="px-1.5 pb-1.5 pt-1 text-[10.5px] font-semibold uppercase tracking-wider text-cream-faint">
                  {t('boards.addWidget')}
                </div>
                <div className="grid grid-cols-2 gap-0.5">
                  {WIDGET_GALLERY.map(({ type, Icon }) => (
                    <button
                      key={type}
                      onClick={() => addWidget(type)}
                      className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-left transition hover:bg-overlay"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                        <Icon size={13} />
                      </span>
                      <span className="truncate text-[12px] text-cream">{t(widgetNameKey(type))}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {toolsMenuOpen && (
              <div className="fade-in absolute bottom-full right-0 mb-2 w-44 rounded-xl border border-line bg-ink-900 p-1 shadow-pop">
                <button
                  onClick={() => void handleImportPick()}
                  className={`${menuItemClass} text-cream-dim hover:bg-overlay hover:text-cream`}
                >
                  <FileUp size={12} />
                  {t('boards.datasets.import')}
                </button>
                <button
                  onClick={openDatasetsPanel}
                  className={`${menuItemClass} text-cream-dim hover:bg-overlay hover:text-cream`}
                >
                  <Database size={12} />
                  {t('boards.datasets.manage')}
                </button>
                <button
                  onClick={handleResetLayout}
                  className={`${menuItemClass} text-cream-dim hover:bg-overlay hover:text-cream`}
                >
                  <LayoutGrid size={12} />
                  {t('boards.resetLayout')}
                </button>
                <button
                  onClick={handleClearWidgets}
                  className={`${menuItemClass} ${
                    confirmClear
                      ? 'bg-red-500/15 text-red-500'
                      : 'text-red-500/80 hover:bg-red-500/10 hover:text-red-500'
                  }`}
                >
                  <Trash2 size={12} />
                  {confirmClear ? t('boards.clearConfirm') : t('boards.clearWidgets')}
                </button>
              </div>
            )}
            <div className="flex items-center gap-0.5 rounded-full border border-line bg-ink-900/95 p-1 shadow-pop backdrop-blur">
              <ToolButton
                title={t('boards.compose.open')}
                onClick={() => {
                  closeMenus()
                  setComposeOpen(true)
                }}
              >
                <Sparkles size={14} />
              </ToolButton>
              <ToolButton
                title={t('boards.addWidget')}
                onClick={() => {
                  setToolsMenuOpen(false)
                  setGalleryOpen(!galleryOpen)
                }}
              >
                <Plus size={15} />
              </ToolButton>
              <ToolButton title={t('boards.tidy')} onClick={handleTidy}>
                <LayoutGrid size={14} />
              </ToolButton>
              <ToolButton title={t('boards.refresh')} onClick={handleRefresh}>
                <RefreshCw size={14} />
              </ToolButton>
              <ToolButton
                title={isFullscreen ? t('boards.exitFullscreen') : t('boards.fullscreen')}
                onClick={toggleFullscreen}
              >
                {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
              </ToolButton>
              <ToolButton
                title={t('boards.more')}
                onClick={() => {
                  setGalleryOpen(false)
                  setConfirmClear(false)
                  setToolsMenuOpen(!toolsMenuOpen)
                }}
              >
                <MoreHorizontal size={14} />
              </ToolButton>
            </div>
          </div>
        )}
      </div>

      {(boardMenuOpen || toolsMenuOpen || galleryOpen) && (
        <div className="fixed inset-0 z-20" onClick={closeMenus} />
      )}

      {datasetsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setDatasetsOpen(false)}
        >
          <div
            className="fade-in w-full max-w-[440px] rounded-2xl border border-line bg-ink-900 p-5 shadow-pop"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <span className="text-[14px] font-semibold text-cream">{t('boards.datasets.title')}</span>
              <button
                onClick={() => setDatasetsOpen(false)}
                title={t('boards.cancel')}
                className="rounded-md p-1 text-cream-faint transition hover:bg-overlay hover:text-cream"
              >
                <X size={14} />
              </button>
            </div>
            <div className="mt-4 max-h-[50vh] space-y-1 overflow-y-auto">
              {datasets.length === 0 && (
                <p className="px-1 py-3 text-[12px] leading-5 text-cream-faint">
                  {t('boards.datasets.empty')}
                </p>
              )}
              {datasets.map((d) => (
                <div
                  key={d.id}
                  className="group/ds flex items-center gap-2 rounded-xl px-2 py-2 transition hover:bg-overlay"
                >
                  <Database size={13} className="shrink-0 text-accent" />
                  {renamingId === d.id ? (
                    <input
                      autoFocus
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onBlur={() => void commitRenameDataset()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void commitRenameDataset()
                        if (e.key === 'Escape') setRenamingId(null)
                      }}
                      maxLength={200}
                      className="min-w-0 flex-1 rounded-md border border-line bg-ink-850 px-1.5 py-0.5 text-[12px] text-cream outline-none focus:border-accent/50"
                    />
                  ) : (
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12.5px] text-cream">{d.name}</div>
                      <div className="text-[10.5px] text-cream-faint">
                        {t('boards.datasets.rowsCols', {
                          rows: d.rows.length,
                          cols: d.columns.length
                        })}
                      </div>
                    </div>
                  )}
                  {renamingId !== d.id && (
                    <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover/ds:opacity-100">
                      <button
                        onClick={() => {
                          setRenamingId(d.id)
                          setRenameDraft(d.name)
                        }}
                        title={t('boards.datasets.rename')}
                        className="rounded-md p-1 text-cream-faint transition hover:bg-overlay hover:text-cream"
                      >
                        <Pencil size={11} />
                      </button>
                      <button
                        onClick={() => void handleDeleteDataset(d.id)}
                        title={
                          confirmDeleteDatasetId === d.id
                            ? t('boards.datasets.deleteConfirm')
                            : t('boards.datasets.delete')
                        }
                        className={`rounded-md p-1 transition ${
                          confirmDeleteDatasetId === d.id
                            ? 'bg-red-500/15 text-red-500'
                            : 'text-cream-faint hover:bg-red-500/15 hover:text-red-500'
                        }`}
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setDatasetsOpen(false)}
                className="rounded-full border border-line px-3 py-1.5 text-[12px] text-cream-dim transition hover:border-ink-600 hover:text-cream"
              >
                {t('boards.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {detailOpen && current && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setDetailOpen(false)}
        >
          <div
            className="fade-in w-full max-w-[400px] rounded-2xl border border-line bg-ink-900 p-5 shadow-pop"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <span className="text-[14px] font-semibold text-cream">{t('boards.detail.title')}</span>
              <button
                onClick={() => setDetailOpen(false)}
                title={t('boards.cancel')}
                className="rounded-md p-1 text-cream-faint transition hover:bg-overlay hover:text-cream"
              >
                <X size={14} />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="mb-1 block text-[11px] text-cream-faint">{t('boards.detail.name')}</span>
                <input
                  autoFocus
                  value={detailName}
                  onChange={(e) => setDetailName(e.target.value)}
                  maxLength={BOARD_LIMITS.maxNameLength}
                  className="w-full rounded-lg border border-line bg-ink-850 px-2.5 py-1.5 text-[12.5px] text-cream outline-none transition placeholder:text-cream-faint focus:border-accent/50"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] text-cream-faint">
                  {t('boards.detail.description')}
                </span>
                <textarea
                  value={detailDesc}
                  onChange={(e) => setDetailDesc(e.target.value)}
                  rows={4}
                  maxLength={BOARD_LIMITS.maxDescriptionLength}
                  placeholder={t('boards.detail.descPlaceholder')}
                  className="w-full resize-none rounded-lg border border-line bg-ink-850 px-2.5 py-1.5 text-[12px] leading-5 text-cream outline-none transition placeholder:text-cream-faint focus:border-accent/50"
                />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setDetailOpen(false)}
                className="rounded-full border border-line px-3 py-1.5 text-[12px] text-cream-dim transition hover:border-ink-600 hover:text-cream"
              >
                {t('boards.cancel')}
              </button>
              <button
                onClick={saveDetail}
                disabled={!detailName.trim()}
                className="flex items-center gap-1 rounded-full bg-cream px-3 py-1.5 text-[12px] font-medium text-ink-950 transition hover:opacity-90 disabled:opacity-40"
              >
                <Check size={11} />
                {t('boards.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {composeOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setComposeOpen(false)}
        >
          <div
            className="fade-in w-full max-w-[400px] rounded-2xl border border-line bg-ink-900 p-5 shadow-pop"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <span className="text-[14px] font-semibold text-cream">{t('boards.compose.title')}</span>
              <button
                onClick={() => setComposeOpen(false)}
                title={t('boards.cancel')}
                className="rounded-md p-1 text-cream-faint transition hover:bg-overlay hover:text-cream"
              >
                <X size={14} />
              </button>
            </div>
            <textarea
              autoFocus
              value={composeText}
              onChange={(e) => setComposeText(e.target.value)}
              rows={4}
              maxLength={BOARD_LIMITS.maxDescriptionLength}
              placeholder={t('boards.compose.placeholder')}
              className="mt-4 w-full resize-none rounded-lg border border-line bg-ink-850 px-2.5 py-1.5 text-[12px] leading-5 text-cream outline-none transition placeholder:text-cream-faint focus:border-accent/50"
            />
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(
                [
                  { preset: 'ads', label: t('boards.preset.ads') },
                  { preset: 'daily', label: t('boards.preset.daily') },
                  { preset: 'blank', label: t('boards.compose.chipBlank') }
                ] as { preset: BoardPresetId; label: string }[]
              ).map((chip) => (
                <button
                  key={chip.preset}
                  onClick={() => handleCompose(chip.preset)}
                  className="rounded-full border border-line px-3 py-1 text-[12px] text-cream-dim transition hover:border-accent/50 hover:text-cream"
                >
                  {chip.label}
                </button>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setComposeOpen(false)}
                className="rounded-full border border-line px-3 py-1.5 text-[12px] text-cream-dim transition hover:border-ink-600 hover:text-cream"
              >
                {t('boards.cancel')}
              </button>
              <button
                onClick={() => handleCompose()}
                className="flex items-center gap-1 rounded-full bg-cream px-3 py-1.5 text-[12px] font-medium text-ink-950 transition hover:opacity-90"
              >
                <Sparkles size={11} />
                {t('boards.compose.generate')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
