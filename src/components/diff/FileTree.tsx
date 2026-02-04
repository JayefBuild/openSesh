import React, { useCallback } from 'react';
import {
  FileText,
  FilePlus,
  FileX,
  FilePen,
  ChevronRight,
  ChevronDown,
  Folder,
  Plus,
  Minus,
  RotateCcw,
} from 'lucide-react';
import { cn, getFileName, getDirectory } from '@/lib/utils';
import { useGitStore, type GitFileStatus } from '@/stores/gitStore';

interface FileTreeProps {
  className?: string;
  staged: GitFileStatus[];
  unstaged: GitFileStatus[];
  untracked: string[];
  projectPath: string;
}

type FileEntry = {
  path: string;
  status: string;
  staged: boolean;
  isUntracked?: boolean;
};

export function FileTree({
  className,
  staged,
  unstaged,
  untracked,
  projectPath,
}: FileTreeProps) {
  const { selectedFile, selectedFileStaged, setSelectedFile, stageFiles, unstageFiles, discardFile, isLoading } =
    useGitStore();

  // Convert data to unified format
  const stagedFiles: FileEntry[] = staged.map((f) => ({
    path: f.path,
    status: f.status,
    staged: true,
  }));

  const unstagedFiles: FileEntry[] = unstaged.map((f) => ({
    path: f.path,
    status: f.status,
    staged: false,
  }));

  const untrackedFiles: FileEntry[] = untracked.map((path) => ({
    path,
    status: 'added',
    staged: false,
    isUntracked: true,
  }));

  const handleSelectFile = useCallback(
    (path: string, isStaged: boolean) => {
      setSelectedFile(path, isStaged);
    },
    [setSelectedFile]
  );

  const handleStage = useCallback(
    async (path: string, e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await stageFiles(projectPath, [path]);
      } catch (err) {
        console.error('Failed to stage file:', err);
      }
    },
    [projectPath, stageFiles]
  );

  const handleUnstage = useCallback(
    async (path: string, e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await unstageFiles(projectPath, [path]);
      } catch (err) {
        console.error('Failed to unstage file:', err);
      }
    },
    [projectPath, unstageFiles]
  );

  const handleDiscard = useCallback(
    async (path: string, e: React.MouseEvent) => {
      e.stopPropagation();
      // TODO: Add confirmation dialog
      try {
        await discardFile(projectPath, path);
      } catch (err) {
        console.error('Failed to discard file:', err);
      }
    },
    [projectPath, discardFile]
  );

  const hasChanges = stagedFiles.length > 0 || unstagedFiles.length > 0 || untrackedFiles.length > 0;

  if (!hasChanges) {
    return (
      <div className={cn('p-4 text-center', className)}>
        <p className="text-xs text-[#666]">No changes to display</p>
      </div>
    );
  }

  return (
    <div className={cn('max-h-60 overflow-y-auto', className)}>
      {/* Staged changes */}
      {stagedFiles.length > 0 && (
        <FileSection
          title="Staged Changes"
          files={stagedFiles}
          selectedFile={selectedFile}
          selectedFileStaged={selectedFileStaged}
          onSelectFile={handleSelectFile}
          onAction={handleUnstage}
          actionIcon={<Minus className="h-3 w-3" />}
          actionTitle="Unstage"
          disabled={isLoading}
        />
      )}

      {/* Unstaged changes */}
      {unstagedFiles.length > 0 && (
        <FileSection
          title="Changes"
          files={unstagedFiles}
          selectedFile={selectedFile}
          selectedFileStaged={selectedFileStaged}
          onSelectFile={handleSelectFile}
          onAction={handleStage}
          actionIcon={<Plus className="h-3 w-3" />}
          actionTitle="Stage"
          secondaryAction={handleDiscard}
          secondaryIcon={<RotateCcw className="h-3 w-3" />}
          secondaryTitle="Discard"
          disabled={isLoading}
        />
      )}

      {/* Untracked files */}
      {untrackedFiles.length > 0 && (
        <FileSection
          title="Untracked"
          files={untrackedFiles}
          selectedFile={selectedFile}
          selectedFileStaged={selectedFileStaged}
          onSelectFile={handleSelectFile}
          onAction={handleStage}
          actionIcon={<Plus className="h-3 w-3" />}
          actionTitle="Stage"
          disabled={isLoading}
        />
      )}
    </div>
  );
}

interface FileSectionProps {
  title: string;
  files: FileEntry[];
  selectedFile: string | null;
  selectedFileStaged: boolean;
  onSelectFile: (path: string, staged: boolean) => void;
  onAction: (path: string, e: React.MouseEvent) => void;
  actionIcon: React.ReactNode;
  actionTitle: string;
  secondaryAction?: (path: string, e: React.MouseEvent) => void;
  secondaryIcon?: React.ReactNode;
  secondaryTitle?: string;
  disabled?: boolean;
}

