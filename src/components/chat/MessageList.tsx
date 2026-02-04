import { useEffect, useRef, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useMessageStore } from '@/stores/messageStore';
import { MessageBubble } from './MessageBubble';

interface MessageListProps {
  threadId: string;
  className?: string;
}

export function MessageList({ threadId, className }: MessageListProps) {
  const allMessages = useMessageStore((state) => state.messages);
  const messages = useMemo(() => allMessages[threadId] || [], [allMessages, threadId]);
  const isGenerating = useMessageStore((state) => state.isGenerating);
  const currentStreamingMessageId = useMessageStore((state) => state.currentStreamingMessageId);
  const listRef = useRef<HTMLDivElement>(null);

  // Get streaming message content for scroll dependency
  const streamingContent = useMemo(() => {
    if (!currentStreamingMessageId) return '';
    const msg = messages.find(m => m.id === currentStreamingMessageId);
    return msg?.content || '';
  }, [messages, currentStreamingMessageId]);

  // Auto-scroll to bottom when new messages arrive or streaming content updates
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages.length, isGenerating, streamingContent]);

  if (messages.length === 0) {
    return (
      <div className={cn('h-full flex items-center justify-center p-8', className)}>
        <div className="text-center max-w-md">
          <p className="text-[#666] text-sm">
            Send a message to start the conversation. Ask questions about your code,
            request changes, or explore the codebase.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      className={cn('h-full overflow-y-auto px-4 py-6 space-y-6', className)}
    >
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}

      {/* Typing indicator when generating */}
      {isGenerating && (
        <div className="flex items-center gap-2 text-[#666]">
          <div className="flex gap-1">
            <span className="w-2 h-2 bg-[#666] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-2 h-2 bg-[#666] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-2 h-2 bg-[#666] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
          <span className="text-sm">Thinking...</span>
        </div>
      )}
    </div>
  );
}
