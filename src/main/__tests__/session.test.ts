import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { OmpSession, OmpProcessLike } from '../omp/OmpSession'
import { Session, SessionEvent, SessionRuntimeState } from '../../shared/types'

/**
 * State-machine tests with a fake child process (EventEmitters for
 * stdout/stderr, mocks for stdin/kill) — no real pi is spawned.
 */

interface FakeProc {
  proc: OmpProcessLike
  stdout: EventEmitter
  stderr: EventEmitter
  stdin: { write: ReturnType<typeof vi.fn> }
  kill: ReturnType<typeof vi.fn>
  emitter: EventEmitter
}

function makeFakeProc(): FakeProc {
  const stdout = new EventEmitter()
  const stderr = new EventEmitter()
  const stdin = { write: vi.fn() }
  const kill = vi.fn()
  const emitter = Object.assign(new EventEmitter(), { stdout, stderr, stdin, kill })
  return { proc: emitter as unknown as OmpProcessLike, stdout, stderr, stdin, kill, emitter }
}

function makeSession() {
  const fake = makeFakeProc()
  const events: SessionEvent[] = []
  const gone: string[] = []
  const session: Session = { id: 's1', cwd: '/tmp/x', title: 'x', createdAt: 0, status: 'idle' }
  const s = new OmpSession(session, fake.proc, {
    label: 'pi',
    onEvent: (e) => events.push(e),
    onGone: () => gone.push('gone')
  })
  return { s, events, gone, fake }
}

/** Push complete JSONL frames through the fake stdout. */
function emitLines(fake: FakeProc, ...payloads: (Record<string, unknown> | string)[]): void {
  const text = payloads.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join('\n')
  fake.stdout.emit('data', Buffer.from(text + '\n', 'utf8'))
}

type StatusEvent = Extract<SessionEvent, { type: 'status' }>

function statusEvents(events: SessionEvent[]): SessionRuntimeState[] {
  return events.filter((e): e is StatusEvent => e.type === 'status').map((e) => e.status)
}

describe('OmpSession lifecycle', () => {
  it('starts in idle and emits connected', () => {
    const { s, events } = makeSession()
    expect(s.runtimeState).toBe('idle')
    expect(events).toEqual([{ type: 'connected', sessionId: 's1' }])
  })

  it('transitions idle → working → idle on agent_start/agent_end', () => {
    const { s, events, fake } = makeSession()
    emitLines(fake, { type: 'agent_start' })
    expect(s.runtimeState).toBe('working')
    emitLines(fake, { type: 'agent_end' })
    expect(s.runtimeState).toBe('idle')
    expect(statusEvents(events)).toEqual(['working', 'idle'])
  })

  it('suppresses a duplicate agent_end while already idle', () => {
    const { s, events, fake } = makeSession()
    emitLines(fake, { type: 'agent_start' }, { type: 'agent_end' }, { type: 'agent_end' })
    expect(s.runtimeState).toBe('idle')
    expect(statusEvents(events)).toEqual(['working', 'idle'])
  })

  it('keeps a non-terminal agent_end (isTerminal: false) working', () => {
    const { s, events, fake } = makeSession()
    emitLines(fake, { type: 'agent_start' }, { type: 'agent_end', isTerminal: false })
    expect(s.runtimeState).toBe('working')
    expect(statusEvents(events)).toEqual(['working'])
    emitLines(fake, { type: 'agent_end' })
    expect(s.runtimeState).toBe('idle')
    expect(statusEvents(events)).toEqual(['working', 'idle'])
  })
})

describe('OmpSession extension UI', () => {
  it('cycles working → waiting_for_user → working → idle', () => {
    const { s, events, fake } = makeSession()
    emitLines(fake, { type: 'agent_start' })
    emitLines(fake, { type: 'extension_ui_request', id: 'x1', method: 'confirm', title: 'Proceed?' })
    expect(s.runtimeState).toBe('waiting_for_user')
    expect(events.filter((e) => e.type === 'ui_request')).toEqual([
      {
        type: 'ui_request',
        sessionId: 's1',
        id: 'x1',
        method: 'confirm',
        title: 'Proceed?',
        message: undefined,
        options: undefined,
        placeholder: undefined,
        prefill: undefined,
        timeout: undefined
      }
    ])
    // No status change while waiting — the renderer must stay busy.
    expect(statusEvents(events)).toEqual(['working'])

    expect(s.respondExtensionUi('x1', { confirmed: true })).toBe(true)
    expect(s.runtimeState).toBe('working')
    expect(fake.stdin.write).toHaveBeenCalledWith(
      '{"type":"extension_ui_response","id":"x1","confirmed":true}\n'
    )

    emitLines(fake, { type: 'agent_end' })
    expect(s.runtimeState).toBe('idle')
    expect(statusEvents(events)).toEqual(['working', 'idle'])
  })
})

describe('OmpSession abort', () => {
  it('moves to aborting and converges at agent_end', () => {
    const { s, events, fake } = makeSession()
    emitLines(fake, { type: 'agent_start' })
    expect(s.abort()).toBe(true)
    expect(s.runtimeState).toBe('aborting')
    const written = fake.stdin.write.mock.calls.map((c) => String(c[0])).join('')
    expect(written).toContain('"type":"abort"')
    emitLines(fake, { type: 'agent_end' })
    expect(s.runtimeState).toBe('idle')
    expect(statusEvents(events)).toEqual(['working', 'idle'])
  })
})

