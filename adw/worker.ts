/**
 * ADW Pipeline - Worker Manager
 *
 * Spawns and manages Claude Code worker sessions.
 * Prepares context files and monitors worker completion.
 *
 * New Phases-based structure:
 * - Phases/00-CONTEXT/plan_context.md - Shared context
 * - Phases/00-CONTEXT/Chunks/*.md - Chunk definitions
 * - Phases/01-IMPLEMENTATION/01a_slug/ - Implementation chunk work dirs
 * - Each work dir has: work_prompt.md, worker.log, handoff.md
 */

import { readFile, writeFile, mkdir, stat, copyFile } from 'node:fs/promises';
import { createWriteStream, type WriteStream } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { $ } from 'bun';
import type {
  Chunk,
  Handoff,
  WorkerContext,
  WorkerResult,
  PipelineConfig,
} from './types.ts';
import { getContextThresholds } from './config.ts';
import {
  getPipelineDir,
  getPhasesDir,
  getContextPhaseDir,
  getPlanContextPath,
  getChunksDir,
  getChunkWorkDir,
  getWorkPromptPath,
  getWorkerLogPath,
  getHandoffPath,
  getPhaseNameForChunk,
  PHASE_UNIT_TESTS,
  PHASE_BRANCH_REVIEW,
  PHASE_FINAL_VALIDATION,
} from './paths.ts';

// Re-export for backward compatibility
export { getPipelineDir } from './paths.ts';

// Heartbeat interval (check every 60 seconds)
const HEARTBEAT_INTERVAL_MS = 60 * 1000;
// Idle warning threshold (5 minutes without handoff.md update)
const IDLE_WARNING_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * Format elapsed time in human-readable format.
 */
function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Start heartbeat monitoring for a worker.
 * Returns a cleanup function to stop monitoring.
 */
function startHeartbeat(
  worktreePath: string,
  chunkId: string,
  startTime: number,
  logStream: WriteStream
): () => void {
  const handoffPath = getHandoffPath(worktreePath, chunkId);

  const intervalId = setInterval(async () => {
    const elapsed = Date.now() - startTime;
    let idleTime = 0;
    let status = 'running';

    try {
      const stats = await stat(handoffPath);
      idleTime = Date.now() - stats.mtimeMs;

      if (idleTime > IDLE_WARNING_THRESHOLD_MS) {
        status = 'idle';
      }
    } catch {
      // handoff.md doesn't exist yet
      status = 'starting';
    }

    const heartbeatMsg = `[${new Date().toISOString()}] 💓 Heartbeat: ${chunkId} | ` +
      `Elapsed: ${formatElapsed(elapsed)} | ` +
      `Status: ${status}` +
      (status === 'idle' ? ` (no handoff.md update in ${formatElapsed(idleTime)})` : '');

    console.log(heartbeatMsg);
    logStream.write(heartbeatMsg + '\n');

    if (status === 'idle') {
      console.log(`⚠️  Worker may be stuck. Check logs in: Phases/`);
    }
  }, HEARTBEAT_INTERVAL_MS);

  return () => clearInterval(intervalId);
}

// ============================================================================
// Context Building
// ============================================================================

/**
 * Build the plan_context.md content (shared context for all workers).
 */
export function buildPlanContext(
  metaContent: string,
  config: PipelineConfig
): string {
  const thresholds = getContextThresholds(config);

  return `# Plan Context

This document provides essential context for all workers in this pipeline.

## Context Budget

You have approximately **${config.chunkContextBudget.toLocaleString()}** tokens for this chunk.
Target completion at **60-70%** usage (~${Math.floor(config.chunkContextBudget * 0.65).toLocaleString()} tokens of work).

### Thresholds

| Level | Usage | Action |
|-------|-------|--------|
| Normal | < 70% | Continue working normally |
| Warning | **${Math.round(config.contextWarningThreshold * 100)}%** (${thresholds.warning.toLocaleString()} tokens) | Consider wrapping up soon |
| Critical | **${Math.round(config.contextCriticalThreshold * 100)}%** (${thresholds.critical.toLocaleString()} tokens) | Start finishing current task, prepare handoff |
| Emergency | **${Math.round(config.contextEmergencyThreshold * 100)}%** (${thresholds.emergency.toLocaleString()} tokens) | **STOP** new work, write handoff.md immediately |

If you feel you're running long, prioritize creating the handoff.md.

---

## Architecture & Decisions (from Setup)

${metaContent}
`;
}

/**
 * Build the work_prompt.md content for an implementation chunk.
 * Combines plan_context + chunk definition + prior handoff.
 */
