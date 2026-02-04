import { useState, useEffect, useMemo } from 'react';
import Editor from '@monaco-editor/react';
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
      console.log('Loading diff for:', { projectPath, filePath, staged });
      try {
        // Get the git diff for the file
        const diff = await invoke<string>('git_diff_file', {
          path: projectPath,
          filePath,
          staged,
        });

        console.log('Got diff:', diff?.substring(0, 200));
        if (cancelled) return;

        setDiffText(diff || '(No changes or new file)');
        setIsLoading(false);
      } catch (err) {
        console.log('Diff error, trying to read file:', err);
        if (cancelled) return;
        // For untracked files, just read the file content
        try {
          const fullPath = `${projectPath}/${filePath}`;
          console.log('Reading file:', fullPath);
          const content = await invoke<string>('read_file', { path: fullPath });
          if (cancelled) return;
          setDiffText(`+ New file: ${filePath}\n\n${content}`);
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

  // Determine language from file extension
  const language = useMemo(() => {
    const ext = filePath.split('.').pop()?.toLowerCase();
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
  }, [filePath]);

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

  // If no diff, show message
  if (!diffText) {
    return (
      <div className={cn('h-full flex items-center justify-center', className)}>
        <p className="text-sm text-[#666]">No changes to display</p>
      </div>
    );
  }

  return (
    <div className={cn('h-full', className)}>
      <Editor
        value={diffText}
        language={language === 'plaintext' ? 'diff' : language}
        theme="vs-dark"
        options={{
          readOnly: true,
          fontSize: editorFontSize,
          fontFamily: '"SF Mono", "Fira Code", "Consolas", monospace',
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          lineNumbers: 'on',
          renderLineHighlight: 'none',
          automaticLayout: true,
          wordWrap: 'on',
          scrollbar: {
            vertical: 'auto',
            horizontal: 'auto',
            verticalScrollbarSize: 8,
            horizontalScrollbarSize: 8,
          },
          padding: { top: 8, bottom: 8 },
        }}
        beforeMount={(monaco) => {
          monaco.editor.defineTheme('opensesh-dark', {
            base: 'vs-dark',
            inherit: true,
            rules: [
              { token: 'string.inserted', foreground: '22c55e' },
              { token: 'string.deleted', foreground: 'ef4444' },
            ],
            colors: {
              'editor.background': '#0f0f0f',
              'editor.foreground': '#ffffff',
              'editorLineNumber.foreground': '#666666',
            },
          });
        }}
        onMount={(_editor, monaco) => {
          monaco.editor.setTheme('opensesh-dark');
        }}
      />
    </div>
  );
}
