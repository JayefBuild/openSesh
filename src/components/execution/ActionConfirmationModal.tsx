import React, { useState } from 'react';
import {
  FileEdit,
  FilePlus,
  FileX,
  Terminal,
  GitBranch,
  Zap,
  AlertTriangle,
  Check,
  X,
  Edit2,
  Shield,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useExecutionStore } from '@/stores/executionStore';
import type {
  ExecutionAction,
  ActionType,
  ActionDetails,
  ActionConfirmationResponse,
  FileEditActionDetails,
  FileCreateActionDetails,
  FileDeleteActionDetails,
  TerminalCommandActionDetails,
  GitOperationActionDetails,
  SkillExecutionActionDetails,
} from '@/types/execution';

interface ActionConfirmationModalProps {
  className?: string;
}

// Action type configuration
const actionTypeConfig: Record<
  ActionType,
  { icon: React.ReactNode; label: string; color: string; bgColor: string }
> = {
  file_edit: {
    icon: <FileEdit className="h-5 w-5" />,
    label: 'File Edit',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
  },
  file_create: {
    icon: <FilePlus className="h-5 w-5" />,
    label: 'File Create',
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
  },
  file_delete: {
    icon: <FileX className="h-5 w-5" />,
    label: 'File Delete',
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
  },
  terminal_command: {
    icon: <Terminal className="h-5 w-5" />,
    label: 'Terminal Command',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
  },
  git_operation: {
    icon: <GitBranch className="h-5 w-5" />,
    label: 'Git Operation',
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10',
  },
  skill_execution: {
    icon: <Zap className="h-5 w-5" />,
    label: 'Skill Execution',
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/10',
  },
};

// Risk level badges
const riskBadge = {
  safe: {
    label: 'Safe',
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
    icon: <Shield className="h-3 w-3" />,
  },
  moderate: {
    label: 'Moderate',
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/10',
    icon: <AlertCircle className="h-3 w-3" />,
  },
  dangerous: {
    label: 'Dangerous',
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    icon: <AlertTriangle className="h-3 w-3" />,
  },
};