export function buildWorkPrompt(
  planContext: string,
  chunkPlan: string,
  priorHandoff: Handoff | undefined,
  chunk: Chunk
): string {
  let prompt = `# Work Prompt: ${chunk.name}

Chunk ID: ${chunk.id}
Phase: ${getPhaseNameForChunk(chunk.id)}

---

${planContext}

---

## Your Task

${chunkPlan}

---
`;

  if (priorHandoff) {
    prompt += `
## Prior Chunk Handoff

**From:** ${priorHandoff.fromChunk}

### What Was Completed

${priorHandoff.completedItems.map((item) => `- ${item}`).join('\n') || '(None listed)'}

### Files Created

${priorHandoff.filesCreated.map((file) => `- ${file}`).join('\n') || '(None)'}

### Files Modified

${priorHandoff.filesModified.map((file) => `- ${file}`).join('\n') || '(None)'}

### Key Decisions

${priorHandoff.decisions.map((d) => `
#### ${d.decision}
**Rationale:** ${d.rationale}
${d.tradeoffs ? `**Tradeoffs:** ${d.tradeoffs}` : ''}
`).join('\n') || '(None documented)'}

### Context for You

${priorHandoff.contextForNext}

### Integration Notes

${priorHandoff.integrationNotes}

${priorHandoff.remainingWork ? `### Remaining Work\n\n${priorHandoff.remainingWork}` : ''}

---
`;
  }

  prompt += `
## Output Requirements

1. Do your work in the repository
2. Commit frequently with descriptive messages
3. **CRITICAL: Fill out handoff.md completely before finishing**

The handoff.md template is already created at your work directory.

### handoff.md Requirements

| Section | Requirement |
|---------|-------------|
| What I Completed | At least 3 items with [x] checkmarks |
| Files Created | Full paths to all new files |
| Files Modified | Full paths to all changed files |
| Key Decisions Made | **At least 2 decisions** with rationale AND tradeoffs |
| Context for Next Chunk | **At least 300 words** of useful orientation |
| Integration Notes | **Code examples** showing how to use your work |

A thin or missing handoff will cause the pipeline to fail.
`;

  return prompt;
}

// ============================================================================
// File Preparation
// ============================================================================

/**
 * Build the handoff.md template for a chunk.
 */
function buildHandoffTemplate(chunk: Chunk): string {
  const nextChunkNum = chunk.order + 1;
  const nextChunkId = `${String(nextChunkNum).padStart(2, '0')}-next`;

  return `# Handoff: ${chunk.id}

To Chunk: ${nextChunkId}

---
**⚠️ IMPORTANT: You MUST fill out ALL sections below before exiting.**
**A poor handoff will cause the next worker to fail.**
---

## What I Completed

<!-- REQUIRED: List at least 3 items with [x] checkmarks -->
- [ ] (Replace with actual completed item)
- [ ] (Replace with actual completed item)
- [ ] (Replace with actual completed item)

## Files Created

<!-- REQUIRED: List full paths to all new files, or "None" -->
- (Replace with actual file paths)

## Files Modified

<!-- REQUIRED: List full paths to all changed files, or "None" -->
- (Replace with actual file paths)

## Key Decisions Made

<!-- REQUIRED: Document at least 2 decisions with rationale AND tradeoffs -->

### 1. (Replace with actual decision title)

**Decision:** (What you decided)
**Rationale:** (Why - be specific about the reasoning)
**Tradeoffs:** (What alternatives you considered and why you rejected them)

### 2. (Replace with actual decision title)

**Decision:** (What you decided)
**Rationale:** (Why - be specific about the reasoning)
**Tradeoffs:** (What alternatives you considered and why you rejected them)

## Context for Next Chunk

<!-- REQUIRED: At least 300 words of useful context -->
<!-- Include: system overview, how components connect, key constraints, gotchas -->

(Replace this entire section with detailed context. The next worker knows NOTHING
about what you did except what you write here. Be thorough.)

## Integration Notes

<!-- REQUIRED: Include concrete code examples -->

(Show how the next chunk should use what you built.)

\`\`\`swift
// Replace with actual code example showing usage
\`\`\`

## Remaining Work

<!-- "None" if fully complete, otherwise list what's left -->
(Replace with actual remaining work or "None")

## Blockers / Issues Encountered

<!-- "None" if everything went smoothly -->
(Replace with actual blockers or "None")

## Tests Status

- [ ] Tests passing
- [ ] Coverage acceptable

## Context Usage

Final: XX% (XXk tokens)
Peak: XX% (XXk tokens)
`;
}

/**
 * Prepare the worktree for a chunk execution.
 *
 * Creates:
 * - Phases/00-CONTEXT/plan_context.md (if not exists)
 * - Phases/01-IMPLEMENTATION/01a_slug/work_prompt.md
 * - Phases/01-IMPLEMENTATION/01a_slug/handoff.md (template)
 */
export async function prepareForChunk(
  worktreePath: string,
  chunk: Chunk,
  metaContent: string,
  priorHandoff: Handoff | undefined,
  config: PipelineConfig
): Promise<void> {
  // Ensure phase directories exist
  const workDir = getChunkWorkDir(worktreePath, chunk.id);
  await mkdir(workDir, { recursive: true });

  // Ensure 00-CONTEXT directory exists
  const contextDir = getContextPhaseDir(worktreePath);
  await mkdir(contextDir, { recursive: true });

  // Write plan_context.md (shared context)
  const planContextPath = getPlanContextPath(worktreePath);
  const planContext = buildPlanContext(metaContent, config);

  try {
    await stat(planContextPath);
    // Already exists, don't overwrite
  } catch {
    await writeFile(planContextPath, planContext, 'utf-8');
  }

  // Read chunk plan
  const chunkPlan = await readFile(chunk.planPath, 'utf-8');

  // Build and write work_prompt.md
  const workPrompt = buildWorkPrompt(planContext, chunkPlan, priorHandoff, chunk);
  const workPromptPath = getWorkPromptPath(worktreePath, chunk.id);
  await writeFile(workPromptPath, workPrompt, 'utf-8');

  // Write handoff.md template
  const handoffTemplate = buildHandoffTemplate(chunk);
  const handoffPath = getHandoffPath(worktreePath, chunk.id);
  await writeFile(handoffPath, handoffTemplate, 'utf-8');
}

// ============================================================================
// Worker Spawning
// ============================================================================

// Default timeout for chunk workers (60 minutes)
const CHUNK_WORKER_TIMEOUT_MS = 60 * 60 * 1000;

/**
 * Build the initial prompt for the worker.
 */
function buildWorkerPrompt(chunk: Chunk, worktreePath: string): string {
  const workDir = getChunkWorkDir(worktreePath, chunk.id);
  const phaseName = getPhaseNameForChunk(chunk.id);

  return `You are starting work on chunk: ${chunk.id} - ${chunk.name}

## FILE LOCATIONS

Your work directory: Phases/${phaseName}/${chunk.id.replace(/-/, '_')}/

Files in your work directory:
- \`work_prompt.md\` - Your full instructions (context + task)
- \`handoff.md\` - Fill this out before finishing

## CRITICAL REQUIREMENTS

1. Read \`work_prompt.md\` for your full instructions
2. Do your implementation work
3. Commit frequently with descriptive messages
4. **FILL OUT handoff.md COMPLETELY before finishing**

### handoff.md Checklist

Before exiting, verify your handoff.md has:
- [ ] At least 3 completed items with checkmarks
- [ ] All created/modified files listed with paths
- [ ] At least 2 key decisions with rationale AND tradeoffs
- [ ] 300+ words of context for the next worker
- [ ] Code examples in integration notes

A poor handoff will cause the next worker to fail.

Your goal: ${chunk.description}

Begin by reading work_prompt.md, then start implementation.`;
}

/**
 * Spawn a Claude Code worker for a chunk.
 */
export async function spawnWorker(
  worktreePath: string,
  chunk: Chunk,
  timeoutMs: number = CHUNK_WORKER_TIMEOUT_MS
): Promise<WorkerResult> {
  const prompt = buildWorkerPrompt(chunk, worktreePath);
  const startTime = Date.now();

  // Ensure work directory exists
  const workDir = getChunkWorkDir(worktreePath, chunk.id);
  await mkdir(workDir, { recursive: true });

  // Create log file
  const logPath = getWorkerLogPath(worktreePath, chunk.id);
  const logStream = createWriteStream(logPath, { flags: 'a' });

  const phaseName = getPhaseNameForChunk(chunk.id);
  const logHeader = `
================================================================================
Worker Log: ${chunk.id} - ${chunk.name}
Phase: ${phaseName}
Started: ${new Date().toISOString()}
Working Directory: ${worktreePath}
Work Directory: ${workDir}
Timeout: ${Math.round(timeoutMs / 60000)} minutes
================================================================================

`;
  logStream.write(logHeader);

  console.log(`\nSpawning worker for chunk: ${chunk.id}`);
  console.log(`Phase: ${phaseName}`);
  console.log(`Working directory: ${worktreePath}`);
  console.log(`Timeout: ${Math.round(timeoutMs / 60000)} minutes`);
  console.log(`Log file: ${logPath}`);

  return new Promise((resolve) => {
    let timedOut = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let stopHeartbeat: (() => void) | undefined;

    const child = spawn('claude', ['--dangerously-skip-permissions', '-p', prompt], {
      cwd: worktreePath,
      stdio: ['inherit', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PWD: worktreePath,
      },
    });

    // Pipe output to both console and log file
    child.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      process.stdout.write(text);
      logStream.write(text);
    });

    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      process.stderr.write(text);
      logStream.write(`[stderr] ${text}`);
    });

    // Start heartbeat monitoring
    stopHeartbeat = startHeartbeat(worktreePath, chunk.id, startTime, logStream);

    // Set up timeout
    timeoutId = setTimeout(() => {
      timedOut = true;
      const timeoutMsg = `\nWorker timed out after ${Math.round(timeoutMs / 60000)} minutes. Killing process...`;
      console.log(timeoutMsg);
      logStream.write(timeoutMsg + '\n');
      child.kill('SIGTERM');

      setTimeout(() => {
        if (!child.killed) {
          console.log('Force killing worker...');
          logStream.write('Force killing worker...\n');
          child.kill('SIGKILL');
        }
      }, 10000);
    }, timeoutMs);

    child.on('error', (error) => {
      if (timeoutId) clearTimeout(timeoutId);
      if (stopHeartbeat) stopHeartbeat();
      const errorMsg = `Worker spawn error: ${error}`;
      console.error(errorMsg);
      logStream.write(`[ERROR] ${errorMsg}\n`);
      logStream.end();
      resolve({
        exitCode: 1,
        handoffCreated: false,
        progressUpdated: false,
        commits: [],
      });
    });

    child.on('close', async (code) => {
      if (timeoutId) clearTimeout(timeoutId);
      if (stopHeartbeat) stopHeartbeat();

      const elapsed = Date.now() - startTime;

      if (timedOut) {
        console.log('Worker was terminated due to timeout.');
        logStream.write('Worker was terminated due to timeout.\n');
      } else {
        console.log(`Worker exited with code: ${code}`);
        logStream.write(`Worker exited with code: ${code}\n`);
      }

      logStream.write(`\nTotal elapsed time: ${formatElapsed(elapsed)}\n`);
      logStream.write(`================================================================================\n`);
      logStream.end();

      // Check if handoff was created
      let handoffCreated = false;
      try {
        const handoffPath = getHandoffPath(worktreePath, chunk.id);
        const handoff = await readFile(handoffPath, 'utf-8');
        handoffCreated = handoff.includes('[x]') || handoff.length > 2000;
      } catch {
        // File doesn't exist or can't be read
      }

      // Get recent commits
      let commits: string[] = [];
      try {
        const result = await $`git -C ${worktreePath} log --oneline -10`.quiet();
        commits = result.text().trim().split('\n').filter(Boolean);
      } catch {
        // No commits
      }

      resolve({
        exitCode: timedOut ? 124 : (code ?? 1),
        handoffCreated,
        progressUpdated: false, // No longer tracking PROGRESS.md
        commits,
      });
    });
  });
}

