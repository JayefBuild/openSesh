import { useState, useCallback } from 'react';
import {
  FileText,
  FilePlus,
  FileX,
  FilePen,
  ChevronDown,
  ChevronRight,
  Check,
  X,
  Play,
  Plus,
  Minus,
} from 'lucide-react';
import { cn, getFileName } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { FileChangePreview } from './FileChangePreview';
import {
  FileApprovalActions,
  StatusBadge,
  InlineApprovalActions,
} from './FileApprovalActions';
import {
  usePendingChangesStore,
  type PendingFileChange,
} from '@/stores/pendingChangesStore';
import { useProjectStore } from '@/stores/projectStore';

interface PendingChangesPanelProps {
  className?: string;
}

export function PendingChangesPanel({ className }: PendingChangesPanelProps) {
  const {
    pendingChanges,
    selectedChangeId,
    setSelectedChange,
    approveChange,
    rejectChange,
    approveAll,
    rejectAll,
    applyChange,
    applyAllApproved,
    revertChange,
    updateProposedContent,
    getPendingCount,
    getApprovedCount,
  } = usePendingChangesStore();

  const activeProject = useProjectStore((state) => state.getActiveProject());
  const projectPath = activeProject?.path || '';

  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [isApplyingAll, setIsApplyingAll] = useState(false);

  const selectedChange = pendingChanges.find((c) => c.id === selectedChangeId);
  const pendingCount = getPendingCount();
  const approvedCount = getApprovedCount();

  const handleSelectChange = useCallback(
    (change: PendingFileChange) => {
      setSelectedChange(change.id);
      setIsEditing(false);
    },
    [setSelectedChange]
  );

  const handleStartEdit = useCallback(() => {
    if (selectedChange) {
      setEditedContent(selectedChange.proposedContent);
      setIsEditing(true);
    }
  }, [selectedChange]);

  const handleSaveEdit = useCallback(() => {
    if (selectedChange) {
      updateProposedContent(selectedChange.id, editedContent);
      setIsEditing(false);
    }
  }, [selectedChange, editedContent, updateProposedContent]);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditedContent('');
  }, []);

  const handleApplyAll = async () => {
    setIsApplyingAll(true);
    try {
      await applyAllApproved(projectPath);
    } finally {
      setIsApplyingAll(false);
    }
  };

  const handleApply = async () => {
    if (selectedChange) {
      await applyChange(selectedChange.id, projectPath);
    }
  };

  const handleRevert = async () => {
    if (selectedChange) {
      await revertChange(selectedChange.id, projectPath);
    }
  };

  // Group changes by status
  const pendingList = pendingChanges.filter((c) => c.status === 'pending');
  const approvedList = pendingChanges.filter((c) => c.status === 'approved');
  const appliedList = pendingChanges.filter((c) => c.status === 'applied');
  const rejectedList = pendingChanges.filter((c) => c.status === 'rejected');

  if (pendingChanges.length === 0) {
    return (
      <div
        className={cn(
          'h-full flex items-center justify-center text-[#666]',
          className
        )}
      >
        <div className="text-center">
          <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No pending changes</p>
          <p className="text-xs mt-1 opacity-75">
            AI-proposed file changes will appear here
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('h-full flex flex-col', className)}>
      {/* Header with bulk actions */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#333] bg-[#0f0f0f]">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Pending Changes</span>
          {pendingCount > 0 && (
            <span className="text-xs bg-yellow-500/20 text-yellow-500 px-1.5 py-0.5 rounded">
              {pendingCount} pending
            </span>
          )}
          {approvedCount > 0 && (
            <span className="text-xs bg-blue-500/20 text-blue-500 px-1.5 py-0.5 rounded">
              {approvedCount} approved
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={approveAll}
                leftIcon={<Check className="h-3.5 w-3.5" />}
              >
                Approve All
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={rejectAll}
                leftIcon={<X className="h-3.5 w-3.5" />}
              >
                Reject All
              </Button>
            </>
          )}
          {approvedCount > 0 && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleApplyAll}
              isLoading={isApplyingAll}
              leftIcon={<Play className="h-3.5 w-3.5" />}
            >
              Apply All ({approvedCount})
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* File list */}
        <div className="w-64 border-r border-[#333] overflow-y-auto">
          {pendingList.length > 0 && (
            <ChangeGroup
              title="Pending Review"
              changes={pendingList}
              selectedId={selectedChangeId}
              onSelect={handleSelectChange}
              onApprove={(id) => approveChange(id)}
              onReject={(id) => rejectChange(id)}
              onApply={(id) => applyChange(id, projectPath)}
              projectPath={projectPath}
            />
          )}
          {approvedList.length > 0 && (
            <ChangeGroup
              title="Approved"
              changes={approvedList}
              selectedId={selectedChangeId}
              onSelect={handleSelectChange}
              onApprove={(id) => approveChange(id)}
              onReject={(id) => rejectChange(id)}
              onApply={(id) => applyChange(id, projectPath)}
              projectPath={projectPath}
            />
          )}
          {appliedList.length > 0 && (
            <ChangeGroup
              title="Applied"
              changes={appliedList}
              selectedId={selectedChangeId}
              onSelect={handleSelectChange}
              onApprove={(id) => approveChange(id)}
              onReject={(id) => rejectChange(id)}
              onApply={(id) => applyChange(id, projectPath)}
              projectPath={projectPath}
              defaultCollapsed
            />
          )}
          {rejectedList.length > 0 && (
            <ChangeGroup
              title="Rejected"
              changes={rejectedList}
              selectedId={selectedChangeId}
              onSelect={handleSelectChange}
              onApprove={(id) => approveChange(id)}
              onReject={(id) => rejectChange(id)}
              onApply={(id) => applyChange(id, projectPath)}
              projectPath={projectPath}
              defaultCollapsed
            />
          )}
        </div>

        {/* Preview pane */}
        <div className="flex-1 flex flex-col min-w-0">
          {selectedChange ? (
            <>
              <div className="flex items-center justify-between px-3 py-2 border-b border-[#333]">
                <div className="flex items-center gap-2">
                  <StatusBadge status={selectedChange.status} />
                  {selectedChange.error && (
                    <span className="text-xs text-red-500">
                      {selectedChange.error}
                    </span>
                  )}
                </div>
                <FileApprovalActions
                  change={selectedChange}
                  onApprove={() => approveChange(selectedChange.id)}
                  onReject={() => rejectChange(selectedChange.id)}
                  onEdit={handleStartEdit}
                  onApply={handleApply}
                  onRevert={handleRevert}
                  isEditing={isEditing}
                  onSaveEdit={handleSaveEdit}
                  onCancelEdit={handleCancelEdit}
                />
              </div>
              <div className="flex-1 min-h-0">
                <FileChangePreview
                  change={
                    isEditing
                      ? { ...selectedChange, proposedContent: editedContent }
                      : selectedChange
                  }
                  isEditing={isEditing}
                  onContentChange={setEditedContent}
                />
              </div>
            </>
          ) : (
            <div className="h-full flex items-center justify-center text-[#666]">
              <p className="text-sm">Select a file to preview changes</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface ChangeGroupProps {
  title: string;
  changes: PendingFileChange[];
  selectedId: string | null;
  onSelect: (change: PendingFileChange) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onApply: (id: string) => Promise<void>;
  projectPath: string;
  defaultCollapsed?: boolean;
}

function ChangeGroup({
  title,
  changes,
  selectedId,
  onSelect,
  onApprove,
  onReject,
  onApply,
  defaultCollapsed = false,
}: ChangeGroupProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  return (
    <div className="border-b border-[#333]">
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[#1a1a1a] transition-colors"
      >
        {isCollapsed ? (
          <ChevronRight className="h-4 w-4 text-[#666]" />
        ) : (
          <ChevronDown className="h-4 w-4 text-[#666]" />
        )}
        <span className="text-xs font-medium text-[#a0a0a0]">{title}</span>
        <span className="text-xs text-[#666]">({changes.length})</span>
      </button>
      {!isCollapsed && (
        <div className="pb-1">
          {changes.map((change) => (
            <ChangeListItem
              key={change.id}
              change={change}
              isSelected={selectedId === change.id}
              onSelect={() => onSelect(change)}
              onApprove={() => onApprove(change.id)}
              onReject={() => onReject(change.id)}
              onApply={() => onApply(change.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface ChangeListItemProps {
  change: PendingFileChange;
  isSelected: boolean;
  onSelect: () => void;
  onApprove: () => void;
  onReject: () => void;
  onApply: () => Promise<void>;
}

function ChangeListItem({
  change,
  isSelected,
  onSelect,
  onApprove,
  onReject,
  onApply,
}: ChangeListItemProps) {
  const TypeIcon =
    change.type === 'create'
      ? FilePlus
      : change.type === 'delete'
        ? FileX
        : FilePen;

  const typeColor =
    change.type === 'create'
      ? 'text-green-500'
      : change.type === 'delete'
        ? 'text-red-500'
        : 'text-yellow-500';

  return (
    <div
      onClick={onSelect}
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors group',
        isSelected ? 'bg-[#252525]' : 'hover:bg-[#1a1a1a]'
      )}
    >
      <TypeIcon className={cn('h-4 w-4 flex-shrink-0', typeColor)} />
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate">{getFileName(change.path)}</p>
        <p className="text-xs text-[#666] truncate">{change.path}</p>
      </div>
      <div className="flex items-center gap-1 text-xs opacity-0 group-hover:opacity-100 transition-opacity">
        <span className="text-green-500">
          <Plus className="h-3 w-3 inline" />
          {change.additions}
        </span>
        <span className="text-red-500">
          <Minus className="h-3 w-3 inline" />
          {change.deletions}
        </span>
      </div>
      <InlineApprovalActions
        status={change.status}
        onApprove={onApprove}
        onReject={onReject}
        onApply={onApply}
        className="opacity-0 group-hover:opacity-100 transition-opacity"
      />
    </div>
  );
}

/**
 * Compact version for embedding in the chat or sidebar
 */
interface PendingChangesSummaryProps {
  onOpenPanel?: () => void;
  className?: string;
}

export function PendingChangesSummary({
  onOpenPanel,
  className,
}: PendingChangesSummaryProps) {
  const { pendingChanges, getPendingCount, getApprovedCount, applyAllApproved } =
    usePendingChangesStore();
  const activeProject = useProjectStore((state) => state.getActiveProject());
  const projectPath = activeProject?.path || '';

  const pendingCount = getPendingCount();
  const approvedCount = getApprovedCount();
  const totalCount = pendingChanges.length;

  if (totalCount === 0) return null;

  return (
    <div
      className={cn(
        'flex items-center justify-between px-3 py-2 bg-[#1a1a1a] border border-[#333] rounded-lg',
        className
      )}
    >
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-[#666]" />
        <span className="text-sm">
          {totalCount} file change{totalCount !== 1 ? 's' : ''}
        </span>
        {pendingCount > 0 && (
          <span className="text-xs bg-yellow-500/20 text-yellow-500 px-1.5 py-0.5 rounded">
            {pendingCount} pending
          </span>
        )}
        {approvedCount > 0 && (
          <span className="text-xs bg-blue-500/20 text-blue-500 px-1.5 py-0.5 rounded">
            {approvedCount} approved
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {approvedCount > 0 && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => applyAllApproved(projectPath)}
            leftIcon={<Play className="h-3.5 w-3.5" />}
          >
            Apply
          </Button>
        )}
        {onOpenPanel && (
          <Button variant="ghost" size="sm" onClick={onOpenPanel}>
            Review
          </Button>
        )}
      </div>
    </div>
  );
}
