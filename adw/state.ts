/**
 * ADW Pipeline - State Manager
 *
 * Handles persistence and loading of pipeline state.
 * State is stored in state.json at the worktree root (same level as Phases/).
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type {
  PipelineState,
  SerializedPipelineState,
  Chunk,
  ChunkResult,
  ChunkStatus,
  PipelineConfig,
} from './types.ts';
import { getStatePath, getPipelineDir } from './paths.ts';

// Re-export path functions for backward compatibility
export { getStatePath, getPipelineDir } from './paths.ts';

// ============================================================================
// Serialization
// ============================================================================

/**
 * Convert PipelineState to serializable format.
 */
function serializeState(state: PipelineState): SerializedPipelineState {
  return {
    runId: state.runId,
    planName: state.planName,
    planPath: state.planPath,
    worktreePath: state.worktreePath,
    chunks: state.chunks,
    results: Array.from(state.results.entries()),
    currentChunkId: state.currentChunkId,
    startTime: state.startTime,
    endTime: state.endTime,
    status: state.status,
    config: state.config,
  };
}

/**
 * Convert serialized format back to PipelineState.
 */
function deserializeState(data: SerializedPipelineState): PipelineState {
  return {
    runId: data.runId,
    planName: data.planName,
    planPath: data.planPath,
    worktreePath: data.worktreePath,
    chunks: data.chunks,
    results: new Map(data.results),
    currentChunkId: data.currentChunkId,
    startTime: data.startTime,
    endTime: data.endTime,
    status: data.status,
    config: data.config,
  };
}

// ============================================================================
// State Operations
// ============================================================================

/**
 * Generate a unique run ID.
 */
function generateRunId(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const random = Math.random().toString(36).substring(2, 8);
  return `run-${timestamp}-${random}`;
}

/**
 * Initialize a new pipeline state.
 */
export function initializeState(
  planName: string,
  planPath: string,
  worktreePath: string,
  chunks: Chunk[],
  config: PipelineConfig
): PipelineState {
  const results = new Map<string, ChunkResult>();

  // Initialize all chunks as pending
  for (const chunk of chunks) {
    results.set(chunk.id, {
      chunkId: chunk.id,
      status: 'pending',
      startTime: '',
    });
  }

  return {
    runId: generateRunId(),
    planName,
    planPath,
    worktreePath,
    chunks,
    results,
    currentChunkId: undefined,
    startTime: new Date().toISOString(),
    endTime: undefined,
    status: 'initializing',
    config,
  };
}

/**
 * Load pipeline state from disk.
 */