// ============================================================================
// Review Worker
// ============================================================================

// Default timeout for review workers (30 minutes)
const REVIEW_WORKER_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Spawn a Claude Code worker for PR review stage.
 */
export async function spawnReviewWorker(
  worktreePath: string,
  branchName: string,
  timeoutMs: number = REVIEW_WORKER_TIMEOUT_MS
): Promise<WorkerResult> {
  const startTime = Date.now();

  // Create review phase directory
  const reviewDir = join(getPhasesDir(worktreePath), PHASE_BRANCH_REVIEW);
  await mkdir(reviewDir, { recursive: true });

  // Create log file
  const logPath = join(reviewDir, 'worker.log');
  const logStream = createWriteStream(logPath, { flags: 'a' });

  const logHeader = `
================================================================================
Review Worker Log
Branch: ${branchName}
Started: ${new Date().toISOString()}
Working Directory: ${worktreePath}
Timeout: ${Math.round(timeoutMs / 60000)} minutes
================================================================================

`;
  logStream.write(logHeader);

  console.log(`\nSpawning review worker for branch: ${branchName}`);
  console.log(`Working directory: ${worktreePath}`);
  console.log(`Timeout: ${Math.round(timeoutMs / 60000)} minutes`);
  console.log(`Log file: ${logPath}`);

  const prompt = `Run the code review workflow on this branch.

Execute: /compound-engineering:workflows:review ${branchName}

This will:
1. Run 13+ specialized review agents in parallel
2. Create todo files for any findings (P1/P2/P3 priority)
3. Fix any P1 (critical) findings before finishing

After the review completes:
- If there are P1 findings, fix them and re-run the review
- Continue until no P1 findings remain
- Create a summary of all findings in Phases/03-BRANCH-REVIEW/handoff.md`;

  // Write prompt to file
  const promptPath = join(reviewDir, 'prompt.md');
  await writeFile(promptPath, prompt, 'utf-8');

  return new Promise((resolve) => {
    let timedOut = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let heartbeatId: ReturnType<typeof setInterval> | undefined;

    const child = spawn('claude', ['--dangerously-skip-permissions', '-p', prompt], {
      cwd: worktreePath,
      stdio: ['inherit', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PWD: worktreePath,
      },
    });

    child.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      process.stdout.write(text);
      logStream.write(text);
    });

    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      process.stderr.write(text);
      logStream.write(`[stderr] ${text}`);
    });

    heartbeatId = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const heartbeatMsg = `[${new Date().toISOString()}] 💓 Review heartbeat | Elapsed: ${formatElapsed(elapsed)}`;
      console.log(heartbeatMsg);
      logStream.write(heartbeatMsg + '\n');
    }, HEARTBEAT_INTERVAL_MS);

    timeoutId = setTimeout(() => {
      timedOut = true;
      const timeoutMsg = `\nReview worker timed out after ${Math.round(timeoutMs / 60000)} minutes. Killing process...`;
      console.log(timeoutMsg);
      logStream.write(timeoutMsg + '\n');
      child.kill('SIGTERM');

      setTimeout(() => {
        if (!child.killed) {
          console.log('Force killing review worker...');
          logStream.write('Force killing review worker...\n');
          child.kill('SIGKILL');
        }
      }, 10000);
    }, timeoutMs);

    child.on('error', (error) => {
      if (timeoutId) clearTimeout(timeoutId);
      if (heartbeatId) clearInterval(heartbeatId);
      const errorMsg = `Review worker spawn error: ${error}`;
      console.error(errorMsg);
      logStream.write(`[ERROR] ${errorMsg}\n`);
      logStream.end();
      resolve({
        exitCode: 1,
        handoffCreated: false,
        progressUpdated: false,
        commits: [],
      });
    });

    child.on('close', async (code) => {
      if (timeoutId) clearTimeout(timeoutId);
      if (heartbeatId) clearInterval(heartbeatId);

      const elapsed = Date.now() - startTime;

      if (timedOut) {
        console.log('Review worker was terminated due to timeout.');
        logStream.write('Review worker was terminated due to timeout.\n');
      } else {
        console.log(`Review worker exited with code: ${code}`);
        logStream.write(`Review worker exited with code: ${code}\n`);
      }

      logStream.write(`\nTotal elapsed time: ${formatElapsed(elapsed)}\n`);
      logStream.write(`================================================================================\n`);
      logStream.end();

      let commits: string[] = [];
      try {
        const result = await $`git -C ${worktreePath} log --oneline -10`.quiet();
        commits = result.text().trim().split('\n').filter(Boolean);
      } catch {
        // No commits
      }

      resolve({
        exitCode: timedOut ? 124 : (code ?? 1),
        handoffCreated: false,
        progressUpdated: false,
        commits,
      });
    });
  });
}

