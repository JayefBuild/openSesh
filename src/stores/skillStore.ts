import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  SkillDefinition,
  ThreadSkillConfig,
  GlobalSkillSettings,
  SkillRiskLevel,
  SkillCategory,
} from '@/types/skills';

/**
 * Built-in skill definitions
 */
export const SKILL_DEFINITIONS: SkillDefinition[] = [
  {
    id: 'file_read',
    name: 'Read Files',
    description: 'Read and view file contents from the project',
    category: 'file',
    riskLevel: 'safe',
    tools: [
      { name: 'read_file', description: 'Read file contents' },
      { name: 'list_directory', description: 'List directory contents' },
      { name: 'search_files', description: 'Search for files by pattern' },
      { name: 'grep_files', description: 'Search text within files' },
    ],
  },
  {
    id: 'file_write',
    name: 'Write Files',
    description: 'Create, edit, and delete files in the project',
    category: 'file',
    riskLevel: 'moderate',
    dependencies: ['file_read'],
    tools: [
      { name: 'write_file', description: 'Write content to a file' },
      { name: 'create_file', description: 'Create a new file' },
      { name: 'delete_file', description: 'Delete a file' },
      { name: 'rename_file', description: 'Rename or move a file' },
    ],
  },
  {
    id: 'terminal',
    name: 'Terminal Commands',
    description: 'Execute shell commands in the terminal',
    category: 'terminal',
    riskLevel: 'dangerous',
    tools: [
      { name: 'execute_command', description: 'Run a shell command' },
      { name: 'run_script', description: 'Execute a script file' },
    ],
  },
  {
    id: 'git_read',
    name: 'Git Read',
    description: 'View git status, history, and diffs',
    category: 'git',
    riskLevel: 'safe',
    tools: [
      { name: 'git_status', description: 'Get repository status' },
      { name: 'git_diff', description: 'View file changes' },
      { name: 'git_log', description: 'View commit history' },
      { name: 'git_branch', description: 'List branches' },
    ],
  },
  {
    id: 'git_write',
    name: 'Git Write',
    description: 'Stage, commit, and push changes',
    category: 'git',
    riskLevel: 'moderate',
    dependencies: ['git_read'],
    tools: [
      { name: 'git_add', description: 'Stage files for commit' },
      { name: 'git_commit', description: 'Create a commit' },
      { name: 'git_push', description: 'Push to remote' },
      { name: 'git_checkout', description: 'Switch branches' },
    ],
  },
  {
    id: 'web_search',
    name: 'Web Search',
    description: 'Search the web for information',
    category: 'web',
    riskLevel: 'safe',
    tools: [
      { name: 'web_search', description: 'Search the web' },
      { name: 'fetch_url', description: 'Fetch content from a URL' },
    ],
  },
  {
    id: 'code_generation',
    name: 'Code Generation',
    description: 'Generate code suggestions and snippets',
    category: 'code',
    riskLevel: 'safe',
    tools: [
      { name: 'generate_code', description: 'Generate code based on description' },
      { name: 'explain_code', description: 'Explain code functionality' },
      { name: 'refactor_code', description: 'Suggest code refactoring' },
    ],
  },
];

/**
 * Default skills enabled for new threads
 */
const DEFAULT_ENABLED_SKILLS = [
  'file_read',
  'git_read',
  'web_search',
  'code_generation',
];

/**
 * Skills that require confirmation by default
 */
const DEFAULT_REQUIRE_CONFIRMATION = [
  'file_write',
  'terminal',
  'git_write',
];

interface SkillStore {
  // Skill definitions (static)
  skillDefinitions: SkillDefinition[];

  // Global settings
  globalSettings: GlobalSkillSettings;

  // Thread-specific configurations
  threadConfigs: Record<string, ThreadSkillConfig>;

  // Actions
  getSkillById: (id: string) => SkillDefinition | undefined;
  getSkillsByCategory: (category: SkillCategory) => SkillDefinition[];
  getSkillsByRiskLevel: (riskLevel: SkillRiskLevel) => SkillDefinition[];

  // Global settings actions
  updateDefaultEnabledSkills: (skillIds: string[]) => void;
  toggleDefaultSkill: (skillId: string) => void;
  updateRequireConfirmationSkills: (skillIds: string[]) => void;
  toggleRequireConfirmation: (skillId: string) => void;

  // Thread config actions
  getThreadSkillConfig: (threadId: string) => ThreadSkillConfig;
  setThreadSkillConfig: (threadId: string, config: Partial<ThreadSkillConfig>) => void;
  toggleThreadSkill: (threadId: string, skillId: string) => void;
  resetThreadToDefaults: (threadId: string) => void;
  setThreadUseCustomConfig: (threadId: string, useCustom: boolean) => void;

  // Query helpers
  isSkillEnabledForThread: (threadId: string, skillId: string) => boolean;
  getEnabledSkillsForThread: (threadId: string) => SkillDefinition[];
  getToolsForThread: (threadId: string) => string[];
  doesSkillRequireConfirmation: (skillId: string) => boolean;
}

