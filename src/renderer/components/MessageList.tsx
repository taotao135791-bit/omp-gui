import MessageItem from './MessageItem'
import { MessageLike } from '../store'

interface MessageListProps {
  messages: MessageLike[]
}

export default function MessageList({ messages }: MessageListProps) {
  return (
    <div className="flex flex-col gap-5 px-4 py-6">
      {messages.map((message) => (
        <MessageItem key={message.id} message={message} />
      ))}
    </div>
  )
}
