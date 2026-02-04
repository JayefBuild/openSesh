import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

/**
 * Git file status from backend
 */
export interface GitFileStatus {
  path: string;
  status: string; // "modified", "added", "deleted", "renamed", "copied", "conflict"
  old_path: string | null; // For renamed/copied files
}

/**
 * Git status from backend
 */
export interface GitStatusResponse {
  branch: string;
  ahead: number;
  behind: number;
  staged: GitFileStatus[];
  unstaged: GitFileStatus[];
  untracked: string[];
  is_clean: boolean;
  has_conflicts: boolean;
}

/**
 * Git branch from backend
 */
export interface GitBranch {
  name: string;
  commit: string;
  upstream: string | null;
  is_current: boolean;
  is_remote: boolean;
}

/**
 * Git commit from backend
 */
export interface GitCommit {
  hash: string;
  short_hash: string;
  author: string;
  email: string;
  date: string;
  message: string;
  body: string;
}

interface GitStore {
  // State
  isGitRepo: boolean;
  isLoading: boolean;
  error: string | null;

  // Git status
  status: GitStatusResponse | null;

  // Branches
  branches: GitBranch[];
  currentBranch: string | null;

  // Recent commits
  recentCommits: GitCommit[];

  // Polling
  pollIntervalId: ReturnType<typeof setInterval> | null;

  // Selected file for diff
  selectedFile: string | null;
  selectedFileStaged: boolean;

  // Commit message
  commitMessage: string;

  // Actions
  checkIsGitRepo: (projectPath: string) => Promise<boolean>;
  fetchStatus: (projectPath: string) => Promise<void>;
  fetchBranches: (projectPath: string) => Promise<void>;
  fetchRecentCommits: (projectPath: string, count?: number) => Promise<void>;

  // Git operations
  stageFiles: (projectPath: string, files: string[]) => Promise<void>;
  unstageFiles: (projectPath: string, files: string[]) => Promise<void>;
  stageAll: (projectPath: string) => Promise<void>;
  discardFile: (projectPath: string, filePath: string) => Promise<void>;
  commit: (projectPath: string, message: string) => Promise<GitCommit | null>;

  // Branch operations
  checkoutBranch: (projectPath: string, branch: string) => Promise<void>;
  createBranch: (projectPath: string, name: string, checkout: boolean) => Promise<void>;

  // Remote operations
  pull: (projectPath: string) => Promise<string>;
  push: (projectPath: string, setUpstream?: boolean) => Promise<string>;
  fetch: (projectPath: string) => Promise<string>;

  // Diff
  getDiff: (projectPath: string, staged: boolean) => Promise<string>;
  getFileDiff: (projectPath: string, filePath: string, staged: boolean) => Promise<string>;

  // UI state
  setSelectedFile: (filePath: string | null, staged: boolean) => void;
  setCommitMessage: (message: string) => void;

  // Polling
  startPolling: (projectPath: string, intervalMs?: number) => void;
  stopPolling: () => void;

  // Reset
  reset: () => void;
}

const initialState = {
  isGitRepo: false,
  isLoading: false,
  error: null,
  status: null,
  branches: [],
  currentBranch: null,
  recentCommits: [],
  pollIntervalId: null,
  selectedFile: null,
  selectedFileStaged: false,
  commitMessage: '',
};

