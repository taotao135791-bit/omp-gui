import { describe, expect, it } from 'vitest'
import { HistorySessionInfo, Session } from '@shared/types'
import {
  recordsForWorkspace,
  replaceHistoricalSessionRecords,
  updateSessionRecordTitle,
  upsertLiveSessionRecord
} from './sessionRegistry'

const A = '/workspace/a'
const B = '/workspace/b'

function live(id: string, cwd = A, extra: Partial<Session> = {}): Session {
  return {
    id,
    cwd,
    title: cwd.endsWith('/a') ? 'Workspace A' : 'Workspace B',
    createdAt: 100,
    status: 'idle',
    ...extra
  }
}

function history(filePath: string, cwd = A, uuid = filePath): HistorySessionInfo {
  return { uuid, filePath, title: `History ${uuid}`, timestamp: 200, cwd }
}

describe('session registry projection', () => {
  it('registers a new live session immediately and updates its title in place', () => {
    let records = upsertLiveSessionRecord([], live('a'))
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ runtimeSessionId: 'a', workspaceRealPath: A, isLive: true })

    records = updateSessionRecordTitle(records, 'a', 'First prompt')
    expect(records).toHaveLength(1)
    expect(records[0].title).toBe('First prompt')
  })

  it('retains A and B as separate live records', () => {
    let records = upsertLiveSessionRecord([], live('a'))
    records = upsertLiveSessionRecord(records, live('b'))
    expect(records.map((record) => record.runtimeSessionId)).toEqual(['b', 'a'])
  })

  it('scopes records by canonical workspace path', () => {
    let records = upsertLiveSessionRecord([], live('a', A))
    records = upsertLiveSessionRecord(records, live('b', B))
    expect(recordsForWorkspace(records, A).map((record) => record.runtimeSessionId)).toEqual(['a'])
    expect(recordsForWorkspace(records, B).map((record) => record.runtimeSessionId)).toEqual(['b'])
  })

  it('discovers historical sessions and upgrades the same record on resume', () => {
    const info = history('/sessions/a.jsonl', A, 'uuid-a')
    let records = replaceHistoricalSessionRecords([], A, [info])
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ key: info.filePath, state: 'historical', isLive: false, isResumable: true })

    records = upsertLiveSessionRecord(
      records,
      live('runtime-a', A, { resumeFrom: info.filePath, title: info.title })
    )
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      key: info.filePath,
      runtimeSessionId: 'runtime-a',
      state: 'idle',
      isLive: true,
      isResumable: true
    })
  })

  it('replaces stale historical discovery without dropping a live session', () => {
    const a = history('/sessions/a.jsonl', A, 'uuid-a')
    const b = history('/sessions/b.jsonl', A, 'uuid-b')
    let records = replaceHistoricalSessionRecords([], A, [a, b])
    records = upsertLiveSessionRecord(records, live('runtime-a', A, { resumeFrom: a.filePath }))
    records = replaceHistoricalSessionRecords(records, A, [a])
    expect(records.map((record) => record.sessionFile)).toEqual([a.filePath])
    expect(records[0].isLive).toBe(true)
  })
})
