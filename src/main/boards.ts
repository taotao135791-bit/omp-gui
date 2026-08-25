import { app } from 'electron'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { KanbanBoard } from '../shared/types'
import { BOARD_LIMITS, KanbanSaveResult, migrateBoard, validateBoard } from '../shared/boards'

/**
 * Widget board persistence — a single JSON document at
 * userData/kanban-boards.json, written atomically (tmp + rename, same as
 * writePiSettings). Deliberately NOT the generic store:set IPC: board data
 * crosses the trust boundary as `unknown` and is re-validated on every read
 * and write here; corrupt files fall back to an empty list. Reads also run
 * v1 kanban entries (columns/cards) through migrateBoard, so old files show
 * up as v2 widget boards and are written back as v2 on the next save.
 */

function defaultBoardsFile(): string {
  return path.join(app.getPath('userData'), 'kanban-boards.json')
}

function readBoards(file: string): KanbanBoard[] {
  try {
    const raw: unknown = JSON.parse(readFileSync(file, 'utf-8'))
    if (!Array.isArray(raw)) return []
    const boards: KanbanBoard[] = []
    for (const entry of raw) {
      const board = migrateBoard(entry)
      if (board) boards.push(board)
    }
    return boards
  } catch {
    return []
  }
}

function writeBoards(file: string, boards: KanbanBoard[]): void {
  mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp-${process.pid}`
  writeFileSync(tmp, JSON.stringify(boards, null, 2) + '\n', 'utf-8')
  renameSync(tmp, file)
}

export function listBoards(file: string = defaultBoardsFile()): KanbanBoard[] {
  return readBoards(file)
}

/** Whole-board upsert, keyed by board id. Validates before touching disk. */
export function saveBoard(raw: unknown, file: string = defaultBoardsFile()): KanbanSaveResult {
  const board = validateBoard(raw)
  if (!board) return { ok: false, error: 'invalid-board' }
  const boards = readBoards(file)
  const index = boards.findIndex((b) => b.id === board.id)
  if (index === -1 && boards.length >= BOARD_LIMITS.maxBoards) {
    return { ok: false, error: 'board-limit' }
  }
  if (index === -1) boards.push(board)
  else boards[index] = board
  try {
    writeBoards(file, boards)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export function deleteBoard(id: unknown, file: string = defaultBoardsFile()): KanbanSaveResult {
  if (typeof id !== 'string' || !id || id.length > BOARD_LIMITS.maxIdLength) {
    return { ok: false, error: 'invalid-board' }
  }
  const boards = readBoards(file)
  const next = boards.filter((b) => b.id !== id)
  // Deleting an absent board is an idempotent no-op — skip the write.
  if (next.length === boards.length) return { ok: true }
  try {
    writeBoards(file, next)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
