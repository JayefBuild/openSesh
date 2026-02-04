import { useEffect, useCallback, useState, useMemo } from 'react';
import { X, RotateCcw, Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/uiStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useProjectStore } from '@/stores/projectStore';
import { useTerminal } from '@/hooks/useTerminal';

interface TerminalPaneProps {
  className?: string;
}

export function TerminalPane({ className }: TerminalPaneProps) {
  const setTerminalOpen = useUIStore((state) => state.setTerminalOpen);
  const terminalFontSize = useSettingsStore((state) => state.terminalFontSize);
  const getActiveProject = useProjectStore((state) => state.getActiveProject);
  const activeProject = useMemo(() => getActiveProject(), [getActiveProject]);
  const [hasExited, setHasExited] = useState(false);
  const [exitCode, setExitCode] = useState<number | null>(null);

  const handleExit = useCallback((code: number | null) => {
    setHasExited(true);
    setExitCode(code);
  }, []);

  const { terminalRef, isReady, fit, dispose, sendSignal, closeTerminal } = useTerminal({
    cwd: activeProject?.path || undefined,
    onExit: handleExit,
    fontSize: terminalFontSize,
  });

  // Fit terminal when container resizes
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      fit();
    });

    if (terminalRef.current) {
      observer.observe(terminalRef.current);
    }

    return () => observer.disconnect();
  }, [terminalRef, fit]);

  const handleClose = useCallback(async () => {
    await closeTerminal();
    setTerminalOpen(false);
  }, [closeTerminal, setTerminalOpen]);

  const handleRestart = useCallback(async () => {
    // Dispose current terminal and reset state
    await dispose();
    setHasExited(false);
    setExitCode(null);
    // The useTerminal hook will reinitialize on next mount
    // For now, we close and reopen the pane
    setTerminalOpen(false);
    setTimeout(() => setTerminalOpen(true), 100);
  }, [dispose, setTerminalOpen]);

  const handleInterrupt = useCallback(async () => {
    await sendSignal('SIGINT');
  }, [sendSignal]);

  return (
    <div className={cn('h-full flex flex-col bg-[#0f0f0f]', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1 border-b border-[#333]">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#a0a0a0]">Terminal</span>
          <span className="px-1.5 py-0.5 bg-[#252525] rounded text-[10px] text-[#666]">
            {isReady ? 'connected' : 'connecting...'}
          </span>
          {hasExited && (
            <span className={cn(
              'px-1.5 py-0.5 rounded text-[10px]',
              exitCode === 0 ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
            )}>
              exited ({exitCode ?? '?'})
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {!hasExited && (
            <button
              onClick={handleInterrupt}
              className="p-1 rounded hover:bg-[#252525] text-[#666] hover:text-white transition-colors"
              title="Interrupt (Ctrl+C)"
            >
              <Square className="h-3.5 w-3.5" />
            </button>
          )}
          {hasExited && (
            <button
              onClick={handleRestart}
              className="p-1 rounded hover:bg-[#252525] text-[#666] hover:text-white transition-colors"
              title="Restart terminal"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={handleClose}
            className="p-1 rounded hover:bg-[#252525] text-[#666] hover:text-white transition-colors"
            title="Close terminal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Terminal content */}
      <div
        ref={terminalRef}
        className="flex-1 min-h-0"
        style={{ backgroundColor: '#0f0f0f' }}
      />
    </div>
  );
}
