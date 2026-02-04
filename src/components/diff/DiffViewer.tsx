import { useState, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settingsStore';
import { Loader2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

interface DiffViewerProps {
  projectPath: string;
  filePath: string;
  staged: boolean;
  className?: string;
}

interface DiffLine {
  type: 'added' | 'removed' | 'context' | 'header' | 'hunk';
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}

function parseDiff(diffText: string): DiffLine[] {
  const lines: DiffLine[] = [];
  const rawLines = diffText.split('\n');

  let oldLineNum = 0;
  let newLineNum = 0;

  for (const line of rawLines) {
    if (line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('new file') || line.startsWith('deleted file')) {
      lines.push({ type: 'header', content: line });
    } else if (line.startsWith('---') || line.startsWith('+++')) {
      lines.push({ type: 'header', content: line });
    } else if (line.startsWith('@@')) {
      // Parse hunk header to get line numbers
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldLineNum = parseInt(match[1], 10);
        newLineNum = parseInt(match[2], 10);
      }
      lines.push({ type: 'hunk', content: line });
    } else if (line.startsWith('+')) {
      lines.push({
        type: 'added',
        content: line.substring(1),
        newLineNum: newLineNum++
      });
    } else if (line.startsWith('-')) {
      lines.push({
        type: 'removed',
        content: line.substring(1),
        oldLineNum: oldLineNum++
      });
    } else if (line.startsWith(' ')) {
      lines.push({
        type: 'context',
        content: line.substring(1),
        oldLineNum: oldLineNum++,
        newLineNum: newLineNum++
      });
    } else if (line === '\\ No newline at end of file') {
      lines.push({ type: 'header', content: line });
    } else if (line.length > 0) {
      // Plain text (for new files without diff format)
      lines.push({ type: 'context', content: line });
    }
  }

  return lines;
}

export function DiffViewer({ projectPath, filePath, staged, className }: DiffViewerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [diffText, setDiffText] = useState<string>('');

  const editorFontSize = useSettingsStore((state) => state.editorFontSize);

  // Load diff when file changes
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const loadDiff = async () => {
      try {
        // Get the git diff for the file
        const diff = await invoke<string>('git_diff_file', {
          path: projectPath,
          filePath,
          staged,
        });

        if (cancelled) return;

        if (diff && diff.trim()) {
          setDiffText(diff);
        } else {
          setDiffText('(No changes)');
        }
        setIsLoading(false);
      } catch (err) {
        if (cancelled) return;
        // For untracked files, just read the file content and format as "added"
        try {
          const fullPath = `${projectPath}/${filePath}`;
          const content = await invoke<string>('read_file', { path: fullPath });
          if (cancelled) return;

          // Format as a diff with all lines as additions
          const lines = content.split('\n');
          const diffFormatted = [
            `diff --git a/${filePath} b/${filePath}`,
            'new file mode 100644',
            '--- /dev/null',
            `+++ b/${filePath}`,
            `@@ -0,0 +1,${lines.length} @@`,
            ...lines.map(line => `+${line}`)
          ].join('\n');

          setDiffText(diffFormatted);
          setIsLoading(false);
        } catch (readErr) {
          console.error('Read error:', readErr);
          const errorMessage = err instanceof Error ? err.message : String(err);
          setError(errorMessage);
          setIsLoading(false);
        }
      }
    };

    loadDiff();

    return () => {
      cancelled = true;
    };
  }, [projectPath, filePath, staged]);

  const parsedLines = useMemo(() => parseDiff(diffText), [diffText]);

  if (isLoading) {
    return (
      <div className={cn('h-full flex items-center justify-center', className)}>
        <Loader2 className="h-6 w-6 text-[#666] animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('h-full flex items-center justify-center p-4', className)}>
        <div className="text-center">
          <p className="text-sm text-red-400 mb-2">Failed to load diff</p>
          <p className="text-xs text-[#666]">{error}</p>
        </div>
      </div>
    );
  }

  if (!diffText || diffText === '(No changes)') {
    return (
      <div className={cn('h-full flex items-center justify-center', className)}>
        <p className="text-sm text-[#666]">No changes to display</p>
      </div>
    );
  }

  return (
    <div className={cn('h-full overflow-auto bg-[#0a0a0a]', className)}>
      <div
        className="font-mono text-sm"
        style={{ fontSize: editorFontSize }}
      >
        {parsedLines.map((line, index) => (
          <DiffLineRow key={index} line={line} />
        ))}
      </div>
    </div>
  );
}

function DiffLineRow({ line }: { line: DiffLine }) {
  const bgColor = {
    added: 'bg-green-500/15',
    removed: 'bg-red-500/15',
    context: 'bg-transparent',
    header: 'bg-[#1a1a1a]',
    hunk: 'bg-blue-500/10',
  }[line.type];

  const textColor = {
    added: 'text-green-400',
    removed: 'text-red-400',
    context: 'text-[#d4d4d4]',
    header: 'text-[#888]',
    hunk: 'text-blue-400',
  }[line.type];

  const borderColor = {
    added: 'border-l-green-500',
    removed: 'border-l-red-500',
    context: 'border-l-transparent',
    header: 'border-l-transparent',
    hunk: 'border-l-blue-500',
  }[line.type];

  const prefix = {
    added: '+',
    removed: '-',
    context: ' ',
    header: '',
    hunk: '',
  }[line.type];

  return (
    <div className={cn('flex border-l-2', bgColor, borderColor)}>
      {/* Line numbers */}
      {(line.type === 'added' || line.type === 'removed' || line.type === 'context') && (
        <div className="flex-shrink-0 w-20 flex text-[#555] text-xs select-none">
          <span className="w-10 text-right pr-2 py-0.5">
            {line.oldLineNum ?? ''}
          </span>
          <span className="w-10 text-right pr-2 py-0.5 border-r border-[#333]">
            {line.newLineNum ?? ''}
          </span>
        </div>
      )}

      {/* Header lines span full width */}
      {(line.type === 'header' || line.type === 'hunk') && (
        <div className="flex-shrink-0 w-20 border-r border-[#333]" />
      )}

      {/* Content */}
      <div className={cn('flex-1 py-0.5 px-2 whitespace-pre-wrap break-all', textColor)}>
        {prefix && <span className="select-none opacity-60 mr-1">{prefix}</span>}
        {line.content}
      </div>
    </div>
  );
}
