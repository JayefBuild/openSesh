import { useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUIStore } from '@/stores/uiStore';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { Resizable, usePanelResize } from './ResizablePanels';
import { ChatPane } from '@/components/chat/ChatPane';
import { DiffPane } from '@/components/diff/DiffPane';
import { TerminalPane } from '@/components/terminal/TerminalPane';
import { CommandPalette } from '@/components/command-palette/CommandPalette';
import { SettingsModal } from '@/components/layout/SettingsModal';
import { PendingChangesModal } from '@/components/changes/PendingChangesModal';

export function MainLayout() {
  // Initialize keyboard shortcuts
  useKeyboardShortcuts();

  const sidebarOpen = useUIStore((state) => state.sidebarOpen);
  const diffPaneOpen = useUIStore((state) => state.diffPaneOpen);
  const terminalOpen = useUIStore((state) => state.terminalOpen);
  const commandPaletteOpen = useUIStore((state) => state.commandPaletteOpen);
  const settingsModalOpen = useUIStore((state) => state.settingsModalOpen);
  const pendingChangesOpen = useUIStore((state) => state.pendingChangesOpen);
  const setCommandPaletteOpen = useUIStore((state) => state.setCommandPaletteOpen);
  const setSettingsModalOpen = useUIStore((state) => state.setSettingsModalOpen);
  const setPendingChangesOpen = useUIStore((state) => state.setPendingChangesOpen);
  const setPanelSizes = useUIStore((state) => state.setPanelSizes);
  const panelSizes = useUIStore((state) => state.panelSizes);

  // Panel resize handlers
  const { size: sidebarWidth, handleResize: handleSidebarResize } = usePanelResize(
    panelSizes.sidebar,
    { minSize: 200, maxSize: 400, direction: 'increase' }
  );

  const { size: diffPaneWidth, handleResize: handleDiffPaneResize } = usePanelResize(
    panelSizes.diffPane,
    { minSize: 250, maxSize: 600, direction: 'decrease' }
  );

  const { size: terminalHeight, handleResize: handleTerminalResize } = usePanelResize(
    panelSizes.terminal,
    { minSize: 100, maxSize: 400, direction: 'decrease' }
  );

  // Update store when panel sizes change
  const handleSidebarResizeWithStore = useCallback(
    (delta: number) => {
      handleSidebarResize(delta);
      setPanelSizes({ sidebar: sidebarWidth + delta });
    },
    [handleSidebarResize, sidebarWidth, setPanelSizes]
  );

  const handleDiffPaneResizeWithStore = useCallback(
    (delta: number) => {
      handleDiffPaneResize(delta);
      setPanelSizes({ diffPane: diffPaneWidth - delta });
    },
    [handleDiffPaneResize, diffPaneWidth, setPanelSizes]
  );

  const handleTerminalResizeWithStore = useCallback(
    (delta: number) => {
      handleTerminalResize(delta);
      setPanelSizes({ terminal: terminalHeight - delta });
    },
    [handleTerminalResize, terminalHeight, setPanelSizes]
  );

  return (
    <div className="h-full flex flex-col bg-[#0f0f0f]">
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <Sidebar />

        {/* Sidebar resize handle */}
        {sidebarOpen && (
          <Resizable direction="horizontal" onResize={handleSidebarResizeWithStore} />
        )}

        {/* Main content area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <Header />

          {/* Content with diff pane and terminal */}
          <div className="flex-1 flex overflow-hidden">
            {/* Chat area + terminal */}
            <div className="flex-1 flex flex-col min-w-0">
              {/* Chat pane */}
              <div className="flex-1 min-h-0">
                <ChatPane />
              </div>

              {/* Terminal resize handle */}
              {terminalOpen && (
                <Resizable
                  direction="vertical"
                  onResize={handleTerminalResizeWithStore}
                />
              )}

              {/* Terminal pane - always mounted to preserve session */}
              <div
                style={{
                  height: terminalOpen ? terminalHeight : 0,
                  overflow: 'hidden',
                }}
                className={terminalOpen ? 'border-t border-[#333]' : ''}
              >
                <div style={{ height: terminalHeight, visibility: terminalOpen ? 'visible' : 'hidden' }}>
                  <TerminalPane />
                </div>
              </div>
            </div>

            {/* Diff pane resize handle */}
            {diffPaneOpen && (
              <Resizable direction="horizontal" onResize={handleDiffPaneResizeWithStore} />
            )}

            {/* Diff pane */}
            <AnimatePresence>
              {diffPaneOpen && (
                <motion.div
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: diffPaneWidth, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden border-l border-[#333]"
                >
                  <DiffPane />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Command palette modal */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
      />

      {/* Settings modal */}
      <SettingsModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
      />

      {/* Pending changes modal */}
      <PendingChangesModal
        isOpen={pendingChangesOpen}
        onClose={() => setPendingChangesOpen(false)}
      />
    </div>
  );
}
