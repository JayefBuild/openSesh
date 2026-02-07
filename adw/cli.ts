#!/usr/bin/env bun
/**
 * ADW Pipeline - CLI Interface
 *
 * Command-line interface for the ADW Pipeline.
 *
 * Commands:
 *   execute <plan>  - Execute a complete pipeline
 *   chunk <plan>    - Chunk a plan (dry run)
 *   status [path]   - Show pipeline status
 *   retry <chunk>   - Retry a failed chunk
 *   validate <plan> - Validate chunks without executing
 */

import { resolve, basename, join } from 'node:path';
import { access } from 'node:fs/promises';
import { loadConfig, formatConfig } from './config.ts';
import {
  executePlan,
  chunkOnly,
  getStatus,
  formatReport,
  retryChunk,
} from './orchestrator.ts';
import { chunkPlanWithRetry, formatValidation } from './chunker.ts';

// ============================================================================
// CLI Argument Parsing
// ============================================================================

interface ParsedArgs {
  command: string;
  args: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: string[] = [];
  const flags: Record<string, string | boolean> = {};

  // Skip 'bun' and script name
  const cliArgs = argv.slice(2);

  let i = 0;
  while (i < cliArgs.length) {
    const arg = cliArgs[i];

    if (!arg) {
      i++;
      continue;
    }

    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const nextArg = cliArgs[i + 1];

      // Check if next arg is a value or another flag
      if (nextArg && !nextArg.startsWith('-')) {
        flags[key] = nextArg;
        i += 2;
      } else {
        flags[key] = true;
        i++;
      }
    } else if (arg.startsWith('-')) {
      const key = arg.slice(1);
      flags[key] = true;
      i++;
    } else {
      args.push(arg);
      i++;
    }
  }

  const command = args[0] ?? 'help';
  const commandArgs = args.slice(1);

  return { command, args: commandArgs, flags };
}

// ============================================================================
// Commands
// ============================================================================

async function cmdExecute(args: string[], flags: Record<string, string | boolean>): Promise<void> {
  const planPath = args[0];

  if (!planPath) {
    console.error('Error: Plan path required');
    console.error('Usage: pipeline execute <plan.md>');
    process.exit(1);
  }

  const resolvedPath = resolve(planPath);

  try {
    await access(resolvedPath);
  } catch {
    console.error(`Error: Plan file not found: ${resolvedPath}`);
    process.exit(1);
  }

  const config = loadConfig();
  const resume = flags['resume'] === true;
  const baseBranch = typeof flags['branch'] === 'string' ? flags['branch'] : 'main';

  const report = await executePlan(resolvedPath, {
    config,
    resume,
    baseBranch,
  });

  console.log('\n' + formatReport(report));

  if (report.status === 'failed') {
    process.exit(1);
  }
}

async function cmdChunk(args: string[], flags: Record<string, string | boolean>): Promise<void> {
  const planPath = args[0];

  if (!planPath) {
    console.error('Error: Plan path required');
    console.error('Usage: pipeline chunk <plan.md>');
    process.exit(1);
  }

  const resolvedPath = resolve(planPath);

  try {
    await access(resolvedPath);
  } catch {
    console.error(`Error: Plan file not found: ${resolvedPath}`);
    process.exit(1);
  }

  const outputDir = typeof flags['output'] === 'string' ? flags['output'] : undefined;
  const config = loadConfig();

  await chunkOnly(resolvedPath, outputDir, config);
}

async function cmdStatus(args: string[], _flags: Record<string, string | boolean>): Promise<void> {
  const worktreePath = args[0] ?? process.cwd();
  const resolvedPath = resolve(worktreePath);

  const status = await getStatus(resolvedPath);
  console.log(status);
}

async function cmdRetry(args: string[], _flags: Record<string, string | boolean>): Promise<void> {
  const chunkId = args[0];
  const worktreePath = args[1] ?? process.cwd();

  if (!chunkId) {
    console.error('Error: Chunk ID required');
    console.error('Usage: pipeline retry <chunk-id> [worktree-path]');
    process.exit(1);
  }

  const resolvedPath = resolve(worktreePath);

  try {
    await retryChunk(resolvedPath, chunkId);
  } catch (error) {
    console.error(`Error: ${error}`);
    process.exit(1);
  }
}

