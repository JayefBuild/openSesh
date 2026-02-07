/**
 * ADW Pipeline - Compile Validator
 *
 * Validates that code compiles after each implementation chunk.
 * Includes self-healing capability to spawn fix workers on failure.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';
import type {
  CompileResult,
  CompileError,
  PipelineConfig,
} from './types.ts';

// ============================================================================
// Build System Detection
// ============================================================================

type BuildSystem = 'xcode' | 'swift-package' | 'unknown';

/**
 * Detect the build system used in the project.
 */
async function detectBuildSystem(worktreePath: string): Promise<BuildSystem> {
  // Check for Xcode workspace/project
  try {
    const result = await $`ls ${worktreePath}/*.xcworkspace ${worktreePath}/*.xcodeproj 2>/dev/null`.quiet();
    if (result.text().trim()) {
      return 'xcode';
    }
  } catch {
    // No Xcode project
  }

  // Check for Package.swift
  try {
    await $`test -f ${worktreePath}/Package.swift`.quiet();
    return 'swift-package';
  } catch {
    // No Package.swift
  }

  return 'unknown';
}

// ============================================================================
// Compilation
// ============================================================================

/**
 * Run compilation check for the project.
 */
export async function validate(
  worktreePath: string,
  scheme?: string
): Promise<CompileResult> {
  const startTime = Date.now();
  const buildSystem = await detectBuildSystem(worktreePath);

  let result: CompileResult;

  switch (buildSystem) {
    case 'xcode':
      result = await runXcodeBuild(worktreePath, scheme);
      break;
    case 'swift-package':
      result = await runSwiftBuild(worktreePath);
      break;
    default:
      result = {
        success: true,
        errors: [],
        warnings: [],
        output: 'No build system detected, skipping compile check',
        duration: 0,
      };
  }

  result.duration = Date.now() - startTime;
  return result;
}

/**
 * Run xcodebuild for Xcode projects.
 */
async function runXcodeBuild(worktreePath: string, scheme?: string): Promise<CompileResult> {
  // Find scheme if not provided
  let schemeName = scheme;

  if (!schemeName) {
    try {
      const listResult = await $`xcodebuild -list -json`.cwd(worktreePath).quiet();
      const listData = JSON.parse(listResult.text());
      const schemes = listData.project?.schemes ?? listData.workspace?.schemes ?? [];
      schemeName = schemes[0];
    } catch {
      // Can't determine scheme
    }
  }

  const args = [
    '-destination', 'platform=macOS',
    'build',
  ];

  if (schemeName) {
    args.unshift('-scheme', schemeName);
  }

  try {
    const result = await $`xcodebuild ${args}`.cwd(worktreePath).quiet();
    return parseXcodeBuildOutput(result.text(), true);
  } catch (error) {
    const output = (error as { stdout?: { toString(): string }; stderr?: { toString(): string } })
      .stdout?.toString() ?? '';
    const stderr = (error as { stderr?: { toString(): string } })
      .stderr?.toString() ?? '';
    return parseXcodeBuildOutput(output + '\n' + stderr, false);
  }
}

/**
 * Run swift build for Swift Package Manager projects.
 */
async function runSwiftBuild(worktreePath: string): Promise<CompileResult> {
  try {
    const result = await $`swift build`.cwd(worktreePath).quiet();
    return parseSwiftBuildOutput(result.text(), true);
  } catch (error) {
    const output = (error as { stdout?: { toString(): string }; stderr?: { toString(): string } })
      .stdout?.toString() ?? '';
    const stderr = (error as { stderr?: { toString(): string } })
      .stderr?.toString() ?? '';
    return parseSwiftBuildOutput(output + '\n' + stderr, false);
  }
}

// ============================================================================
// Output Parsing
// ============================================================================

/**
 * Parse xcodebuild output for errors and warnings.
 */
function parseXcodeBuildOutput(output: string, success: boolean): CompileResult {
  const errors: CompileError[] = [];
  const warnings: CompileError[] = [];
  const lines = output.split('\n');

  for (const line of lines) {
    // Match error pattern: /path/file.swift:12:34: error: message
    const errorMatch = line.match(/^(.+?):(\d+):(\d+):\s*error:\s*(.+)$/);
    if (errorMatch) {
      errors.push({
        file: errorMatch[1] ?? '',
        line: parseInt(errorMatch[2] ?? '0', 10),
        column: parseInt(errorMatch[3] ?? '0', 10),
        message: errorMatch[4] ?? '',
      });
      continue;
    }

    // Match warning pattern: /path/file.swift:12:34: warning: message
    const warningMatch = line.match(/^(.+?):(\d+):(\d+):\s*warning:\s*(.+)$/);
    if (warningMatch) {
      warnings.push({
        file: warningMatch[1] ?? '',
        line: parseInt(warningMatch[2] ?? '0', 10),
        column: parseInt(warningMatch[3] ?? '0', 10),
        message: warningMatch[4] ?? '',
      });
      continue;
    }

    // Match simpler error pattern: error: message
    const simpleErrorMatch = line.match(/^\s*error:\s*(.+)$/);
    if (simpleErrorMatch) {
      errors.push({
        file: '',
        message: simpleErrorMatch[1] ?? '',
      });
    }
  }

  return {
    success: success && errors.length === 0,
    errors,
    warnings,
    output,
    duration: 0,
  };
}

