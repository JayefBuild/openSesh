import React from 'react';
import {
  Play,
  Pause,
  Square,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  ChevronDown,
  ChevronUp,
  SkipForward,
  AlertTriangle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { useExecutionStore } from '@/stores/executionStore';
import type { ExecutionAction, ActionStatus } from '@/types/execution';

interface ExecutionProgressProps {
  threadId?: string;
  className?: string;
  showActions?: boolean;
  compact?: boolean;
}

// Status configuration
const statusConfig: Record<
  ActionStatus,
  { icon: React.ReactNode; color: string; bgColor: string; label: string }
> = {
  pending: {
    icon: <Clock className="h-3 w-3" />,
    color: 'text-[#666]',
    bgColor: 'bg-[#252525]',
    label: 'Pending',
  },
  awaiting_confirmation: {
    icon: <Clock className="h-3 w-3" />,
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/10',
    label: 'Awaiting',
  },
  approved: {
    icon: <CheckCircle className="h-3 w-3" />,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    label: 'Approved',
  },
  rejected: {
    icon: <XCircle className="h-3 w-3" />,
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    label: 'Rejected',
  },
  executing: {
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    label: 'Executing',
  },
  completed: {
    icon: <CheckCircle className="h-3 w-3" />,
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
    label: 'Completed',
  },
  failed: {
    icon: <XCircle className="h-3 w-3" />,
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    label: 'Failed',
  },
  cancelled: {
    icon: <SkipForward className="h-3 w-3" />,
    color: 'text-[#666]',
    bgColor: 'bg-[#252525]',
    label: 'Cancelled',
  },
};

export function ExecutionProgress({
  threadId,
  className,
  showActions = true,
  compact = false,
}: ExecutionProgressProps) {
  const [isExpanded, setIsExpanded] = React.useState(true);
  const [showAllActions, setShowAllActions] = React.useState(false);

  const isExecuting = useExecutionStore((state) => state.isExecuting);
  const isPaused = useExecutionStore((state) => state.isPaused);
  const pauseExecution = useExecutionStore((state) => state.pauseExecution);
  const resumeExecution = useExecutionStore((state) => state.resumeExecution);
  const cancelExecution = useExecutionStore((state) => state.cancelExecution);
  const actions = useExecutionStore((state) => state.actions);

  const progress = useExecutionStore((state) => state.getProgress(threadId));

  // Get actions to display
  const displayActions = threadId
    ? actions.filter((a) => a.threadId === threadId)
    : actions;

  const recentActions = showAllActions
    ? displayActions
    : displayActions.slice(0, 5);

  // Don't render if no progress to show
  if (progress.totalActions === 0 && !isExecuting) return null;

  if (compact) {
    return (
      <CompactProgress
        progress={progress}
        isExecuting={isExecuting}
        isPaused={isPaused}
        onPause={pauseExecution}
        onResume={resumeExecution}
        onCancel={cancelExecution}
        className={className}
      />
    );
  }

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
            <span>Execution Progress</span>
          </button>

          {/* Controls */}
          {isExecuting && (
            <div className="flex items-center gap-1">
              {isPaused ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resumeExecution}
                  leftIcon={<Play className="h-3 w-3" />}
                >
                  Resume
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={pauseExecution}
                  leftIcon={<Pause className="h-3 w-3" />}
                >
                  Pause
                </Button>
              )}
              <Button
                variant="danger"
                size="sm"
                onClick={cancelExecution}
                leftIcon={<Square className="h-3 w-3" />}
              >
                Cancel
              </Button>
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-[#666] mb-1">
            <span>
              {progress.completedActions} of {progress.totalActions} actions
            </span>
            <span>{progress.percentage}%</span>
          </div>
          <div className="h-2 bg-[#252525] rounded-full overflow-hidden">
            <motion.div
              className={cn(
                'h-full rounded-full',
                isPaused ? 'bg-yellow-500' : 'bg-blue-500'
              )}
              initial={{ width: 0 }}
              animate={{ width: `${progress.percentage}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 mt-2 text-xs">
          {progress.completedActions > 0 && (
            <div className="flex items-center gap-1 text-green-400">
              <CheckCircle className="h-3 w-3" />
              <span>{progress.completedActions} completed</span>
            </div>
          )}
          {progress.failedActions > 0 && (
            <div className="flex items-center gap-1 text-red-400">
              <XCircle className="h-3 w-3" />
              <span>{progress.failedActions} failed</span>
            </div>
          )}
          {progress.skippedActions > 0 && (
            <div className="flex items-center gap-1 text-[#666]">
              <SkipForward className="h-3 w-3" />
              <span>{progress.skippedActions} skipped</span>
            </div>
          )}
          {isPaused && (
            <div className="flex items-center gap-1 text-yellow-400">
              <Pause className="h-3 w-3" />
              <span>Paused</span>
            </div>
          )}
        </div>
      </div>

      {/* Action list */}
      <AnimatePresence>
        {isExpanded && showActions && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="p-3 space-y-2">
              {/* Current action */}
              {progress.currentAction && (
                <div className="p-2 rounded bg-blue-500/10 border border-blue-500/20">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />
                    <span className="text-sm font-medium text-blue-400">
                      {progress.currentAction.title}
                    </span>
                  </div>
                  <p className="text-xs text-[#a0a0a0] mt-1 ml-6">
                    {progress.currentAction.description}
                  </p>
                </div>
              )}

              {/* Recent actions */}
              {recentActions.length > 0 && (
                <div className="space-y-1">
                  {recentActions.map((action) => (
                    <ActionRow key={action.id} action={action} />
                  ))}
                </div>
              )}

              {/* Show more button */}
              {displayActions.length > 5 && (
                <button
                  onClick={() => setShowAllActions(!showAllActions)}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  {showAllActions
                    ? 'Show less'
                    : `Show ${displayActions.length - 5} more actions`}
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Action row component
interface ActionRowProps {
  action: ExecutionAction;
}

function ActionRow({ action }: ActionRowProps) {
  const config = statusConfig[action.status];

  return (
    <div
      className={cn(
        'flex items-center gap-2 p-2 rounded text-sm',
        action.status === 'executing' && 'bg-blue-500/5'
      )}
    >
      <div className={cn('flex-shrink-0', config.color)}>{config.icon}</div>
      <div className="flex-1 min-w-0">
        <p className="truncate">{action.title}</p>
      </div>
      {action.error && (
        <div className="flex items-center gap-1 text-xs text-red-400">
          <AlertTriangle className="h-3 w-3" />
          <span className="truncate max-w-[150px]">{action.error}</span>
        </div>
      )}
      <span className={cn('text-xs px-1.5 py-0.5 rounded', config.bgColor, config.color)}>
        {config.label}
      </span>
    </div>
  );
}

// Compact progress component
interface CompactProgressProps {
  progress: import('@/types/execution').ExecutionProgress;
  isExecuting: boolean;
  isPaused: boolean;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  className?: string;
}

function CompactProgress({
  progress,
  isExecuting,
  isPaused,
  onPause,
  onResume,
  onCancel,
  className,
}: CompactProgressProps) {
  if (!isExecuting && progress.totalActions === 0) return null;

  return (
    <div className={cn('flex items-center gap-3 px-3 py-2 bg-[#1a1a1a] rounded-md border border-[#333]', className)}>
      {/* Progress indicator */}
      {isExecuting && !isPaused && <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />}
      {isPaused && <Pause className="h-4 w-4 text-yellow-400" />}

      {/* Progress text */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#a0a0a0]">
            {progress.completedActions}/{progress.totalActions}
          </span>
          <div className="flex-1 h-1 bg-[#252525] rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full', isPaused ? 'bg-yellow-500' : 'bg-blue-500')}
              style={{ width: `${progress.percentage}%` }}
            />
          </div>
          <span className="text-xs text-[#666]">{progress.percentage}%</span>
        </div>
      </div>

      {/* Controls */}
      {isExecuting && (
        <div className="flex items-center gap-1">
          {isPaused ? (
            <button
              onClick={onResume}
              className="p-1 rounded hover:bg-[#252525] text-[#666] hover:text-white transition-colors"
              title="Resume"
            >
              <Play className="h-3 w-3" />
            </button>
          ) : (
            <button
              onClick={onPause}
              className="p-1 rounded hover:bg-[#252525] text-[#666] hover:text-white transition-colors"
              title="Pause"
            >
              <Pause className="h-3 w-3" />
            </button>
          )}
          <button
            onClick={onCancel}
            className="p-1 rounded hover:bg-red-500/10 text-[#666] hover:text-red-400 transition-colors"
            title="Cancel"
          >
            <Square className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Execution progress indicator for the bottom bar
 */
export function ExecutionProgressIndicator({ threadId }: { threadId?: string }) {
  const isExecuting = useExecutionStore((state) => state.isExecuting);
  const isPaused = useExecutionStore((state) => state.isPaused);
  const progress = useExecutionStore((state) => state.getProgress(threadId));

  if (!isExecuting || progress.totalActions === 0) return null;

  return (
    <div className="flex items-center gap-2 text-xs">
      {isPaused ? (
        <Pause className="h-3 w-3 text-yellow-400" />
      ) : (
        <Loader2 className="h-3 w-3 text-blue-400 animate-spin" />
      )}
      <span className={cn(isPaused ? 'text-yellow-400' : 'text-blue-400')}>
        {progress.completedActions}/{progress.totalActions}
      </span>
    </div>
  );
}
