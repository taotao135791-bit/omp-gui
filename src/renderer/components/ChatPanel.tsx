import { useRef, useEffect } from 'react'
import { Bot, MoreHorizontal, Cpu } from 'lucide-react'
import { useAppStore } from '../store'
import MessageList from './MessageList'
import Composer from './Composer'

export default function ChatPanel() {
  const {
    currentSessionId,
    currentProject,
    sessions,
    messages,
    modules,
    cliAvailable
  } = useAppStore()

  const currentSession = sessions.find((s) => s.id === currentSessionId)
  const sessionMessages = currentSessionId ? messages[currentSessionId] || [] : []
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [sessionMessages])

  const handleSend = async (text: string) => {
    if (!currentSessionId || !text.trim() || cliAvailable === false) return
    useAppStore.getState().addMessage(currentSessionId, {
      id: crypto.randomUUID(),
      role: 'user',
      content: text.trim()
    })
    await window.electronAPI.sendMessage(currentSessionId, text.trim())
  }

  const enabledCount = modules.filter((m) => m.enabled).length

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-surface-700 bg-surface-800/50 px-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-700">
            <Bot size={16} />
          </div>
          <div>
            <div className="text-sm font-medium text-white">
              {currentSession ? currentSession.title : 'No active session'}
            </div>
            <div className="text-xs text-gray-500">
              {currentProject || 'No project selected'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 rounded-full bg-surface-700/50 px-3 py-1 text-xs text-gray-400">
            <Cpu size={12} />
            {enabledCount} module{enabledCount !== 1 ? 's' : ''} active
          </div>
          <button className="rounded p-1.5 text-gray-400 hover:bg-surface-700">
            <MoreHorizontal size={18} />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        {currentSessionId ? (
          <MessageList messages={sessionMessages} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center px-8 text-center text-gray-500">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-800">
              <Bot size={32} />
            </div>
            <h2 className="mb-2 text-xl font-semibold text-gray-200">Start a conversation</h2>
            <p className="max-w-sm text-sm">
              Select a project folder and click "New Chat" to begin coding with Oh My Pi.
            </p>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <Composer onSend={handleSend} disabled={!currentSessionId} />
    </div>
  )
}