// ============================================================================
// Unit Tests Worker
// ============================================================================

// Default timeout for unit tests workers (20 minutes)
const UNIT_TESTS_WORKER_TIMEOUT_MS = 20 * 60 * 1000;

/**
 * Spawn a Claude Code worker for unit tests stage.
 */
export async function spawnUnitTestsWorker(
  worktreePath: string,
  timeoutMs: number = UNIT_TESTS_WORKER_TIMEOUT_MS
): Promise<WorkerResult> {
  const startTime = Date.now();

  // Create unit tests phase directory
  const unitTestsDir = join(getPhasesDir(worktreePath), PHASE_UNIT_TESTS);
  await mkdir(unitTestsDir, { recursive: true });

  // Create log file
  const logPath = join(unitTestsDir, 'worker.log');
  const logStream = createWriteStream(logPath, { flags: 'a' });

  const logHeader = `
================================================================================
Unit Tests Worker Log
Started: ${new Date().toISOString()}
Working Directory: ${worktreePath}
Timeout: ${Math.round(timeoutMs / 60000)} minutes
================================================================================

`;
  logStream.write(logHeader);

  console.log(`\nSpawning unit tests worker`);
  console.log(`Working directory: ${worktreePath}`);
  console.log(`Timeout: ${Math.round(timeoutMs / 60000)} minutes`);
  console.log(`Log file: ${logPath}`);

  const prompt = `Create comprehensive unit tests for the implementation, then verify they pass.

## Your Task

1. **Review the implementation** - Read through the code created in 01-IMPLEMENTATION to understand what needs testing
2. **Identify test cases** - Plan tests for:
   - Happy path scenarios
   - Edge cases (empty inputs, boundary values, etc.)
   - Error handling
   - Any complex logic paths
3. **Create unit tests** - Write comprehensive tests using the project's test framework
4. **Run all tests** - Execute the full test suite
5. **Fix any failures** - If tests fail, fix the tests or implementation as needed

## Test Coverage Goals

- All public APIs should have tests
- Edge cases should be covered (empty strings, nil values, boundaries)
- Error paths should be tested
- At least 80% code coverage for new implementation code

## Output Requirements

1. Create test files in the appropriate test directory
2. Commit your tests with a descriptive message
3. Fill out the handoff at Phases/02-UNIT-TESTS/handoff.md with:
   - Tests created (list each test file and what it covers)
   - Test results summary (pass/fail counts)
   - Coverage notes
   - Any issues or gaps for the next phase`;

  // Write prompt to file
  const promptPath = join(unitTestsDir, 'prompt.md');
  await writeFile(promptPath, prompt, 'utf-8');

  // Write handoff template
  const handoffTemplate = `# Handoff: 02-UNIT-TESTS

To Phase: 03-BRANCH-REVIEW

---

## Tests Created

| Test File | What It Tests |
|-----------|---------------|
| | |

## Test Results

- Total tests:
- Passed:
- Failed:
- Skipped:

## Test Command Used

\`\`\`bash
# Command used to run tests
\`\`\`

## Coverage Notes

- Estimated coverage:
- Areas well covered:
- Areas with gaps (if any):

## Key Test Cases

1. **Happy path:** (describe)
2. **Edge cases:** (describe)
3. **Error handling:** (describe)

## Issues / Concerns

(Any concerns for the review phase, or "None")
`;
  const handoffPath = join(unitTestsDir, 'handoff.md');
  await writeFile(handoffPath, handoffTemplate, 'utf-8');

  return new Promise((resolve) => {
    let timedOut = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let heartbeatId: ReturnType<typeof setInterval> | undefined;

    const child = spawn('claude', ['--dangerously-skip-permissions', '-p', prompt], {
      cwd: worktreePath,
      stdio: ['inherit', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PWD: worktreePath,
      },
    });

    child.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      process.stdout.write(text);
      logStream.write(text);
    });

    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      process.stderr.write(text);
      logStream.write(`[stderr] ${text}`);
    });

    heartbeatId = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const heartbeatMsg = `[${new Date().toISOString()}] 💓 Unit tests heartbeat | Elapsed: ${formatElapsed(elapsed)}`;
      console.log(heartbeatMsg);
      logStream.write(heartbeatMsg + '\n');
    }, HEARTBEAT_INTERVAL_MS);

    timeoutId = setTimeout(() => {
      timedOut = true;
      const timeoutMsg = `\nUnit tests worker timed out after ${Math.round(timeoutMs / 60000)} minutes. Killing process...`;
      console.log(timeoutMsg);
      logStream.write(timeoutMsg + '\n');
      child.kill('SIGTERM');

      setTimeout(() => {
        if (!child.killed) {
          console.log('Force killing unit tests worker...');
          logStream.write('Force killing unit tests worker...\n');
          child.kill('SIGKILL');
        }
      }, 10000);
    }, timeoutMs);

    child.on('error', (error) => {
      if (timeoutId) clearTimeout(timeoutId);
      if (heartbeatId) clearInterval(heartbeatId);
      const errorMsg = `Unit tests worker spawn error: ${error}`;
      console.error(errorMsg);
      logStream.write(`[ERROR] ${errorMsg}\n`);
      logStream.end();
      resolve({
        exitCode: 1,
        handoffCreated: false,
        progressUpdated: false,
        commits: [],
      });
    });

    child.on('close', async (code) => {
      if (timeoutId) clearTimeout(timeoutId);
      if (heartbeatId) clearInterval(heartbeatId);

      const elapsed = Date.now() - startTime;

      if (timedOut) {
        console.log('Unit tests worker was terminated due to timeout.');
        logStream.write('Unit tests worker was terminated due to timeout.\n');
      } else {
        console.log(`Unit tests worker exited with code: ${code}`);
        logStream.write(`Unit tests worker exited with code: ${code}\n`);
      }

      logStream.write(`\nTotal elapsed time: ${formatElapsed(elapsed)}\n`);
      logStream.write(`================================================================================\n`);
      logStream.end();

      let commits: string[] = [];
      try {
        const result = await $`git -C ${worktreePath} log --oneline -10`.quiet();
        commits = result.text().trim().split('\n').filter(Boolean);
      } catch {
        // No commits
      }

      resolve({
        exitCode: timedOut ? 124 : (code ?? 1),
        handoffCreated: false,
        progressUpdated: false,
        commits,
      });
    });
  });
}