/**
 * Parse swift build output for errors and warnings.
 */
function parseSwiftBuildOutput(output: string, success: boolean): CompileResult {
  // Swift compiler uses similar output format to clang
  return parseXcodeBuildOutput(output, success);
}

/**
 * Parse errors from compile output.
 */
export function parseErrors(output: string): CompileError[] {
  const result = parseXcodeBuildOutput(output, false);
  return result.errors;
}

// ============================================================================
// Fix Worker
// ============================================================================

/**
 * Generate a fix prompt for compilation errors.
 */
export function buildFixPrompt(
  errors: CompileError[],
  modifiedFiles: string[],
  chunkName: string
): string {
  const errorList = errors
    .map((e) => {
      if (e.file && e.line) {
        return `- ${e.file}:${e.line}:${e.column ?? 0}: ${e.message}`;
      }
      return `- ${e.message}`;
    })
    .join('\n');

  const fileList = modifiedFiles.map((f) => `- ${f}`).join('\n');

  return `## Fix Request

The following compilation error(s) occurred after Chunk: ${chunkName}

### Errors

\`\`\`
${errorList}
\`\`\`

### Files modified in this chunk

${fileList}

### Instructions

Fix these compilation errors. Do NOT add new functionality - only resolve the compilation issues.

After fixing:
1. Verify the code compiles
2. Commit the fix with message: "Fix: compile errors from ${chunkName}"
`;
}

/**
 * Spawn a fix worker to resolve compilation errors.
 */
export async function attemptFix(
  worktreePath: string,
  errors: CompileError[],
  modifiedFiles: string[],
  chunkName: string
): Promise<boolean> {
  const fixPrompt = buildFixPrompt(errors, modifiedFiles, chunkName);
  const fixPromptPath = join(worktreePath, 'FIX_REQUEST.md');

  await writeFile(fixPromptPath, fixPrompt, 'utf-8');

  // Spawn Claude Code to fix the errors
  try {
    // Use claude command with the fix prompt
    const result = await $`claude -p ${fixPrompt}`.cwd(worktreePath).quiet();
    console.log('Fix worker output:', result.text());
    return true;
  } catch (error) {
    console.error('Fix worker failed:', error);
    return false;
  }
}

/**
 * Validate with retry loop for self-healing.
 */
export async function validateWithRetry(
  worktreePath: string,
  modifiedFiles: string[],
  chunkName: string,
  config: PipelineConfig,
  scheme?: string
): Promise<{ result: CompileResult; attempts: number }> {
  let attempts = 0;
  let lastResult: CompileResult;

  do {
    attempts++;
    console.log(`Compile check attempt ${attempts}...`);

    lastResult = await validate(worktreePath, scheme);

    if (lastResult.success) {
      console.log('Compile check passed.');
      return { result: lastResult, attempts };
    }

    console.log(`Compile failed with ${lastResult.errors.length} errors.`);

    if (attempts >= config.maxCompileFixRetries) {
      console.log('Max fix retries reached.');
      break;
    }

    // Attempt to fix
    console.log('Spawning fix worker...');
    const fixed = await attemptFix(worktreePath, lastResult.errors, modifiedFiles, chunkName);

    if (!fixed) {
      console.log('Fix worker failed to complete.');
      break;
    }

    // Brief pause before retry
    await new Promise((resolve) => setTimeout(resolve, 1000));
  } while (attempts < config.maxCompileFixRetries);

  return { result: lastResult, attempts };
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Format compile result for display.
 */
export function formatCompileResult(result: CompileResult): string {
  if (result.success) {
    const warningText = result.warnings.length > 0
      ? ` (${result.warnings.length} warnings)`
      : '';
    return `Compilation successful${warningText} in ${result.duration}ms`;
  }

  let output = `Compilation failed with ${result.errors.length} error(s):\n`;

  for (const error of result.errors.slice(0, 10)) {
    if (error.file && error.line) {
      output += `\n  ${error.file}:${error.line}: ${error.message}`;
    } else {
      output += `\n  ${error.message}`;
    }
  }

  if (result.errors.length > 10) {
    output += `\n  ... and ${result.errors.length - 10} more errors`;
  }

  return output;
}

/**
 * Check if compile validation should be run for a chunk type.
 */
export function shouldValidateCompile(chunkType: string): boolean {
  // Only validate implementation chunks
  return chunkType === 'implementation';
}
