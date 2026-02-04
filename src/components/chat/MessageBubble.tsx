import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  User,
  Bot,
  ChevronDown,
  ChevronRight,
  Plus,
  Minus,
  CheckCircle,
  XCircle,
  Loader2,
  Copy,
  Check,
  FilePlus,
  FileX,
  FilePen,
  Play,
  Eye,
} from 'lucide-react';
import { cn, formatDate, getFileName } from '@/lib/utils';
import type { Message, ToolCall, FileChange } from '@/types';
import { Button } from '@/components/ui/Button';
import {
  usePendingChangesStore,
  type PendingFileChange,
  calculateDiffStats,
  readFileOrNull,
} from '@/stores/pendingChangesStore';
import { useProjectStore } from '@/stores/projectStore';
import { StatusBadge, InlineApprovalActions } from '@/components/changes/FileApprovalActions';

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  if (isSystem) {
    return (
      <div className="flex justify-center">
        <div className="px-4 py-2 bg-[#252525] rounded-full text-xs text-[#666]">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex gap-3 max-w-4xl',
        isUser ? 'ml-auto flex-row-reverse' : ''
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
          isUser ? 'bg-blue-500' : 'bg-[#252525]'
        )}
      >
        {isUser ? (
          <User className="h-4 w-4 text-white" />
        ) : (
          <Bot className="h-4 w-4 text-[#a0a0a0]" />
        )}
      </div>

      {/* Content */}
      <div
        className={cn(
          'flex-1 min-w-0 space-y-3',
          isUser && 'text-right'
        )}
      >
        {/* Message text */}
        <div
          className={cn(
            'inline-block text-left rounded-lg px-4 py-2 max-w-full',
            isUser ? 'bg-blue-500/20' : 'bg-[#1a1a1a]'
          )}
        >
          <MessageContent content={message.content} />
        </div>

        {/* Tool calls */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="space-y-2">
            {message.toolCalls.map((toolCall) => (
              <ToolCallCard key={toolCall.id} toolCall={toolCall} />
            ))}
          </div>
        )}

        {/* File changes */}
        {message.fileChanges && message.fileChanges.length > 0 && (
          <FileChangesCard changes={message.fileChanges} messageId={message.id} />
        )}

        {/* Timestamp */}
        <p className="text-xs text-[#666]">{formatDate(message.timestamp)}</p>
      </div>
    </div>
  );
}

interface MessageContentProps {
  content: string;
}

function MessageContent({ content }: MessageContentProps) {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div className="prose prose-invert prose-sm max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const code = String(children).replace(/\n$/, '');
            const isInline = !match && !code.includes('\n');

            if (isInline) {
              return (
                <code
                  className="px-1.5 py-0.5 bg-[#252525] rounded text-sm font-mono"
                  {...props}
                >
                  {children}
                </code>
              );
            }

            return (
              <div className="relative group">
                <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleCopyCode(code)}
                    className="p-1.5 bg-[#333] hover:bg-[#404040] rounded text-[#a0a0a0] hover:text-white transition-colors"
                  >
                    {copiedCode === code ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <pre className="bg-[#252525] rounded-lg p-4 overflow-x-auto">
                  <code className={cn('text-sm font-mono', className)} {...props}>
                    {children}
                  </code>
                </pre>
              </div>
            );
          },
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline"
              >
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

interface ToolCallCardProps {
  toolCall: ToolCall;
}

