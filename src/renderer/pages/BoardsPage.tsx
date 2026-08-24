import { useEffect, useRef, useState } from 'react'
import { SquareKanban, Plus, Trash2, MoreHorizontal, Check } from 'lucide-react'
import { KanbanBoard, KanbanCard, KanbanColumn, KanbanTemplateId } from '@shared/types'
import { BOARD_TEMPLATES, boardCardCount, createBoardFromTemplate } from '@shared/boards'
import { useT, I18nKey } from '../i18n'

/**
 * Kanban boards page. Local-first: every committed mutation is persisted
 * immediately as a whole-board upsert (boards are small; drag-hover never
 * saves — only the drop does).
 */

const CARD_DRAG_TYPE = 'application/x-omp-kanban-card'

function hasCardDrag(e: React.DragEvent): boolean {
  return e.dataTransfer.types.includes(CARD_DRAG_TYPE)
}

/** Template columns store an i18n key as their title; user text passes through. */
function useColumnTitle() {
  const t = useT()
  return (title: string) => (title.startsWith('boards.col.') ? t(title as I18nKey) : title)
}

export default function BoardsPage() {
  const t = useT()
  const columnTitle = useColumnTitle()
  const [boards, setBoards] = useState<KanbanBoard[] | null>(null)
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [confirmDeleteBoardId, setConfirmDeleteBoardId] = useState<string | null>(null)
  const [menuColId, setMenuColId] = useState<string | null>(null)
  const [confirmDeleteColId, setConfirmDeleteColId] = useState<string | null>(null)
  const [renamingColId, setRenamingColId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [addingCardColId, setAddingCardColId] = useState<string | null>(null)
  const [newCardTitle, setNewCardTitle] = useState('')
  const [editingCardId, setEditingCardId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editNote, setEditNote] = useState('')
  const [overColId, setOverColId] = useState<string | null>(null)
  const [saveFailed, setSaveFailed] = useState(false)
  const confirmBoardTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const confirmColTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveFailedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const current = boards?.find((b) => b.id === currentId) ?? null

  useEffect(() => {
    let alive = true
    window.electronAPI.listBoards().then((list) => {
      if (!alive) return
      setBoards(list)
      setCurrentId((id) => (id && list.some((b) => b.id === id) ? id : (list[0]?.id ?? null)))
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    return () => {
      if (confirmBoardTimer.current) clearTimeout(confirmBoardTimer.current)
      if (confirmColTimer.current) clearTimeout(confirmColTimer.current)
      if (saveFailedTimer.current) clearTimeout(saveFailedTimer.current)
    }
  }, [])

  const flashSaveFailed = () => {
    setSaveFailed(true)
    if (saveFailedTimer.current) clearTimeout(saveFailedTimer.current)
    saveFailedTimer.current = setTimeout(() => setSaveFailed(false), 3000)
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

  const handleCreate = (templateId: KanbanTemplateId) => {
    const tpl = BOARD_TEMPLATES.find((x) => x.id === templateId)
    if (!tpl) return
    const board = createBoardFromTemplate(templateId, t(tpl.nameKey as I18nKey))
    setCreating(false)
    setBoards((prev) => [...(prev ?? []), board])
    setCurrentId(board.id)
    persist(board)
  }

  // Two-stage confirm, same pattern as PackagesPage.handleRemoveClick.
  const handleDeleteBoard = async (id: string) => {
    if (confirmDeleteBoardId !== id) {
      setConfirmDeleteBoardId(id)
      if (confirmBoardTimer.current) clearTimeout(confirmBoardTimer.current)
      confirmBoardTimer.current = setTimeout(() => setConfirmDeleteBoardId(null), 3000)
      return
    }
    setConfirmDeleteBoardId(null)
    if (confirmBoardTimer.current) clearTimeout(confirmBoardTimer.current)
    const result = await window.electronAPI.deleteBoard(id)
    if (!result.ok) {
      flashSaveFailed()
      return
    }
    const next = (boards ?? []).filter((b) => b.id !== id)
    setBoards(next)
    if (currentId === id) setCurrentId(next[0]?.id ?? null)
  }

  // ------------------------------------------------------------------ cards

  const addCard = (colId: string) => {
    const title = newCardTitle.trim()
    setNewCardTitle('')
    setAddingCardColId(null)
    if (!title || !currentId) return
    const card: KanbanCard = { id: crypto.randomUUID(), title, createdAt: Date.now() }
    mutateBoard(currentId, (b) => ({
      ...b,
      columns: b.columns.map((c) => (c.id === colId ? { ...c, cards: [...c.cards, card] } : c))
    }))
  }

  const deleteCard = (colId: string, cardId: string) => {
    if (!currentId) return
    mutateBoard(currentId, (b) => ({
      ...b,
      columns: b.columns.map((c) =>
        c.id === colId ? { ...c, cards: c.cards.filter((card) => card.id !== cardId) } : c
      )
    }))
  }

  const startEditCard = (card: KanbanCard) => {
    setEditingCardId(card.id)
    setEditTitle(card.title)
    setEditNote(card.note ?? '')
  }

  const commitEditCard = (colId: string, cardId: string) => {
    const title = editTitle.trim()
    setEditingCardId(null)
    if (!title || !currentId) return
    const note = editNote.trim()
    mutateBoard(currentId, (b) => ({
      ...b,
      columns: b.columns.map((c) =>
        c.id === colId
          ? {
              ...c,
              cards: c.cards.map((card) =>
                card.id === cardId ? { ...card, title, ...(note ? { note } : { note: undefined }) } : card
              )
            }
          : c
      )
    }))
  }

  const moveCard = (fromColId: string, toColId: string, cardId: string) => {
    if (!currentId || fromColId === toColId) return
    mutateBoard(currentId, (b) => {
      const from = b.columns.find((c) => c.id === fromColId)
      const card = from?.cards.find((x) => x.id === cardId)
      if (!from || !card) return b
      return {
        ...b,
        columns: b.columns.map((c) => {
          if (c.id === fromColId) return { ...c, cards: c.cards.filter((x) => x.id !== cardId) }
          if (c.id === toColId) return { ...c, cards: [...c.cards, card] }
          return c
        })
      }
    })
  }

  // ---------------------------------------------------------------- columns

  const addColumn = (afterColId?: string) => {
    if (!currentId) return
    const column: KanbanColumn = { id: crypto.randomUUID(), title: t('boards.newColumn'), cards: [] }
    mutateBoard(currentId, (b) => {
      if (!afterColId) return { ...b, columns: [...b.columns, column] }
      const index = b.columns.findIndex((c) => c.id === afterColId)
      if (index === -1) return { ...b, columns: [...b.columns, column] }
      const columns = [...b.columns]
      columns.splice(index + 1, 0, column)
      return { ...b, columns }
    })
  }

  const commitRenameColumn = (colId: string) => {
    const title = renameValue.trim()
    setRenamingColId(null)
    if (!title || !currentId) return
    mutateBoard(currentId, (b) => ({
      ...b,
      columns: b.columns.map((c) => (c.id === colId ? { ...c, title } : c))
    }))
  }

  const handleDeleteColumn = (colId: string) => {
    // A board must keep at least one column — an empty columns array would
    // be rejected by the main-process validation anyway.
    const board = boards?.find((b) => b.id === currentId)
    if (!board || board.columns.length <= 1) return
    if (confirmDeleteColId !== colId) {
      setConfirmDeleteColId(colId)
      if (confirmColTimer.current) clearTimeout(confirmColTimer.current)
      confirmColTimer.current = setTimeout(() => setConfirmDeleteColId(null), 3000)
      return
    }
    setConfirmDeleteColId(null)
    setMenuColId(null)
    if (confirmColTimer.current) clearTimeout(confirmColTimer.current)
    if (!currentId) return
    mutateBoard(currentId, (b) => ({
      ...b,
      columns: b.columns.filter((c) => c.id !== colId)
    }))
  }

  // ------------------------------------------------------------------ render

  const boardRow = (board: KanbanBoard) => {
    const active = board.id === currentId
    const confirming = confirmDeleteBoardId === board.id
    return (
      <div
        key={board.id}
        onClick={() => setCurrentId(board.id)}
        className={`group flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-[6px] transition-all duration-150 ease-standard ${
          active ? 'border-line bg-ink-850 shadow-card' : 'border-transparent hover:bg-overlay'
        }`}
      >
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] leading-5 text-cream">{board.name}</div>
          <div className="text-[11px] leading-4 text-cream-faint">
            {t('boards.cardCount', { count: boardCardCount(board) })}
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            void handleDeleteBoard(board.id)
          }}
          title={confirming ? t('boards.deleteConfirm') : t('boards.deleteBoard')}
          className={
            confirming
              ? 'shrink-0 rounded-md bg-red-500/15 p-1 text-red-500 transition-all'
              : 'shrink-0 rounded-md p-1 text-cream-faint opacity-0 transition-all hover:bg-red-500/15 hover:text-red-500 group-hover:opacity-100'
          }
        >
          <Trash2 size={12} />
        </button>
      </div>
    )
  }

  const renderCard = (col: KanbanColumn, card: KanbanCard) => {
    if (editingCardId === card.id) {
      return (
        <div key={card.id} className="space-y-2 rounded-xl border border-accent/50 bg-ink-900 p-2.5">
          <input
            autoFocus
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitEditCard(col.id, card.id)
              if (e.key === 'Escape') setEditingCardId(null)
            }}
            placeholder={t('boards.cardTitlePlaceholder')}
            className="w-full rounded-lg border border-line bg-ink-850 px-2.5 py-1.5 text-[12.5px] text-cream outline-none transition-all placeholder:text-cream-faint focus:border-accent/50"
          />
          <textarea
            value={editNote}
            onChange={(e) => setEditNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setEditingCardId(null)
            }}
            placeholder={t('boards.cardNotePlaceholder')}
            rows={3}
            className="w-full resize-none rounded-lg border border-line bg-ink-850 px-2.5 py-1.5 text-[12px] leading-5 text-cream outline-none transition-all placeholder:text-cream-faint focus:border-accent/50"
          />
          <div className="flex justify-end gap-1.5">
            <button
              onClick={() => setEditingCardId(null)}
              className="rounded-full border border-line px-2.5 py-1 text-[11px] text-cream-dim transition hover:border-ink-600 hover:text-cream"
            >
              {t('boards.cancel')}
            </button>
            <button
              onClick={() => commitEditCard(col.id, card.id)}
              disabled={!editTitle.trim()}
              className="flex items-center gap-1 rounded-full bg-cream px-2.5 py-1 text-[11px] font-medium text-ink-950 transition hover:opacity-90 disabled:opacity-40"
            >
              <Check size={10} />
              {t('boards.done')}
            </button>
          </div>
        </div>
      )
    }
    return (
      <div
        key={card.id}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(CARD_DRAG_TYPE, JSON.stringify({ cardId: card.id, fromColId: col.id }))
          e.dataTransfer.effectAllowed = 'move'
        }}
        onClick={() => startEditCard(card)}
        className="group cursor-pointer rounded-xl border border-line bg-ink-900 p-2.5 transition hover:border-ink-600 hover:shadow-card"
      >
        <div className="flex items-start gap-1.5">
          <div className="min-w-0 flex-1 break-words text-[12.5px] leading-5 text-cream">
            {card.title}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation()
              deleteCard(col.id, card.id)
            }}
            title={t('boards.deleteCard')}
            className="shrink-0 rounded-md p-0.5 text-cream-faint opacity-0 transition-all hover:bg-red-500/15 hover:text-red-500 group-hover:opacity-100"
          >
            <Trash2 size={11} />
          </button>
        </div>
        {card.note && (
          <div className="mt-1 line-clamp-2 break-words text-[11px] leading-4 text-cream-faint">
            {card.note}
          </div>
        )}
      </div>
    )
  }

  const renderColumn = (col: KanbanColumn) => (
    <div
      key={col.id}
      onDragOver={(e) => {
        if (!hasCardDrag(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setOverColId(col.id)
      }}
      onDragLeave={() => setOverColId((currentOver) => (currentOver === col.id ? null : currentOver))}
      onDrop={(e) => {
        setOverColId(null)
        if (!hasCardDrag(e)) return
        e.preventDefault()
        try {
          const payload = JSON.parse(e.dataTransfer.getData(CARD_DRAG_TYPE)) as {
            cardId?: unknown
            fromColId?: unknown
          }
          if (typeof payload.cardId === 'string' && typeof payload.fromColId === 'string') {
            moveCard(payload.fromColId, col.id, payload.cardId)
          }
        } catch {
          // Malformed drag payload — ignore.
        }
      }}
      className={`flex max-h-full w-72 shrink-0 flex-col rounded-[16px] border bg-ink-850 shadow-card transition ${
        overColId === col.id ? 'border-accent/60' : 'border-line'
      }`}
    >
      <div className="relative flex items-center gap-1.5 px-3 pt-3">
        {renamingColId === col.id ? (
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={() => commitRenameColumn(col.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRenameColumn(col.id)
              if (e.key === 'Escape') setRenamingColId(null)
            }}
            className="min-w-0 flex-1 rounded-lg border border-line bg-ink-900 px-2 py-1 text-[12.5px] text-cream outline-none focus:border-accent/50"
          />
        ) : (
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-cream">
            {columnTitle(col.title)}
          </span>
        )}
        <span className="rounded-full bg-overlay-strong px-1.5 py-0.5 font-mono text-[10px] text-cream-dim">
          {col.cards.length}
        </span>
        <button
          onClick={() => {
            setMenuColId(menuColId === col.id ? null : col.id)
            setConfirmDeleteColId(null)
          }}
          title={t('boards.columnMenu')}
          className="shrink-0 rounded-md p-1 text-cream-faint transition hover:bg-overlay hover:text-cream"
        >
          <MoreHorizontal size={13} />
        </button>
        {menuColId === col.id && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuColId(null)} />
            <div className="absolute right-2 top-9 z-20 w-44 rounded-xl border border-line bg-ink-900 p-1 shadow-pop">
              <button
                onClick={() => {
                  setMenuColId(null)
                  setRenamingColId(col.id)
                  setRenameValue(columnTitle(col.title))
                }}
                className="flex w-full items-center rounded-lg px-2.5 py-1.5 text-left text-[12px] text-cream-dim transition hover:bg-overlay hover:text-cream"
              >
                {t('boards.renameColumn')}
              </button>
              <button
                onClick={() => {
                  setMenuColId(null)
                  addColumn(col.id)
                }}
                className="flex w-full items-center rounded-lg px-2.5 py-1.5 text-left text-[12px] text-cream-dim transition hover:bg-overlay hover:text-cream"
              >
                {t('boards.addColumnRight')}
              </button>
              <button
                onClick={() => handleDeleteColumn(col.id)}
                disabled={current !== null && current.columns.length <= 1}
                className={`flex w-full items-center rounded-lg px-2.5 py-1.5 text-left text-[12px] transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  confirmDeleteColId === col.id
                    ? 'bg-red-500/15 text-red-500'
                    : 'text-red-500/80 hover:bg-red-500/10 hover:text-red-500'
                }`}
              >
                {confirmDeleteColId === col.id ? t('boards.deleteColumnConfirm') : t('boards.deleteColumn')}
              </button>
            </div>
          </>
        )}
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {col.cards.map((card) => renderCard(col, card))}
      </div>
      <div className="px-3 pb-3">
        {addingCardColId === col.id ? (
          <input
            autoFocus
            value={newCardTitle}
            onChange={(e) => setNewCardTitle(e.target.value)}
            onBlur={() => addCard(col.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addCard(col.id)
              if (e.key === 'Escape') {
                setNewCardTitle('')
                setAddingCardColId(null)
              }
            }}
            placeholder={t('boards.cardTitlePlaceholder')}
            className="w-full rounded-lg border border-line bg-ink-900 px-2.5 py-1.5 text-[12.5px] text-cream outline-none transition-all placeholder:text-cream-faint focus:border-accent/50"
          />
        ) : (
          <button
            onClick={() => setAddingCardColId(col.id)}
            className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] text-cream-faint transition hover:bg-overlay hover:text-cream-dim"
          >
            <Plus size={12} />
            {t('boards.addCard')}
          </button>
        )}
      </div>
    </div>
  )

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <header className="app-drag flex h-12 shrink-0 items-center justify-between border-b border-line px-4">
        <div className="flex items-center gap-2.5">
          <SquareKanban size={15} className="text-accent" />
          <span className="text-[13px] font-medium text-cream">{t('boards.title')}</span>
          <span className="text-xs text-cream-faint">{t('boards.subtitle')}</span>
        </div>
        {saveFailed && (
          <span className="text-[11px] text-red-500">{t('boards.saveFailed')}</span>
        )}
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Board list */}
        <aside className="flex w-52 shrink-0 flex-col border-r border-line">
          <div className="flex items-center justify-between px-3.5 pb-2 pt-3.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-cream-faint">
              {t('boards.myBoards')}
            </span>
            <button
              onClick={() => setCreating(!creating)}
              title={t('boards.new')}
              className="rounded-md p-1 text-cream-faint transition hover:bg-overlay hover:text-cream"
            >
              <Plus size={13} />
            </button>
          </div>
          {creating && (
            <div className="mx-2 mb-2 rounded-xl border border-line bg-ink-850 p-1.5 shadow-card">
              <div className="px-1.5 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-cream-faint">
                {t('boards.pickTemplate')}
              </div>
              {BOARD_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => handleCreate(tpl.id)}
                  className="flex w-full flex-col rounded-lg px-1.5 py-1.5 text-left transition hover:bg-overlay"
                >
                  <span className="text-[12.5px] text-cream">{t(tpl.nameKey as I18nKey)}</span>
                  <span className="text-[10.5px] leading-4 text-cream-faint">
                    {t(tpl.descKey as I18nKey)}
                  </span>
                </button>
              ))}
            </div>
          )}
          <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
            {(boards ?? []).map(boardRow)}
          </div>
        </aside>

        {/* Board content */}
        <main className="flex-1 overflow-x-auto overflow-y-hidden">
          {boards === null ? (
            <div className="flex h-full items-center justify-center text-sm text-cream-faint">
              {t('app.loading')}
            </div>
          ) : current === null ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <SquareKanban size={28} className="text-cream-faint" />
              <div className="text-sm text-cream-dim">{t('boards.empty')}</div>
              <div className="text-xs text-cream-faint">{t('boards.emptyHint')}</div>
              <button
                onClick={() => setCreating(true)}
                className="mt-1 flex items-center gap-1.5 rounded-full bg-cream px-4 py-2 text-[12px] font-medium text-ink-950 transition hover:opacity-90"
              >
                <Plus size={12} />
                {t('boards.create')}
              </button>
            </div>
          ) : (
            <div className="flex h-full flex-col">
              <div className="flex items-center gap-2.5 px-4 pb-1 pt-4">
                <span className="truncate text-[15px] font-semibold text-cream">{current.name}</span>
                <span className="rounded-full bg-accent-soft px-2 py-0.5 font-mono text-[10px] text-accent">
                  {t('boards.cardCount', { count: boardCardCount(current) })}
                </span>
              </div>
              <div className="flex flex-1 items-start gap-3 overflow-x-auto p-4">
                {current.columns.map(renderColumn)}
                <button
                  onClick={() => addColumn()}
                  className="flex h-9 w-40 shrink-0 items-center justify-center gap-1.5 rounded-[16px] border border-dashed border-line text-[12px] text-cream-faint transition hover:border-accent/60 hover:text-cream-dim"
                >
                  <Plus size={12} />
                  {t('boards.addColumn')}
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
