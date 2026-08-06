import { ReactNode } from 'react'
import MessageItem from './MessageItem'
import ToolCallCard from './ToolCallCard'
import { MessageLike } from '../store'

interface MessageListProps {
  messages: MessageLike[]
  sessionId?: string | null
}

/**
 * Vertical rhythm: a loose 28px gap between turns, tightened inside a
 * question→answer pair (user bubble → reply hugs at 12px, consecutive user
 * bubbles stack compactly).
 */
function gapBefore(prev: MessageLike | undefined, nextIsUser: boolean): string {
  if (!prev) return ''
  if (prev.role === 'user') return nextIsUser ? 'mt-2' : 'mt-3'
  return 'mt-7'
}

export default function MessageList({ messages, sessionId = null }: MessageListProps) {
  const nodes: ReactNode[] = []
  let prev: MessageLike | undefined
  let i = 0
  while (i < messages.length) {
    const message = messages[i]
    // Consecutive tool calls collapse into one bordered group with hairline
    // separators — a list, not a stack of boxes (Claude Code style).
    if (message.toolCall) {
      const run: MessageLike[] = []
      let j = i
      while (j < messages.length && messages[j].toolCall) {
        run.push(messages[j])
        j++
      }
      nodes.push(
        <div key={message.id} className={gapBefore(prev, false)}>
          <div className="msg-in overflow-hidden rounded-xl border border-line bg-ink-850/50">
            <div className="divide-y divide-line">
              {run.map((m) => (
                <ToolCallCard key={m.id} toolCall={m.toolCall!} />
              ))}
            </div>
          </div>
        </div>
      )
      prev = messages[j - 1]
      i = j
      continue
    }
    nodes.push(
      <div key={message.id} className={gapBefore(prev, message.role === 'user')}>
        <MessageItem message={message} index={i} sessionId={sessionId} />
      </div>
    )
    prev = message
    i++
  }
  return <div className="flex flex-col px-6 py-8">{nodes}</div>
}
