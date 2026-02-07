/**
 * ADW Pipeline - Orchestrator
 *
 * Main controller that coordinates the entire pipeline execution.
 * Handles plan loading, chunking, worker management, and state persistence.
 *
 * New structure:
 * .worktrees/plan-name/
 * ├── plan.md           # Original plan
 * ├── state.json        # Pipeline state
 * └── Phases/           # All phase artifacts
 */

import { readFile, writeFile, mkdir, copyFile, access, stat } from 'node:fs/promises';
import { join, basename, dirname, extname, resolve } from 'node:path';
import { $ } from 'bun';
import type {
  PipelineState,
  Chunk,
  Handoff,
  PipelineConfig,
  PipelineReport,
  ChunkResult,
} from './types.ts';
import { loadConfig, formatConfig } from './config.ts';
import {
  initializeState,
  loadState,
  saveState,
  updateChunkStatus,
  startChunking,
  startExecution,
  completePipeline,
  failPipeline,
  getNextPendingChunk,
  getProgress,
  formatStateStatus,
} from './state.ts';
import {
  getPipelineDir,
  getPhasesDir,
  getPlanPath,
  getChunksDir,
  getHandoffPath,
} from './paths.ts';
import {
  chunkPlanWithRetry,
  formatValidation,
} from './chunker.ts';
import {
  validate as validateHandoff,
  recoverHandoff,
  formatHandoffValidation,
} from './handoff-validator.ts';
import {
  validateWithRetry as validateCompile,
  shouldValidateCompile,
  formatCompileResult,
} from './compile-validator.ts';
import {
  prepareForChunk,
  spawnWorker,
  spawnUnitTestsWorker,
  spawnReviewWorker,
  spawnFinalValidationWorker,
  ensureCommit,
  getModifiedFiles,
  loadMetaContent,
  archiveChunkArtifacts,
} from './worker.ts';

// ============================================================================
// Directory Structure
// ============================================================================

const PLAN_FILE = 'plan.md';

// ============================================================================
// Utilities
// ============================================================================

/**
 * Derive a slug from a plan filename.
 */
function slugFromPlanPath(planPath: string): string {
  const filename = basename(planPath);
  const ext = extname(filename);
  return filename.slice(0, -ext.length);
}

/**
 * Check if a path is a directory.
 */
