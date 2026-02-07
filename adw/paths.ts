/**
 * ADW Pipeline - Path Management
 *
 * Centralized path structure for the Phases-based organization.
 *
 * Directory Structure:
 * .worktrees/some_plan/
 * └── .pipeline/                        # All pipeline artifacts
 *     ├── plan.md                       # Original plan
 *     ├── state.json                    # Pipeline state
 *     └── Phases/
 *         ├── 00-CONTEXT/
 *         │   ├── plan_context.md       # Shared context for all workers
 *         │   └── Chunks/
 *         │       ├── a_work-slug.md    # Individual chunk definitions
 *         │       └── b_work-slug.md
 *         ├── 01-IMPLEMENTATION/
 *         │   ├── 01a_work-slug/
 *         │   │   ├── work_prompt.md    # Combined prompt (context + chunk)
 *         │   │   ├── worker.log
 *         │   │   └── handoff.md
 *         │   └── 01b_work-slug/
 *         │       ├── work_prompt.md
 *         │       ├── worker.log
 *         │       └── handoff.md
 *         ├── 02-UNIT-TESTS/
 *         │   ├── prompt.md
 *         │   ├── worker.log
 *         │   └── handoff.md
 *         ├── 03-BRANCH-REVIEW/
 *         │   ├── prompt.md
 *         │   ├── worker.log
 *         │   └── handoff.md
 *         └── 04-FINAL-VALIDATION/
 *             ├── prompt.md
 *             ├── worker.log
 *             └── handoff.md
 */

import { join } from 'node:path';

// ============================================================================
// Directory Names
// ============================================================================

export const PIPELINE_DIR = '.pipeline';
export const PHASES_DIR = 'Phases';
export const STATE_FILE = 'state.json';
export const PLAN_FILE = 'plan.md';

// Phase directory names
export const PHASE_CONTEXT = '00-CONTEXT';
export const PHASE_IMPLEMENTATION = '01-IMPLEMENTATION';
export const PHASE_UNIT_TESTS = '02-UNIT-TESTS';
export const PHASE_BRANCH_REVIEW = '03-BRANCH-REVIEW';
export const PHASE_FINAL_VALIDATION = '04-FINAL-VALIDATION';

// File names within phases
export const PLAN_CONTEXT_FILE = 'plan_context.md';
export const CHUNKS_SUBDIR = 'Chunks';
export const WORK_PROMPT_FILE = 'work_prompt.md';
export const PROMPT_FILE = 'prompt.md';
export const WORKER_LOG_FILE = 'worker.log';
export const HANDOFF_FILE = 'handoff.md';

// ============================================================================
// Root Level Paths
// ============================================================================

/**
 * Get the path to the .pipeline directory.
 */
export function getPipelineDir(worktreePath: string): string {
  return join(worktreePath, PIPELINE_DIR);
}

/**
 * Get the path to the Phases directory (inside .pipeline).
 */
export function getPhasesDir(worktreePath: string): string {
  return join(getPipelineDir(worktreePath), PHASES_DIR);
}

/**
 * Get the path to the state.json file (inside .pipeline).
 */
export function getStatePath(worktreePath: string): string {
  return join(getPipelineDir(worktreePath), STATE_FILE);
}

/**
 * Get the path to the plan.md file (inside .pipeline).
 */
export function getPlanPath(worktreePath: string): string {
  return join(getPipelineDir(worktreePath), PLAN_FILE);
}

// ============================================================================
// 00-CONTEXT Phase Paths
// ============================================================================

/**
 * Get the path to the 00-CONTEXT phase directory.
 */
export function getContextPhaseDir(worktreePath: string): string {
  return join(getPhasesDir(worktreePath), PHASE_CONTEXT);
}

/**
 * Get the path to plan_context.md (shared context for all workers).
 */
export function getPlanContextPath(worktreePath: string): string {
  return join(getContextPhaseDir(worktreePath), PLAN_CONTEXT_FILE);
}

/**
 * Get the path to the Chunks subdirectory within 00-CONTEXT.
 */
export function getChunksDir(worktreePath: string): string {
  return join(getContextPhaseDir(worktreePath), CHUNKS_SUBDIR);
}

