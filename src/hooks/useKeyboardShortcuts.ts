import { useEffect, useCallback } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useThreadStore } from '@/stores/threadStore';
import { useProjectStore } from '@/stores/projectStore';
import { getPlatform } from '@/lib/utils';

interface ShortcutHandler {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  handler: () => void;
  preventDefault?: boolean;
}

export function useKeyboardShortcuts(additionalShortcuts?: ShortcutHandler[]) {
  const toggleCommandPalette = useUIStore((state) => state.toggleCommandPalette);
  const toggleTerminal = useUIStore((state) => state.toggleTerminal);
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);
  const toggleSettingsModal = useUIStore((state) => state.toggleSettingsModal);
  const setCommandPaletteOpen = useUIStore((state) => state.setCommandPaletteOpen);
  const commandPaletteOpen = useUIStore((state) => state.commandPaletteOpen);
  const settingsModalOpen = useUIStore((state) => state.settingsModalOpen);

  const createThread = useThreadStore((state) => state.createThread);
  const activeProjectId = useProjectStore((state) => state.activeProjectId);

  const isMac = getPlatform() === 'macos';

  const handleNewThread = useCallback(() => {
    if (activeProjectId) {
      createThread(activeProjectId);
    }
  }, [activeProjectId, createThread]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const modifier = isMac ? event.metaKey : event.ctrlKey;
      const key = event.key.toLowerCase();

      // Close modals on Escape
      if (key === 'escape') {
        if (commandPaletteOpen) {
          setCommandPaletteOpen(false);
          event.preventDefault();
          return;
        }
        if (settingsModalOpen) {
          toggleSettingsModal();
          event.preventDefault();
          return;
        }
      }

      // Cmd/Ctrl + K: Command palette
      if (modifier && key === 'k') {
        event.preventDefault();
        toggleCommandPalette();
        return;
      }

      // Cmd/Ctrl + J: Toggle terminal
      if (modifier && key === 'j') {
        event.preventDefault();
        toggleTerminal();
        return;
      }

      // Cmd/Ctrl + N: New thread
      if (modifier && key === 'n') {
        event.preventDefault();
        handleNewThread();
        return;
      }

      // Cmd/Ctrl + ,: Settings
      if (modifier && key === ',') {
        event.preventDefault();
        toggleSettingsModal();
        return;
      }

      // Cmd/Ctrl + B: Toggle sidebar
      if (modifier && key === 'b') {
        event.preventDefault();
        toggleSidebar();
        return;
      }

      // Handle additional shortcuts
      if (additionalShortcuts) {
        for (const shortcut of additionalShortcuts) {
          const ctrlMatch = shortcut.ctrl ? (isMac ? event.metaKey : event.ctrlKey) : true;
          const metaMatch = shortcut.meta ? event.metaKey : true;
          const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey;
          const altMatch = shortcut.alt ? event.altKey : !event.altKey;
          const keyMatch = key === shortcut.key.toLowerCase();

          if (ctrlMatch && metaMatch && shiftMatch && altMatch && keyMatch) {
            if (shortcut.preventDefault !== false) {
              event.preventDefault();
            }
            shortcut.handler();
            return;
          }
        }
      }
    },
    [
      isMac,
      commandPaletteOpen,
      settingsModalOpen,
      toggleCommandPalette,
      toggleTerminal,
      toggleSidebar,
      toggleSettingsModal,
      handleNewThread,
      setCommandPaletteOpen,
      additionalShortcuts,
    ]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

// Hook for getting shortcut display text
export function useShortcutDisplay() {
  const isMac = getPlatform() === 'macos';
  const modifier = isMac ? '\u2318' : 'Ctrl';

  return {
    modifier,
    commandPalette: `${modifier}K`,
    terminal: `${modifier}J`,
    newThread: `${modifier}N`,
    settings: `${modifier},`,
    sidebar: `${modifier}B`,
    send: `${modifier}\u21B5`,
  };
}