describe('OmpSession error handling', () => {
  it('ends the turn on a failed command response', () => {
    const { s, events, fake } = makeSession()
    emitLines(fake, { type: 'agent_start' })
    emitLines(fake, { type: 'response', command: 'prompt', success: false, error: 'model not configured' })
    expect(s.runtimeState).toBe('idle')
    expect(events).toContainEqual({ type: 'error', sessionId: 's1', message: 'model not configured' })
    expect(statusEvents(events)).toEqual(['working', 'idle'])
  })

  it('surfaces transport (oversize line) errors without dying', () => {
    const { s, events, fake } = makeSession()
    fake.stdout.emit('data', Buffer.alloc(17 * 1024 * 1024, 'a'))
    const errors = events.filter((e) => e.type === 'error')
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatchObject({ recoverable: true })
    expect(s.runtimeState).toBe('idle')
    // Still functional afterwards: the LF resyncs framing.
    fake.stdout.emit('data', Buffer.from('tail of giant line\n' + JSON.stringify({ type: 'agent_start' }) + '\n'))
    expect(s.runtimeState).toBe('working')
  })
})

describe('OmpSession process exit / crash', () => {
  it('non-zero exit: failed → closed, stderr tail in the error, pending resolved null', async () => {
    const { s, events, gone, fake } = makeSession()
    fake.stderr.emit('data', Buffer.from('l1\nl2\nl3\nl4\n'))
    const query = s.query({ type: 'get_state' })
    fake.emitter.emit('exit', 1)
    await expect(query).resolves.toBeNull()
    expect(s.runtimeState).toBe('closed')
    const error = events.find((e) => e.type === 'error')
    expect(error).toMatchObject({ recoverable: false })
    expect((error as { message: string }).message).toBe('omp exited with code 1\nl2\nl3\nl4')
    expect(events.filter((e) => e.type === 'closed')).toHaveLength(1)
    expect(gone).toEqual(['gone'])
  })

  it('clean exit (code 0): closed without an error event', () => {
    const { s, events, gone, fake } = makeSession()
    fake.emitter.emit('exit', 0)
    expect(s.runtimeState).toBe('closed')
    expect(events.filter((e) => e.type === 'error')).toHaveLength(0)
    expect(events.filter((e) => e.type === 'closed')).toHaveLength(1)
    expect(gone).toEqual(['gone'])
  })

  it('spawn failure: failed → closed and a later exit is ignored', () => {
    const { s, events, gone, fake } = makeSession()
    fake.emitter.emit('error', new Error('spawn pi ENOENT'))
    expect(s.runtimeState).toBe('closed')
    expect(events).toContainEqual({
      type: 'error',
      sessionId: 's1',
      message: 'Failed to start pi: spawn pi ENOENT',
      recoverable: false
    })
    fake.emitter.emit('exit', -2)
    expect(events.filter((e) => e.type === 'closed')).toHaveLength(1)
    expect(gone).toEqual(['gone'])
  })

  it('processes a residual line at EOF before closing', () => {
    const { s, events, fake } = makeSession()
    fake.stdout.emit('data', Buffer.from(JSON.stringify({ type: 'agent_start' }))) // no trailing LF
    fake.emitter.emit('exit', 0)
    expect(events).toContainEqual({ type: 'status', sessionId: 's1', status: 'working' })
    expect(s.runtimeState).toBe('closed')
  })
})

describe('OmpSession queries', () => {
  it('resolves a pending query with its matching response', async () => {
    const { s, fake } = makeSession()
    const query = s.query({ type: 'get_state' })
    const written = String(fake.stdin.write.mock.calls[0][0])
    const id = (JSON.parse(written) as { id: string }).id
    emitLines(fake, { type: 'response', id, command: 'get_state', success: true, data: { isStreaming: false } })
    const res = await query
    expect(res?.success).toBe(true)
    expect((res?.data as { isStreaming: boolean }).isStreaming).toBe(false)
  })

  it('kill() resolves pending queries with null, closes silently, ignores exit', async () => {
    const { s, events, gone, fake } = makeSession()
    const query = s.query({ type: 'get_state' })
    s.kill()
    await expect(query).resolves.toBeNull()
    expect(fake.kill).toHaveBeenCalled()
    expect(s.runtimeState).toBe('closed')
    // Renderer-initiated: no error/closed events.
    expect(events).toEqual([{ type: 'connected', sessionId: 's1' }])
    fake.emitter.emit('exit', null)
    expect(events).toEqual([{ type: 'connected', sessionId: 's1' }])
    expect(gone).toEqual(['gone'])
  })

  it('writes prompt commands with images and streaming behavior', () => {
    const { s, fake } = makeSession()
    expect(
      s.sendPrompt('hi', [{ type: 'image', data: 'AA==', mimeType: 'image/png' }], 'steer')
    ).toBe(true)
    const written = JSON.parse(String(fake.stdin.write.mock.calls[0][0])) as Record<string, unknown>
    expect(written).toMatchObject({
      type: 'prompt',
      message: 'hi',
      streamingBehavior: 'steer'
    })
    expect(written.images).toEqual([{ type: 'image', data: 'AA==', mimeType: 'image/png' }])
  })
})

describe('OmpSession assistant text tracking', () => {
  it('accumulates deltas per turn and finalizes at agent_end', () => {
    const { s, fake } = makeSession()
    emitLines(
      fake,
      { type: 'agent_start' },
      { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Hello ' } },
      { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'world' } },
      { type: 'agent_end' }
    )
    expect(s.lastAssistantText).toBe('Hello world')
  })
})