async function isDirectory(path: string): Promise<boolean> {
  try {
    const stats = await stat(path);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

// ============================================================================
// Worktree Management
// ============================================================================

/**
 * Get the git root directory.
 */
async function getGitRoot(fromPath: string): Promise<string> {
  const dir = await isDirectory(fromPath) ? fromPath : dirname(fromPath);
  const result = await $`git -C ${dir} rev-parse --show-toplevel`.quiet();
  return result.text().trim();
}

/**
 * Create a git worktree for the pipeline.
 */
export async function createWorktree(
  planPath: string,
  planName: string,
  baseBranch: string = 'main'
): Promise<string> {
  const repoRoot = await getGitRoot(planPath);

  console.log(`Target repo: ${repoRoot}`);

  const worktreesBase = join(repoRoot, '.worktrees');
  const worktreePath = join(worktreesBase, planName);

  try {
    await access(worktreePath);
    console.log(`Worktree already exists: ${worktreePath}`);
    return worktreePath;
  } catch {
    // Worktree doesn't exist, create it
  }

  await mkdir(worktreesBase, { recursive: true });

  const branchName = `feature/${planName}`;

  try {
    await $`git -C ${repoRoot} worktree add -b ${branchName} ${worktreePath} ${baseBranch}`.quiet();
    console.log(`Created worktree: ${worktreePath} (branch: ${branchName})`);
  } catch (error) {
    try {
      await $`git -C ${repoRoot} worktree add ${worktreePath} ${branchName}`.quiet();
      console.log(`Created worktree: ${worktreePath} (existing branch: ${branchName})`);
    } catch {
      throw new Error(`Failed to create worktree: ${error}`);
    }
  }

  return worktreePath;
}

/**
 * Copy the plan to .pipeline/plan.md.
 */
async function copyPlanToWorktree(planPath: string, worktreePath: string): Promise<void> {
  const pipelineDir = getPipelineDir(worktreePath);
  await mkdir(pipelineDir, { recursive: true });
  const destPath = getPlanPath(worktreePath);
  await copyFile(planPath, destPath);
  console.log(`Copied plan to: ${destPath}`);
}

// ============================================================================
// Pipeline Execution
// ============================================================================

/**
 * Execute a complete pipeline from a plan file.
 */
export async function executePlan(
  planPath: string,
  options: {
    config?: PipelineConfig;
    resume?: boolean;
    baseBranch?: string;
  } = {}
): Promise<PipelineReport> {
  const config = options.config ?? loadConfig();
  const resolvedPlanPath = resolve(planPath);

  // Derive plan name from filename (without extension)
  const planName = slugFromPlanPath(resolvedPlanPath);

  console.log('\n' + '='.repeat(60));
  console.log('ADW Pipeline - Starting Execution');
  console.log('='.repeat(60));
  console.log(`\nPlan: ${resolvedPlanPath}`);
  console.log(`Environment: ${config.environment}`);

  const worktreePath = await createWorktree(resolvedPlanPath, planName, options.baseBranch);

  let state = await loadState(worktreePath);

  if (state && options.resume) {
    console.log(`\nResuming pipeline: ${state.runId}`);
    console.log(formatStateStatus(state));
  } else {
    console.log('\nStarting fresh pipeline run...');

    // Copy plan to worktree's .pipeline directory
    await copyPlanToWorktree(resolvedPlanPath, worktreePath);

    // Run chunker
    console.log('\n--- Chunking Phase ---');
    state = initializeState(planName, resolvedPlanPath, worktreePath, [], config);
    state = startChunking(state);
    await saveState(worktreePath, state);

    // Chunks go to Phases/00-CONTEXT/Chunks/
    const chunksDir = getChunksDir(worktreePath);
    const { chunks, validation } = await chunkPlanWithRetry(resolvedPlanPath, chunksDir, config);

    console.log(formatValidation(validation));

    if (!validation.valid) {
      state = failPipeline(state, 'Chunk validation failed');
      await saveState(worktreePath, state);
      return generateReport(state);
    }

    state = initializeState(planName, planPath, worktreePath, chunks, config);
    state = startExecution(state);
    await saveState(worktreePath, state);

    console.log(`\nCreated ${chunks.length} chunks:`);
    for (const chunk of chunks.sort((a, b) => a.order - b.order)) {
      console.log(`  - ${chunk.id}: ${chunk.name}`);
    }
  }

  // Execute chunks
  console.log('\n--- Execution Phase ---');

  const chunksDir = getChunksDir(worktreePath);
  let priorHandoff: Handoff | undefined;

  while (true) {
    const nextChunk = getNextPendingChunk(state);

    if (!nextChunk) {
      break;
    }

    console.log(`\n--- Executing Chunk: ${nextChunk.id} ---`);
    console.log(`Description: ${nextChunk.description}`);

    state = updateChunkStatus(state, nextChunk.id, 'in_progress');
    await saveState(worktreePath, state);

    try {
      const result = await executeChunk(
        worktreePath,
        nextChunk,
        priorHandoff,
        chunksDir,
        config
      );

      state = updateChunkStatus(state, nextChunk.id, 'completed', {
        handoffPath: result.handoffPath,
        commitHash: result.commitHash,
      });
      await saveState(worktreePath, state);

      if (result.handoff) {
        priorHandoff = result.handoff;
      }

      const progress = getProgress(state);
      console.log(`\nProgress: ${progress.completed}/${progress.total} chunks (${progress.percent}%)`);
    } catch (error) {
      console.error(`\nChunk ${nextChunk.id} failed:`, error);

      state = updateChunkStatus(state, nextChunk.id, 'failed', {
        error: String(error),
      });
      state = failPipeline(state, `Chunk ${nextChunk.id} failed: ${error}`);
      await saveState(worktreePath, state);

      return generateReport(state);
    }
  }

  // Run unit tests stage (02-UNIT-TESTS)
  console.log('\n' + '='.repeat(60));
  console.log('Running Unit Tests Stage');
  console.log('='.repeat(60));

  try {
    const unitTestsResult = await spawnUnitTestsWorker(worktreePath);

    if (unitTestsResult.exitCode !== 0) {
      console.log(`Unit tests stage exited with code ${unitTestsResult.exitCode}`);
    }

    console.log('Unit tests stage complete.');
  } catch (error) {
    console.error('Unit tests stage error:', error);
  }

  // Run PR review stage (03-BRANCH-REVIEW)
  console.log('\n' + '='.repeat(60));
  console.log('Running PR Review Stage');
  console.log('='.repeat(60));

  try {
    const branchResult = await $`git -C ${worktreePath} branch --show-current`.quiet();
    const branchName = branchResult.text().trim();

    const reviewResult = await spawnReviewWorker(worktreePath, branchName);

    if (reviewResult.exitCode !== 0) {
      console.log(`Review stage exited with code ${reviewResult.exitCode}`);
    }

    console.log('Review stage complete.');
  } catch (error) {
    console.error('Review stage error:', error);
  }

  // Run final validation stage (04-FINAL-VALIDATION)
  console.log('\n' + '='.repeat(60));
  console.log('Running Final Validation Stage');
  console.log('='.repeat(60));

  try {
    const validationResult = await spawnFinalValidationWorker(worktreePath);

    if (validationResult.exitCode !== 0) {
      console.log(`Final validation stage exited with code ${validationResult.exitCode}`);
    }

    console.log('Final validation stage complete.');
  } catch (error) {
    console.error('Final validation stage error:', error);
  }

  // Complete pipeline
  state = completePipeline(state);
  await saveState(worktreePath, state);

  console.log('\n' + '='.repeat(60));
  console.log('Pipeline Complete!');
  console.log('='.repeat(60));

  return generateReport(state);
}

/**
 * Execute a single chunk.
 */
async function executeChunk(
  worktreePath: string,
  chunk: Chunk,
  priorHandoff: Handoff | undefined,
  chunksDir: string,
  config: PipelineConfig
): Promise<{
  handoff?: Handoff;
  handoffPath?: string;
  commitHash?: string;
}> {
  // Load setup content
  const metaContent = await loadMetaContent(chunksDir);

  // Prepare worktree for this chunk
  await prepareForChunk(worktreePath, chunk, metaContent, priorHandoff, config);

  // Spawn worker
  const workerResult = await spawnWorker(worktreePath, chunk);

  if (workerResult.exitCode !== 0) {
    console.log(`Worker exited with code ${workerResult.exitCode}`);
  }

  // Validate handoff
  const handoffPath = getHandoffPath(worktreePath, chunk.id);
  const nextChunkOrder = chunk.order + 1;
  const toChunkId = `${String(nextChunkOrder).padStart(2, '0')}-next`;

  let handoff: Handoff | undefined;
  const { result: handoffValidation, handoff: parsedHandoff } = await validateHandoff(
    handoffPath,
    chunk.id,
    toChunkId,
    config
  );

  console.log(formatHandoffValidation(handoffValidation));

  if (parsedHandoff) {
    handoff = parsedHandoff;
  } else if (!handoffValidation.valid) {
    console.log('Attempting handoff recovery...');
    handoff = await recoverHandoff(worktreePath, chunk.id, toChunkId) ?? undefined;

    if (handoff) {
      console.log('Recovered partial handoff.');
      await writeFile(handoffPath, handoff.rawContent, 'utf-8');
    }
  }

  // Run compile validation for implementation chunks
  if (shouldValidateCompile(chunk.type)) {
    console.log('\nRunning compile validation...');

    const modifiedFiles = await getModifiedFiles(worktreePath);
    const { result: compileResult, attempts } = await validateCompile(
      worktreePath,
      modifiedFiles,
      chunk.name,
      config
    );

    console.log(formatCompileResult(compileResult));

    if (!compileResult.success) {
      throw new Error(`Compilation failed after ${attempts} attempts`);
    }
  }

  // Ensure changes are committed
  const commitHash = await ensureCommit(worktreePath, chunk.name) ?? undefined;

  // Archive artifacts (now a no-op since structure is already correct)
  await archiveChunkArtifacts(worktreePath, chunk.id);

  return {
    handoff,
    handoffPath,
    commitHash,
  };
}

// ============================================================================
// Dry Run (Chunking Only)
// ============================================================================

/**
 * Chunk a plan without executing (dry run).
 */
export async function chunkOnly(
  planPath: string,
  outputDir?: string,
  config?: PipelineConfig
): Promise<void> {
  const cfg = config ?? loadConfig();
  const resolvedPlanPath = resolve(planPath);

  console.log('\n' + '='.repeat(60));
  console.log('ADW Pipeline - Chunk Only (Dry Run)');
  console.log('='.repeat(60));
  console.log(`\nPlan: ${resolvedPlanPath}`);
  console.log(formatConfig(cfg));

  // Use temp directory for dry run if no output specified
  const targetChunksDir = outputDir ?? `/tmp/adw-chunks-${Date.now()}`;
  const { chunks, validation } = await chunkPlanWithRetry(resolvedPlanPath, targetChunksDir, cfg);

  console.log('\n' + formatValidation(validation));

  console.log(`\nChunks written to: ${targetChunksDir}`);
  for (const chunk of chunks.sort((a, b) => a.order - b.order)) {
    console.log(`  - ${chunk.id}: ${chunk.name} (~${chunk.estimatedTokens.toLocaleString()} tokens)`);
  }
}

// ============================================================================
// Status and Reporting
// ============================================================================

/**
 * Get the status of a pipeline.
 */
export async function getStatus(worktreePath: string): Promise<string> {
  const state = await loadState(worktreePath);

  if (!state) {
    return 'No pipeline state found.';
  }

  return formatStateStatus(state);
}

/**
 * Generate a pipeline report.
 */
export function generateReport(state: PipelineState): PipelineReport {
  const endTime = state.endTime ?? new Date().toISOString();
  const startDate = new Date(state.startTime);
  const endDate = new Date(endTime);
  const durationMs = endDate.getTime() - startDate.getTime();

  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };

  const progress = getProgress(state);

  const chunks = state.chunks
    .sort((a, b) => a.order - b.order)
    .map((chunk) => {
      const result = state.results.get(chunk.id);
      let chunkDuration: string | undefined;

      if (result?.startTime && result?.endTime) {
        const start = new Date(result.startTime).getTime();
        const end = new Date(result.endTime).getTime();
        chunkDuration = formatDuration(end - start);
      }

      return {
        id: chunk.id,
        name: chunk.name,
        status: result?.status ?? 'pending',
        duration: chunkDuration,
        commitHash: result?.commitHash,
        error: result?.error,
      };
    });

  const gitHistory: string[] = [];
  for (const result of state.results.values()) {
    if (result.commitHash) {
      gitHistory.push(result.commitHash);
    }
  }

  const recommendations: string[] = [];

  if (state.status === 'failed') {
    const failedChunks = chunks.filter((c) => c.status === 'failed');
    for (const chunk of failedChunks) {
      recommendations.push(`Review ${chunk.id}: ${chunk.error ?? 'Unknown error'}`);
    }
  }

  if (progress.percent === 100) {
    recommendations.push('All chunks complete. Ready for code review and merge.');
  }

  return {
    runId: state.runId,
    planName: state.planName,
    status: state.status === 'completed' ? 'completed' : state.status === 'failed' ? 'failed' : 'partial',
    startTime: state.startTime,
    endTime,
    duration: formatDuration(durationMs),
    chunks,
    summary: {
      totalChunks: progress.total,
      completedChunks: progress.completed,
      failedChunks: progress.failed,
      skippedChunks: chunks.filter((c) => c.status === 'skipped').length,
    },
    gitHistory,
    recommendations,
  };
}

/**
 * Format a pipeline report for display.
 */
export function formatReport(report: PipelineReport): string {
  let output = `
Pipeline Report
${'='.repeat(60)}

Run ID:    ${report.runId}
Plan:      ${report.planName}
Status:    ${report.status.toUpperCase()}
Duration:  ${report.duration}
Started:   ${report.startTime}
Ended:     ${report.endTime}

Summary
-------
Total Chunks:     ${report.summary.totalChunks}
Completed:        ${report.summary.completedChunks}
Failed:           ${report.summary.failedChunks}
Skipped:          ${report.summary.skippedChunks}

Chunks
------
`;

  for (const chunk of report.chunks) {
    const icon =
      chunk.status === 'completed' ? '[x]' :
      chunk.status === 'failed' ? '[!]' :
      chunk.status === 'skipped' ? '[-]' : '[ ]';

    output += `${icon} ${chunk.id}: ${chunk.name}`;

    if (chunk.duration) {
      output += ` (${chunk.duration})`;
    }

    if (chunk.commitHash) {
      output += ` [${chunk.commitHash.slice(0, 8)}]`;
    }

    if (chunk.error) {
      output += `\n    Error: ${chunk.error}`;
    }

    output += '\n';
  }

  if (report.recommendations && report.recommendations.length > 0) {
    output += `
Recommendations
---------------
`;
    for (const rec of report.recommendations) {
      output += `- ${rec}\n`;
    }
  }

  return output.trim();
}

// ============================================================================
// Retry Support
// ============================================================================

/**
 * Retry a specific failed chunk.
 */
export async function retryChunk(
  worktreePath: string,
  chunkId: string
): Promise<void> {
  const state = await loadState(worktreePath);

  if (!state) {
    throw new Error('No pipeline state found');
  }

  const chunk = state.chunks.find((c) => c.id === chunkId);
  if (!chunk) {
    throw new Error(`Chunk not found: ${chunkId}`);
  }

  const result = state.results.get(chunkId);
  if (result?.status !== 'failed') {
    throw new Error(`Chunk ${chunkId} is not in failed state (current: ${result?.status})`);
  }

  console.log(`Retrying chunk: ${chunkId}`);

  let updatedState = updateChunkStatus(state, chunkId, 'pending');
  updatedState = { ...updatedState, status: 'executing' };
  await saveState(worktreePath, updatedState);

  await executePlan(state.planPath, {
    config: state.config,
    resume: true,
  });
}