export const useGitStore = create<GitStore>((set, get) => ({
  ...initialState,

  checkIsGitRepo: async (projectPath: string) => {
    try {
      const isRepo = await invoke<boolean>('is_git_repository', { path: projectPath });
      set({ isGitRepo: isRepo });
      return isRepo;
    } catch (error) {
      console.error('Failed to check git repository:', error);
      set({ isGitRepo: false });
      return false;
    }
  },

  fetchStatus: async (projectPath: string) => {
    set({ isLoading: true, error: null });
    try {
      const status = await invoke<GitStatusResponse>('git_status', { path: projectPath });
      set({
        status,
        currentBranch: status.branch,
        isGitRepo: true,
        isLoading: false,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      set({
        error: errorMessage,
        isLoading: false,
        isGitRepo: false,
      });
    }
  },

  fetchBranches: async (projectPath: string) => {
    try {
      const branches = await invoke<GitBranch[]>('git_branches', { path: projectPath });
      set({ branches });
    } catch (error) {
      console.error('Failed to fetch branches:', error);
    }
  },

  fetchRecentCommits: async (projectPath: string, count = 10) => {
    try {
      const commits = await invoke<GitCommit[]>('git_log', { path: projectPath, count });
      set({ recentCommits: commits });
    } catch (error) {
      console.error('Failed to fetch recent commits:', error);
    }
  },

  stageFiles: async (projectPath: string, files: string[]) => {
    set({ isLoading: true, error: null });
    try {
      await invoke('git_stage', { path: projectPath, files });
      await get().fetchStatus(projectPath);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      set({ error: errorMessage, isLoading: false });
      throw error;
    }
  },

  unstageFiles: async (projectPath: string, files: string[]) => {
    set({ isLoading: true, error: null });
    try {
      await invoke('git_unstage', { path: projectPath, files });
      await get().fetchStatus(projectPath);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      set({ error: errorMessage, isLoading: false });
      throw error;
    }
  },

  stageAll: async (projectPath: string) => {
    set({ isLoading: true, error: null });
    try {
      await invoke('git_stage_all', { path: projectPath });
      await get().fetchStatus(projectPath);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      set({ error: errorMessage, isLoading: false });
      throw error;
    }
  },

  discardFile: async (projectPath: string, filePath: string) => {
    set({ isLoading: true, error: null });
    try {
      await invoke('git_discard', { path: projectPath, filePath });
      await get().fetchStatus(projectPath);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      set({ error: errorMessage, isLoading: false });
      throw error;
    }
  },

  commit: async (projectPath: string, message: string) => {
    set({ isLoading: true, error: null });
    try {
      const commit = await invoke<GitCommit>('git_commit', { path: projectPath, message });
      set({ commitMessage: '' });
      await get().fetchStatus(projectPath);
      await get().fetchRecentCommits(projectPath);
      return commit;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      set({ error: errorMessage, isLoading: false });
      throw error;
    }
  },

  checkoutBranch: async (projectPath: string, branch: string) => {
    set({ isLoading: true, error: null });
    try {
      await invoke('git_checkout', { path: projectPath, branch });
      await get().fetchStatus(projectPath);
      await get().fetchBranches(projectPath);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      set({ error: errorMessage, isLoading: false });
      throw error;
    }
  },

  createBranch: async (projectPath: string, name: string, checkout: boolean) => {
    set({ isLoading: true, error: null });
    try {
      await invoke('git_create_branch', { path: projectPath, name, checkout });
      await get().fetchStatus(projectPath);
      await get().fetchBranches(projectPath);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      set({ error: errorMessage, isLoading: false });
      throw error;
    }
  },

  pull: async (projectPath: string) => {
    set({ isLoading: true, error: null });
    try {
      const result = await invoke<string>('git_pull', { path: projectPath });
      await get().fetchStatus(projectPath);
      await get().fetchRecentCommits(projectPath);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      set({ error: errorMessage, isLoading: false });
      throw error;
    }
  },

  push: async (projectPath: string, setUpstream = false) => {
    set({ isLoading: true, error: null });
    try {
      const result = await invoke<string>('git_push', { path: projectPath, setUpstream });
      await get().fetchStatus(projectPath);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      set({ error: errorMessage, isLoading: false });
      throw error;
    }
  },

  fetch: async (projectPath: string) => {
    set({ isLoading: true, error: null });
    try {
      const result = await invoke<string>('git_fetch', { path: projectPath });
      await get().fetchStatus(projectPath);
      await get().fetchBranches(projectPath);
      set({ isLoading: false });
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      set({ error: errorMessage, isLoading: false });
      throw error;
    }
  },

  getDiff: async (projectPath: string, staged: boolean) => {
    try {
      return await invoke<string>('git_diff', { path: projectPath, staged });
    } catch (error) {
      console.error('Failed to get diff:', error);
      return '';
    }
  },

  getFileDiff: async (projectPath: string, filePath: string, staged: boolean) => {
    try {
      return await invoke<string>('git_diff_file', { path: projectPath, filePath, staged });
    } catch (error) {
      console.error('Failed to get file diff:', error);
      return '';
    }
  },

  setSelectedFile: (filePath: string | null, staged: boolean) => {
    set({ selectedFile: filePath, selectedFileStaged: staged });
  },

  setCommitMessage: (message: string) => {
    set({ commitMessage: message });
  },

  startPolling: (projectPath: string, intervalMs = 5000) => {
    // Stop any existing polling
    get().stopPolling();

    // Fetch immediately
    get().fetchStatus(projectPath);

    // Set up interval
    const pollIntervalId = setInterval(() => {
      get().fetchStatus(projectPath);
    }, intervalMs);

    set({ pollIntervalId });
  },

  stopPolling: () => {
    const { pollIntervalId } = get();
    if (pollIntervalId) {
      clearInterval(pollIntervalId);
      set({ pollIntervalId: null });
    }
  },

  reset: () => {
    get().stopPolling();
    set(initialState);
  },
}));
