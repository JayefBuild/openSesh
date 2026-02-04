import { create } from 'zustand';
import type { Message, FileChange, ToolCall } from '@/types';
import { generateId } from '@/lib/utils';

interface MessageStore {
  messages: Record<string, Message[]>; // threadId -> messages
  isGenerating: boolean;
  currentStreamingMessageId: string | null;

  // Actions
  addMessage: (threadId: string, message: Omit<Message, 'id' | 'timestamp'>) => Message;
  updateMessage: (threadId: string, messageId: string, updates: Partial<Message>) => void;
  deleteMessage: (threadId: string, messageId: string) => void;
  getMessages: (threadId: string) => Message[];
  clearMessages: (threadId: string) => void;
  setIsGenerating: (isGenerating: boolean) => void;
  setCurrentStreamingMessage: (messageId: string | null) => void;
  appendToMessage: (threadId: string, messageId: string, content: string) => void;
  addToolCall: (threadId: string, messageId: string, toolCall: ToolCall) => void;
  updateToolCall: (threadId: string, messageId: string, toolCallId: string, updates: Partial<ToolCall>) => void;
  addFileChange: (threadId: string, messageId: string, fileChange: FileChange) => void;
}

export const useMessageStore = create<MessageStore>((set, get) => ({
  messages: {},
  isGenerating: false,
  currentStreamingMessageId: null,

  addMessage: (threadId, messageData) => {
    const message: Message = {
      id: generateId(),
      timestamp: new Date(),
      ...messageData,
    };
    set((state) => ({
      messages: {
        ...state.messages,
        [threadId]: [...(state.messages[threadId] || []), message],
      },
    }));
    return message;
  },

  updateMessage: (threadId, messageId, updates) => {
    set((state) => ({
      messages: {
        ...state.messages,
        [threadId]: (state.messages[threadId] || []).map((m) =>
          m.id === messageId ? { ...m, ...updates } : m
        ),
      },
    }));
  },

  deleteMessage: (threadId, messageId) => {
    set((state) => ({
      messages: {
        ...state.messages,
        [threadId]: (state.messages[threadId] || []).filter((m) => m.id !== messageId),
      },
    }));
  },

  getMessages: (threadId) => {
    return get().messages[threadId] || [];
  },

  clearMessages: (threadId) => {
    set((state) => ({
      messages: {
        ...state.messages,
        [threadId]: [],
      },
    }));
  },

  setIsGenerating: (isGenerating) => {
    set({ isGenerating });
  },

  setCurrentStreamingMessage: (messageId) => {
    set({ currentStreamingMessageId: messageId });
  },

  appendToMessage: (threadId, messageId, content) => {
    set((state) => ({
      messages: {
        ...state.messages,
        [threadId]: (state.messages[threadId] || []).map((m) =>
          m.id === messageId ? { ...m, content: m.content + content } : m
        ),
      },
    }));
  },

  addToolCall: (threadId, messageId, toolCall) => {
    set((state) => ({
      messages: {
        ...state.messages,
        [threadId]: (state.messages[threadId] || []).map((m) =>
          m.id === messageId
            ? { ...m, toolCalls: [...(m.toolCalls || []), toolCall] }
            : m
        ),
      },
    }));
  },

  updateToolCall: (threadId, messageId, toolCallId, updates) => {
    set((state) => ({
      messages: {
        ...state.messages,
        [threadId]: (state.messages[threadId] || []).map((m) =>
          m.id === messageId
            ? {
                ...m,
                toolCalls: (m.toolCalls || []).map((tc) =>
                  tc.id === toolCallId ? { ...tc, ...updates } : tc
                ),
              }
            : m
        ),
      },
    }));
  },

  addFileChange: (threadId, messageId, fileChange) => {
    set((state) => ({
      messages: {
        ...state.messages,
        [threadId]: (state.messages[threadId] || []).map((m) =>
          m.id === messageId
            ? { ...m, fileChanges: [...(m.fileChanges || []), fileChange] }
            : m
        ),
      },
    }));
  },
}));