export async function loadState(worktreePath: string): Promise<PipelineState | null> {
  const statePath = getStatePath(worktreePath);

  try {
    const content = await readFile(statePath, 'utf-8');
    const data = JSON.parse(content) as SerializedPipelineState;
    return deserializeState(data);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Save pipeline state to disk.
 */
export async function saveState(worktreePath: string, state: PipelineState): Promise<void> {
  const statePath = getStatePath(worktreePath);

  const serialized = serializeState(state);
  const content = JSON.stringify(serialized, null, 2);

  await writeFile(statePath, content, 'utf-8');
}

// ============================================================================
// State Updates
// ============================================================================

/**
 * Update the status of a specific chunk.
 */
export function updateChunkStatus(
  state: PipelineState,
  chunkId: string,
  status: ChunkStatus,
  updates?: Partial<Omit<ChunkResult, 'chunkId' | 'status'>>
): PipelineState {
  const existingResult = state.results.get(chunkId);

  if (!existingResult) {
    throw new Error(`Chunk not found: ${chunkId}`);
  }

  const updatedResult: ChunkResult = {
    ...existingResult,
    status,
    ...updates,
  };

  // Set start time if transitioning to in_progress
  if (status === 'in_progress' && !updatedResult.startTime) {
    updatedResult.startTime = new Date().toISOString();
  }

  // Set end time if transitioning to a terminal state
  if (['completed', 'failed', 'skipped'].includes(status) && !updatedResult.endTime) {
    updatedResult.endTime = new Date().toISOString();
  }

  const newResults = new Map(state.results);
  newResults.set(chunkId, updatedResult);

  return {
    ...state,
    results: newResults,
    currentChunkId: status === 'in_progress' ? chunkId : state.currentChunkId,
  };
}

/**
 * Mark the pipeline as started with chunking.
 */
export function startChunking(state: PipelineState): PipelineState {
  return {
    ...state,
    status: 'chunking',
  };
}

/**
 * Mark the pipeline as executing chunks.
 */
export function startExecution(state: PipelineState): PipelineState {
  return {
    ...state,
    status: 'executing',
  };
}

/**
 * Mark the pipeline as completed.
 */
export function completePipeline(state: PipelineState): PipelineState {
  return {
    ...state,
    status: 'completed',
    endTime: new Date().toISOString(),
    currentChunkId: undefined,
  };
}

/**
 * Mark the pipeline as failed.
 */
export function failPipeline(state: PipelineState, error?: string): PipelineState {
  return {
    ...state,
    status: 'failed',
    endTime: new Date().toISOString(),
  };
}

// ============================================================================
// State Queries
// ============================================================================

/**
 * Get the next pending chunk in execution order.
 */
export function getNextPendingChunk(state: PipelineState): Chunk | null {
  const sortedChunks = [...state.chunks].sort((a, b) => a.order - b.order);

  for (const chunk of sortedChunks) {
    const result = state.results.get(chunk.id);
    if (result?.status === 'pending') {
      // Check if all dependencies are completed
      const dependenciesMet = chunk.dependsOn.every((depId) => {
        const depResult = state.results.get(depId);
        return depResult?.status === 'completed';
      });

      if (dependenciesMet) {
        return chunk;
      }
    }
  }

  return null;
}

/**
 * Get the result for a specific chunk.
 */
export function getChunkResult(state: PipelineState, chunkId: string): ChunkResult | undefined {
  return state.results.get(chunkId);
}

/**
 * Get all chunks with a specific status.
 */
export function getChunksByStatus(state: PipelineState, status: ChunkStatus): Chunk[] {
  return state.chunks.filter((chunk) => {
    const result = state.results.get(chunk.id);
    return result?.status === status;
  });
}

/**
 * Calculate pipeline progress.
 */
export function getProgress(state: PipelineState): {
  total: number;
  completed: number;
  failed: number;
  pending: number;
  inProgress: number;
  percent: number;
} {
  const total = state.chunks.length;
  let completed = 0;
  let failed = 0;
  let pending = 0;
  let inProgress = 0;

  for (const result of state.results.values()) {
    switch (result.status) {
      case 'completed':
        completed++;
        break;
      case 'failed':
        failed++;
        break;
      case 'pending':
        pending++;
        break;
      case 'in_progress':
        inProgress++;
        break;
    }
  }

  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return { total, completed, failed, pending, inProgress, percent };
}

/**
 * Check if the pipeline can continue (no blockers).
 */
export function canContinue(state: PipelineState): boolean {
  // Can't continue if failed
  if (state.status === 'failed') return false;

  // Can't continue if there are failed chunks (unless we want retry logic)
  const hasFailed = getChunksByStatus(state, 'failed').length > 0;
  if (hasFailed) return false;

  // Can continue if there are pending chunks
  const hasPending = getChunksByStatus(state, 'pending').length > 0;
  return hasPending;
}

/**
 * Format state for display.
 */
export function formatStateStatus(state: PipelineState): string {
  const progress = getProgress(state);

  let output = `
Pipeline: ${state.planName}
Run ID: ${state.runId}
Status: ${state.status}
Progress: ${progress.completed}/${progress.total} chunks (${progress.percent}%)

Chunks:
`;

  const sortedChunks = [...state.chunks].sort((a, b) => a.order - b.order);

  for (const chunk of sortedChunks) {
    const result = state.results.get(chunk.id);
    const statusIcon = getStatusIcon(result?.status ?? 'pending');
    output += `  ${statusIcon} ${chunk.id}: ${chunk.name} (${result?.status ?? 'pending'})\n`;
  }

  return output.trim();
}

function getStatusIcon(status: ChunkStatus): string {
  switch (status) {
    case 'completed':
      return '[x]';
    case 'in_progress':
      return '[>]';
    case 'failed':
      return '[!]';
    case 'skipped':
      return '[-]';
    case 'pending':
    default:
      return '[ ]';
  }
}