async function cmdValidate(args: string[], _flags: Record<string, string | boolean>): Promise<void> {
  const planPath = args[0];

  if (!planPath) {
    console.error('Error: Plan path required');
    console.error('Usage: pipeline validate <plan.md>');
    process.exit(1);
  }

  const resolvedPath = resolve(planPath);

  try {
    await access(resolvedPath);
  } catch {
    console.error(`Error: Plan file not found: ${resolvedPath}`);
    process.exit(1);
  }

  const config = loadConfig();

  console.log('Chunking plan for validation...');
  const { chunks, validation } = await chunkPlanWithRetry(
    resolvedPath,
    '/tmp/adw-validate-' + Date.now(),
    config
  );

  console.log('\n' + formatValidation(validation));

  if (validation.valid) {
    console.log(`\nValidation passed. ${chunks.length} chunks would be created.`);
    process.exit(0);
  } else {
    console.log('\nValidation failed.');
    process.exit(1);
  }
}

function cmdConfig(): void {
  const config = loadConfig();
  console.log(formatConfig(config));
}

async function cmdWatch(args: string[], _flags: Record<string, string | boolean>): Promise<void> {
  const worktreePath = args[0] ?? process.cwd();
  const resolvedPath = resolve(worktreePath);

  console.log(`\nWatching pipeline at: ${resolvedPath}`);
  console.log('Press Ctrl+C to stop\n');

  const phasesDir = join(resolvedPath, '.pipeline', 'Phases');

  const { readdir, stat } = await import('node:fs/promises');
  const { spawn } = await import('node:child_process');

  // Show current state
  const status = await getStatus(resolvedPath);
  console.log(status);
  console.log('\n' + '='.repeat(60) + '\n');

  // Find the most recent worker.log file recursively in Phases/
  async function findMostRecentLog(dir: string): Promise<{ path: string; mtime: number } | null> {
    let best: { path: string; mtime: number } | null = null;

    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          const subResult = await findMostRecentLog(fullPath);
          if (subResult && (!best || subResult.mtime > best.mtime)) {
            best = subResult;
          }
        } else if (entry.name === 'worker.log') {
          const stats = await stat(fullPath);
          if (!best || stats.mtimeMs > best.mtime) {
            best = { path: fullPath, mtime: stats.mtimeMs };
          }
        }
      }
    } catch {
      // Directory may not exist
    }

    return best;
  }

  const mostRecent = await findMostRecentLog(phasesDir);

  if (!mostRecent) {
    console.log('No log files found yet. The pipeline may not have started.');
    return;
  }

  console.log(`Tailing: ${mostRecent.path}\n`);
  console.log('='.repeat(60) + '\n');

  // Use tail -f to follow the log
  const tail = spawn('tail', ['-f', '-n', '50', mostRecent.path], {
    stdio: 'inherit',
  });

  // Handle Ctrl+C gracefully
  process.on('SIGINT', () => {
    tail.kill();
    console.log('\n\nStopped watching.');
    process.exit(0);
  });

  // Wait for tail to exit
  await new Promise<void>((resolve) => {
    tail.on('close', () => resolve());
  });
}

