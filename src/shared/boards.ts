/**
 * Pure half of the kanban boards: templates, model factories and structural
 * validation, with no filesystem access (that lives in src/main/boards.ts).
 * Kept in shared/ so the renderer can reuse the factory and the main process
 * can validate everything crossing IPC or coming back from disk.
 */
import { KanbanBoard, KanbanCard, KanbanColumn, KanbanTemplateId } from './types'

export const BOARD_LIMITS = {
  maxBoards: 50,
  maxColumns: 20,
  maxCardsPerColumn: 500,
  maxNameLength: 200,
  maxColumnTitleLength: 200,
  maxCardTitleLength: 500,
  maxNoteLength: 5000,
  maxIdLength: 100,
  maxTemplateLength: 50
} as const

/** Outcome of a boards write; `error` is a stable code or an fs message. */
export type KanbanSaveResult = { ok: true } | { ok: false; error: string }

// ---------------------------------------------------------------------------
// Templates — column titles are stored as i18n keys and translated at render
// time, so switching the UI language re-labels template columns too.
// ---------------------------------------------------------------------------

export interface KanbanTemplate {
  id: KanbanTemplateId
  /** i18n key for the template name shown in the picker. */
  nameKey: string
  /** i18n key for the one-line description shown in the picker. */
  descKey: string
  /** i18n keys stored as the default column titles. */
  columnKeys: string[]
}

export const BOARD_TEMPLATES: readonly KanbanTemplate[] = [
  {
    id: 'task',
    nameKey: 'boards.template.task',
    descKey: 'boards.template.task.desc',
    columnKeys: ['boards.col.todo', 'boards.col.doing', 'boards.col.done']
  },
  {
    id: 'bug',
    nameKey: 'boards.template.bug',
    descKey: 'boards.template.bug.desc',
    columnKeys: ['boards.col.reported', 'boards.col.confirmed', 'boards.col.fixing', 'boards.col.closed']
  },
  {
    id: 'release',
    nameKey: 'boards.template.release',
    descKey: 'boards.template.release.desc',
    columnKeys: ['boards.col.backlog', 'boards.col.thisWeek', 'boards.col.nextWeek', 'boards.col.shipped']
  },
  {
    id: 'blank',
    nameKey: 'boards.template.blank',
    descKey: 'boards.template.blank.desc',
    columnKeys: ['boards.col.todo']
  }
]

/** Total card count across all columns (sidebar list badge). */
export function boardCardCount(board: KanbanBoard): number {
  return board.columns.reduce((n, col) => n + col.cards.length, 0)
}

/**
 * Create a board from a template. `name` is display text supplied by the
 * caller (the renderer passes the localized template name). Unknown template
 * ids fall back to 'blank' rather than failing.
 */
export function createBoardFromTemplate(
  templateId: KanbanTemplateId,
  name: string,
  now: number = Date.now()
): KanbanBoard {
  const template =
    BOARD_TEMPLATES.find((tpl) => tpl.id === templateId) ??
    BOARD_TEMPLATES.find((tpl) => tpl.id === 'blank')!
  return {
    id: crypto.randomUUID(),
    name,
    template: template.id,
    columns: template.columnKeys.map((key) => ({
      id: crypto.randomUUID(),
      title: key,
      cards: []
    })),
    createdAt: now,
    updatedAt: now
  }
}

// ---------------------------------------------------------------------------
// Validation — strict per board: one bad field drops the whole board (on
// disk: the entry is skipped; over IPC: the write is rejected). Never throws.
// ---------------------------------------------------------------------------

// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\x00-\x1f\x7f]/

function isValidId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= BOARD_LIMITS.maxIdLength &&
    !CONTROL_RE.test(value)
  )
}

function isValidTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function validateCard(raw: unknown): KanbanCard | null {
  if (!raw || typeof raw !== 'object') return null
  const c = raw as Record<string, unknown>
  if (!isValidId(c.id)) return null
  if (
    typeof c.title !== 'string' ||
    !c.title.trim() ||
    c.title.length > BOARD_LIMITS.maxCardTitleLength
  ) {
    return null
  }
  if (c.note !== undefined && (typeof c.note !== 'string' || c.note.length > BOARD_LIMITS.maxNoteLength)) {
    return null
  }
  if (!isValidTimestamp(c.createdAt)) return null
  const card: KanbanCard = { id: c.id, title: c.title, createdAt: c.createdAt }
  if (typeof c.note === 'string' && c.note.length > 0) card.note = c.note
  return card
}

function validateColumn(raw: unknown): KanbanColumn | null {
  if (!raw || typeof raw !== 'object') return null
  const c = raw as Record<string, unknown>
  if (!isValidId(c.id)) return null
  if (
    typeof c.title !== 'string' ||
    !c.title.trim() ||
    c.title.length > BOARD_LIMITS.maxColumnTitleLength
  ) {
    return null
  }
  if (!Array.isArray(c.cards) || c.cards.length > BOARD_LIMITS.maxCardsPerColumn) return null
  const cards: KanbanCard[] = []
  const seen = new Set<string>()
  for (const rawCard of c.cards) {
    const card = validateCard(rawCard)
    if (!card || seen.has(card.id)) return null
    seen.add(card.id)
    cards.push(card)
  }
  return { id: c.id, title: c.title, cards }
}

export function validateBoard(raw: unknown): KanbanBoard | null {
  if (!raw || typeof raw !== 'object') return null
  const b = raw as Record<string, unknown>
  if (!isValidId(b.id)) return null
  if (
    typeof b.name !== 'string' ||
    !b.name.trim() ||
    b.name.length > BOARD_LIMITS.maxNameLength
  ) {
    return null
  }
  if (
    typeof b.template !== 'string' ||
    b.template.length > BOARD_LIMITS.maxTemplateLength ||
    CONTROL_RE.test(b.template)
  ) {
    return null
  }
  if (!Array.isArray(b.columns) || b.columns.length === 0 || b.columns.length > BOARD_LIMITS.maxColumns) {
    return null
  }
  if (!isValidTimestamp(b.createdAt) || !isValidTimestamp(b.updatedAt)) return null
  const columns: KanbanColumn[] = []
  const columnIds = new Set<string>()
  const cardIds = new Set<string>()
  for (const rawColumn of b.columns) {
    const column = validateColumn(rawColumn)
    if (!column || columnIds.has(column.id)) return null
    for (const card of column.cards) {
      // A card id may live in exactly one column — DnD moves rely on it.
      if (cardIds.has(card.id)) return null
      cardIds.add(card.id)
    }
    columnIds.add(column.id)
    columns.push(column)
  }
  return {
    id: b.id,
    name: b.name,
    template: b.template,
    columns,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt
  }
}
