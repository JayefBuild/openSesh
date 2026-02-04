// Project Types
export interface Project {
  id: string;
  name: string;
  path: string;
  isGitRepo: boolean;
}

// Thread Types
export interface Thread {
  id: string;
  projectId: string;
  title: string;
  providerId: string;
  modelId: string;
  createdAt: Date;
  updatedAt: Date;
  // Skills configuration (optional - if not set, use defaults)
  enabledSkillIds?: string[];
  useCustomSkillConfig?: boolean;
  // Plan mode configuration
  planModeEnabled?: boolean;
  currentPlanId?: string | null;
}

// Message Types
export interface Message {
  id: string;
  threadId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: ToolCall[];
  fileChanges?: FileChange[];
  timestamp: Date;
  isStreaming?: boolean;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: string;
  status: 'pending' | 'running' | 'completed' | 'error';
}

export interface FileChange {
  path: string;
  type: 'create' | 'modify' | 'delete';
  additions: number;
  deletions: number;
  content?: string;
  originalContent?: string;
}

/**
 * Extended file change with approval status for the pending changes workflow
 */
export type FileChangeStatus = 'pending' | 'approved' | 'rejected' | 'applied' | 'error';

export interface ApprovalFileChange extends FileChange {
  id: string;
  messageId: string;
  status: FileChangeStatus;
  error?: string;
  appliedAt?: Date;
}

// Provider and Model Types
export interface Provider {
  id: string;
  name: string;
  models: Model[];
  icon?: string;
}

export interface Model {
  id: string;
  name: string;
  contextWindow: number;
  maxOutput?: number;
}

// Settings Types
export interface Settings {
  theme: 'dark' | 'light' | 'system';
  fontSize: number;
  defaultProviderId: string;
  defaultModelId: string;
  terminalFontSize: number;
  editorFontSize: number;
}

// Git Types
export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: GitFile[];
  unstaged: GitFile[];
  untracked: string[];
}

export interface GitFile {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions?: number;
  deletions?: number;
}

// Command Palette Types
export interface Command {
  id: string;
  label: string;
  shortcut?: string;
  category: 'suggested' | 'navigation' | 'actions' | 'settings';
  icon?: string;
  action: () => void;
}

// UI State Types
export interface PanelSizes {
  sidebar: number;
  diffPane: number;
  terminal: number;
}

// Re-export skills types
export type {
  SkillRiskLevel,
  SkillCategory,
  SkillTool,
  SkillDefinition,
  SkillState,
  ThreadSkillConfig,
  GlobalSkillSettings,
} from './skills';

// Re-export plan types
export type {
  PlanStepType,
  PlanStepStatus,
  PlanStatus,
  FileEditDetails,
  FileCreateDetails,
  FileDeleteDetails,
  TerminalCommandDetails,
  GitOperationDetails,
  InformationDetails,
  PlanStepDetails,
  PlanStep,
  Plan,
  PlanGenerationRequest,
  PlanExecutionOptions,
} from './plan';

// Re-export execution types
export type {
  ExecutionMode,
  ActionType,
  ActionStatus,
  ActionRiskLevel,
  FileEditActionDetails,
  FileCreateActionDetails,
  FileDeleteActionDetails,
  TerminalCommandActionDetails,
  GitOperationActionDetails,
  SkillExecutionActionDetails,
  ActionDetails,
  ExecutionAction,
  ActionConfirmationRequest,
  ActionConfirmationResponse,
  ExecutionContext,
  ExecutionProgress,
  ExecutionSettings,
  ExecutionAuditEntry,
} from './execution';

export { planStepToAction } from './execution';
