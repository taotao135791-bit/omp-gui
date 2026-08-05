import MessageItem from './MessageItem'
import { MessageLike } from '../store'

interface MessageListProps {
  messages: MessageLike[]
  sessionId?: string | null
}

export default function MessageList({ messages, sessionId = null }: MessageListProps) {
  return (
    <div className="flex flex-col gap-5 px-4 py-6">
      {messages.map((message, index) => (
        <MessageItem key={message.id} message={message} index={index} sessionId={sessionId} />
      ))}
    </div>
  )
}
