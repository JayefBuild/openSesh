import React, { useState } from 'react';
import {
  Layers,
  Check,
  X,
  Play,
  Clock,
  FileEdit,
  FilePlus,
  FileX,
  Terminal,
  GitBranch,
  Zap,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  XCircle,
  Loader2,
  SkipForward,
  AlertTriangle,
  Trash2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { useExecutionStore } from '@/stores/executionStore';
import type { ExecutionAction, ActionType, ActionStatus, ActionRiskLevel } from '@/types/execution';

interface ActionQueueProps {
  threadId?: string;
  className?: string;
  onStartExecution?: () => void;
}

// Action type icons
const actionTypeIcons: Record<ActionType, React.ReactNode> = {
  file_edit: <FileEdit className="h-4 w-4" />,
  file_create: <FilePlus className="h-4 w-4" />,
  file_delete: <FileX className="h-4 w-4" />,
  terminal_command: <Terminal className="h-4 w-4" />,
  git_operation: <GitBranch className="h-4 w-4" />,
  skill_execution: <Zap className="h-4 w-4" />,
};

// Action type colors
const actionTypeColors: Record<ActionType, string> = {
  file_edit: 'text-blue-400',
  file_create: 'text-green-400',
  file_delete: 'text-red-400',
  terminal_command: 'text-purple-400',
  git_operation: 'text-orange-400',
  skill_execution: 'text-yellow-400',
};

// Status icons
const statusIcons: Record<ActionStatus, React.ReactNode> = {
  pending: <Clock className="h-3 w-3" />,
  awaiting_confirmation: <Clock className="h-3 w-3" />,
  approved: <CheckCircle className="h-3 w-3" />,
  rejected: <XCircle className="h-3 w-3" />,
  executing: <Loader2 className="h-3 w-3 animate-spin" />,
  completed: <CheckCircle className="h-3 w-3" />,
  failed: <XCircle className="h-3 w-3" />,
  cancelled: <SkipForward className="h-3 w-3" />,
};

// Status colors
const statusColors: Record<ActionStatus, string> = {
  pending: 'text-[#666]',
  awaiting_confirmation: 'text-yellow-400',
  approved: 'text-blue-400',
  rejected: 'text-red-400',
  executing: 'text-blue-400',
  completed: 'text-green-400',
  failed: 'text-red-400',
  cancelled: 'text-[#666]',
};

// Risk badges
const riskColors: Record<ActionRiskLevel, { text: string; bg: string }> = {
  safe: { text: 'text-green-400', bg: 'bg-green-500/10' },
  moderate: { text: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  dangerous: { text: 'text-red-400', bg: 'bg-red-500/10' },
};

export function ActionQueue({ threadId, className, onStartExecution }: ActionQueueProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('all');

  const executionMode = useExecutionStore((state) => state.executionMode);
  const isExecuting = useExecutionStore((state) => state.isExecuting);
  const approveAction = useExecutionStore((state) => state.approveAction);
  const rejectAction = useExecutionStore((state) => state.rejectAction);
  const approveAllPending = useExecutionStore((state) => state.approveAllPending);
  const rejectAllPending = useExecutionStore((state) => state.rejectAllPending);
  const removeAction = useExecutionStore((state) => state.removeAction);
  const clearQueue = useExecutionStore((state) => state.clearQueue);
  const actions = useExecutionStore((state) => state.actions);
  const requestConfirmation = useExecutionStore((state) => state.requestConfirmation);

  // Get actions for this thread
  const allActions = threadId
    ? actions.filter((a) => a.threadId === threadId)
    : actions;

  // Apply filter
  const filteredActions = allActions.filter((a) => {
    if (filter === 'pending') {
      return ['pending', 'awaiting_confirmation', 'approved'].includes(a.status);
    }
    if (filter === 'completed') {
      return ['completed', 'failed', 'cancelled', 'rejected'].includes(a.status);
    }
    return true;
  });

  const pendingCount = allActions.filter((a) =>
    ['pending', 'awaiting_confirmation'].includes(a.status)
  ).length;
  const approvedCount = allActions.filter((a) => a.status === 'approved').length;
  const queuedCount = pendingCount + approvedCount;

  // Don't render if no actions
  if (allActions.length === 0) return null;

  return (
    <div className={cn('rounded-lg border border-[#333] bg-[#141414]', className)}>
      {/* Header */}
      <div className="p-3 border-b border-[#252525]">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-2 text-sm font-medium hover:text-white transition-colors"
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
            <Layers className="h-4 w-4 text-blue-400" />
            <span>Action Queue</span>
            <span className="text-xs text-[#666]">({allActions.length})</span>
          </button>

          {/* Quick actions */}
          {!isExecuting && queuedCount > 0 && (
            <div className="flex items-center gap-2">
              {pendingCount > 0 && executionMode === 'assisted' && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => approveAllPending(threadId)}
                    leftIcon={<Check className="h-3 w-3" />}
                  >
                    Approve All
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => rejectAllPending(threadId)}
                    leftIcon={<X className="h-3 w-3" />}
                  >
                    Reject All
                  </Button>
                </>
              )}
              {approvedCount > 0 && onStartExecution && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={onStartExecution}
                  leftIcon={<Play className="h-3 w-3" />}
                >
                  Execute ({approvedCount})
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1 mt-3">
          {(['all', 'pending', 'completed'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'px-2 py-1 text-xs rounded transition-colors capitalize',
                filter === f
                  ? 'bg-[#252525] text-white'
                  : 'text-[#666] hover:text-white hover:bg-[#1a1a1a]'
              )}
            >
              {f}
            </button>
          ))}
          {allActions.length > 0 && (
            <button
              onClick={clearQueue}
              className="ml-auto px-2 py-1 text-xs text-[#666] hover:text-red-400 transition-colors"
              title="Clear all actions"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Action list */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="p-2 max-h-[400px] overflow-y-auto">
              {filteredActions.length === 0 ? (
                <div className="text-center text-sm text-[#666] py-4">
                  No actions to display
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredActions.map((action) => (
                    <ActionItem
                      key={action.id}
                      action={action}
                      onApprove={() => approveAction(action.id)}
                      onReject={() => rejectAction(action.id)}
                      onRemove={() => removeAction(action.id)}
                      onViewDetails={() => requestConfirmation(action, true, true)}
                      showActions={
                        executionMode === 'assisted' &&
                        !isExecuting &&
                        ['pending', 'awaiting_confirmation'].includes(action.status)
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Individual action item component
interface ActionItemProps {
  action: ExecutionAction;
  onApprove: () => void;
  onReject: () => void;
  onRemove: () => void;
  onViewDetails: () => void;
  showActions: boolean;
}

function ActionItem({
  action,
  onApprove,
  onReject,
  onRemove,
  onViewDetails,
  showActions,
}: ActionItemProps) {
  const [isHovered, setIsHovered] = useState(false);

  const typeIcon = actionTypeIcons[action.type];
  const typeColor = actionTypeColors[action.type];
  const statusIcon = statusIcons[action.status];
  const statusColor = statusColors[action.status];
  const riskStyle = riskColors[action.riskLevel];

  const isFinished = ['completed', 'failed', 'cancelled', 'rejected'].includes(action.status);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        'flex items-center gap-2 p-2 rounded transition-colors',
        isHovered && 'bg-[#1a1a1a]',
        action.status === 'executing' && 'bg-blue-500/5 border border-blue-500/20',
        isFinished && 'opacity-60'
      )}
    >
      {/* Type icon */}
      <div className={cn('flex-shrink-0', typeColor)}>{typeIcon}</div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm truncate">{action.title}</p>
          {action.riskLevel === 'dangerous' && (
            <span
              className={cn(
                'flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px]',
                riskStyle.bg,
                riskStyle.text
              )}
            >
              <AlertTriangle className="h-2.5 w-2.5" />
            </span>
          )}
        </div>
        {action.description && (
          <p className="text-xs text-[#666] truncate">{action.description}</p>
        )}
        {action.error && (
          <p className="text-xs text-red-400 truncate mt-0.5">
            Error: {action.error}
          </p>
        )}
      </div>

      {/* Status badge */}
      <div className={cn('flex items-center gap-1', statusColor)}>
        {statusIcon}
      </div>

      {/* Actions */}
      <AnimatePresence>
        {(showActions || isHovered) && !isFinished && (
          <motion.div
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 'auto' }}
            exit={{ opacity: 0, width: 0 }}
            className="flex items-center gap-1 overflow-hidden"
          >
            {showActions && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onApprove();
                  }}
                  className="p-1 rounded hover:bg-green-500/20 text-[#666] hover:text-green-400 transition-colors"
                  title="Approve"
                >
                  <Check className="h-3 w-3" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onReject();
                  }}
                  className="p-1 rounded hover:bg-red-500/20 text-[#666] hover:text-red-400 transition-colors"
                  title="Reject"
                >
                  <X className="h-3 w-3" />
                </button>
              </>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onViewDetails();
              }}
              className="p-1 rounded hover:bg-[#252525] text-[#666] hover:text-white transition-colors"
              title="View details"
            >
              <ChevronDown className="h-3 w-3" />
            </button>
            {!['executing'].includes(action.status) && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
                }}
                className="p-1 rounded hover:bg-red-500/10 text-[#666] hover:text-red-400 transition-colors"
                title="Remove"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/**
 * Compact action queue badge for showing in header
 */
export function ActionQueueBadge({ threadId }: { threadId?: string }) {
  const actions = useExecutionStore((state) => state.actions);

  const relevantActions = threadId
    ? actions.filter((a) => a.threadId === threadId)
    : actions;

  const pendingCount = relevantActions.filter((a) =>
    ['pending', 'awaiting_confirmation', 'approved'].includes(a.status)
  ).length;

  if (pendingCount === 0) return null;

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-500/10 border border-blue-500/20 rounded text-xs text-blue-400">
      <Layers className="h-3 w-3" />
      <span>{pendingCount} queued</span>
    </div>
  );
}
