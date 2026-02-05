import React, { useState, useCallback } from 'react';
import {
  Menu,
  ChevronDown,
  GitBranch,
  FolderOpen,
  GitCommit,
  Plus,
  Minus,
  FileEdit,
  PanelRightOpen,
  PanelRightClose,
} from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/uiStore';
import { useThreadStore } from '@/stores/threadStore';
import { useProjectStore } from '@/stores/projectStore';
import { usePendingChangesStore } from '@/stores/pendingChangesStore';
import { Button } from '@/components/ui/Button';
import { DropdownMenu, DropdownItem, DropdownSeparator } from '@/components/ui/Dropdown';

interface HeaderProps {
  className?: string;
}

export function Header({ className }: HeaderProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState('');

  const sidebarOpen = useUIStore((state) => state.sidebarOpen);
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);
  const diffPaneOpen = useUIStore((state) => state.diffPaneOpen);
  const toggleDiffPane = useUIStore((state) => state.toggleDiffPane);
  const uncommittedChanges = useUIStore((state) => state.uncommittedChanges);
  const setPendingChangesOpen = useUIStore((state) => state.setPendingChangesOpen);

  const pendingChanges = usePendingChangesStore((state) => state.pendingChanges);
  const pendingCount = pendingChanges.filter((c) => c.status === 'pending').length;
  const approvedCount = pendingChanges.filter((c) => c.status === 'approved').length;

  const activeThread = useThreadStore((state) => state.getActiveThread());
  const updateThread = useThreadStore((state) => state.updateThread);

  const activeProject = useProjectStore((state) => state.getActiveProject());

  // Calculate change summary
  const totalAdditions = uncommittedChanges.reduce((sum, c) => sum + c.additions, 0);
  const totalDeletions = uncommittedChanges.reduce((sum, c) => sum + c.deletions, 0);

  const handleTitleClick = () => {
    if (activeThread) {
      setEditTitle(activeThread.title);
      setIsEditingTitle(true);
    }
  };

  const handleTitleSave = () => {
    if (activeThread && editTitle.trim()) {
      updateThread(activeThread.id, { title: editTitle.trim() });
    }
    setIsEditingTitle(false);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleTitleSave();
    } else if (e.key === 'Escape') {
      setIsEditingTitle(false);
    }
  };

  // Use programmatic dragging API for reliable window dragging
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    // Only start drag on left mouse button and on the element itself (not children)
    if (e.button === 0 && e.target === e.currentTarget) {
      e.preventDefault();
      getCurrentWindow().startDragging();
    }
  }, []);

  return (
    <header
      data-tauri-drag-region
      className={cn(
        'h-12 flex items-center px-4 bg-[#0f0f0f] border-b border-[#333]',
        // Add left padding for macOS traffic lights (window controls)
        'pl-20',
        className
      )}
    >
      {/* Left section */}
      <div className="flex items-center gap-3">
        {/* Sidebar toggle */}
        {!sidebarOpen && (
          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded hover:bg-[#252525] text-[#666] hover:text-white transition-colors"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}

        {/* Thread title */}
        {activeThread ? (
          isEditingTitle ? (
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={handleTitleKeyDown}
              className="text-sm font-medium bg-[#1a1a1a] border border-blue-500 rounded px-2 py-1 focus:outline-none"
              autoFocus
            />
          ) : (
            <button
              onClick={handleTitleClick}
              className="text-sm font-medium hover:text-[#a0a0a0] transition-colors"
            >
              {activeThread.title}
            </button>
          )
        ) : (
          <span className="text-sm text-[#666]">Select or create a thread</span>
        )}

        {/* Project badge */}
        {activeProject && (
          <span className="flex items-center gap-1 px-2 py-0.5 bg-[#252525] rounded text-xs text-[#a0a0a0]">
            <FolderOpen className="h-3 w-3" />
            {activeProject.name}
          </span>
        )}
      </div>

      {/* Draggable spacer - fills the middle area for window dragging */}
      <div
        onMouseDown={handleDragStart}
        className="flex-1 h-full min-w-[40px] cursor-default"
      />

      {/* Right section */}
      <div className="flex items-center gap-2">
        {/* Pending changes button */}
        {pendingChanges.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPendingChangesOpen(true)}
            leftIcon={<FileEdit className="h-4 w-4" />}
            className="relative"
          >
            Review Changes
            {(pendingCount > 0 || approvedCount > 0) && (
              <span className="ml-1.5 flex items-center gap-1">
                {pendingCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded text-xs bg-yellow-500/20 text-yellow-500">
                    {pendingCount}
                  </span>
                )}
                {approvedCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded text-xs bg-blue-500/20 text-blue-500">
                    {approvedCount}
                  </span>
                )}
              </span>
            )}
          </Button>
        )}

        {/* Change summary badge */}
        {uncommittedChanges.length > 0 && (
          <span className="flex items-center gap-1.5 px-2 py-1 bg-[#252525] rounded text-xs">
            <span className="flex items-center text-green-500">
              <Plus className="h-3 w-3" />
              {totalAdditions}
            </span>
            <span className="flex items-center text-red-500">
              <Minus className="h-3 w-3" />
              {totalDeletions}
            </span>
          </span>
        )}

        {/* Git branch indicator */}
        {activeProject?.isGitRepo && (
          <span className="flex items-center gap-1 px-2 py-1 text-xs text-[#a0a0a0]">
            <GitBranch className="h-3 w-3" />
            main
          </span>
        )}

        {/* Source Control toggle */}
        {activeProject && (
          <button
            onClick={toggleDiffPane}
            className={cn(
              'p-1.5 rounded transition-colors',
              diffPaneOpen
                ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
                : 'hover:bg-[#252525] text-[#666] hover:text-white'
            )}
            title={diffPaneOpen ? 'Hide Source Control' : 'Show Source Control'}
          >
            {diffPaneOpen ? (
              <PanelRightClose className="h-4 w-4" />
            ) : (
              <PanelRightOpen className="h-4 w-4" />
            )}
          </button>
        )}

        {/* Open dropdown */}
        <DropdownMenu
          trigger={
            <Button variant="ghost" size="sm" rightIcon={<ChevronDown className="h-4 w-4" />}>
              Open
            </Button>
          }
          align="right"
        >
          <DropdownItem icon={<FolderOpen className="h-4 w-4" />}>
            Open Project...
          </DropdownItem>
          <DropdownItem>Open Recent</DropdownItem>
          <DropdownSeparator />
          <DropdownItem>Open in Editor</DropdownItem>
          <DropdownItem>Open in Terminal</DropdownItem>
        </DropdownMenu>

        {/* Commit dropdown */}
        {activeProject?.isGitRepo && (
          <DropdownMenu
            trigger={
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<GitCommit className="h-4 w-4" />}
                rightIcon={<ChevronDown className="h-4 w-4" />}
              >
                Commit
              </Button>
            }
            align="right"
          >
            <DropdownItem>Commit All Changes</DropdownItem>
            <DropdownItem>Commit Staged</DropdownItem>
            <DropdownSeparator />
            <DropdownItem>Amend Last Commit</DropdownItem>
            <DropdownItem>Stash Changes</DropdownItem>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}
