import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Settings, Provider, Model, ExecutionMode } from '@/types';

/**
 * Execution-related settings
 */
interface ExecutionPreferences {
  // Default execution mode for new threads
  defaultExecutionMode: ExecutionMode;
  // Always confirm dangerous actions even in autonomous mode
  alwaysConfirmDangerous: boolean;
  // Always confirm git operations even in autonomous mode
  alwaysConfirmGitOperations: boolean;
  // Always confirm file deletions even in autonomous mode
  alwaysConfirmFileDeletions: boolean;
}

interface SettingsStore extends Settings {
  providers: Provider[];
  execution: ExecutionPreferences;

  // Actions
  updateSettings: (settings: Partial<Settings>) => void;
  setProviders: (providers: Provider[]) => void;
  getDefaultModel: () => Model | null;
  getModelById: (providerId: string, modelId: string) => Model | null;
  getProviderById: (providerId: string) => Provider | null;

  // Execution settings
  updateExecutionPreferences: (prefs: Partial<ExecutionPreferences>) => void;
  getExecutionPreferences: () => ExecutionPreferences;
}

// Default execution preferences
const defaultExecutionPreferences: ExecutionPreferences = {
  defaultExecutionMode: 'assisted',
  alwaysConfirmDangerous: true,
  alwaysConfirmGitOperations: true,
  alwaysConfirmFileDeletions: true,
};

// Default providers (will be overwritten by backend)
const defaultProviders: Provider[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    models: [
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', contextWindow: 200000 },
      { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', contextWindow: 200000 },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', contextWindow: 200000 },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128000 },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', contextWindow: 128000 },
      { id: 'o1', name: 'o1', contextWindow: 200000 },
      { id: 'o1-mini', name: 'o1 Mini', contextWindow: 128000 },
    ],
  },
  {
    id: 'google',
    name: 'Google',
    models: [
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', contextWindow: 1000000 },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', contextWindow: 2000000 },
    ],
  },
];

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      // Default settings
      theme: 'dark',
      fontSize: 14,
      defaultProviderId: 'anthropic',
      defaultModelId: 'claude-sonnet-4-20250514',
      terminalFontSize: 13,
      editorFontSize: 13,
      providers: defaultProviders,
      execution: defaultExecutionPreferences,

      updateSettings: (settings) => {
        set((state) => ({ ...state, ...settings }));
      },

      setProviders: (providers) => {
        set({ providers });
      },

      getDefaultModel: () => {
        const { providers, defaultProviderId, defaultModelId } = get();
        const provider = providers.find((p) => p.id === defaultProviderId);
        return provider?.models.find((m) => m.id === defaultModelId) || null;
      },

      getModelById: (providerId, modelId) => {
        const { providers } = get();
        const provider = providers.find((p) => p.id === providerId);
        return provider?.models.find((m) => m.id === modelId) || null;
      },

      getProviderById: (providerId) => {
        const { providers } = get();
        return providers.find((p) => p.id === providerId) || null;
      },

      updateExecutionPreferences: (prefs) => {
        set((state) => ({
          execution: { ...state.execution, ...prefs },
        }));
      },

      getExecutionPreferences: () => {
        return get().execution;
      },
    }),
    {
      name: 'opensesh-settings',
      partialize: (state) => ({
        theme: state.theme,
        fontSize: state.fontSize,
        defaultProviderId: state.defaultProviderId,
        defaultModelId: state.defaultModelId,
        terminalFontSize: state.terminalFontSize,
        editorFontSize: state.editorFontSize,
        execution: state.execution,
      }),
    }
  )
);
