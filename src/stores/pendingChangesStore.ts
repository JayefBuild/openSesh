import { create } from 'zustand';
import { writeFile, readFile } from '@/lib/tauri';
import { useGitStore } from './gitStore';

/**
 * Status of a pending file change
 */
export type PendingChangeStatus = 'pending' | 'approved' | 'rejected' | 'applied' | 'error';

/**
 * A pending file change proposed by the AI
 */
export interface PendingFileChange {
  id: string;
  messageId: string;
  path: string;
  type: 'create' | 'modify' | 'delete';
  originalContent: string | null;
  proposedContent: string;
  status: PendingChangeStatus;
  additions: number;
  deletions: number;
  error?: string;
  appliedAt?: Date;
}

interface PendingChangesStore {
  // State
  pendingChanges: PendingFileChange[];
  selectedChangeId: string | null;
  isApplying: boolean;

  // Actions
  addPendingChange: (change: Omit<PendingFileChange, 'id' | 'status'>) => string;
  addPendingChanges: (changes: Omit<PendingFileChange, 'id' | 'status'>[]) => string[];
  removePendingChange: (id: string) => void;
  clearPendingChanges: () => void;
  clearPendingChangesForMessage: (messageId: string) => void;

  // Status updates
  approveChange: (id: string) => void;
  rejectChange: (id: string) => void;
  approveAll: () => void;
  rejectAll: () => void;

  // Apply changes
  applyChange: (id: string, projectPath: string) => Promise<void>;
  applyAllApproved: (projectPath: string) => Promise<void>;
  revertChange: (id: string, projectPath: string) => Promise<void>;

  // Edit proposed content
  updateProposedContent: (id: string, content: string) => void;

  // UI state
  setSelectedChange: (id: string | null) => void;
  getChangeById: (id: string) => PendingFileChange | undefined;
  getPendingCount: () => number;
  getApprovedCount: () => number;
}

let changeIdCounter = 0;
const generateChangeId = () => `pending-change-${Date.now()}-${++changeIdCounter}`;

