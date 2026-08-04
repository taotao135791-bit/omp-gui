import { AlertTriangle } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { MessageLike } from '../store'
import ToolCallCard from './ToolCallCard'

interface MessageItemProps {
  message: MessageLike
}

export default function MessageItem({ message }: MessageItemProps) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-white/[0.08] px-4 py-2.5 text-sm leading-7 text-cream">
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-3">
      <div
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold ${
          isSystem ? 'bg-red-500/15 text-red-300' : 'bg-accent/15 text-accent'
        }`}
      >
        {isSystem ? <AlertTriangle size={12} /> : 'π'}
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        {message.toolCall ? (
          <ToolCallCard toolCall={message.toolCall} />
        ) : isSystem ? (
          <div className="rounded-xl border border-red-500/20 bg-red-500/[0.08] px-3.5 py-2.5 text-sm text-red-200">
            {message.content}
          </div>
        ) : (
          <div className="md">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  )
}
