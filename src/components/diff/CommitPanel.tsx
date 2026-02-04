import { useState, useCallback, useRef, useEffect } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useGitStore } from '@/stores/gitStore';
import { Button } from '@/components/ui/Button';

interface CommitPanelProps {
  projectPath: string;
  className?: string;
}

export function CommitPanel({ projectPath, className }: CommitPanelProps) {
  const { commitMessage, setCommitMessage, commit, status } = useGitStore();
  const [isCommitting, setIsCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const stagedCount = status?.staged.length ?? 0;
  const canCommit = stagedCount > 0 && commitMessage.trim().length > 0;

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
    }
  }, [commitMessage]);

  const handleCommit = useCallback(async () => {
    if (!canCommit || isCommitting) return;

    setIsCommitting(true);
    setError(null);

    try {
      await commit(projectPath, commitMessage.trim());
      // Message is cleared by the store on success
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
    } finally {
      setIsCommitting(false);
    }
  }, [canCommit, isCommitting, commit, projectPath, commitMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Cmd/Ctrl + Enter to commit
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleCommit();
      }
    },
    [handleCommit]
  );

  return (
    <div className={cn('p-3', className)}>
      {/* Commit message input */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Commit message"
          className={cn(
            'w-full px-3 py-2 text-sm bg-[#1a1a1a] border border-[#333] rounded-md',
            'text-white placeholder-[#666]',
            'focus:outline-none focus:border-[#555] focus:ring-1 focus:ring-[#555]',
            'resize-none min-h-[60px]',
            error && 'border-red-500/50'
          )}
          disabled={isCommitting}
          rows={2}
        />
      </div>

      {/* Error message */}
      {error && (
        <p className="mt-2 text-xs text-red-400">{error}</p>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between mt-3">
        <p className="text-xs text-[#666]">
          {stagedCount} file{stagedCount !== 1 ? 's' : ''} staged
        </p>
        <Button
          variant="primary"
          size="sm"
          onClick={handleCommit}
          disabled={!canCommit || isCommitting}
          leftIcon={
            isCommitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )
          }
        >
          {isCommitting ? 'Committing...' : 'Commit'}
        </Button>
      </div>

      {/* Keyboard hint */}
      <p className="mt-2 text-[10px] text-[#555] text-right">
        {navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl'} + Enter to commit
      </p>
    </div>
  );
}
