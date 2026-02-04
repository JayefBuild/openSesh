import React, { useState } from 'react';
import {
  FileEdit,
  FilePlus,
  FileX,
  Terminal,
  GitBranch,
  Info,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  Play,
  Loader2,
  AlertCircle,
  SkipForward,
  Edit3,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import type { PlanStep, PlanStepType, PlanStepStatus } from '@/types/plan';

interface PlanStepItemProps {
  step: PlanStep;
  isActive?: boolean;
  isExecuting?: boolean;
  onApprove: () => void;
  onReject: (reason?: string) => void;
  onEdit?: () => void;
  onExecute?: () => void;
  showActions?: boolean;
  compact?: boolean;
}

// Icon mapping for step types
const stepTypeIcons: Record<PlanStepType, React.ReactNode> = {
  file_edit: <FileEdit className="h-4 w-4" />,
  file_create: <FilePlus className="h-4 w-4" />,
  file_delete: <FileX className="h-4 w-4" />,
  terminal_command: <Terminal className="h-4 w-4" />,
  git_operation: <GitBranch className="h-4 w-4" />,
  information: <Info className="h-4 w-4" />,
};

// Status configuration
const statusConfig: Record<
  PlanStepStatus,
  { color: string; bgColor: string; borderColor: string; icon: React.ReactNode; label: string }
> = {
  pending: {
    color: 'text-[#666]',
    bgColor: 'bg-[#252525]',
    borderColor: 'border-[#333]',
    icon: null,
    label: 'Pending',
  },
  approved: {
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    icon: <Check className="h-3 w-3" />,
    label: 'Approved',
  },
  rejected: {
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
    icon: <X className="h-3 w-3" />,
    label: 'Rejected',
  },
  in_progress: {
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500/30',
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
    label: 'Running',
  },
  completed: {
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/30',
    icon: <Check className="h-3 w-3" />,
    label: 'Completed',
  },
  error: {
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
    icon: <AlertCircle className="h-3 w-3" />,
    label: 'Error',
  },
  skipped: {
    color: 'text-[#666]',
    bgColor: 'bg-[#1a1a1a]',
    borderColor: 'border-[#252525]',
    icon: <SkipForward className="h-3 w-3" />,
    label: 'Skipped',
  },
};

// Type labels
const stepTypeLabels: Record<PlanStepType, string> = {
  file_edit: 'Edit File',
  file_create: 'Create File',
  file_delete: 'Delete File',
  terminal_command: 'Run Command',
  git_operation: 'Git Operation',
  information: 'Information',
};

export function PlanStepItem({
  step,
  isActive = false,
  isExecuting = false,
  onApprove,
  onReject,
  onEdit,
  onExecute,
  showActions = true,
  compact = false,
}: PlanStepItemProps) {
  const [expanded, setExpanded] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);

  const config = statusConfig[step.status];
  const icon = stepTypeIcons[step.type];

  const handleReject = () => {
    if (rejectReason.trim()) {
      onReject(rejectReason.trim());
      setRejectReason('');
      setShowRejectInput(false);
    } else {
      onReject();
    }
  };

  const canApprove = step.status === 'pending';
  const canReject = step.status === 'pending' || step.status === 'approved';
  const canExecute = step.status === 'approved' && onExecute;

  // Get details display based on step type
  const getDetailsDisplay = () => {
    const details = step.details;

    if ('filePath' in details) {
      return (
        <code className="text-xs text-[#a0a0a0] font-mono bg-[#1a1a1a] px-2 py-0.5 rounded">
          {details.filePath}
        </code>
      );
    }

    if ('command' in details) {
      return (
        <code className="text-xs text-[#a0a0a0] font-mono bg-[#1a1a1a] px-2 py-0.5 rounded block mt-1 overflow-x-auto">
          $ {details.command}
        </code>
      );
    }

    if ('operation' in details) {
      return (
        <span className="text-xs text-[#666]">
          {details.operation}
          {details.branchName && `: ${details.branchName}`}
        </span>
      );
    }

    return null;
  };

  if (compact) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 px-2 py-1.5 rounded transition-colors',
          isActive ? 'bg-[#252525]' : 'hover:bg-[#1a1a1a]',
          config.borderColor
        )}
      >
        {/* Step number */}
        <span className="text-xs text-[#666] font-mono w-5">{step.stepNumber}.</span>

        {/* Icon */}
        <span className={cn('flex-shrink-0', config.color)}>{icon}</span>

        {/* Title */}
        <span className="flex-1 text-sm truncate">{step.title}</span>

        {/* Status badge */}
        <span
          className={cn(
            'flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]',
            config.color,
            config.bgColor
          )}
        >
          {config.icon}
          {config.label}
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-lg border transition-all',
        isActive ? 'ring-1 ring-blue-500/50' : '',
        config.bgColor,
        config.borderColor
      )}
    >
      {/* Header */}
      <div
        className="flex items-start gap-3 p-3 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Expand toggle */}
        <button className="mt-0.5 text-[#666] hover:text-white transition-colors">
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        {/* Step number */}
        <div
          className={cn(
            'flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium',
            config.bgColor,
            config.color
          )}
        >
          {step.stepNumber}
        </div>

        {/* Icon */}
        <div className={cn('mt-0.5', config.color)}>{icon}</div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{step.title}</span>
            <span
              className={cn(
                'px-1.5 py-0.5 rounded text-[10px]',
                'bg-[#252525] text-[#666]'
              )}
            >
              {stepTypeLabels[step.type]}
            </span>
          </div>
          <p className="text-xs text-[#666] mt-0.5 line-clamp-2">{step.description}</p>
          {getDetailsDisplay()}
        </div>

        {/* Status badge */}
        <div
          className={cn(
            'flex items-center gap-1 px-2 py-1 rounded text-xs flex-shrink-0',
            config.color,
            config.bgColor
          )}
        >
          {config.icon}
          {config.label}
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-[#252525]">
          {/* Description */}
          <div className="mt-3">
            <h4 className="text-xs font-medium text-[#666] mb-1">Description</h4>
            <p className="text-sm text-[#a0a0a0]">{step.description}</p>
          </div>

          {/* Details based on type */}
          {'filePath' in step.details && (
            <div className="mt-3">
              <h4 className="text-xs font-medium text-[#666] mb-1">File Path</h4>
              <code className="text-sm text-[#a0a0a0] font-mono">
                {step.details.filePath}
              </code>
            </div>
          )}

          {'command' in step.details && (
            <div className="mt-3">
              <h4 className="text-xs font-medium text-[#666] mb-1">Command</h4>
              <pre className="text-sm text-[#a0a0a0] font-mono bg-[#1a1a1a] p-2 rounded overflow-x-auto">
                $ {step.details.command}
              </pre>
            </div>
          )}

          {'operation' in step.details && step.details.commitMessage && (
            <div className="mt-3">
              <h4 className="text-xs font-medium text-[#666] mb-1">Commit Message</h4>
              <p className="text-sm text-[#a0a0a0]">{step.details.commitMessage}</p>
            </div>
          )}

          {/* Error display */}
          {step.error && (
            <div className="mt-3 p-2 rounded bg-red-500/10 border border-red-500/30">
              <h4 className="text-xs font-medium text-red-400 mb-1">Error</h4>
              <p className="text-sm text-red-300">{step.error}</p>
            </div>
          )}

          {/* Execution result */}
          {step.executionResult && (
            <div className="mt-3 p-2 rounded bg-green-500/10 border border-green-500/30">
              <h4 className="text-xs font-medium text-green-400 mb-1">Result</h4>
              <p className="text-sm text-green-300">{step.executionResult}</p>
            </div>
          )}

          {/* User note (for rejected steps) */}
          {step.userNote && (
            <div className="mt-3 p-2 rounded bg-[#252525]">
              <h4 className="text-xs font-medium text-[#666] mb-1">Note</h4>
              <p className="text-sm text-[#a0a0a0]">{step.userNote}</p>
            </div>
          )}

          {/* Actions */}
          {showActions && (
            <div className="mt-4 flex items-center gap-2">
              {canApprove && (
                <Button
                  variant="primary"
                  size="sm"
                  leftIcon={<Check className="h-3 w-3" />}
                  onClick={(e) => {
                    e.stopPropagation();
                    onApprove();
                  }}
                >
                  Approve
                </Button>
              )}

              {canReject && !showRejectInput && (
                <Button
                  variant="danger"
                  size="sm"
                  leftIcon={<X className="h-3 w-3" />}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowRejectInput(true);
                  }}
                >
                  Reject
                </Button>
              )}

              {showRejectInput && (
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="text"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Reason (optional)"
                    className="px-2 py-1 text-sm bg-[#1a1a1a] border border-[#333] rounded focus:outline-none focus:border-[#444]"
                    autoFocus
                  />
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={handleReject}
                  >
                    Confirm
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowRejectInput(false);
                      setRejectReason('');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              )}

              {canExecute && (
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={
                    isExecuting ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Play className="h-3 w-3" />
                    )
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    onExecute?.();
                  }}
                  disabled={isExecuting}
                >
                  Execute
                </Button>
              )}

              {onEdit && canApprove && (
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={<Edit3 className="h-3 w-3" />}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit();
                  }}
                >
                  Edit
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
