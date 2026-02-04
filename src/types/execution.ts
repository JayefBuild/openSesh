// Execution Mode Type Definitions
// Execution modes control how actions are performed - with human approval (Assisted) or automatically (Autonomous)

import type { PlanStepType, PlanStep } from './plan';
import type { SkillRiskLevel } from './skills';

/**
 * Execution mode determines how actions are processed
 * - assisted: Require human approval for each action before execution
 * - autonomous: Execute actions automatically with progress reporting
 */
export type ExecutionMode = 'assisted' | 'autonomous';

/**
 * The type of action that requires confirmation
 */
export type ActionType =
  | 'file_edit'
  | 'file_create'
  | 'file_delete'
  | 'terminal_command'
  | 'git_operation'
  | 'skill_execution';

/**
 * The status of an action in the queue
 */
export type ActionStatus =
  | 'pending'      // Waiting in queue
  | 'awaiting_confirmation' // Waiting for user approval (Assisted mode)
  | 'approved'     // User approved (ready to execute)
  | 'rejected'     // User rejected
  | 'executing'    // Currently being executed
  | 'completed'    // Successfully executed
  | 'failed'       // Execution failed
  | 'cancelled';   // Cancelled by user

/**
 * Risk level for an action (used to determine if confirmation is needed)
 */
export type ActionRiskLevel = SkillRiskLevel;

/**
 * Details for file edit action
 */
export interface FileEditActionDetails {
  filePath: string;
  originalContent?: string;
  proposedContent?: string;
  diff?: string;
  description?: string;
}

/**
 * Details for file create action
 */
export interface FileCreateActionDetails {
  filePath: string;
  proposedContent: string;
  description?: string;
}

/**
 * Details for file delete action
 */
export interface FileDeleteActionDetails {
  filePath: string;
  description?: string;
}

/**
 * Details for terminal command action
 */
export interface TerminalCommandActionDetails {
  command: string;
  workingDirectory?: string;
  description?: string;
  expectedOutput?: string;
}

/**
 * Details for git operation action
 */
export interface GitOperationActionDetails {
  operation: 'commit' | 'push' | 'pull' | 'branch' | 'merge' | 'checkout' | 'stash' | 'reset' | 'other';
  command?: string;
  commitMessage?: string;
  branchName?: string;
  description?: string;
}

/**
 * Details for skill execution action
 */
export interface SkillExecutionActionDetails {
  skillId: string;
  skillName: string;
  toolName: string;
  arguments: Record<string, unknown>;
  description?: string;
}

/**
 * Union type for all action details
 */
export type ActionDetails =
  | FileEditActionDetails
  | FileCreateActionDetails
  | FileDeleteActionDetails
  | TerminalCommandActionDetails
  | GitOperationActionDetails
  | SkillExecutionActionDetails;

/**
 * An action that may need confirmation before execution
 */
export interface ExecutionAction {
  id: string;
  type: ActionType;
  title: string;
  description: string;
  details: ActionDetails;
  status: ActionStatus;
  riskLevel: ActionRiskLevel;

  // Metadata
  createdAt: Date;
  executedAt?: Date;

  // Execution results
  result?: string;
  error?: string;

  // User modifications (for "Edit & Approve")
  userModifiedDetails?: ActionDetails;
  userNote?: string;

  // Source tracking (optional - ties to plan step if from a plan)
  planId?: string;
  planStepId?: string;

  // Thread context
  threadId: string;
}

/**
 * Action confirmation request (shown in modal)
 */
export interface ActionConfirmationRequest {
  action: ExecutionAction;
  showDiff?: boolean;
  allowEdit?: boolean;
  warningMessage?: string;
}

/**
 * User's response to an action confirmation
 */
export interface ActionConfirmationResponse {
  actionId: string;
  decision: 'approve' | 'reject' | 'edit_and_approve';
  editedDetails?: ActionDetails;
  note?: string;
}

/**
 * Execution context provides environment for action execution
 */
export interface ExecutionContext {
  threadId: string;
  planId?: string;
  workingDirectory?: string;
  environmentVariables?: Record<string, string>;
}

/**
 * Progress update for execution
 */
export interface ExecutionProgress {
  totalActions: number;
  completedActions: number;
  failedActions: number;
  skippedActions: number;
  currentAction?: ExecutionAction;
  percentage: number;
}

/**
 * Execution settings (persisted)
 */
export interface ExecutionSettings {
  // Default execution mode for new threads
  defaultExecutionMode: ExecutionMode;

  // Always confirm dangerous actions even in autonomous mode
  alwaysConfirmDangerous: boolean;

  // Always confirm git operations
  alwaysConfirmGitOperations: boolean;

  // Always confirm file deletions
  alwaysConfirmFileDeletions: boolean;

  // Stop execution if any action fails
  stopOnError: boolean;

  // Enable audit log
  enableAuditLog: boolean;

  // Timeout for autonomous execution (in seconds)
  autonomousTimeout: number;

  // Maximum actions per batch in autonomous mode
  maxActionsPerBatch: number;
}

/**
 * Audit log entry for executed actions
 */
export interface ExecutionAuditEntry {
  id: string;
  action: ExecutionAction;
  executedAt: Date;
  executionMode: ExecutionMode;
  userApproved: boolean;
  success: boolean;
  error?: string;
}

/**
 * Convert a PlanStep to an ExecutionAction
 */
export function planStepToAction(
  step: PlanStep,
  threadId: string
): ExecutionAction {
  // Map plan step type to action type
  const typeMap: Record<PlanStepType, ActionType> = {
    file_edit: 'file_edit',
    file_create: 'file_create',
    file_delete: 'file_delete',
    terminal_command: 'terminal_command',
    git_operation: 'git_operation',
    information: 'skill_execution', // Information steps mapped to skill execution
  };

  // Determine risk level based on type
  const riskMap: Record<PlanStepType, ActionRiskLevel> = {
    file_edit: 'moderate',
    file_create: 'moderate',
    file_delete: 'dangerous',
    terminal_command: 'dangerous',
    git_operation: 'dangerous',
    information: 'safe',
  };

  return {
    id: `action-${step.id}`,
    type: typeMap[step.type],
    title: step.title,
    description: step.description,
    details: step.details as ActionDetails,
    status: 'pending',
    riskLevel: riskMap[step.type],
    createdAt: new Date(),
    planId: step.planId,
    planStepId: step.id,
    threadId,
  };
}