/**
 * Get the path to a specific chunk definition file.
 */
export function getChunkDefinitionPath(worktreePath: string, chunkSlug: string): string {
  return join(getChunksDir(worktreePath), `${chunkSlug}.md`);
}

// ============================================================================
// Phase Directory Paths
// ============================================================================

/**
 * Get the phase directory name for a chunk ID.
 *
 * Chunk IDs map to phases:
 * - "00-setup" -> "01-IMPLEMENTATION" (setup IS implementation)
 * - "01a-project-setup" -> "01-IMPLEMENTATION"
 * - "01b-core-impl" -> "01-IMPLEMENTATION"
 * - "02-unit-tests" or "02a-..." -> "02-UNIT-TESTS"
 * - "03-branch-review" -> "03-BRANCH-REVIEW"
 * - "04-final-validation" -> "04-FINAL-VALIDATION"
 *
 * Note: 00-CONTEXT is for storing plan_context.md and chunk definitions,
 * NOT for worker output. All worker output goes to 01+ phases.
 */
export function getPhaseNameForChunk(chunkId: string): string {
  // Setup and implementation chunks -> 01-IMPLEMENTATION
  if (chunkId.startsWith('00-') || chunkId.match(/^01[a-z]?-/)) {
    return PHASE_IMPLEMENTATION;
  }
  if (chunkId.startsWith('02-') || chunkId.match(/^02[a-z]-/)) {
    return PHASE_UNIT_TESTS;
  }
  if (chunkId.startsWith('03-')) {
    return PHASE_BRANCH_REVIEW;
  }
  if (chunkId.startsWith('04-')) {
    return PHASE_FINAL_VALIDATION;
  }
  // Default to implementation for unknown patterns
  return PHASE_IMPLEMENTATION;
}

/**
 * Get the path to a phase directory.
 */
export function getPhaseDir(worktreePath: string, phaseName: string): string {
  return join(getPhasesDir(worktreePath), phaseName);
}

// ============================================================================
// Chunk Work Directory Paths
// ============================================================================

/**
 * Get the work directory for a specific chunk.
 *
 * For implementation chunks (00-setup, 01a, 01b, etc.):
 *   Phases/01-IMPLEMENTATION/00_setup/
 *   Phases/01-IMPLEMENTATION/01a_work-slug/
 *
 * For other phases (02, 03, 04):
 *   Phases/02-UNIT-TESTS/ (no subdirectory)
 */
export function getChunkWorkDir(worktreePath: string, chunkId: string): string {
  const phaseName = getPhaseNameForChunk(chunkId);
  const phaseDir = getPhaseDir(worktreePath, phaseName);

  // Implementation phase chunks get their own subdirectory
  // Includes: 00-setup, 01a-xxx, 01b-xxx, etc.
  if (chunkId.match(/^00-/) || chunkId.match(/^01[a-z]?-/)) {
    // Convert "00-setup" to "00_setup", "01a-work-slug" to "01a_work-slug"
    const dirName = chunkId.replace(/-/, '_');
    return join(phaseDir, dirName);
  }

  // Other phases don't have subdirectories
  return phaseDir;
}

/**
 * Get the path to the work prompt file for a chunk.
 *
 * Implementation chunks (00-setup, 01a, 01b): work_prompt.md (includes context + chunk plan)
 * Other phases: prompt.md
 */
export function getWorkPromptPath(worktreePath: string, chunkId: string): string {
  const workDir = getChunkWorkDir(worktreePath, chunkId);

  // Implementation phase chunks use work_prompt.md
  if (chunkId.match(/^00-/) || chunkId.match(/^01[a-z]?-/)) {
    return join(workDir, WORK_PROMPT_FILE);
  }
  return join(workDir, PROMPT_FILE);
}

/**
 * Get the path to the worker log for a chunk.
 */
export function getWorkerLogPath(worktreePath: string, chunkId: string): string {
  return join(getChunkWorkDir(worktreePath, chunkId), WORKER_LOG_FILE);
}

/**
 * Get the path to the handoff file for a chunk.
 */
export function getHandoffPath(worktreePath: string, chunkId: string): string {
  return join(getChunkWorkDir(worktreePath, chunkId), HANDOFF_FILE);
}

