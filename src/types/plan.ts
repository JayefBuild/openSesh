// Plan Mode Type Definitions
// Plan mode allows the AI to generate a plan BEFORE making any changes

/**
 * Types of actions a plan step can perform
 */
export type PlanStepType =
  | 'file_edit'        // Edit an existing file
  | 'file_create'      // Create a new file
  | 'file_delete'      // Delete a file
  | 'terminal_command' // Run a terminal command
  | 'git_operation'    // Git operation (commit, push, etc.)
  | 'information';     // Informational step (no action)

/**
 * Status of a plan step
 */
export type PlanStepStatus =
  | 'pending'     // Not yet executed
  | 'approved'    // User approved, ready to execute
  | 'rejected'    // User rejected this step
  | 'in_progress' // Currently executing
  | 'completed'   // Successfully executed
  | 'error'       // Execution failed
  | 'skipped';    // Skipped (e.g., if rejected or parent failed)

/**
 * Status of the overall plan
 */
export type PlanStatus =
  | 'generating'   // AI is generating the plan
  | 'pending'      // Plan generated, waiting for approval
  | 'approved'     // User approved the entire plan
  | 'executing'    // Plan is being executed
  | 'completed'    // All steps completed successfully
  | 'partial'      // Some steps completed, some failed/rejected
  | 'cancelled'    // User cancelled the plan
  | 'error';       // Plan execution failed

/**
 * Details specific to each step type
 */
export interface FileEditDetails {
  filePath: string;
  description: string;
  originalContent?: string;
  proposedContent?: string;
}

export interface FileCreateDetails {
  filePath: string;
  description: string;
  proposedContent?: string;
}

export interface FileDeleteDetails {
  filePath: string;
  description: string;
}

export interface TerminalCommandDetails {
  command: string;
  description: string;
  workingDirectory?: string;
  expectedOutput?: string;
}

export interface GitOperationDetails {
  operation: 'commit' | 'push' | 'pull' | 'branch' | 'merge' | 'checkout' | 'stash' | 'other';
  command?: string;
  description: string;
  commitMessage?: string;
  branchName?: string;
}

export interface InformationDetails {
  description: string;
  note?: string;
}

export type PlanStepDetails =
  | FileEditDetails
  | FileCreateDetails
  | FileDeleteDetails
  | TerminalCommandDetails
  | GitOperationDetails
  | InformationDetails;

/**
 * A single step in a plan
 */
export interface PlanStep {
  id: string;
  planId: string;
  stepNumber: number;
  type: PlanStepType;
  title: string;
  description: string;
  details: PlanStepDetails;
  status: PlanStepStatus;
  userNote?: string;      // User's note or modification request
  executionResult?: string;
  error?: string;
  executedAt?: Date;
  dependsOn?: string[];   // IDs of steps this step depends on
}

/**
 * A plan containing multiple steps
 */
export interface Plan {
  id: string;
  threadId: string;
  messageId: string;       // The message that triggered this plan
  title: string;
  summary: string;
  steps: PlanStep[];
  status: PlanStatus;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  userRequest: string;     // The original user request
  totalSteps: number;
  completedSteps: number;
  failedSteps: number;
  rejectedSteps: number;
}

/**
 * Plan generation request
 */
export interface PlanGenerationRequest {
  threadId: string;
  userMessage: string;
  context?: string;
}

/**
 * Plan execution options
 */
export interface PlanExecutionOptions {
  stopOnError: boolean;
  skipRejected: boolean;
  autoApproveInformation: boolean;
}
