import { useMemo } from 'react';
import { DiffEditor, Editor, type Monaco } from '@monaco-editor/react';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settingsStore';
import type { PendingFileChange } from '@/stores/pendingChangesStore';
import { Loader2, FileText, FilePlus, FileX, FilePen } from 'lucide-react';

interface FileChangePreviewProps {
  change: PendingFileChange;
  className?: string;
  isEditing?: boolean;
  onContentChange?: (content: string) => void;
}

export function FileChangePreview({
  change,
  className,
  isEditing = false,
  onContentChange,
}: FileChangePreviewProps) {
  const editorFontSize = useSettingsStore((state) => state.editorFontSize);

  // Determine language from file extension
  const language = useMemo(() => {
    const ext = change.path.split('.').pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      json: 'json',
      md: 'markdown',
      css: 'css',
      scss: 'scss',
      html: 'html',
      py: 'python',
      rs: 'rust',
      go: 'go',
      java: 'java',
      rb: 'ruby',
      php: 'php',
      sql: 'sql',
      yaml: 'yaml',
      yml: 'yaml',
      xml: 'xml',
      sh: 'shell',
      bash: 'shell',
      toml: 'toml',
      c: 'c',
      cpp: 'cpp',
      h: 'c',
      hpp: 'cpp',
      swift: 'swift',
      kt: 'kotlin',
      scala: 'scala',
      vue: 'vue',
      svelte: 'svelte',
    };
    return languageMap[ext || ''] || 'plaintext';
  }, [change.path]);

  // Get the type icon
  const TypeIcon = useMemo(() => {
    switch (change.type) {
      case 'create':
        return FilePlus;
      case 'delete':
        return FileX;
      case 'modify':
        return FilePen;
      default:
        return FileText;
    }
  }, [change.type]);

  const editorOptions = {
    fontSize: editorFontSize,
    fontFamily: '"SF Mono", "Fira Code", "Consolas", monospace',
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    lineNumbers: 'on' as const,
    renderLineHighlight: 'all' as const,
    automaticLayout: true,
    scrollbar: {
      vertical: 'auto' as const,
      horizontal: 'auto' as const,
      verticalScrollbarSize: 8,
      horizontalScrollbarSize: 8,
    },
    padding: { top: 8, bottom: 8 },
  };

  const defineTheme = (monaco: Monaco) => {
    monaco.editor.defineTheme('opensesh-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#0f0f0f',
        'editor.foreground': '#ffffff',
        'editor.lineHighlightBackground': '#1a1a1a',
        'editorLineNumber.foreground': '#666666',
        'editorLineNumber.activeForeground': '#a0a0a0',
        'editor.selectionBackground': '#3b82f640',
        'editor.inactiveSelectionBackground': '#3b82f620',
        'diffEditor.insertedTextBackground': '#22c55e20',
        'diffEditor.removedTextBackground': '#ef444420',
        'diffEditor.insertedLineBackground': '#22c55e10',
        'diffEditor.removedLineBackground': '#ef444410',
      },
    });
  };

  // For new files, show just the proposed content
  if (change.type === 'create' || change.originalContent === null) {
    return (
      <div className={cn('h-full flex flex-col', className)}>
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[#333] bg-[#1a1a1a]">
          <TypeIcon className="h-4 w-4 text-green-500" />
          <span className="text-sm font-mono truncate">{change.path}</span>
          <span className="text-xs text-green-500 px-1.5 py-0.5 rounded bg-green-500/20 ml-auto">
            new file
          </span>
        </div>
        <div className="flex-1 min-h-0">
          <Editor
            value={change.proposedContent}
            language={language}
            theme="vs-dark"
            options={{
              ...editorOptions,
              readOnly: !isEditing,
            }}
            onChange={(value) => {
              if (isEditing && onContentChange && value !== undefined) {
                onContentChange(value);
              }
            }}
            beforeMount={defineTheme}
            onMount={(_editor, monaco) => {
              monaco.editor.setTheme('opensesh-dark');
            }}
            loading={
              <div className="h-full flex items-center justify-center">
                <Loader2 className="h-6 w-6 text-[#666] animate-spin" />
              </div>
            }
          />
        </div>
      </div>
    );
  }

  // For deleted files, show just the original content with a warning
  if (change.type === 'delete') {
    return (
      <div className={cn('h-full flex flex-col', className)}>
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[#333] bg-[#1a1a1a]">
          <TypeIcon className="h-4 w-4 text-red-500" />
          <span className="text-sm font-mono truncate">{change.path}</span>
          <span className="text-xs text-red-500 px-1.5 py-0.5 rounded bg-red-500/20 ml-auto">
            will be deleted
          </span>
        </div>
        <div className="flex-1 min-h-0">
          <Editor
            value={change.originalContent || ''}
            language={language}
            theme="vs-dark"
            options={{
              ...editorOptions,
              readOnly: true,
            }}
            beforeMount={defineTheme}
            onMount={(_editor, monaco) => {
              monaco.editor.setTheme('opensesh-dark');
            }}
            loading={
              <div className="h-full flex items-center justify-center">
                <Loader2 className="h-6 w-6 text-[#666] animate-spin" />
              </div>
            }
          />
        </div>
      </div>
    );
  }

  // For modifications, show diff editor
  return (
    <div className={cn('h-full flex flex-col', className)}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#333] bg-[#1a1a1a]">
        <TypeIcon className="h-4 w-4 text-yellow-500" />
        <span className="text-sm font-mono truncate">{change.path}</span>
        <span className="text-xs text-yellow-500 px-1.5 py-0.5 rounded bg-yellow-500/20 ml-auto">
          modified
        </span>
      </div>
      <div className="flex-1 min-h-0">
        {isEditing ? (
          <Editor
            value={change.proposedContent}
            language={language}
            theme="vs-dark"
            options={{
              ...editorOptions,
              readOnly: false,
            }}
            onChange={(value) => {
              if (onContentChange && value !== undefined) {
                onContentChange(value);
              }
            }}
            beforeMount={defineTheme}
            onMount={(_editor, monaco) => {
              monaco.editor.setTheme('opensesh-dark');
            }}
            loading={
              <div className="h-full flex items-center justify-center">
                <Loader2 className="h-6 w-6 text-[#666] animate-spin" />
              </div>
            }
          />
        ) : (
          <DiffEditor
            original={change.originalContent || ''}
            modified={change.proposedContent}
            language={language}
            theme="vs-dark"
            options={{
              ...editorOptions,
              readOnly: true,
              renderSideBySide: true,
            }}
            beforeMount={defineTheme}
            onMount={(_editor, monaco) => {
              monaco.editor.setTheme('opensesh-dark');
            }}
            loading={
              <div className="h-full flex items-center justify-center">
                <Loader2 className="h-6 w-6 text-[#666] animate-spin" />
              </div>
            }
          />
        )}
      </div>
    </div>
  );
}
