import React, { useState } from 'react';
import { MessageSquare, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useThreadStore } from '@/stores/threadStore';
import { DropdownMenu, DropdownItem, DropdownSeparator } from '@/components/ui/Dropdown';
import type { Thread } from '@/types';

interface ThreadItemProps {
  thread: Thread;
}

export function ThreadItem({ thread }: ThreadItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(thread.title);

  const activeThreadId = useThreadStore((state) => state.activeThreadId);
  const setActiveThread = useThreadStore((state) => state.setActiveThread);
  const updateThread = useThreadStore((state) => state.updateThread);
  const deleteThread = useThreadStore((state) => state.deleteThread);

  const isActive = thread.id === activeThreadId;

  const handleClick = () => {
    if (!isEditing) {
      setActiveThread(thread.id);
    }
  };

  const handleRename = () => {
    setIsEditing(true);
    setEditTitle(thread.title);
  };

  const handleSaveRename = () => {
    if (editTitle.trim()) {
      updateThread(thread.id, { title: editTitle.trim() });
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveRename();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setEditTitle(thread.title);
    }
  };

  const handleDelete = () => {
    deleteThread(thread.id);
  };

  return (
    <div
      className={cn(
        'group flex items-center gap-2 px-2 py-1.5 rounded-md text-sm cursor-pointer',
        'hover:bg-[#252525] transition-colors',
        isActive && 'bg-[#252525]'
      )}
      onClick={handleClick}
    >
      <MessageSquare className="h-4 w-4 text-[#666] flex-shrink-0" />

      {isEditing ? (
        <input
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onBlur={handleSaveRename}
          onKeyDown={handleKeyDown}
          className="flex-1 min-w-0 bg-[#1a1a1a] border border-blue-500 rounded px-1 py-0.5 text-sm focus:outline-none"
          autoFocus
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="truncate flex-1">{thread.title}</span>
      )}

      <DropdownMenu
        trigger={
          <button
            onClick={(e) => e.stopPropagation()}
            className={cn(
              'p-1 rounded hover:bg-[#333] transition-colors',
              'opacity-0 group-hover:opacity-100',
              isActive && 'opacity-100'
            )}
          >
            <MoreHorizontal className="h-4 w-4 text-[#666]" />
          </button>
        }
        align="right"
      >
        <DropdownItem onClick={handleRename} icon={<Pencil className="h-4 w-4" />}>
          Rename
        </DropdownItem>
        <DropdownSeparator />
        <DropdownItem
          onClick={handleDelete}
          icon={<Trash2 className="h-4 w-4" />}
          danger
        >
          Delete
        </DropdownItem>
      </DropdownMenu>
    </div>
  );
}
