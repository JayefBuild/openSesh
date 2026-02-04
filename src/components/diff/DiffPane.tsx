import React, { useEffect, useCallback } from 'react';
import { X, Plus, GitBranch, RefreshCw, ArrowUp, ArrowDown, Loader2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/uiStore';
import { useProjectStore } from '@/stores/projectStore';
import { useGitStore } from '@/stores/gitStore';
import { Button } from '@/components/ui/Button';
import { FileTree } from './FileTree';
import { DiffViewer } from './DiffViewer';
import { CommitPanel } from './CommitPanel';

// Simple error boundary component
class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; fallback: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('DiffViewer error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

function DiffErrorFallback() {
  return (
    <div className="h-full flex items-center justify-center p-4">
      <div className="text-center">
        <AlertTriangle className="h-8 w-8 text-yellow-500 mx-auto mb-2" />
        <p className="text-sm text-[#a0a0a0]">Failed to load diff viewer</p>
        <p className="text-xs text-[#666] mt-1">Try selecting another file</p>
      </div>
    </div>
  );
}

interface DiffPaneProps {
  className?: string;
}

export function DiffPane({ className }: DiffPaneProps) {
  const setDiffPaneOpen = useUIStore((state) => state.setDiffPaneOpen);

  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const projects = useProjectStore((state) => state.projects);
  const activeProject = projects.find((p) => p.id === activeProjectId);

  const {
    isGitRepo,
    isLoading,
    error,
    status,
    currentBranch,
    selectedFile,
    selectedFileStaged,
    checkIsGitRepo,
    fetchStatus,
    stageAll,
    startPolling,
    stopPolling,
    reset,
  } = useGitStore();

  // Initialize git state when project changes
  useEffect(() => {
    if (activeProject?.path) {
      const initGit = async () => {
        const isRepo = await checkIsGitRepo(activeProject.path);
        if (isRepo) {
          fetchStatus(activeProject.path);
          startPolling(activeProject.path, 5000);
        }
      };
      initGit();
    } else {
      reset();
    }

    return () => {
      stopPolling();
    };
  }, [activeProject?.path, checkIsGitRepo, fetchStatus, startPolling, stopPolling, reset]);

  const handleClose = () => {
    setDiffPaneOpen(false);
  };

  const handleRefresh = useCallback(() => {
    if (activeProject?.path) {
      fetchStatus(activeProject.path);
    }
  }, [activeProject?.path, fetchStatus]);

  const handleStageAll = useCallback(async () => {
    if (activeProject?.path) {
      try {
        await stageAll(activeProject.path);
      } catch (err) {
        console.error('Failed to stage all:', err);
      }
    }
  }, [activeProject?.path, stageAll]);

  // Calculate totals
  const stagedCount = status?.staged.length ?? 0;
  const unstagedCount = status?.unstaged.length ?? 0;
  const untrackedCount = status?.untracked.length ?? 0;
  const totalChanges = stagedCount + unstagedCount + untrackedCount;
  const isClean = status?.is_clean ?? true;

  // Render non-git directory state
  if (!isGitRepo && activeProject) {
    return (
      <div className={cn('h-full flex flex-col bg-[#0f0f0f]', className)}>
        <div className="flex items-center justify-between px-3 py-2 border-b border-[#333]">
          <h3 className="text-sm font-medium">Source Control</h3>
          <button
            onClick={handleClose}
            className="p-1 rounded hover:bg-[#252525] text-[#666] hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <GitBranch className="h-8 w-8 text-[#666] mx-auto mb-2" />
            <p className="text-sm text-[#666]">Not a git repository</p>
            <p className="text-xs text-[#555] mt-1">Initialize a git repository to track changes</p>
          </div>
        </div>
      </div>
    );
  }

  // Render no project state
  if (!activeProject) {
    return (
      <div className={cn('h-full flex flex-col bg-[#0f0f0f]', className)}>
        <div className="flex items-center justify-between px-3 py-2 border-b border-[#333]">
          <h3 className="text-sm font-medium">Source Control</h3>
          <button
            onClick={handleClose}
            className="p-1 rounded hover:bg-[#252525] text-[#666] hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-sm text-[#666]">No project selected</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('h-full flex flex-col bg-[#0f0f0f]', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#333]">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium">Source Control</h3>
          {currentBranch && (
            <div className="flex items-center gap-1 text-xs text-[#888]">
              <GitBranch className="h-3 w-3" />
              <span>{currentBranch}</span>
              {status && (status.ahead > 0 || status.behind > 0) && (
                <span className="flex items-center gap-0.5 text-[#666]">
                  {status.ahead > 0 && (
                    <span className="flex items-center">
                      <ArrowUp className="h-3 w-3" />
                      {status.ahead}
                    </span>
                  )}
                  {status.behind > 0 && (
                    <span className="flex items-center">
                      <ArrowDown className="h-3 w-3" />
                      {status.behind}
                    </span>
                  )}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="p-1 rounded hover:bg-[#252525] text-[#666] hover:text-white transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </button>
          <button
            onClick={handleClose}
            className="p-1 rounded hover:bg-[#252525] text-[#666] hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="px-3 py-2 bg-red-500/10 border-b border-red-500/20 text-red-400 text-xs">
          {error}
        </div>
      )}

      {/* Loading state */}
      {isLoading && !status && (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 text-[#666] animate-spin" />
        </div>
      )}

      {/* Content */}
      {status && (
        <>
          {/* Commit panel */}
          {stagedCount > 0 && (
            <div className="border-b border-[#333]">
              <CommitPanel projectPath={activeProject.path} />
            </div>
          )}

          {/* File tree */}
          <div className="flex-shrink-0 border-b border-[#333] overflow-hidden">
            <FileTree
              staged={status.staged}
              unstaged={status.unstaged}
              untracked={status.untracked}
              projectPath={activeProject.path}
            />
          </div>

          {/* Diff viewer */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {selectedFile ? (
              <ErrorBoundary fallback={<DiffErrorFallback />}>
                <DiffViewer
                  projectPath={activeProject.path}
                  filePath={selectedFile}
                  staged={selectedFileStaged}
                />
              </ErrorBoundary>
            ) : (
              <div className="h-full flex items-center justify-center">
                <p className="text-sm text-[#666]">
                  {totalChanges > 0
                    ? 'Select a file to view diff'
                    : 'Working tree clean'}
                </p>
              </div>
            )}
          </div>

          {/* Actions */}
          {(unstagedCount > 0 || untrackedCount > 0) && (
            <div className="flex items-center gap-2 p-3 border-t border-[#333]">
              <span className="text-xs text-[#666]">
                {totalChanges} change{totalChanges !== 1 ? 's' : ''}
              </span>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Plus className="h-4 w-4" />}
                onClick={handleStageAll}
                className="ml-auto"
                disabled={isLoading}
              >
                Stage All
              </Button>
            </div>
          )}

          {/* Clean state */}
          {isClean && (
            <div className="p-4 text-center">
              <p className="text-xs text-[#666]">No changes to commit</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
