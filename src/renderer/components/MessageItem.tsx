import { AlertTriangle } from 'lucide-react'
import { MessageLike } from '../store'
import Markdown from './Markdown'
import ToolCallCard from './ToolCallCard'

interface MessageItemProps {
  message: MessageLike
}

export default function MessageItem({ message }: MessageItemProps) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'

  if (isUser) {
    return (
      <div className="msg-in flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-ink-700 px-4 py-2.5 text-[15px] leading-7 text-cream">
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div className="msg-in flex gap-3">
      {isSystem ? (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-red-500/15 text-red-300">
          <AlertTriangle size={13} />
        </div>
      ) : (
        <div className="brand-gradient flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[13px] font-bold text-ink-950 shadow-sm shadow-indigo-500/20">
          π
        </div>
      )}
      <div className="min-w-0 flex-1 pt-0.5">
        {message.toolCall ? (
          <ToolCallCard toolCall={message.toolCall} />
        ) : isSystem ? (
          <div className="rounded-xl border border-red-500/20 bg-red-500/[0.08] px-3.5 py-2.5 text-sm leading-6 text-red-200">
            {message.content}
          </div>
        ) : (
          <Markdown content={message.content} />
        )}
      </div>
    </div>
  )
}