// ============================================================================
// Final Validation Worker
// ============================================================================

// Default timeout for final validation workers (15 minutes)
const FINAL_VALIDATION_WORKER_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * Spawn a Claude Code worker for final validation stage.
 */
export async function spawnFinalValidationWorker(
  worktreePath: string,
  timeoutMs: number = FINAL_VALIDATION_WORKER_TIMEOUT_MS
): Promise<WorkerResult> {
  const startTime = Date.now();

  // Create final validation phase directory
  const validationDir = join(getPhasesDir(worktreePath), PHASE_FINAL_VALIDATION);
  await mkdir(validationDir, { recursive: true });

  // Create log file
  const logPath = join(validationDir, 'worker.log');
  const logStream = createWriteStream(logPath, { flags: 'a' });

  const logHeader = `
================================================================================
Final Validation Worker Log
Started: ${new Date().toISOString()}
Working Directory: ${worktreePath}
Timeout: ${Math.round(timeoutMs / 60000)} minutes
================================================================================

`;
  logStream.write(logHeader);

  console.log(`\nSpawning final validation worker`);
  console.log(`Working directory: ${worktreePath}`);
  console.log(`Timeout: ${Math.round(timeoutMs / 60000)} minutes`);
  console.log(`Log file: ${logPath}`);

  const prompt = `Perform final validation of this feature branch before merge.

## Your Task

1. **Build verification** - Ensure the project builds cleanly with no warnings
2. **Test verification** - Run all tests one final time
3. **Code quality check** - Look for any obvious issues, dead code, or debug statements
4. **Documentation check** - Verify any new public APIs are documented
5. **Git hygiene** - Check commit history is clean

## Checklist

- [ ] Project builds without errors
- [ ] Project builds without warnings (or warnings are acceptable)
- [ ] All tests pass
- [ ] No debug/console statements left in production code
- [ ] No TODO comments for this feature remain unaddressed
- [ ] Commit history is clean and descriptive

## Output Requirements

Create a handoff at Phases/04-FINAL-VALIDATION/handoff.md with:
- Final build status
- Final test status
- Any issues found and fixed
- Recommendation: READY TO MERGE or NEEDS ATTENTION

If everything passes, the branch is ready to merge.`;

  // Write prompt to file
  const promptPath = join(validationDir, 'prompt.md');
  await writeFile(promptPath, prompt, 'utf-8');

  // Write handoff template
  const handoffTemplate = `# Handoff: 04-FINAL-VALIDATION

---

## Final Status

**Recommendation:** [READY TO MERGE / NEEDS ATTENTION]

## Build Status

- [ ] Builds without errors
- [ ] Builds without warnings

\`\`\`bash
# Build output summary
\`\`\`

## Test Status

- Total tests:
- All passing: [Yes/No]

## Code Quality

- [ ] No debug statements
- [ ] No unaddressed TODOs
- [ ] Documentation complete

## Issues Found & Fixed

- (List any issues found and fixed, or "None")

## Final Notes

(Any notes for the person merging this PR)
`;
  const handoffPath = join(validationDir, 'handoff.md');
  await writeFile(handoffPath, handoffTemplate, 'utf-8');

  return new Promise((resolve) => {
    let timedOut = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let heartbeatId: ReturnType<typeof setInterval> | undefined;

    const child = spawn('claude', ['--dangerously-skip-permissions', '-p', prompt], {
      cwd: worktreePath,
      stdio: ['inherit', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PWD: worktreePath,
      },
    });

    child.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      process.stdout.write(text);
      logStream.write(text);
    });

    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      process.stderr.write(text);
      logStream.write(`[stderr] ${text}`);
    });

    heartbeatId = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const heartbeatMsg = `[${new Date().toISOString()}] 💓 Final validation heartbeat | Elapsed: ${formatElapsed(elapsed)}`;
      console.log(heartbeatMsg);
      logStream.write(heartbeatMsg + '\n');
    }, HEARTBEAT_INTERVAL_MS);

    timeoutId = setTimeout(() => {
      timedOut = true;
      const timeoutMsg = `\nFinal validation worker timed out after ${Math.round(timeoutMs / 60000)} minutes. Killing process...`;
      console.log(timeoutMsg);
      logStream.write(timeoutMsg + '\n');
      child.kill('SIGTERM');

      setTimeout(() => {
        if (!child.killed) {
          console.log('Force killing final validation worker...');
          logStream.write('Force killing final validation worker...\n');
          child.kill('SIGKILL');
        }
      }, 10000);
    }, timeoutMs);

    child.on('error', (error) => {
      if (timeoutId) clearTimeout(timeoutId);
      if (heartbeatId) clearInterval(heartbeatId);
      const errorMsg = `Final validation worker spawn error: ${error}`;
      console.error(errorMsg);
      logStream.write(`[ERROR] ${errorMsg}\n`);
      logStream.end();
      resolve({
        exitCode: 1,
        handoffCreated: false,
        progressUpdated: false,
        commits: [],
      });
    });

    child.on('close', async (code) => {
      if (timeoutId) clearTimeout(timeoutId);
      if (heartbeatId) clearInterval(heartbeatId);

      const elapsed = Date.now() - startTime;

      if (timedOut) {
        console.log('Final validation worker was terminated due to timeout.');
        logStream.write('Final validation worker was terminated due to timeout.\n');
      } else {
        console.log(`Final validation worker exited with code: ${code}`);
        logStream.write(`Final validation worker exited with code: ${code}\n`);
      }

      logStream.write(`\nTotal elapsed time: ${formatElapsed(elapsed)}\n`);
      logStream.write(`================================================================================\n`);
      logStream.end();

      let commits: string[] = [];
      try {
        const result = await $`git -C ${worktreePath} log --oneline -10`.quiet();
        commits = result.text().trim().split('\n').filter(Boolean);
      } catch {
        // No commits
      }

      resolve({
        exitCode: timedOut ? 124 : (code ?? 1),
        handoffCreated: false,
        progressUpdated: false,
        commits,
      });
    });
  });
}