function FileSection({
  title,
  files,
  selectedFile,
  selectedFileStaged,
  onSelectFile,
  onAction,
  actionIcon,
  actionTitle,
  secondaryAction,
  secondaryIcon,
  secondaryTitle,
  disabled,
}: FileSectionProps) {
  const [isExpanded, setIsExpanded] = React.useState(true);

  // Group files by directory
  const groupedFiles = groupFilesByDirectory(files);

  return (
    <div>
      {/* Section header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#a0a0a0] hover:bg-[#252525] transition-colors font-medium"
      >
        {isExpanded ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        <span>{title}</span>
        <span className="text-[#666]">({files.length})</span>
      </button>

      {isExpanded && (
        <div>
          {Object.entries(groupedFiles).map(([dir, dirFiles]) => (
            <DirectoryGroup
              key={dir}
              directory={dir}
              files={dirFiles}
              selectedFile={selectedFile}
              selectedFileStaged={selectedFileStaged}
              onSelectFile={onSelectFile}
              onAction={onAction}
              actionIcon={actionIcon}
              actionTitle={actionTitle}
              secondaryAction={secondaryAction}
              secondaryIcon={secondaryIcon}
              secondaryTitle={secondaryTitle}
              disabled={disabled}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface DirectoryGroupProps {
  directory: string;
  files: FileEntry[];
  selectedFile: string | null;
  selectedFileStaged: boolean;
  onSelectFile: (path: string, staged: boolean) => void;
  onAction: (path: string, e: React.MouseEvent) => void;
  actionIcon: React.ReactNode;
  actionTitle: string;
  secondaryAction?: (path: string, e: React.MouseEvent) => void;
  secondaryIcon?: React.ReactNode;
  secondaryTitle?: string;
  disabled?: boolean;
}

function DirectoryGroup({
  directory,
  files,
  selectedFile,
  selectedFileStaged,
  onSelectFile,
  onAction,
  actionIcon,
  actionTitle,
  secondaryAction,
  secondaryIcon,
  secondaryTitle,
  disabled,
}: DirectoryGroupProps) {
  const [isExpanded, setIsExpanded] = React.useState(true);

  return (
    <div>
      {directory && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center gap-1.5 px-3 py-1 text-xs text-[#888] hover:bg-[#252525] transition-colors ml-2"
        >
          {isExpanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          <Folder className="h-3 w-3" />
          <span className="truncate">{directory || '/'}</span>
        </button>
      )}

      {isExpanded && (
        <div className={directory ? 'ml-4' : 'ml-2'}>
          {files.map((file) => (
            <FileItem
              key={file.path}
              file={file}
              isSelected={file.path === selectedFile && file.staged === selectedFileStaged}
              onClick={() => onSelectFile(file.path, file.staged)}
              onAction={onAction}
              actionIcon={actionIcon}
              actionTitle={actionTitle}
              secondaryAction={secondaryAction}
              secondaryIcon={secondaryIcon}
              secondaryTitle={secondaryTitle}
              disabled={disabled}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface FileItemProps {
  file: FileEntry;
  isSelected: boolean;
  onClick: () => void;
  onAction: (path: string, e: React.MouseEvent) => void;
  actionIcon: React.ReactNode;
  actionTitle: string;
  secondaryAction?: (path: string, e: React.MouseEvent) => void;
  secondaryIcon?: React.ReactNode;
  secondaryTitle?: string;
  disabled?: boolean;
}

function FileItem({
  file,
  isSelected,
  onClick,
  onAction,
  actionIcon,
  actionTitle,
  secondaryAction,
  secondaryIcon,
  secondaryTitle,
  disabled,
}: FileItemProps) {
  const getFileIcon = () => {
    switch (file.status) {
      case 'added':
        return <FilePlus className="h-4 w-4 text-green-500" />;
      case 'deleted':
        return <FileX className="h-4 w-4 text-red-500" />;
      case 'modified':
        return <FilePen className="h-4 w-4 text-yellow-500" />;
      case 'renamed':
        return <FilePen className="h-4 w-4 text-blue-500" />;
      case 'copied':
        return <FilePlus className="h-4 w-4 text-blue-500" />;
      case 'conflict':
        return <FileX className="h-4 w-4 text-orange-500" />;
      default:
        return <FileText className="h-4 w-4 text-[#666]" />;
    }
  };

  const getStatusBadge = () => {
    const badges: Record<string, { label: string; className: string }> = {
      added: { label: 'A', className: 'text-green-500' },
      modified: { label: 'M', className: 'text-yellow-500' },
      deleted: { label: 'D', className: 'text-red-500' },
      renamed: { label: 'R', className: 'text-blue-500' },
      copied: { label: 'C', className: 'text-blue-500' },
      conflict: { label: 'U', className: 'text-orange-500' },
    };
    const badge = badges[file.status];
    if (!badge) return null;
    return (
      <span className={cn('text-xs font-mono', badge.className)}>
        {badge.label}
      </span>
    );
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        'group w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left cursor-pointer',
        'hover:bg-[#252525] transition-colors',
        isSelected && 'bg-[#252525]'
      )}
    >
      {getFileIcon()}
      <span className="flex-1 truncate">{getFileName(file.path)}</span>
      {getStatusBadge()}

      {/* Action buttons */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {secondaryAction && secondaryIcon && (
          <button
            onClick={(e) => secondaryAction(file.path, e)}
            disabled={disabled}
            className="p-1 rounded hover:bg-[#333] text-[#666] hover:text-red-400 transition-colors disabled:opacity-50"
            title={secondaryTitle}
          >
            {secondaryIcon}
          </button>
        )}
        <button
          onClick={(e) => onAction(file.path, e)}
          disabled={disabled}
          className="p-1 rounded hover:bg-[#333] text-[#666] hover:text-white transition-colors disabled:opacity-50"
          title={actionTitle}
        >
          {actionIcon}
        </button>
      </div>
    </div>
  );
}

function groupFilesByDirectory(files: FileEntry[]): Record<string, FileEntry[]> {
  const grouped: Record<string, FileEntry[]> = {};

  for (const file of files) {
    const dir = getDirectory(file.path);
    if (!grouped[dir]) {
      grouped[dir] = [];
    }
    grouped[dir].push(file);
  }

  // Sort directories
  const sorted: Record<string, FileEntry[]> = {};
  const sortedKeys = Object.keys(grouped).sort();
  for (const key of sortedKeys) {
    sorted[key] = grouped[key].sort((a, b) =>
      getFileName(a.path).localeCompare(getFileName(b.path))
    );
  }

  return sorted;
}