export const useSkillStore = create<SkillStore>()(
  persist(
    (set, get) => ({
      skillDefinitions: SKILL_DEFINITIONS,

      globalSettings: {
        defaultEnabledSkillIds: DEFAULT_ENABLED_SKILLS,
        requireConfirmationSkillIds: DEFAULT_REQUIRE_CONFIRMATION,
      },

      threadConfigs: {},

      // Getters
      getSkillById: (id) => {
        return get().skillDefinitions.find((s) => s.id === id);
      },

      getSkillsByCategory: (category) => {
        return get().skillDefinitions.filter((s) => s.category === category);
      },

      getSkillsByRiskLevel: (riskLevel) => {
        return get().skillDefinitions.filter((s) => s.riskLevel === riskLevel);
      },

      // Global settings actions
      updateDefaultEnabledSkills: (skillIds) => {
        set((state) => ({
          globalSettings: {
            ...state.globalSettings,
            defaultEnabledSkillIds: skillIds,
          },
        }));
      },

      toggleDefaultSkill: (skillId) => {
        set((state) => {
          const current = state.globalSettings.defaultEnabledSkillIds;
          const isEnabled = current.includes(skillId);
          return {
            globalSettings: {
              ...state.globalSettings,
              defaultEnabledSkillIds: isEnabled
                ? current.filter((id) => id !== skillId)
                : [...current, skillId],
            },
          };
        });
      },

      updateRequireConfirmationSkills: (skillIds) => {
        set((state) => ({
          globalSettings: {
            ...state.globalSettings,
            requireConfirmationSkillIds: skillIds,
          },
        }));
      },

      toggleRequireConfirmation: (skillId) => {
        set((state) => {
          const current = state.globalSettings.requireConfirmationSkillIds;
          const requires = current.includes(skillId);
          return {
            globalSettings: {
              ...state.globalSettings,
              requireConfirmationSkillIds: requires
                ? current.filter((id) => id !== skillId)
                : [...current, skillId],
            },
          };
        });
      },

      // Thread config actions
      getThreadSkillConfig: (threadId) => {
        const { threadConfigs, globalSettings } = get();
        return (
          threadConfigs[threadId] || {
            threadId,
            enabledSkillIds: [...globalSettings.defaultEnabledSkillIds],
            useCustomConfig: false,
          }
        );
      },

      setThreadSkillConfig: (threadId, config) => {
        set((state) => ({
          threadConfigs: {
            ...state.threadConfigs,
            [threadId]: {
              ...state.getThreadSkillConfig(threadId),
              ...config,
            },
          },
        }));
      },

      toggleThreadSkill: (threadId, skillId) => {
        const config = get().getThreadSkillConfig(threadId);
        const isEnabled = config.enabledSkillIds.includes(skillId);
        const skill = get().getSkillById(skillId);

        let newEnabledSkills = isEnabled
          ? config.enabledSkillIds.filter((id) => id !== skillId)
          : [...config.enabledSkillIds, skillId];

        // If enabling a skill with dependencies, also enable dependencies
        if (!isEnabled && skill?.dependencies) {
          for (const depId of skill.dependencies) {
            if (!newEnabledSkills.includes(depId)) {
              newEnabledSkills.push(depId);
            }
          }
        }

        // If disabling a skill, also disable skills that depend on it
        if (isEnabled) {
          const dependentSkills = get().skillDefinitions.filter(
            (s) => s.dependencies?.includes(skillId)
          );
          for (const depSkill of dependentSkills) {
            newEnabledSkills = newEnabledSkills.filter((id) => id !== depSkill.id);
          }
        }

        set((state) => ({
          threadConfigs: {
            ...state.threadConfigs,
            [threadId]: {
              ...config,
              enabledSkillIds: newEnabledSkills,
              useCustomConfig: true,
            },
          },
        }));
      },

      resetThreadToDefaults: (threadId) => {
        set((state) => ({
          threadConfigs: {
            ...state.threadConfigs,
            [threadId]: {
              threadId,
              enabledSkillIds: [...state.globalSettings.defaultEnabledSkillIds],
              useCustomConfig: false,
            },
          },
        }));
      },

      setThreadUseCustomConfig: (threadId, useCustom) => {
        const config = get().getThreadSkillConfig(threadId);
        set((state) => ({
          threadConfigs: {
            ...state.threadConfigs,
            [threadId]: {
              ...config,
              useCustomConfig: useCustom,
              // If switching to defaults, reset to default skills
              enabledSkillIds: useCustom
                ? config.enabledSkillIds
                : [...state.globalSettings.defaultEnabledSkillIds],
            },
          },
        }));
      },

      // Query helpers
      isSkillEnabledForThread: (threadId, skillId) => {
        const config = get().getThreadSkillConfig(threadId);
        if (!config.useCustomConfig) {
          return get().globalSettings.defaultEnabledSkillIds.includes(skillId);
        }
        return config.enabledSkillIds.includes(skillId);
      },

      getEnabledSkillsForThread: (threadId) => {
        const config = get().getThreadSkillConfig(threadId);
        const enabledIds = config.useCustomConfig
          ? config.enabledSkillIds
          : get().globalSettings.defaultEnabledSkillIds;
        return get().skillDefinitions.filter((s) => enabledIds.includes(s.id));
      },

      getToolsForThread: (threadId) => {
        const enabledSkills = get().getEnabledSkillsForThread(threadId);
        const tools: string[] = [];
        for (const skill of enabledSkills) {
          for (const tool of skill.tools) {
            if (!tools.includes(tool.name)) {
              tools.push(tool.name);
            }
          }
        }
        return tools;
      },

      doesSkillRequireConfirmation: (skillId) => {
        return get().globalSettings.requireConfirmationSkillIds.includes(skillId);
      },
    }),
    {
      name: 'opensesh-skills',
      partialize: (state) => ({
        globalSettings: state.globalSettings,
        threadConfigs: state.threadConfigs,
      }),
    }
  )
);