// ============================================================================
// Git Operations
// ============================================================================

/**
 * Ensure changes are committed after chunk completion.
 */
export async function ensureCommit(
  worktreePath: string,
  chunkName: string
): Promise<string | null> {
  try {
    const statusResult = await $`git -C ${worktreePath} status --porcelain`.quiet();
    const status = statusResult.text().trim();

    if (!status) {
      console.log('No uncommitted changes.');
      return null;
    }

    await $`git -C ${worktreePath} add -A`.quiet();

    const commitMessage = `Chunk complete: ${chunkName}`;
    await $`git -C ${worktreePath} commit -m ${commitMessage}`.quiet();

    const hashResult = await $`git -C ${worktreePath} rev-parse HEAD`.quiet();
    const hash = hashResult.text().trim();

    console.log(`Committed changes: ${hash.slice(0, 8)}`);
    return hash;
  } catch (error) {
    console.error('Git commit failed:', error);
    return null;
  }
}

/**
 * Get the list of files modified in recent commits.
 */
export async function getModifiedFiles(
  worktreePath: string,
  commitCount: number = 5
): Promise<string[]> {
  try {
    const result = await $`git -C ${worktreePath} diff --name-only HEAD~${commitCount}..HEAD`.quiet();
    return result.text().trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

// ============================================================================
// Setup Content
// ============================================================================

/**
 * Load the setup chunk content for context building.
 */
export async function loadMetaContent(chunksDir: string): Promise<string> {
  // Try new name first, fall back to old name for compatibility
  const setupPath = join(chunksDir, '00-setup.md');
  const legacyPath = join(chunksDir, '00-META.md');

  try {
    return await readFile(setupPath, 'utf-8');
  } catch {
    try {
      return await readFile(legacyPath, 'utf-8');
    } catch {
      return '(No setup chunk found)';
    }
  }
}

/**
 * Archive chunk artifacts (no longer needed with new structure).
 * Each chunk's artifacts are already in their own directory.
 */
export async function archiveChunkArtifacts(
  worktreePath: string,
  chunkId: string
): Promise<void> {
  // With the new structure, artifacts are already in place
  // This function is kept for API compatibility
  const workDir = getChunkWorkDir(worktreePath, chunkId);
  console.log(`Artifacts at: ${workDir}`);
}

/**
 * Get the work directory path for external use.
 */
export function getChunkRunDir(worktreePath: string, chunkId: string): string {
  return getChunkWorkDir(worktreePath, chunkId);
}
