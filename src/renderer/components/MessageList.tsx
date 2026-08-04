import MessageItem from './MessageItem'
import { MessageLike } from '../store'

interface MessageListProps {
  messages: MessageLike[]
}

export default function MessageList({ messages }: MessageListProps) {
  return (
    <div className="flex flex-col gap-6 p-4">
      {messages.map((message) => (
        <MessageItem key={message.id} message={message} />
      ))}
    </div>
  )
}