function ToolCallCard({ toolCall }: ToolCallCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const statusIcons = {
    pending: <Loader2 className="h-4 w-4 text-[#666] animate-spin" />,
    running: <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />,
    completed: <CheckCircle className="h-4 w-4 text-green-500" />,
    error: <XCircle className="h-4 w-4 text-red-500" />,
  };

  return (
    <div className="bg-[#1a1a1a] border border-[#333] rounded-lg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[#252525] transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-[#666]" />
        ) : (
          <ChevronRight className="h-4 w-4 text-[#666]" />
        )}
        <span className="text-sm font-mono">{toolCall.name}</span>
        <span className="ml-auto">{statusIcons[toolCall.status]}</span>
      </button>

      {isExpanded && (
        <div className="px-3 pb-3 border-t border-[#333]">
          <div className="mt-2">
            <p className="text-xs text-[#666] mb-1">Arguments:</p>
            <pre className="text-xs bg-[#252525] rounded p-2 overflow-x-auto">
              {JSON.stringify(toolCall.arguments, null, 2)}
            </pre>
          </div>

          {toolCall.result && (
            <div className="mt-2">
              <p className="text-xs text-[#666] mb-1">Result:</p>
              <pre className="text-xs bg-[#252525] rounded p-2 overflow-x-auto max-h-40">
                {toolCall.result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface FileChangesCardProps {
  changes: FileChange[];
  messageId: string;
}

function FileChangesCard({ changes, messageId }: FileChangesCardProps) {
  const totalAdditions = changes.reduce((sum, c) => sum + c.additions, 0);
  const totalDeletions = changes.reduce((sum, c) => sum + c.deletions, 0);

  const {
    pendingChanges,
    addPendingChanges,
    approveChange,
    rejectChange,
    applyChange,
    setSelectedChange,
  } = usePendingChangesStore();

  const activeProject = useProjectStore((state) => state.getActiveProject());
  const projectPath = activeProject?.path || '';

  // Track pending changes for this message
  const messageChanges = pendingChanges.filter((c) => c.messageId === messageId);
  const hasExistingChanges = messageChanges.length > 0;

  const [isAddingChanges, setIsAddingChanges] = useState(false);
  const [isApplyingAll, setIsApplyingAll] = useState(false);

  // Add changes to pending store when they first appear
  useEffect(() => {
    if (hasExistingChanges || changes.length === 0 || !projectPath) return;

    const addChangesToStore = async () => {
      setIsAddingChanges(true);
      try {
        const changesToAdd = await Promise.all(
          changes.map(async (change) => {
            const fullPath = change.path.startsWith('/')
              ? change.path
              : `${projectPath}/${change.path}`;
            const originalContent = await readFileOrNull(fullPath);
            const proposedContent = change.content || '';
            const stats = calculateDiffStats(originalContent, proposedContent);

            return {
              messageId,
              path: change.path,
              type: change.type,
              originalContent,
              proposedContent,
              additions: stats.additions || change.additions,
              deletions: stats.deletions || change.deletions,
            };
          })
        );

        addPendingChanges(changesToAdd);
      } catch (error) {
        console.error('Failed to add pending changes:', error);
      } finally {
        setIsAddingChanges(false);
      }
    };

    addChangesToStore();
  }, [changes, messageId, hasExistingChanges, projectPath, addPendingChanges]);

  const pendingCount = messageChanges.filter((c) => c.status === 'pending').length;
  const approvedCount = messageChanges.filter((c) => c.status === 'approved').length;
  const appliedCount = messageChanges.filter((c) => c.status === 'applied').length;

  const handleApproveAll = () => {
    messageChanges
      .filter((c) => c.status === 'pending')
      .forEach((c) => approveChange(c.id));
  };

  const handleApplyAll = async () => {
    setIsApplyingAll(true);
    try {
      for (const change of messageChanges.filter((c) => c.status === 'approved')) {
        await applyChange(change.id, projectPath);
      }
    } finally {
      setIsApplyingAll(false);
    }
  };

  const getChangeForPath = (path: string): PendingFileChange | undefined => {
    return messageChanges.find((c) => c.path === path);
  };

  return (
    <div className="bg-[#1a1a1a] border border-[#333] rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#333]">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">
            {changes.length} file{changes.length !== 1 ? 's' : ''} changed
          </span>
          {isAddingChanges && (
            <Loader2 className="h-3 w-3 animate-spin text-[#666]" />
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="flex items-center text-green-500">
              <Plus className="h-3 w-3" />
              {totalAdditions}
            </span>
            <span className="flex items-center text-red-500">
              <Minus className="h-3 w-3" />
              {totalDeletions}
            </span>
          </div>
          {/* Status indicators */}
          {appliedCount > 0 && (
            <span className="text-xs bg-green-500/20 text-green-500 px-1.5 py-0.5 rounded">
              {appliedCount} applied
            </span>
          )}
        </div>
      </div>

      {/* Bulk actions */}
      {(pendingCount > 0 || approvedCount > 0) && (
        <div className="flex items-center justify-between px-3 py-2 bg-[#151515] border-b border-[#333]">
          <div className="flex items-center gap-2">
            {pendingCount > 0 && (
              <span className="text-xs text-yellow-500">
                {pendingCount} pending review
              </span>
            )}
            {approvedCount > 0 && (
              <span className="text-xs text-blue-500">
                {approvedCount} ready to apply
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {pendingCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleApproveAll}
                leftIcon={<Check className="h-3.5 w-3.5" />}
              >
                Approve All
              </Button>
            )}
            {approvedCount > 0 && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleApplyAll}
                isLoading={isApplyingAll}
                leftIcon={<Play className="h-3.5 w-3.5" />}
              >
                Apply All
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="divide-y divide-[#333]">
        {changes.map((change) => {
          const pendingChange = getChangeForPath(change.path);
          return (
            <FileChangeRow
              key={change.path}
              change={change}
              pendingChange={pendingChange}
              onApprove={() => pendingChange && approveChange(pendingChange.id)}
              onReject={() => pendingChange && rejectChange(pendingChange.id)}
              onApply={async () => {
                if (pendingChange) {
                  await applyChange(pendingChange.id, projectPath);
                }
              }}
              onPreview={() => pendingChange && setSelectedChange(pendingChange.id)}
            />
          );
        })}
      </div>
    </div>
  );
}

interface FileChangeRowProps {
  change: FileChange;
  pendingChange?: PendingFileChange;
  onApprove: () => void;
  onReject: () => void;
  onApply: () => Promise<void>;
  onPreview: () => void;
}

function FileChangeRow({
  change,
  pendingChange,
  onApprove,
  onReject,
  onApply,
  onPreview,
}: FileChangeRowProps) {
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

  const typeBgColor =
    change.type === 'create'
      ? 'bg-green-500/20'
      : change.type === 'delete'
        ? 'bg-red-500/20'
        : 'bg-yellow-500/20';

  return (
    <div className="flex items-center gap-2 px-3 py-2 hover:bg-[#252525] group">
      <TypeIcon className={cn('h-4 w-4 flex-shrink-0', typeColor)} />
      <span className="text-sm truncate flex-1">{getFileName(change.path)}</span>

      {/* Status badge for applied/rejected */}
      {pendingChange && (pendingChange.status === 'applied' || pendingChange.status === 'rejected' || pendingChange.status === 'error') && (
        <StatusBadge status={pendingChange.status} />
      )}

      {/* Type badge */}
      {(!pendingChange || (pendingChange.status !== 'applied' && pendingChange.status !== 'rejected')) && (
        <span className={cn('text-xs px-1.5 py-0.5 rounded', typeBgColor, typeColor)}>
          {change.type}
        </span>
      )}

      {/* Diff stats */}
      <div className="flex items-center gap-1 text-xs">
        <span className="text-green-500">+{change.additions}</span>
        <span className="text-red-500">-{change.deletions}</span>
      </div>

      {/* Preview button */}
      <button
        onClick={onPreview}
        className="p-1 hover:bg-[#333] rounded transition-colors opacity-0 group-hover:opacity-100"
        title="Preview"
      >
        <Eye className="h-3.5 w-3.5 text-[#666]" />
      </button>

      {/* Approval actions */}
      {pendingChange && (
        <InlineApprovalActions
          status={pendingChange.status}
          onApprove={onApprove}
          onReject={onReject}
          onApply={onApply}
          className="opacity-0 group-hover:opacity-100 transition-opacity"
        />
      )}
    </div>
  );
}