export function ActionConfirmationModal({ className }: ActionConfirmationModalProps) {
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [userNote, setUserNote] = useState('');

  const pendingConfirmation = useExecutionStore((state) => state.pendingConfirmation);
  const handleConfirmationResponse = useExecutionStore((state) => state.handleConfirmationResponse);
  const cancelConfirmation = useExecutionStore((state) => state.cancelConfirmation);

  if (!pendingConfirmation) return null;

  const { action, showDiff, allowEdit, warningMessage } = pendingConfirmation;
  const config = actionTypeConfig[action.type];
  const risk = riskBadge[action.riskLevel];

  const handleApprove = () => {
    const response: ActionConfirmationResponse = {
      actionId: action.id,
      decision: 'approve',
      note: userNote || undefined,
    };
    handleConfirmationResponse(response);
    resetState();
  };

  const handleEditAndApprove = () => {
    // Parse edited content based on action type
    let editedDetails: ActionDetails | undefined;

    if (action.type === 'terminal_command') {
      editedDetails = {
        ...action.details,
        command: editedContent,
      } as TerminalCommandActionDetails;
    } else if (action.type === 'file_edit' || action.type === 'file_create') {
      editedDetails = {
        ...action.details,
        proposedContent: editedContent,
      } as FileEditActionDetails | FileCreateActionDetails;
    }

    const response: ActionConfirmationResponse = {
      actionId: action.id,
      decision: 'edit_and_approve',
      editedDetails,
      note: userNote || undefined,
    };
    handleConfirmationResponse(response);
    resetState();
  };

  const handleReject = () => {
    const response: ActionConfirmationResponse = {
      actionId: action.id,
      decision: 'reject',
      note: userNote || undefined,
    };
    handleConfirmationResponse(response);
    resetState();
  };

  const handleClose = () => {
    cancelConfirmation();
    resetState();
  };

  const resetState = () => {
    setIsEditMode(false);
    setEditedContent('');
    setUserNote('');
  };

  const enterEditMode = () => {
    // Pre-populate with current content
    if (action.type === 'terminal_command') {
      setEditedContent((action.details as TerminalCommandActionDetails).command);
    } else if (action.type === 'file_edit' || action.type === 'file_create') {
      const details = action.details as FileEditActionDetails | FileCreateActionDetails;
      setEditedContent(details.proposedContent || '');
    }
    setIsEditMode(true);
  };

  return (
    <Modal
      isOpen={true}
      onClose={handleClose}
      title="Confirm Action"
      size="lg"
      className={className}
      closeOnOverlayClick={false}
      footer={
        <div className="flex items-center justify-between w-full">
          <Button variant="danger" onClick={handleReject} leftIcon={<X className="h-4 w-4" />}>
            Reject
          </Button>
          <div className="flex items-center gap-2">
            {allowEdit && !isEditMode && (
              <Button variant="ghost" onClick={enterEditMode} leftIcon={<Edit2 className="h-4 w-4" />}>
                Edit
              </Button>
            )}
            {isEditMode ? (
              <Button variant="primary" onClick={handleEditAndApprove} leftIcon={<Check className="h-4 w-4" />}>
                Save & Approve
              </Button>
            ) : (
              <Button variant="primary" onClick={handleApprove} leftIcon={<Check className="h-4 w-4" />}>
                Approve
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Warning message */}
        {warningMessage && (
          <div className="flex items-center gap-2 p-3 rounded-md bg-yellow-500/10 border border-yellow-500/20">
            <AlertTriangle className="h-4 w-4 text-yellow-400 flex-shrink-0" />
            <p className="text-sm text-yellow-400">{warningMessage}</p>
          </div>
        )}

        {/* Action header */}
        <div className="flex items-start gap-3">
          <div className={cn('p-2 rounded-md', config.bgColor)}>
            <span className={config.color}>{config.icon}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-lg">{action.title}</h3>
              <div className={cn('flex items-center gap-1 px-2 py-0.5 rounded-full text-xs', risk.bgColor, risk.color)}>
                {risk.icon}
                <span>{risk.label}</span>
              </div>
            </div>
            <p className="text-sm text-[#a0a0a0] mt-1">{action.description}</p>
          </div>
        </div>

        {/* Action details */}
        <div className="p-3 rounded-md bg-[#141414] border border-[#252525]">
          <ActionDetailsView
            action={action}
            isEditMode={isEditMode}
            editedContent={editedContent}
            onEditChange={setEditedContent}
            showDiff={showDiff}
          />
        </div>

        {/* User note */}
        <div>
          <label className="block text-sm text-[#666] mb-1">
            Add a note (optional)
          </label>
          <textarea
            value={userNote}
            onChange={(e) => setUserNote(e.target.value)}
            placeholder="Add a note about this action..."
            className="w-full px-3 py-2 bg-[#1a1a1a] border border-[#333] rounded-md text-sm text-white placeholder:text-[#666] focus:outline-none focus:border-blue-500 resize-none"
            rows={2}
          />
        </div>
      </div>
    </Modal>
  );
}

// Component to render action details based on type
interface ActionDetailsViewProps {
  action: ExecutionAction;
  isEditMode: boolean;
  editedContent: string;
  onEditChange: (content: string) => void;
  showDiff?: boolean;
}

function ActionDetailsView({
  action,
  isEditMode,
  editedContent,
  onEditChange,
}: ActionDetailsViewProps) {
  switch (action.type) {
    case 'file_edit':
    case 'file_create': {
      const details = action.details as FileEditActionDetails | FileCreateActionDetails;
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#666] font-medium">File:</span>
            <code className="text-xs text-blue-400 bg-[#1a1a1a] px-2 py-0.5 rounded">
              {details.filePath}
            </code>
          </div>
          {details.description && (
            <p className="text-sm text-[#a0a0a0]">{details.description}</p>
          )}
          {(details.proposedContent || isEditMode) && (
            <div>
              <span className="text-xs text-[#666] font-medium block mb-1">
                {isEditMode ? 'Edit content:' : 'Proposed content:'}
              </span>
              {isEditMode ? (
                <textarea
                  value={editedContent}
                  onChange={(e) => onEditChange(e.target.value)}
                  className="w-full h-48 px-3 py-2 bg-[#0a0a0a] border border-[#333] rounded-md text-xs font-mono text-white focus:outline-none focus:border-blue-500 resize-none"
                />
              ) : (
                <pre className="text-xs font-mono text-[#a0a0a0] bg-[#0a0a0a] p-3 rounded overflow-x-auto max-h-48">
                  {details.proposedContent}
                </pre>
              )}
            </div>
          )}
        </div>
      );
    }

    case 'file_delete': {
      const details = action.details as FileDeleteActionDetails;
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#666] font-medium">File to delete:</span>
            <code className="text-xs text-red-400 bg-red-500/10 px-2 py-0.5 rounded">
              {details.filePath}
            </code>
          </div>
          {details.description && (
            <p className="text-sm text-[#a0a0a0]">{details.description}</p>
          )}
          <div className="flex items-center gap-2 p-2 rounded bg-red-500/10 border border-red-500/20">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <p className="text-xs text-red-400">This action cannot be undone.</p>
          </div>
        </div>
      );
    }

    case 'terminal_command': {
      const details = action.details as TerminalCommandActionDetails;
      return (
        <div className="space-y-3">
          <div>
            <span className="text-xs text-[#666] font-medium block mb-1">
              {isEditMode ? 'Edit command:' : 'Command:'}
            </span>
            {isEditMode ? (
              <textarea
                value={editedContent}
                onChange={(e) => onEditChange(e.target.value)}
                className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#333] rounded-md text-sm font-mono text-white focus:outline-none focus:border-blue-500 resize-none"
                rows={3}
              />
            ) : (
              <code className="block text-sm font-mono text-green-400 bg-[#0a0a0a] p-3 rounded">
                $ {details.command}
              </code>
            )}
          </div>
          {details.workingDirectory && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#666] font-medium">Working directory:</span>
              <code className="text-xs text-[#a0a0a0] bg-[#1a1a1a] px-2 py-0.5 rounded">
                {details.workingDirectory}
              </code>
            </div>
          )}
          {details.description && (
            <p className="text-sm text-[#a0a0a0]">{details.description}</p>
          )}
        </div>
      );
    }

    case 'git_operation': {
      const details = action.details as GitOperationActionDetails;
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#666] font-medium">Operation:</span>
            <span className="text-sm font-medium text-orange-400 capitalize">
              {details.operation}
            </span>
          </div>
          {details.command && (
            <div>
              <span className="text-xs text-[#666] font-medium block mb-1">Command:</span>
              <code className="block text-sm font-mono text-orange-400 bg-[#0a0a0a] p-3 rounded">
                $ {details.command}
              </code>
            </div>
          )}
          {details.commitMessage && (
            <div>
              <span className="text-xs text-[#666] font-medium block mb-1">Commit message:</span>
              <p className="text-sm text-[#a0a0a0] bg-[#0a0a0a] p-3 rounded">
                {details.commitMessage}
              </p>
            </div>
          )}
          {details.branchName && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#666] font-medium">Branch:</span>
              <code className="text-xs text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded">
                {details.branchName}
              </code>
            </div>
          )}
          {details.description && (
            <p className="text-sm text-[#a0a0a0]">{details.description}</p>
          )}
        </div>
      );
    }

    case 'skill_execution': {
      const details = action.details as SkillExecutionActionDetails;
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#666] font-medium">Skill:</span>
            <span className="text-sm font-medium text-yellow-400">{details.skillName}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#666] font-medium">Tool:</span>
            <code className="text-xs text-[#a0a0a0] bg-[#1a1a1a] px-2 py-0.5 rounded">
              {details.toolName}
            </code>
          </div>
          {Object.keys(details.arguments).length > 0 && (
            <div>
              <span className="text-xs text-[#666] font-medium block mb-1">Arguments:</span>
              <pre className="text-xs font-mono text-[#a0a0a0] bg-[#0a0a0a] p-3 rounded overflow-x-auto">
                {JSON.stringify(details.arguments, null, 2)}
              </pre>
            </div>
          )}
          {details.description && (
            <p className="text-sm text-[#a0a0a0]">{details.description}</p>
          )}
        </div>
      );
    }

    default:
      return null;
  }
}
