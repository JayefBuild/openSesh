import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  MessageSquare,
  FolderOpen,
  Settings,
  Terminal,
  GitBranch,
  FileText,
  Zap,
  Command,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/uiStore';
import { useThreadStore } from '@/stores/threadStore';
import { useProjectStore } from '@/stores/projectStore';
import { useShortcutDisplay } from '@/hooks/useKeyboardShortcuts';
import type { Command as CommandType } from '@/types';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const toggleTerminal = useUIStore((state) => state.toggleTerminal);
  const toggleSettingsModal = useUIStore((state) => state.toggleSettingsModal);
  const toggleDiffPane = useUIStore((state) => state.toggleDiffPane);

  const createThread = useThreadStore((state) => state.createThread);
  const activeProjectId = useProjectStore((state) => state.activeProjectId);

  const shortcuts = useShortcutDisplay();

  // Define available commands
  const commands: CommandType[] = useMemo(
    () => [
      {
        id: 'new-thread',
        label: 'New Thread',
        shortcut: shortcuts.newThread,
        category: 'suggested',
        icon: 'message',
        action: () => {
          if (activeProjectId) {
            createThread(activeProjectId);
          }
          onClose();
        },
      },
      {
        id: 'toggle-terminal',
        label: 'Toggle Terminal',
        shortcut: shortcuts.terminal,
        category: 'navigation',
        icon: 'terminal',
        action: () => {
          toggleTerminal();
          onClose();
        },
      },
      {
        id: 'open-settings',
        label: 'Open Settings',
        shortcut: shortcuts.settings,
        category: 'navigation',
        icon: 'settings',
        action: () => {
          toggleSettingsModal();
          onClose();
        },
      },
      {
        id: 'toggle-diff',
        label: 'Toggle Diff Pane',
        category: 'navigation',
        icon: 'git',
        action: () => {
          toggleDiffPane();
          onClose();
        },
      },
      {
        id: 'open-project',
        label: 'Open Project...',
        category: 'actions',
        icon: 'folder',
        action: () => {
          // TODO: Implement project opening
          onClose();
        },
      },
      {
        id: 'go-to-file',
        label: 'Go to File...',
        category: 'navigation',
        icon: 'file',
        action: () => {
          // TODO: Implement file navigation
          onClose();
        },
      },
      {
        id: 'run-automation',
        label: 'Run Automation...',
        category: 'actions',
        icon: 'zap',
        action: () => {
          // TODO: Implement automation runner
          onClose();
        },
      },
    ],
    [
      activeProjectId,
      createThread,
      onClose,
      toggleTerminal,
      toggleSettingsModal,
      toggleDiffPane,
      shortcuts,
    ]
  );

  // Filter commands based on query
  const filteredCommands = useMemo(() => {
    if (!query.trim()) {
      return commands;
    }

    const lowerQuery = query.toLowerCase();
    return commands.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(lowerQuery) ||
        cmd.category.toLowerCase().includes(lowerQuery)
    );
  }, [commands, query]);

  // Group commands by category
  const groupedCommands = useMemo(() => {
    const groups: Record<string, CommandType[]> = {
      suggested: [],
      navigation: [],
      actions: [],
    };

    for (const cmd of filteredCommands) {
      if (groups[cmd.category]) {
        groups[cmd.category].push(cmd);
      }
    }

    return groups;
  }, [filteredCommands]);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Reset query when closed
  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) =>
            Math.min(prev + 1, filteredCommands.length - 1)
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (filteredCommands[selectedIndex]) {
            filteredCommands[selectedIndex].action();
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [filteredCommands, selectedIndex, onClose]
  );

  const getIcon = (iconName?: string) => {
    switch (iconName) {
      case 'message':
        return <MessageSquare className="h-4 w-4" />;
      case 'terminal':
        return <Terminal className="h-4 w-4" />;
      case 'settings':
        return <Settings className="h-4 w-4" />;
      case 'folder':
        return <FolderOpen className="h-4 w-4" />;
      case 'file':
        return <FileText className="h-4 w-4" />;
      case 'git':
        return <GitBranch className="h-4 w-4" />;
      case 'zap':
        return <Zap className="h-4 w-4" />;
      default:
        return <Command className="h-4 w-4" />;
    }
  };

  const categoryLabels: Record<string, string> = {
    suggested: 'Suggested',
    navigation: 'Navigation',
    actions: 'Actions',
  };

  let flatIndex = 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            className="absolute inset-0 bg-black/60"
            onClick={onClose}
          />

          {/* Palette */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.15 }}
            className="relative w-full max-w-lg bg-[#1a1a1a] border border-[#333] rounded-lg shadow-2xl overflow-hidden"
          >
            {/* Search input */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[#333]">
              <Search className="h-5 w-5 text-[#666]" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a command or search..."
                className="flex-1 bg-transparent text-white placeholder:text-[#666] focus:outline-none"
                autoFocus
              />
              <kbd className="px-2 py-1 bg-[#252525] rounded text-xs text-[#666]">esc</kbd>
            </div>

            {/* Command list */}
            <div className="max-h-80 overflow-y-auto py-2">
              {filteredCommands.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-sm text-[#666]">No commands found</p>
                </div>
              ) : (
                Object.entries(groupedCommands).map(([category, cmds]) =>
                  cmds.length > 0 ? (
                    <div key={category}>
                      <div className="px-4 py-1.5">
                        <span className="text-xs text-[#666] font-medium">
                          {categoryLabels[category] || category}
                        </span>
                      </div>
                      {cmds.map((cmd) => {
                        const index = flatIndex++;
                        return (
                          <CommandItem
                            key={cmd.id}
                            command={cmd}
                            icon={getIcon(cmd.icon)}
                            isSelected={index === selectedIndex}
                            onClick={() => cmd.action()}
                            onMouseEnter={() => setSelectedIndex(index)}
                          />
                        );
                      })}
                    </div>
                  ) : null
                )
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

interface CommandItemProps {
  command: CommandType;
  icon: React.ReactNode;
  isSelected: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
}

function CommandItem({
  command,
  icon,
  isSelected,
  onClick,
  onMouseEnter,
}: CommandItemProps) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-2 text-left transition-colors',
        isSelected ? 'bg-[#252525]' : 'hover:bg-[#252525]'
      )}
    >
      <span className="text-[#666]">{icon}</span>
      <span className="flex-1 text-sm">{command.label}</span>
      {command.shortcut && (
        <kbd className="px-2 py-0.5 bg-[#333] rounded text-xs text-[#666] font-mono">
          {command.shortcut}
        </kbd>
      )}
    </button>
  );
}