export const usePendingChangesStore = create<PendingChangesStore>((set, get) => ({
  pendingChanges: [],
  selectedChangeId: null,
  isApplying: false,

  addPendingChange: (change) => {
    const id = generateChangeId();
    const newChange: PendingFileChange = {
      ...change,
      id,
      status: 'pending',
    };
    set((state) => ({
      pendingChanges: [...state.pendingChanges, newChange],
    }));
    return id;
  },

  addPendingChanges: (changes) => {
    const ids: string[] = [];
    const newChanges = changes.map((change) => {
      const id = generateChangeId();
      ids.push(id);
      return {
        ...change,
        id,
        status: 'pending' as const,
      };
    });
    set((state) => ({
      pendingChanges: [...state.pendingChanges, ...newChanges],
    }));
    return ids;
  },

  removePendingChange: (id) => {
    set((state) => ({
      pendingChanges: state.pendingChanges.filter((c) => c.id !== id),
      selectedChangeId: state.selectedChangeId === id ? null : state.selectedChangeId,
    }));
  },

  clearPendingChanges: () => {
    set({ pendingChanges: [], selectedChangeId: null });
  },

  clearPendingChangesForMessage: (messageId) => {
    set((state) => ({
      pendingChanges: state.pendingChanges.filter((c) => c.messageId !== messageId),
    }));
  },

  approveChange: (id) => {
    set((state) => ({
      pendingChanges: state.pendingChanges.map((c) =>
        c.id === id ? { ...c, status: 'approved' as const } : c
      ),
    }));
  },

  rejectChange: (id) => {
    set((state) => ({
      pendingChanges: state.pendingChanges.map((c) =>
        c.id === id ? { ...c, status: 'rejected' as const } : c
      ),
    }));
  },

  approveAll: () => {
    set((state) => ({
      pendingChanges: state.pendingChanges.map((c) =>
        c.status === 'pending' ? { ...c, status: 'approved' as const } : c
      ),
    }));
  },

  rejectAll: () => {
    set((state) => ({
      pendingChanges: state.pendingChanges.map((c) =>
        c.status === 'pending' ? { ...c, status: 'rejected' as const } : c
      ),
    }));
  },

  applyChange: async (id, projectPath) => {
    const { pendingChanges } = get();
    const change = pendingChanges.find((c) => c.id === id);
    if (!change || change.status !== 'approved') {
      return;
    }

    set({ isApplying: true });

    try {
      const fullPath = change.path.startsWith('/')
        ? change.path
        : `${projectPath}/${change.path}`;

      if (change.type === 'delete') {
        // For delete, we could either delete the file or write empty content
        // For now, we'll write empty content as a soft delete
        await writeFile(fullPath, '');
      } else {
        // Create or modify - write the proposed content
        await writeFile(fullPath, change.proposedContent);
      }

      set((state) => ({
        pendingChanges: state.pendingChanges.map((c) =>
          c.id === id
            ? { ...c, status: 'applied' as const, appliedAt: new Date() }
            : c
        ),
        isApplying: false,
      }));

      // Refresh git status
      const gitStore = useGitStore.getState();
      if (gitStore.isGitRepo) {
        await gitStore.fetchStatus(projectPath);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      set((state) => ({
        pendingChanges: state.pendingChanges.map((c) =>
          c.id === id
            ? { ...c, status: 'error' as const, error: errorMessage }
            : c
        ),
        isApplying: false,
      }));
      throw error;
    }
  },

  applyAllApproved: async (projectPath) => {
    const { pendingChanges, applyChange } = get();
    const approvedChanges = pendingChanges.filter((c) => c.status === 'approved');

    for (const change of approvedChanges) {
      try {
        await applyChange(change.id, projectPath);
      } catch (error) {
        console.error(`Failed to apply change ${change.id}:`, error);
        // Continue applying other changes
      }
    }
  },

  revertChange: async (id, projectPath) => {
    const { pendingChanges } = get();
    const change = pendingChanges.find((c) => c.id === id);
    if (!change || change.status !== 'applied' || change.originalContent === null) {
      return;
    }

    set({ isApplying: true });

    try {
      const fullPath = change.path.startsWith('/')
        ? change.path
        : `${projectPath}/${change.path}`;

      // Write the original content back
      await writeFile(fullPath, change.originalContent);

      set((state) => ({
        pendingChanges: state.pendingChanges.map((c) =>
          c.id === id ? { ...c, status: 'pending' as const, appliedAt: undefined } : c
        ),
        isApplying: false,
      }));

      // Refresh git status
      const gitStore = useGitStore.getState();
      if (gitStore.isGitRepo) {
        await gitStore.fetchStatus(projectPath);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      set((state) => ({
        pendingChanges: state.pendingChanges.map((c) =>
          c.id === id ? { ...c, error: errorMessage } : c
        ),
        isApplying: false,
      }));
      throw error;
    }
  },

  updateProposedContent: (id, content) => {
    set((state) => ({
      pendingChanges: state.pendingChanges.map((c) =>
        c.id === id ? { ...c, proposedContent: content } : c
      ),
    }));
  },

  setSelectedChange: (id) => {
    set({ selectedChangeId: id });
  },

  getChangeById: (id) => {
    return get().pendingChanges.find((c) => c.id === id);
  },

  getPendingCount: () => {
    return get().pendingChanges.filter((c) => c.status === 'pending').length;
  },

  getApprovedCount: () => {
    return get().pendingChanges.filter((c) => c.status === 'approved').length;
  },
}));

/**
 * Helper function to calculate additions and deletions from content diff
 */
export function calculateDiffStats(
  originalContent: string | null,
  newContent: string
): { additions: number; deletions: number } {
  const originalLines = originalContent?.split('\n') || [];
  const newLines = newContent.split('\n');

  // Simple line-based diff count
  const originalSet = new Set(originalLines);
  const newSet = new Set(newLines);

  let additions = 0;
  let deletions = 0;

  for (const line of newLines) {
    if (!originalSet.has(line)) {
      additions++;
    }
  }

  for (const line of originalLines) {
    if (!newSet.has(line)) {
      deletions++;
    }
  }

  return { additions, deletions };
}

/**
 * Helper to read file content safely, returning null if file doesn't exist
 */
export async function readFileOrNull(path: string): Promise<string | null> {
  try {
    return await readFile(path);
  } catch {
    return null;
  }
}