async function cmdLogs(args: string[], _flags: Record<string, string | boolean>): Promise<void> {
  const worktreePath = args[0] ?? process.cwd();
  const chunkId = args[1];
  const resolvedPath = resolve(worktreePath);

  const phasesDir = join(resolvedPath, '.pipeline', 'Phases');
  const { readdir, readFile, stat } = await import('node:fs/promises');

  // Find all worker.log files recursively
  async function findAllLogs(dir: string, logs: { chunk: string; phase: string; path: string }[] = []): Promise<typeof logs> {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          await findAllLogs(fullPath, logs);
        } else if (entry.name === 'worker.log') {
          // Extract phase and chunk from path: Phases/{phase}/{chunk}/worker.log
          const parts = fullPath.split('/');
          const chunkName = parts[parts.length - 2] ?? 'unknown';
          const phaseName = parts[parts.length - 3] ?? 'unknown';
          logs.push({ chunk: chunkName, phase: phaseName, path: fullPath });
        }
      }
    } catch {
      // Directory may not exist
    }
    return logs;
  }

  const allLogs = await findAllLogs(phasesDir);

  if (chunkId) {
    // Show specific chunk log
    const logEntry = allLogs.find(l => l.chunk === chunkId || l.chunk.startsWith(chunkId));
    if (logEntry) {
      const content = await readFile(logEntry.path, 'utf-8');
      console.log(content);
    } else {
      console.error(`Log not found for chunk: ${chunkId}`);
      console.log('\nAvailable logs:');
      for (const log of allLogs) {
        console.log(`  - ${log.phase}/${log.chunk}`);
      }
      process.exit(1);
    }
  } else {
    // List all log files grouped by phase
    if (allLogs.length === 0) {
      console.log('No log files found.');
      return;
    }

    console.log(`\nLogs in ${phasesDir}:\n`);

    // Group by phase
    const byPhase = new Map<string, typeof allLogs>();
    for (const log of allLogs) {
      const existing = byPhase.get(log.phase) ?? [];
      existing.push(log);
      byPhase.set(log.phase, existing);
    }

    for (const [phase, logs] of [...byPhase.entries()].sort()) {
      console.log(`${phase}/`);
      for (const log of logs.sort((a, b) => a.chunk.localeCompare(b.chunk))) {
        console.log(`  └── ${log.chunk}/worker.log`);
      }
    }

    console.log('\nUsage: pipeline logs <worktree> <chunk-id>');
    console.log('Example: pipeline logs .worktrees/my-feature 01a-project-setup');
  }
}

function cmdHelp(): void {
  console.log(`
ADW Pipeline - AI Development Workflow

Usage: pipeline <command> [options]

Commands:
  execute <plan>    Execute a complete pipeline from a plan file
  chunk <plan>      Chunk a plan without executing (dry run)
  status [path]     Show pipeline status for a worktree
  watch [path]      Watch a running pipeline (tail logs in real-time)
  logs [path] [id]  View log files for a pipeline
  retry <chunk>     Retry a failed chunk
  validate <plan>   Validate a plan's chunking without executing
  config            Show current configuration
  help              Show this help message

Execute Options:
  --resume          Resume an existing pipeline instead of starting fresh
  --branch <name>   Base branch for worktree (default: main)

Chunk Options:
  --output <dir>    Output directory for chunk files

Environment Variables:
  CLAUDE_ENVIRONMENT      Environment profile (api, pro, max5, max20)
  CHUNK_CONTEXT_BUDGET    Max tokens per chunk
  HANDOFF_TARGET_SIZE     Target handoff size in tokens
  HANDOFF_MAX_SIZE        Maximum handoff size in tokens

Examples:
  # Execute a plan
  pipeline execute plans/feature-auth.md

  # Resume a failed pipeline
  pipeline execute plans/feature-auth.md --resume

  # Watch a running pipeline
  pipeline watch .worktrees/feature-auth

  # View logs for a specific chunk
  pipeline logs .worktrees/feature-auth 01-setup

  # Chunk a plan (dry run)
  pipeline chunk plans/feature-auth.md

  # Check pipeline status
  pipeline status worktrees/feature-auth

  # Retry a failed chunk
  pipeline retry 02-api worktrees/feature-auth

  # Show configuration
  pipeline config
`);
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const { command, args, flags } = parseArgs(process.argv);

  try {
    switch (command) {
      case 'execute':
      case 'run':
        await cmdExecute(args, flags);
        break;

      case 'chunk':
        await cmdChunk(args, flags);
        break;

      case 'status':
        await cmdStatus(args, flags);
        break;

      case 'retry':
        await cmdRetry(args, flags);
        break;

      case 'validate':
        await cmdValidate(args, flags);
        break;

      case 'watch':
        await cmdWatch(args, flags);
        break;

      case 'logs':
        await cmdLogs(args, flags);
        break;

      case 'config':
        cmdConfig();
        break;

      case 'help':
      case '-h':
      case '--help':
        cmdHelp();
        break;

      default:
        console.error(`Unknown command: ${command}`);
        cmdHelp();
        process.exit(1);
    }
  } catch (error) {
    console.error('Pipeline error:', error);
    process.exit(1);
  }
}

main();
