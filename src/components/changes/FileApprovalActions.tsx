import { useState } from 'react';
import { Check, X, Pencil, RotateCcw, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import type { PendingFileChange, PendingChangeStatus } from '@/stores/pendingChangesStore';

interface FileApprovalActionsProps {
  change: PendingFileChange;
  onApprove: () => void;
  onReject: () => void;
  onEdit: () => void;
  onApply: () => Promise<void>;
  onRevert: () => Promise<void>;
  isEditing: boolean;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  className?: string;
}

export function FileApprovalActions({
  change,
  onApprove,
  onReject,
  onEdit,
  onApply,
  onRevert,
  isEditing,
  onSaveEdit,
  onCancelEdit,
  className,
}: FileApprovalActionsProps) {
  const [isApplying, setIsApplying] = useState(false);
  const [isReverting, setIsReverting] = useState(false);

  const handleApply = async () => {
    setIsApplying(true);
    try {
      await onApply();
    } finally {
      setIsApplying(false);
    }
  };

  const handleRevert = async () => {
    setIsReverting(true);
    try {
      await onRevert();
    } finally {
      setIsReverting(false);
    }
  };

  // Editing mode actions
  if (isEditing) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <Button
          variant="primary"
          size="sm"
          onClick={onSaveEdit}
          leftIcon={<Check className="h-3.5 w-3.5" />}
        >
          Save Changes
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancelEdit}
          leftIcon={<X className="h-3.5 w-3.5" />}
        >
          Cancel
        </Button>
      </div>
    );
  }

  // Status-based actions
  return (
    <div className={cn('flex items-center gap-2', className)}>
      {change.status === 'pending' && (
        <>
          <Button
            variant="primary"
            size="sm"
            onClick={onApprove}
            leftIcon={<Check className="h-3.5 w-3.5" />}
          >
            Approve
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={onReject}
            leftIcon={<X className="h-3.5 w-3.5" />}
          >
            Reject
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onEdit}
            leftIcon={<Pencil className="h-3.5 w-3.5" />}
          >
            Edit
          </Button>
        </>
      )}

      {change.status === 'approved' && (
        <>
          <Button
            variant="primary"
            size="sm"
            onClick={handleApply}
            isLoading={isApplying}
            leftIcon={<Check className="h-3.5 w-3.5" />}
          >
            Apply Now
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onReject}
            leftIcon={<X className="h-3.5 w-3.5" />}
          >
            Reject
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onEdit}
            leftIcon={<Pencil className="h-3.5 w-3.5" />}
          >
            Edit
          </Button>
        </>
      )}

      {change.status === 'rejected' && (
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={onApprove}
            leftIcon={<RotateCcw className="h-3.5 w-3.5" />}
          >
            Restore
          </Button>
        </>
      )}

      {change.status === 'applied' && (
        <>
          <StatusBadge status="applied" />
          {change.originalContent !== null && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRevert}
              isLoading={isReverting}
              leftIcon={<RotateCcw className="h-3.5 w-3.5" />}
            >
              Revert
            </Button>
          )}
        </>
      )}

      {change.status === 'error' && (
        <>
          <StatusBadge status="error" />
          <Button
            variant="ghost"
            size="sm"
            onClick={onApprove}
            leftIcon={<RotateCcw className="h-3.5 w-3.5" />}
          >
            Retry
          </Button>
        </>
      )}
    </div>
  );
}

interface StatusBadgeProps {
  status: PendingChangeStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const statusConfig: Record<
    PendingChangeStatus,
    { label: string; color: string; icon?: React.ReactNode }
  > = {
    pending: {
      label: 'Pending',
      color: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30',
    },
    approved: {
      label: 'Approved',
      color: 'bg-blue-500/20 text-blue-500 border-blue-500/30',
    },
    rejected: {
      label: 'Rejected',
      color: 'bg-red-500/20 text-red-500 border-red-500/30',
    },
    applied: {
      label: 'Applied',
      color: 'bg-green-500/20 text-green-500 border-green-500/30',
      icon: <Check className="h-3 w-3" />,
    },
    error: {
      label: 'Error',
      color: 'bg-red-500/20 text-red-500 border-red-500/30',
      icon: <AlertCircle className="h-3 w-3" />,
    },
  };

  const config = statusConfig[status];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border',
        config.color,
        className
      )}
    >
      {config.icon}
      {config.label}
    </span>
  );
}

interface InlineApprovalActionsProps {
  status: PendingChangeStatus;
  onApprove: () => void;
  onReject: () => void;
  onApply: () => Promise<void>;
  isApplying?: boolean;
  className?: string;
}

/**
 * Compact inline actions for use in file list items
 */
export function InlineApprovalActions({
  status,
  onApprove,
  onReject,
  onApply,
  isApplying = false,
  className,
}: InlineApprovalActionsProps) {
  const [localApplying, setLocalApplying] = useState(false);

  const handleApply = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setLocalApplying(true);
    try {
      await onApply();
    } finally {
      setLocalApplying(false);
    }
  };

  const handleApprove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onApprove();
  };

  const handleReject = (e: React.MouseEvent) => {
    e.stopPropagation();
    onReject();
  };

  if (status === 'applied') {
    return (
      <div className={cn('flex items-center', className)}>
        <StatusBadge status="applied" />
      </div>
    );
  }

  if (status === 'rejected') {
    return (
      <div className={cn('flex items-center gap-1', className)}>
        <StatusBadge status="rejected" />
        <button
          onClick={handleApprove}
          className="p-1 hover:bg-[#333] rounded transition-colors"
          title="Restore"
        >
          <RotateCcw className="h-3.5 w-3.5 text-[#666]" />
        </button>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className={cn('flex items-center gap-1', className)}>
        <StatusBadge status="error" />
        <button
          onClick={handleApprove}
          className="p-1 hover:bg-[#333] rounded transition-colors"
          title="Retry"
        >
          <RotateCcw className="h-3.5 w-3.5 text-[#666]" />
        </button>
      </div>
    );
  }

  const applying = isApplying || localApplying;

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {status === 'approved' && (
        <button
          onClick={handleApply}
          disabled={applying}
          className="p-1 hover:bg-green-500/20 rounded transition-colors disabled:opacity-50"
          title="Apply"
        >
          {applying ? (
            <Loader2 className="h-3.5 w-3.5 text-green-500 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5 text-green-500" />
          )}
        </button>
      )}
      {status === 'pending' && (
        <button
          onClick={handleApprove}
          className="p-1 hover:bg-green-500/20 rounded transition-colors"
          title="Approve"
        >
          <Check className="h-3.5 w-3.5 text-green-500" />
        </button>
      )}
      <button
        onClick={handleReject}
        className="p-1 hover:bg-red-500/20 rounded transition-colors"
        title="Reject"
      >
        <X className="h-3.5 w-3.5 text-red-500" />
      </button>
    </div>
  );
}
