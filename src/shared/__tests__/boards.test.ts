import { describe, it, expect } from 'vitest'
import { KanbanBoard } from '../types'
import {
  BOARD_LIMITS,
  BOARD_TEMPLATES,
  boardCardCount,
  createBoardFromTemplate,
  validateBoard
} from '../boards'

function validBoard(): KanbanBoard {
  return {
    id: 'board-1',
    name: 'My board',
    template: 'task',
    columns: [
      {
        id: 'col-1',
        title: 'boards.col.todo',
        cards: [{ id: 'card-1', title: 'Write tests', note: 'unit first', createdAt: 1000 }]
      },
      { id: 'col-2', title: 'boards.col.done', cards: [] }
    ],
    createdAt: 1000,
    updatedAt: 2000
  }
}

describe('validateBoard', () => {
  it('accepts a well-formed board', () => {
    expect(validateBoard(validBoard())).toEqual(validBoard())
  })

  it('rejects non-objects and missing fields', () => {
    expect(validateBoard(null)).toBeNull()
    expect(validateBoard('board')).toBeNull()
    expect(validateBoard([])).toBeNull()
    expect(validateBoard({})).toBeNull()
    expect(validateBoard({ ...validBoard(), columns: undefined })).toBeNull()
  })

  it('rejects empty or oversized names', () => {
    expect(validateBoard({ ...validBoard(), name: '' })).toBeNull()
    expect(validateBoard({ ...validBoard(), name: '   ' })).toBeNull()
    expect(
      validateBoard({ ...validBoard(), name: 'x'.repeat(BOARD_LIMITS.maxNameLength + 1) })
    ).toBeNull()
  })

  it('rejects bad ids and oversized templates', () => {
    expect(validateBoard({ ...validBoard(), id: '' })).toBeNull()
    expect(validateBoard({ ...validBoard(), id: 'bad\nid' })).toBeNull()
    expect(
      validateBoard({ ...validBoard(), id: 'x'.repeat(BOARD_LIMITS.maxIdLength + 1) })
    ).toBeNull()
    expect(
      validateBoard({ ...validBoard(), template: 'x'.repeat(BOARD_LIMITS.maxTemplateLength + 1) })
    ).toBeNull()
    expect(validateBoard({ ...validBoard(), template: 42 })).toBeNull()
  })

  it('rejects empty or oversized column lists', () => {
    expect(validateBoard({ ...validBoard(), columns: [] })).toBeNull()
    const columns = Array.from({ length: BOARD_LIMITS.maxColumns + 1 }, (_, i) => ({
      id: `col-${i}`,
      title: `Column ${i}`,
      cards: []
    }))
    expect(validateBoard({ ...validBoard(), columns })).toBeNull()
  })

  it('rejects invalid cards and timestamps', () => {
    const withCard = (card: unknown) =>
      validateBoard({
        ...validBoard(),
        columns: [{ id: 'col-1', title: 'Todo', cards: [card] }]
      })
    expect(withCard({ id: 'c', title: '', createdAt: 1 })).toBeNull()
    expect(withCard({ id: 'c', title: 'x', createdAt: Number.NaN })).toBeNull()
    expect(withCard({ id: 'c', title: 'x', note: 5, createdAt: 1 })).toBeNull()
    expect(
      withCard({ id: 'c', title: 'x', note: 'n'.repeat(BOARD_LIMITS.maxNoteLength + 1), createdAt: 1 })
    ).toBeNull()
    expect(
      withCard({ id: 'c', title: 'x'.repeat(BOARD_LIMITS.maxCardTitleLength + 1), createdAt: 1 })
    ).toBeNull()
    expect(validateBoard({ ...validBoard(), createdAt: 'yesterday' })).toBeNull()
  })

  it('rejects duplicate column ids and card ids reused across columns', () => {
    const col = validBoard().columns[0]
    expect(validateBoard({ ...validBoard(), columns: [col, col] })).toBeNull()
    const card = { id: 'shared-card', title: 'dup', createdAt: 1 }
    expect(
      validateBoard({
        ...validBoard(),
        columns: [
          { id: 'a', title: 'A', cards: [card] },
          { id: 'b', title: 'B', cards: [card] }
        ]
      })
    ).toBeNull()
  })

  it('rejects a column over the card limit', () => {
    const cards = Array.from({ length: BOARD_LIMITS.maxCardsPerColumn + 1 }, (_, i) => ({
      id: `card-${i}`,
      title: `Card ${i}`,
      createdAt: i
    }))
    expect(
      validateBoard({ ...validBoard(), columns: [{ id: 'col-1', title: 'Todo', cards }] })
    ).toBeNull()
  })

  it('normalizes away empty notes', () => {
    const board = validateBoard({
      ...validBoard(),
      columns: [
        { id: 'col-1', title: 'Todo', cards: [{ id: 'c', title: 'x', note: '', createdAt: 1 }] }
      ]
    })
    expect(board?.columns[0].cards[0]).toEqual({ id: 'c', title: 'x', createdAt: 1 })
  })
})

describe('createBoardFromTemplate', () => {
  it('creates the task template with its three i18n-keyed columns', () => {
    const board = createBoardFromTemplate('task', 'Tasks', 1234)
    expect(board.template).toBe('task')
    expect(board.name).toBe('Tasks')
    expect(board.columns.map((c) => c.title)).toEqual([
      'boards.col.todo',
      'boards.col.doing',
      'boards.col.done'
    ])
    expect(board.columns.every((c) => c.cards.length === 0)).toBe(true)
    expect(board.createdAt).toBe(1234)
    expect(board.updatedAt).toBe(1234)
    expect(validateBoard(board)).toEqual(board)
  })

  it('creates every template as a valid board with unique ids', () => {
    for (const tpl of BOARD_TEMPLATES) {
      const board = createBoardFromTemplate(tpl.id, tpl.id, 1)
      expect(board.columns.length).toBe(tpl.columnKeys.length)
      expect(validateBoard(board)).not.toBeNull()
    }
  })

  it('falls back to the blank template for unknown ids', () => {
    const board = createBoardFromTemplate('nope' as never, 'Fallback', 1)
    expect(board.template).toBe('blank')
    expect(board.columns).toHaveLength(1)
  })
})

describe('BOARD_TEMPLATES', () => {
  it('has unique ids, non-empty columns and i18n-key-shaped titles', () => {
    const ids = BOARD_TEMPLATES.map((tpl) => tpl.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const tpl of BOARD_TEMPLATES) {
      expect(tpl.nameKey.startsWith('boards.template.')).toBe(true)
      expect(tpl.descKey.startsWith('boards.template.')).toBe(true)
      expect(tpl.columnKeys.length).toBeGreaterThan(0)
      for (const key of tpl.columnKeys) {
        expect(key.startsWith('boards.col.')).toBe(true)
      }
    }
  })
})

describe('boardCardCount', () => {
  it('sums cards across columns', () => {
    expect(boardCardCount(validBoard())).toBe(1)
    expect(boardCardCount(createBoardFromTemplate('release', 'R', 1))).toBe(0)
  })
})
