import { useEffect, useState, useCallback } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { isTauri } from '@/lib/utils';

/**
 * Hook to check if running in Tauri environment
 */
export function useIsTauri(): boolean {
  const [inTauri, setInTauri] = useState(false);

  useEffect(() => {
    setInTauri(isTauri());
  }, []);

  return inTauri;
}

/**
 * Hook to listen to Tauri events
 */
export function useTauriEvent<T>(
  eventName: string,
  handler: (payload: T) => void,
  deps: React.DependencyList = []
) {
  useEffect(() => {
    if (!isTauri()) return;

    let unlisten: UnlistenFn | null = null;

    const setupListener = async () => {
      unlisten = await listen<T>(eventName, (event) => {
        handler(event.payload);
      });
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventName, ...deps]);
}

/**
 * Hook for terminal data events
 */
export function useTerminalDataEvent(
  terminalId: string | null,
  onData: (data: string) => void
) {
  useTauriEvent<{ terminalId: string; data: string }>(
    'terminal-data',
    (payload) => {
      if (payload.terminalId === terminalId) {
        onData(payload.data);
      }
    },
    [terminalId, onData]
  );
}

/**
 * Hook for message streaming events
 */
interface StreamEvent {
  threadId: string;
  messageId: string;
  content?: string;
  done?: boolean;
  error?: string;
}

export function useMessageStreamEvent(
  threadId: string | null,
  handlers: {
    onContent?: (messageId: string, content: string) => void;
    onDone?: (messageId: string) => void;
    onError?: (messageId: string, error: string) => void;
  }
) {
  useTauriEvent<StreamEvent>(
    'message-stream',
    (payload) => {
      if (payload.threadId !== threadId) return;

      if (payload.content && handlers.onContent) {
        handlers.onContent(payload.messageId, payload.content);
      }

      if (payload.done && handlers.onDone) {
        handlers.onDone(payload.messageId);
      }

      if (payload.error && handlers.onError) {
        handlers.onError(payload.messageId, payload.error);
      }
    },
    [threadId, handlers]
  );
}

/**
 * Hook for file change events
 */
interface FileChangeEvent {
  projectPath: string;
  filePath: string;
  type: 'create' | 'modify' | 'delete';
}

export function useFileChangeEvent(
  projectPath: string | null,
  onFileChange: (filePath: string, type: 'create' | 'modify' | 'delete') => void
) {
  useTauriEvent<FileChangeEvent>(
    'file-change',
    (payload) => {
      if (payload.projectPath === projectPath) {
        onFileChange(payload.filePath, payload.type);
      }
    },
    [projectPath, onFileChange]
  );
}

/**
 * Hook for git status updates
 */
interface GitStatusEvent {
  projectPath: string;
  branch: string;
  ahead: number;
  behind: number;
  hasChanges: boolean;
}

export function useGitStatusEvent(
  projectPath: string | null,
  onStatusChange: (status: Omit<GitStatusEvent, 'projectPath'>) => void
) {
  useTauriEvent<GitStatusEvent>(
    'git-status',
    (payload) => {
      if (payload.projectPath === projectPath) {
        const { projectPath: _path, ...status } = payload;
        onStatusChange(status);
      }
    },
    [projectPath, onStatusChange]
  );
}

/**
 * Generic async command hook with loading state
 */
export function useTauriCommand<T, Args extends unknown[]>(
  commandFn: (...args: Args) => Promise<T>
): {
  execute: (...args: Args) => Promise<T | null>;
  isLoading: boolean;
  error: string | null;
  data: T | null;
  reset: () => void;
} {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<T | null>(null);

  const execute = useCallback(
    async (...args: Args): Promise<T | null> => {
      if (!isTauri()) {
        setError('Not running in Tauri environment');
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        const result = await commandFn(...args);
        setData(result);
        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(errorMessage);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [commandFn]
  );

  const reset = useCallback(() => {
    setIsLoading(false);
    setError(null);
    setData(null);
  }, []);

  return { execute, isLoading, error, data, reset };
}
