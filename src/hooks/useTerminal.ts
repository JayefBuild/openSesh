import { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import '@xterm/xterm/css/xterm.css';

interface TerminalInfo {
  id: string;
  cols: number;
  rows: number;
  cwd: string;
}

interface PtyOutputEvent {
  terminal_id: string;
  data: string;
}

interface PtyExitEvent {
  terminal_id: string;
  exit_code: number | null;
}

interface UseTerminalOptions {
  cwd?: string;
  onExit?: (exitCode: number | null) => void;
  fontSize?: number;
}

export function useTerminal(options: UseTerminalOptions = {}) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInstance = useRef<Terminal | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [terminalId, setTerminalId] = useState<string | null>(null);
  const unlistenOutputRef = useRef<UnlistenFn | null>(null);
  const unlistenExitRef = useRef<UnlistenFn | null>(null);

  const { cwd, onExit, fontSize = 13 } = options;

  // Use refs for values that shouldn't trigger re-initialization
  const cwdRef = useRef(cwd);
  const onExitRef = useRef(onExit);
  const fontSizeRef = useRef(fontSize);

  // Update refs when values change
  useEffect(() => {
    cwdRef.current = cwd;
    onExitRef.current = onExit;
    fontSizeRef.current = fontSize;
  }, [cwd, onExit, fontSize]);

  // Write data to the terminal display
  const write = useCallback((data: string) => {
    terminalInstance.current?.write(data);
  }, []);

  const writeln = useCallback((data: string) => {
    terminalInstance.current?.writeln(data);
  }, []);

  const clear = useCallback(() => {
    terminalInstance.current?.clear();
  }, []);

  const focus = useCallback(() => {
    terminalInstance.current?.focus();
  }, []);

  const fit = useCallback(() => {
    fitAddon.current?.fit();
  }, []);

  // Send data to the PTY backend
  const sendInput = useCallback(async (data: string) => {
    if (!terminalId) return;
    try {
      await invoke('write_terminal', { terminalId, data });
    } catch (error) {
      console.error('Failed to write to terminal:', error);
    }
  }, [terminalId]);

  // Resize the PTY
  const resizePty = useCallback(async (cols: number, rows: number) => {
    if (!terminalId) return;
    try {
      await invoke('resize_terminal', { terminalId, cols, rows });
    } catch (error) {
      console.error('Failed to resize terminal:', error);
    }
  }, [terminalId]);

  // Send a signal to the PTY (e.g., SIGINT)
  const sendSignal = useCallback(async (signal: string) => {
    if (!terminalId) return;
    try {
      await invoke('send_terminal_signal', { terminalId, signal });
    } catch (error) {
      console.error('Failed to send signal:', error);
    }
  }, [terminalId]);

  // Close the terminal
  const closeTerminal = useCallback(async () => {
    if (!terminalId) return;
    try {
      await invoke('close_terminal', { terminalId });
    } catch (error) {
      console.error('Failed to close terminal:', error);
    }
  }, [terminalId]);

  // Initialize terminal and spawn PTY
  const initTerminal = useCallback(async () => {
    if (!terminalRef.current || terminalInstance.current) return;

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: fontSizeRef.current,
      fontFamily: '"SF Mono", "Fira Code", "Consolas", monospace',
      theme: {
        background: '#0f0f0f',
        foreground: '#ffffff',
        cursor: '#ffffff',
        cursorAccent: '#0f0f0f',
        selectionBackground: 'rgba(255, 255, 255, 0.2)',
        black: '#000000',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#f59e0b',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#ffffff',
        brightBlack: '#666666',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#fbbf24',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: '#ffffff',
      },
      allowProposedApi: true,
      scrollback: 10000,
    });

    const fit = new FitAddon();
    fitAddon.current = fit;
    terminal.loadAddon(fit);

    terminal.open(terminalRef.current);
    fit.fit();

    terminalInstance.current = terminal;

    // Get initial terminal size
    const cols = terminal.cols;
    const rows = terminal.rows;

    try {
      // Spawn the PTY session
      const info = await invoke<TerminalInfo>('spawn_terminal', {
        cwd: cwdRef.current,
        cols,
        rows,
      });

      setTerminalId(info.id);

      // Listen for PTY output
      const unlistenOutput = await listen<PtyOutputEvent>('pty-output', (event) => {
        if (event.payload.terminal_id === info.id) {
          terminal.write(event.payload.data);
        }
      });
      unlistenOutputRef.current = unlistenOutput;

      // Listen for PTY exit
      const unlistenExit = await listen<PtyExitEvent>('pty-exit', (event) => {
        if (event.payload.terminal_id === info.id) {
          terminal.writeln(`\r\n\x1b[1;33m[Process exited with code ${event.payload.exit_code ?? 'unknown'}]\x1b[0m`);
          if (onExitRef.current) {
            onExitRef.current(event.payload.exit_code);
          }
        }
      });
      unlistenExitRef.current = unlistenExit;

      // Handle terminal input - send to PTY
      terminal.onData(async (data) => {
        try {
          await invoke('write_terminal', { terminalId: info.id, data });
        } catch (error) {
          console.error('Failed to write to terminal:', error);
        }
      });

      // Handle terminal resize
      terminal.onResize(async ({ cols, rows }) => {
        try {
          await invoke('resize_terminal', { terminalId: info.id, cols, rows });
        } catch (error) {
          console.error('Failed to resize terminal:', error);
        }
      });

      setIsReady(true);
    } catch (error) {
      console.error('Failed to spawn terminal:', error);
      terminal.writeln(`\x1b[1;31mFailed to spawn terminal: ${error}\x1b[0m`);
    }

    return terminal;
  }, []);

  const dispose = useCallback(async () => {
    // Clean up event listeners
    if (unlistenOutputRef.current) {
      unlistenOutputRef.current();
      unlistenOutputRef.current = null;
    }
    if (unlistenExitRef.current) {
      unlistenExitRef.current();
      unlistenExitRef.current = null;
    }

    // Close the PTY session
    if (terminalId) {
      try {
        await invoke('close_terminal', { terminalId });
      } catch (error) {
        console.error('Failed to close terminal:', error);
      }
    }

    // Dispose xterm instance
    terminalInstance.current?.dispose();
    terminalInstance.current = null;
    fitAddon.current = null;
    setIsReady(false);
    setTerminalId(null);
  }, [terminalId]);

  // Initialize terminal on mount - only run once
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      if (mounted) {
        await initTerminal();
      }
    };

    init();

    return () => {
      mounted = false;
      // Cleanup on unmount
      if (unlistenOutputRef.current) {
        unlistenOutputRef.current();
        unlistenOutputRef.current = null;
      }
      if (unlistenExitRef.current) {
        unlistenExitRef.current();
        unlistenExitRef.current = null;
      }
      terminalInstance.current?.dispose();
      terminalInstance.current = null;
      fitAddon.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      fit();
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [fit]);

  return {
    terminalRef,
    terminal: terminalInstance.current,
    terminalId,
    isReady,
    write,
    writeln,
    clear,
    focus,
    fit,
    dispose,
    sendInput,
    resizePty,
    sendSignal,
    closeTerminal,
  };
}
