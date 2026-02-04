import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PanelSizes, FileChange } from '@/types';

interface UIStore {
  // Panel visibility
  sidebarOpen: boolean;
  diffPaneOpen: boolean;
  terminalOpen: boolean;
  commandPaletteOpen: boolean;
  settingsModalOpen: boolean;
  pendingChangesOpen: boolean;

  // Panel sizes (percentages or pixels)
  panelSizes: PanelSizes;

  // Diff pane state
  selectedDiffFile: string | null;
  uncommittedChanges: FileChange[];

  // Terminal state
  terminalHeight: number;

  // Loading states
  isLoading: boolean;
  loadingMessage: string | null;

  // Error state
  error: string | null;

  // Actions
  toggleSidebar: () => void;
  toggleDiffPane: () => void;
  toggleTerminal: () => void;
  toggleCommandPalette: () => void;
  toggleSettingsModal: () => void;
  togglePendingChanges: () => void;
  setSidebarOpen: (open: boolean) => void;
  setDiffPaneOpen: (open: boolean) => void;
  setTerminalOpen: (open: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setSettingsModalOpen: (open: boolean) => void;
  setPendingChangesOpen: (open: boolean) => void;
  setPanelSizes: (sizes: Partial<PanelSizes>) => void;
  setSelectedDiffFile: (path: string | null) => void;
  setUncommittedChanges: (changes: FileChange[]) => void;
  setTerminalHeight: (height: number) => void;
  setLoading: (isLoading: boolean, message?: string | null) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
}

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      // Initial state
      sidebarOpen: true,
      diffPaneOpen: true,
      terminalOpen: false,
      commandPaletteOpen: false,
      settingsModalOpen: false,
      pendingChangesOpen: false,
      panelSizes: {
        sidebar: 240,
        diffPane: 350,
        terminal: 200,
      },
      selectedDiffFile: null,
      uncommittedChanges: [],
      terminalHeight: 200,
      isLoading: false,
      loadingMessage: null,
      error: null,

      // Actions
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      toggleDiffPane: () => set((state) => ({ diffPaneOpen: !state.diffPaneOpen })),
      toggleTerminal: () => set((state) => ({ terminalOpen: !state.terminalOpen })),
      toggleCommandPalette: () =>
        set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen })),
      toggleSettingsModal: () =>
        set((state) => ({ settingsModalOpen: !state.settingsModalOpen })),
      togglePendingChanges: () =>
        set((state) => ({ pendingChangesOpen: !state.pendingChangesOpen })),

      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setDiffPaneOpen: (open) => set({ diffPaneOpen: open }),
      setTerminalOpen: (open) => set({ terminalOpen: open }),
      setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
      setSettingsModalOpen: (open) => set({ settingsModalOpen: open }),
      setPendingChangesOpen: (open) => set({ pendingChangesOpen: open }),

      setPanelSizes: (sizes) =>
        set((state) => ({
          panelSizes: { ...state.panelSizes, ...sizes },
        })),

      setSelectedDiffFile: (path) => set({ selectedDiffFile: path }),
      setUncommittedChanges: (changes) => set({ uncommittedChanges: changes }),
      setTerminalHeight: (height) => set({ terminalHeight: height }),

      setLoading: (isLoading, message = null) => set({ isLoading, loadingMessage: message }),
      setError: (error) => set({ error }),
      clearError: () => set({ error: null }),
    }),
    {
      name: 'opensesh-ui',
      partialize: (state) => ({
        sidebarOpen: state.sidebarOpen,
        diffPaneOpen: state.diffPaneOpen,
        panelSizes: state.panelSizes,
        terminalHeight: state.terminalHeight,
      }),
    }
  )
);
