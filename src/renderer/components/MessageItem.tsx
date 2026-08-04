import { User, Bot, AlertTriangle } from 'lucide-react'
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

  return (
    <div className={`flex gap-4 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          isUser
            ? 'bg-brand'
            : isSystem
              ? 'bg-red-900/50 text-red-400'
              : 'bg-surface-700'
        }`}
      >
        {isUser ? <User size={16} /> : isSystem ? <AlertTriangle size={16} /> : <Bot size={16} />}
      </div>
      <div
        className={`max-w-[80%] overflow-hidden rounded-2xl px-4 py-3 text-sm ${
          isUser
            ? 'bg-brand text-white'
            : isSystem
              ? 'border border-red-900/50 bg-red-900/20 text-red-200'
              : 'bg-surface-800 text-gray-100'
        }`}
      >
        {message.toolCall ? (
          <ToolCallCard toolCall={message.toolCall} />
        ) : (
          <div className="prose prose-invert prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  )
}
