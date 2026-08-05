import { useState } from 'react'
import { AlertTriangle, Check, Copy } from 'lucide-react'
import { MessageLike } from '../store'
import { useT } from '../i18n'
import Markdown from './Markdown'
import ToolCallCard from './ToolCallCard'
import Logo from './Logo'

interface MessageItemProps {
  message: MessageLike
}

export default function MessageItem({ message }: MessageItemProps) {
  const [copied, setCopied] = useState(false)
  const t = useT()
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'

  const copyContent = () => {
    navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  if (isUser) {
    return (
      <div className="msg-in group flex justify-end">
        <div className="relative max-w-[85%]">
          <div className="whitespace-pre-wrap rounded-2xl rounded-br-md bg-ink-700 px-3.5 py-2 text-[15px] leading-7 text-cream">
            {message.content}
          </div>
          <button
            onClick={copyContent}
            title={t('msg.copy')}
            className="absolute -left-7 top-1 rounded-md p-1 text-cream-faint opacity-0 transition-all hover:bg-overlay hover:text-cream group-hover:opacity-100"
          >
            {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="msg-in group flex gap-2.5">
      {isSystem ? (
        <div className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-red-500/12 text-red-500 dark:text-red-300">
          <AlertTriangle size={12} />
        </div>
      ) : (
        <Logo size={22} className="shrink-0" />
      )}
      <div className="relative min-w-0 flex-1 pt-px">
        {message.toolCall ? (
          <ToolCallCard toolCall={message.toolCall} />
        ) : isSystem ? (
          <div className="rounded-xl border border-red-500/20 bg-red-500/[0.06] px-3 py-2 text-sm leading-6 text-red-600 dark:text-red-200">
            {message.content}
          </div>
        ) : (
          <>
            <Markdown content={message.content} />
            {message.content && (
              <button
                onClick={copyContent}
                title={t('msg.copy')}
                className="mt-1 flex items-center gap-1 rounded-md px-1 py-0.5 text-[10.5px] text-cream-faint opacity-0 transition-all hover:bg-overlay hover:text-cream group-hover:opacity-100"
              >
                {copied ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
                {copied ? t('msg.copied') : t('msg.copy')}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
