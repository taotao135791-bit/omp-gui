import { spawn, ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { CliInfo, Session, SessionEvent } from '../shared/types'
import { getStore, setStore } from './store'

const sessions = new Map<string, { process: ChildProcess; session: Session }>()

let cliInfoCache: CliInfo | null = null

export function detectCli(): CliInfo {
  if (cliInfoCache) return cliInfoCache

  for (const cmd of ['omp', 'pi']) {
    const candidate = findExecutable(cmd)
    if (candidate) {
      cliInfoCache = { command: cmd, available: true }
      return cliInfoCache
    }
  }

  cliInfoCache = { command: 'omp', available: false }
  return cliInfoCache
}

function findExecutable(cmd: string): string | null {
  const paths = (process.env.PATH || '').split(path.delimiter)
  for (const p of paths) {
    const full = path.join(p, cmd)
    if (existsSync(full)) return full
  }
  return null
}

export function listSessions(): Session[] {
  return Array.from(sessions.values()).map((s) => s.session)
}

export function createSession(
  cwd: string,
  onEvent: (event: SessionEvent) => void
): Session {
  const id = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const cli = detectCli()

  if (!cli.available) {
    const errorEvent: SessionEvent = {
      type: 'error',
      sessionId: id,
      message: 'Oh My Pi (omp) or Pi CLI not found. Please install omp first: https://omp.sh'
    }
    setTimeout(() => onEvent(errorEvent), 0)
    return {
      id,
      cwd,
      title: 'Uninitialized',
      createdAt: Date.now(),
      status: 'error'
    }
  }

  const enabledIds = getStore('enabledModules')
  const extensionArgs: string[] = []
  if (enabledIds.length > 0) {
    const { scanModules } = require('./modules')
    const modules = scanModules(cwd)
    for (const mod of modules) {
      if (mod.enabled && mod.source !== 'builtin' && mod.path) {
        extensionArgs.push('-e', mod.path)
      }
    }
  }

  const args = ['--mode', 'rpc', ...extensionArgs]
  const proc = spawn(cli.command, args, {
    cwd,
    env: {
      ...process.env,
      HOME: homedir(),
      FORCE_COLOR: '0'
    }
  })

  const session: Session = {
    id,
    cwd,
    title: path.basename(cwd) || 'New Chat',
    createdAt: Date.now(),
    status: 'idle'
  }

  sessions.set(id, { process: proc, session })

  let buffer = ''
  proc.stdout?.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf-8')
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      if (!line.trim()) continue
      parseLine(line, id, onEvent)
    }
  })

  proc.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf-8')
    const errorEvent: SessionEvent = {
      type: 'error',
      sessionId: id,
      message: text
    }
    onEvent(errorEvent)
  })

  proc.on('exit', (code) => {
    sessions.delete(id)
    onEvent({ type: 'closed', sessionId: id })
    if (code !== 0 && code !== null) {
      onEvent({
        type: 'error',
        sessionId: id,
        message: `omp exited with code ${code}`
      })
    }
  })

  onEvent({ type: 'connected', sessionId: id })

  const recent = getStore('recentProjects')
  if (!recent.includes(cwd)) {
    setStore('recentProjects', [cwd, ...recent].slice(0, 10))
  }

  return session
}

function parseLine(line: string, sessionId: string, onEvent: (event: SessionEvent) => void) {
  try {
    const payload = JSON.parse(line)
    if (payload.type === 'tool_call') {
      onEvent({
        type: 'tool_call',
        sessionId,
        tool: payload.tool,
        input: payload.input,
        output: payload.output
      })
    } else if (payload.type === 'message') {
      onEvent({
        type: 'message',
        sessionId,
        role: payload.role || 'assistant',
        content: payload.content
      })
    } else {
      onEvent({
        type: 'message',
        sessionId,
        role: 'assistant',
        content: line
      })
    }
  } catch {
    onEvent({
      type: 'message',
      sessionId,
      role: 'assistant',
      content: line
    })
  }
}

export function sendMessage(sessionId: string, text: string): boolean {
  const entry = sessions.get(sessionId)
  if (!entry) return false
  const payload = JSON.stringify({ type: 'prompt', content: text }) + '\n'
  entry.process.stdin?.write(payload)
  return true
}

export function killSession(sessionId: string): boolean {
  const entry = sessions.get(sessionId)
  if (!entry) return false
  entry.process.kill()
  sessions.delete(sessionId)
  return true
}
