import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Thread } from '@/types';
import { generateId } from '@/lib/utils';

interface CreateThreadOptions {
  providerId?: string;
  modelId?: string;
  enabledSkillIds?: string[];
  useCustomSkillConfig?: boolean;
  planModeEnabled?: boolean;
}

interface ThreadStore {
  threads: Thread[];
  activeThreadId: string | null;

  // Actions
  createThread: (projectId: string, options?: CreateThreadOptions) => Thread;
  deleteThread: (id: string) => void;
  updateThread: (id: string, updates: Partial<Thread>) => void;
  setActiveThread: (id: string | null) => void;
  getActiveThread: () => Thread | null;
  getThreadsByProject: (projectId: string) => Thread[];
  setThreads: (threads: Thread[]) => void;
}

export const useThreadStore = create<ThreadStore>()(
  persist(
    (set, get) => ({
      threads: [],
      activeThreadId: null,

      createThread: (projectId, options = {}) => {
        const {
          providerId = 'anthropic',
          modelId = 'claude-sonnet-4-20250514',
          enabledSkillIds,
          useCustomSkillConfig = false,
          planModeEnabled = false,
        } = options;

        const now = new Date();
        const thread: Thread = {
          id: generateId(),
          projectId,
          title: 'New Thread',
          providerId,
          modelId,
          createdAt: now,
          updatedAt: now,
          enabledSkillIds,
          useCustomSkillConfig,
          planModeEnabled,
          currentPlanId: null,
        };
        set((state) => ({
          threads: [thread, ...state.threads],
          activeThreadId: thread.id,
        }));
        return thread;
      },

      deleteThread: (id) => {
        set((state) => ({
          threads: state.threads.filter((t) => t.id !== id),
          activeThreadId: state.activeThreadId === id ? null : state.activeThreadId,
        }));
      },

      updateThread: (id, updates) => {
        set((state) => ({
          threads: state.threads.map((t) =>
            t.id === id ? { ...t, ...updates, updatedAt: new Date() } : t
          ),
        }));
      },

      setActiveThread: (id) => {
        set({ activeThreadId: id });
      },

      getActiveThread: () => {
        const { threads, activeThreadId } = get();
        return threads.find((t) => t.id === activeThreadId) || null;
      },

      getThreadsByProject: (projectId) => {
        const { threads } = get();
        return threads
          .filter((t) => t.projectId === projectId)
          .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      },

      setThreads: (threads) => {
        set({ threads });
      },
    }),
    {
      name: 'opensesh-threads',
      partialize: (state) => ({
        threads: state.threads,
        activeThreadId: state.activeThreadId,
      }),
    }
  )
);
