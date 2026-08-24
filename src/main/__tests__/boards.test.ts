import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

// boards.ts resolves its default store through electron's app.getPath; the
// tests mostly inject an explicit file, and the one default-path case reads
// userDataDir which beforeEach points at a fresh temp dir.
let userDataDir: string
vi.mock('electron', () => ({
  app: { getPath: () => userDataDir }
}))

import { deleteBoard, listBoards, saveBoard } from '../boards'
import { BOARD_LIMITS } from '../../shared/boards'
import { KanbanBoard } from '../../shared/types'

let dir: string
let file: string

function makeBoard(id: string, name = `Board ${id}`): KanbanBoard {
  return {
    id,
    name,
    template: 'task',
    columns: [
      {
        id: `${id}-col-1`,
        title: 'boards.col.todo',
        cards: [{ id: `${id}-card-1`, title: 'Task', createdAt: 1000 }]
      }
    ],
    createdAt: 1000,
    updatedAt: 2000
  }
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'omp-boards-'))
  userDataDir = dir
  file = path.join(dir, 'kanban-boards.json')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('listBoards', () => {
  it('returns an empty list when the file is missing', () => {
    expect(listBoards(file)).toEqual([])
  })

  it('falls back to an empty list for corrupt JSON', () => {
    writeFileSync(file, '{not json')
    expect(listBoards(file)).toEqual([])
  })

  it('falls back to an empty list for non-array JSON', () => {
    writeFileSync(file, JSON.stringify({ boards: [] }))
    expect(listBoards(file)).toEqual([])
  })

  it('drops invalid entries but keeps the valid ones', () => {
    writeFileSync(
      file,
      JSON.stringify([makeBoard('good'), { id: 'bad' }, null, makeBoard('good-2')])
    )
    expect(listBoards(file).map((b) => b.id)).toEqual(['good', 'good-2'])
  })
})

describe('saveBoard', () => {
  it('round-trips a board through listBoards', () => {
    const board = makeBoard('b1')
    expect(saveBoard(board, file)).toEqual({ ok: true })
    expect(listBoards(file)).toEqual([board])
  })

  it('upserts by id instead of appending', () => {
    expect(saveBoard(makeBoard('b1'), file)).toEqual({ ok: true })
    const updated = { ...makeBoard('b1', 'Renamed'), updatedAt: 3000 }
    expect(saveBoard(updated, file)).toEqual({ ok: true })
    const boards = listBoards(file)
    expect(boards).toHaveLength(1)
    expect(boards[0].name).toBe('Renamed')
    expect(boards[0].updatedAt).toBe(3000)
  })

  it('rejects structurally invalid boards without touching the file', () => {
    expect(saveBoard(makeBoard('b1'), file)).toEqual({ ok: true })
    const before = readFileSync(file, 'utf-8')
    const result = saveBoard({ id: 'x' }, file)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-board')
    expect(readFileSync(file, 'utf-8')).toBe(before)
  })

  it('enforces the board limit for new boards but still allows upserts', () => {
    for (let i = 0; i < BOARD_LIMITS.maxBoards; i++) {
      expect(saveBoard(makeBoard(`b-${i}`), file)).toEqual({ ok: true })
    }
    const extra = saveBoard(makeBoard('one-too-many'), file)
    expect(extra.ok).toBe(false)
    if (!extra.ok) expect(extra.error).toBe('board-limit')
    expect(saveBoard(makeBoard('b-0', 'Still fine'), file)).toEqual({ ok: true })
    expect(listBoards(file)).toHaveLength(BOARD_LIMITS.maxBoards)
  })

  it('writes to userData/kanban-boards.json by default', () => {
    expect(saveBoard(makeBoard('default-file'))).toEqual({ ok: true })
    const target = path.join(userDataDir, 'kanban-boards.json')
    expect(existsSync(target)).toBe(true)
    expect(JSON.parse(readFileSync(target, 'utf-8'))[0].id).toBe('default-file')
    expect(listBoards()).toHaveLength(1)
  })
})

describe('deleteBoard', () => {
  it('removes the board and keeps the rest', () => {
    saveBoard(makeBoard('a'), file)
    saveBoard(makeBoard('b'), file)
    expect(deleteBoard('a', file)).toEqual({ ok: true })
    expect(listBoards(file).map((b) => b.id)).toEqual(['b'])
  })

  it('treats deleting an absent board as an idempotent no-op', () => {
    saveBoard(makeBoard('a'), file)
    const before = readFileSync(file, 'utf-8')
    expect(deleteBoard('absent', file)).toEqual({ ok: true })
    expect(readFileSync(file, 'utf-8')).toBe(before)
  })

  it('rejects non-string ids', () => {
    const result = deleteBoard(42, file)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-board')
  })
})
