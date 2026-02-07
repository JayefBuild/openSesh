/**
 * ADW Pipeline - Handoff Validator
 *
 * Validates handoff documents for completeness and quality.
 * Can recover handoffs from PROGRESS.md and git history if needed.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';
import type {
  Handoff,
  ValidationResult,
  ValidationIssue,
  PipelineConfig,
} from './types.ts';
import { getPipelineDir } from './state.ts';

// ============================================================================
// Required Handoff Sections
// ============================================================================

const REQUIRED_SECTIONS = [
  'What I Completed',
  'Files Created',
  'Files Modified',
  'Key Decisions Made',
  'Context for Next Chunk',
  'Integration Notes',
] as const;

const OPTIONAL_SECTIONS = [
  'Remaining Work',
  'Blockers',
  'Tests Status',
  'Context Usage',
] as const;

// ============================================================================
// Handoff Parsing
// ============================================================================

/**
 * Parse a handoff document into structured data.
 */
export function parseHandoff(content: string, fromChunk: string, toChunk: string): Handoff {
  const sections = extractSections(content);

  return {
    fromChunk,
    toChunk,
    completedItems: parseList(sections.get('What I Completed') ?? ''),
    filesCreated: parseList(sections.get('Files Created') ?? ''),
    filesModified: parseList(sections.get('Files Modified') ?? ''),
    decisions: parseDecisions(sections.get('Key Decisions Made') ?? ''),
    contextForNext: sections.get('Context for Next Chunk') ?? '',
    integrationNotes: sections.get('Integration Notes') ?? '',
    remainingWork: sections.get('Remaining Work'),
    blockers: sections.get('Blockers'),
    testStatus: sections.get('Tests Status'),
    contextUsage: parseContextUsage(sections.get('Context Usage') ?? ''),
    rawContent: content,
  };
}

/**
 * Extract sections from markdown content.
 */
function extractSections(content: string): Map<string, string> {
  const sections = new Map<string, string>();
  const lines = content.split('\n');

  let currentSection = '';
  let currentContent: string[] = [];

  for (const line of lines) {
    // Check for section header (## or ###)
    const headerMatch = line.match(/^#{2,3}\s+(.+)$/);

    if (headerMatch) {
      // Save previous section
      if (currentSection) {
        sections.set(currentSection, currentContent.join('\n').trim());
      }

      currentSection = normalizeHeader(headerMatch[1] ?? '');
      currentContent = [];
    } else if (currentSection) {
      currentContent.push(line);
    }
  }

  // Save last section
  if (currentSection) {
    sections.set(currentSection, currentContent.join('\n').trim());
  }

  return sections;
}

/**
 * Normalize section headers for matching.
 */
function normalizeHeader(header: string): string {
  // Remove common prefixes/suffixes and normalize
  return header
    .replace(/^\d+\.\s*/, '') // Remove numbering
    .replace(/\s*\([^)]*\)$/, '') // Remove parenthetical notes
    .trim();
}

/**
 * Parse a list section into an array of items.
 */
function parseList(content: string): string[] {
  const items: string[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    // Match list items (-, *, or numbered)
    const match = line.match(/^[\s]*[-*]\s+(.+)$/) || line.match(/^\d+\.\s+(.+)$/);
    if (match && match[1]) {
      // Remove checkbox markers
      const item = match[1].replace(/^\[[ x]\]\s*/, '').trim();
      if (item) {
        items.push(item);
      }
    }
  }

  return items;
}

/**
 * Parse decisions section into structured format.
 */
function parseDecisions(content: string): Handoff['decisions'] {
  const decisions: Handoff['decisions'] = [];
  const lines = content.split('\n');

  let currentDecision: { decision: string; rationale: string; tradeoffs?: string } | null = null;
  let currentField: 'decision' | 'rationale' | 'tradeoffs' = 'decision';

  for (const line of lines) {
    // Check for decision header (### or ####)
    const headerMatch = line.match(/^#{3,4}\s+(?:\d+\.\s*)?(.+)$/);

    if (headerMatch) {
      // Save previous decision
      if (currentDecision) {
        decisions.push(currentDecision);
      }

      currentDecision = {
        decision: headerMatch[1]?.trim() ?? '',
        rationale: '',
        tradeoffs: undefined,
      };
      currentField = 'decision';
      continue;
    }

    if (!currentDecision) continue;

    // Check for field markers
    if (line.match(/^\*\*Decision:?\*\*/i)) {
      currentField = 'decision';
      const value = line.replace(/^\*\*Decision:?\*\*\s*/i, '').trim();
      if (value) currentDecision.decision = value;
      continue;
    }

    if (line.match(/^\*\*Rationale:?\*\*/i)) {
      currentField = 'rationale';
      const value = line.replace(/^\*\*Rationale:?\*\*\s*/i, '').trim();
      if (value) currentDecision.rationale = value;
      continue;
    }

    if (line.match(/^\*\*Trade-?off:?\*\*/i)) {
      currentField = 'tradeoffs';
      const value = line.replace(/^\*\*Trade-?off:?\*\*\s*/i, '').trim();
      if (value) currentDecision.tradeoffs = value;
      continue;
    }

    // Append content to current field
    const trimmed = line.trim();
    if (trimmed && currentField === 'rationale') {
      currentDecision.rationale += (currentDecision.rationale ? ' ' : '') + trimmed;
    } else if (trimmed && currentField === 'tradeoffs') {
      currentDecision.tradeoffs = (currentDecision.tradeoffs ?? '') + (currentDecision.tradeoffs ? ' ' : '') + trimmed;
    }
  }

  // Save last decision
  if (currentDecision) {
    decisions.push(currentDecision);
  }

  return decisions;
}

/**
 * Parse context usage metrics.
 */
function parseContextUsage(content: string): Handoff['contextUsage'] | undefined {
  const finalMatch = content.match(/Final[:\s]+(\d+)%?\s*(?:\((\d+)k?\s*tokens?\))?/i);
  const peakMatch = content.match(/Peak[:\s]+(\d+)%?\s*(?:\((\d+)k?\s*tokens?\))?/i);

  if (!finalMatch && !peakMatch) {
    return undefined;
  }

  return {
    finalPercent: finalMatch ? parseInt(finalMatch[1] ?? '0', 10) : 0,
    peakPercent: peakMatch ? parseInt(peakMatch[1] ?? '0', 10) : 0,
    finalTokens: finalMatch?.[2] ? parseInt(finalMatch[2], 10) * 1000 : 0,
    peakTokens: peakMatch?.[2] ? parseInt(peakMatch[2], 10) * 1000 : 0,
  };
}

// ============================================================================
// Handoff Validation
// ============================================================================

/**
 * Validate a handoff file exists and has required content.
 */
export async function validate(
  handoffPath: string,
  fromChunk: string,
  toChunk: string,
  config: PipelineConfig
): Promise<{ result: ValidationResult; handoff?: Handoff }> {
  const issues: ValidationIssue[] = [];

  // Try to read the file
  let content: string;
  try {
    content = await readFile(handoffPath, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      issues.push({
        severity: 'error',
        code: 'HANDOFF_MISSING',
        message: `HANDOFF.md not found at ${handoffPath}`,
        suggestion: 'Worker should create HANDOFF.md before exiting',
      });
      return { result: { valid: false, issues } };
    }
    throw error;
  }

  // Check for empty content
  if (!content.trim()) {
    issues.push({
      severity: 'error',
      code: 'HANDOFF_EMPTY',
      message: 'HANDOFF.md is empty',
      suggestion: 'Worker should populate HANDOFF.md with required sections',
    });
    return { result: { valid: false, issues } };
  }

  // Parse the handoff
  const handoff = parseHandoff(content, fromChunk, toChunk);

  // Validate required sections
  const sections = extractSections(content);

  for (const required of REQUIRED_SECTIONS) {
    const found = Array.from(sections.keys()).some(
      (key) => key.toLowerCase().includes(required.toLowerCase())
    );

    if (!found) {
      issues.push({
        severity: 'error',
        code: 'MISSING_SECTION',
        message: `Missing required section: "${required}"`,
        suggestion: `Add a "## ${required}" section to the handoff`,
      });
    }
  }

  // Validate content quality
  if (handoff.completedItems.length === 0) {
    issues.push({
      severity: 'warning',
      code: 'NO_COMPLETED_ITEMS',
      message: 'No completed items listed',
      suggestion: 'List at least 3 completed items with checkmarks',
    });
  }

  if (handoff.filesCreated.length === 0 && handoff.filesModified.length === 0) {
    issues.push({
      severity: 'warning',
      code: 'NO_FILES_LISTED',
      message: 'No files created or modified listed',
      suggestion: 'List all files that were created or modified',
    });
  }

  if (handoff.decisions.length === 0) {
    issues.push({
      severity: 'warning',
      code: 'NO_DECISIONS',
      message: 'No key decisions documented',
      suggestion: 'Document at least 2-3 key decisions with rationale',
    });
  }

  if (handoff.contextForNext.length < 200) {
    issues.push({
      severity: 'warning',
      code: 'THIN_CONTEXT',
      message: 'Context for next chunk is minimal',
      suggestion: 'Provide at least 500 words of context for the next worker',
    });
  }

  if (handoff.integrationNotes.length < 100) {
    issues.push({
      severity: 'warning',
      code: 'THIN_INTEGRATION',
      message: 'Integration notes are minimal',
      suggestion: 'Include concrete code examples showing how to use prior work',
    });
  }

  // Check handoff size
  const tokenEstimate = Math.ceil(content.length / 4);

  if (tokenEstimate > config.handoffMaxSize) {
    issues.push({
      severity: 'warning',
      code: 'HANDOFF_TOO_LARGE',
      message: `Handoff is ~${tokenEstimate.toLocaleString()} tokens, exceeds max of ${config.handoffMaxSize.toLocaleString()}`,
      suggestion: 'Trim the handoff to essential information only',
    });
  }

  const hasErrors = issues.some((i) => i.severity === 'error');

  return {
    result: { valid: !hasErrors, issues },
    handoff: hasErrors ? undefined : handoff,
  };
}

/**
 * Validate handoff content (already loaded).
 */
export function validateContent(
  handoff: Handoff,
  config: PipelineConfig
): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (handoff.completedItems.length === 0) {
    issues.push({
      severity: 'warning',
      code: 'NO_COMPLETED_ITEMS',
      message: 'No completed items listed',
    });
  }

  if (handoff.decisions.length === 0) {
    issues.push({
      severity: 'warning',
      code: 'NO_DECISIONS',
      message: 'No key decisions documented',
    });
  }

  // Check for decisions without rationale
  for (const decision of handoff.decisions) {
    if (!decision.rationale || decision.rationale.length < 20) {
      issues.push({
        severity: 'warning',
        code: 'DECISION_NO_RATIONALE',
        message: `Decision "${decision.decision}" lacks rationale`,
      });
    }
  }

  return {
    valid: !issues.some((i) => i.severity === 'error'),
    issues,
  };
}

// ============================================================================
// Handoff Recovery
// ============================================================================

/**
 * Files/directories to exclude from recovered handoffs.
 * These are typically not relevant to the chunk's work.
 */
const RECOVERY_FILE_EXCLUDES = [
  // Pipeline artifacts
  '.pipeline/',
  'CONTEXT.md',
  'CHUNK_PLAN.md',
  'PROGRESS.md',
  'HANDOFF.md',
  'plan.md',
  // IDE/editor
  '.claude/',
  '.vscode/',
  '.idea/',
  // Build artifacts
  '.build/',
  'node_modules/',
  // Screenshots/media from other tools
  '.playwright-mcp/',
  // Other plans (not this chunk's work)
  'plans/',
  // Archive/temp
  'archive/',
  'to-remove/',
  'todos/',
];

/**
 * Check if a file path should be excluded from recovery.
 */
function shouldExcludeFile(filePath: string): boolean {
  return RECOVERY_FILE_EXCLUDES.some((exclude) => filePath.startsWith(exclude));
}

/**
 * Attempt to recover a handoff from PROGRESS.md and git history.
 */
export async function recoverHandoff(
  worktreePath: string,
  fromChunk: string,
  toChunk: string
): Promise<Handoff | null> {
  // PROGRESS.md is in .pipeline/
  const progressPath = join(getPipelineDir(worktreePath), 'PROGRESS.md');

  // Read PROGRESS.md
  let progressContent = '';
  try {
    progressContent = await readFile(progressPath, 'utf-8');
  } catch {
    // PROGRESS.md doesn't exist
  }

  // Get git diff for recent changes
  let gitDiff = '';
  let gitLog = '';

  try {
    const diffResult = await $`git -C ${worktreePath} diff HEAD~5..HEAD --name-status`.quiet();
    gitDiff = diffResult.text();
  } catch {
    // Git diff failed
  }

  try {
    const logResult = await $`git -C ${worktreePath} log --oneline -10`.quiet();
    gitLog = logResult.text();
  } catch {
    // Git log failed
  }

  // If we have nothing, can't recover
  if (!progressContent && !gitDiff && !gitLog) {
    return null;
  }

  // Parse files from git diff, filtering out irrelevant files
  const filesCreated: string[] = [];
  const filesModified: string[] = [];

  for (const line of gitDiff.split('\n')) {
    const match = line.match(/^([AMD])\s+(.+)$/);
    if (match) {
      const [, status, file] = match;
      if (!file || shouldExcludeFile(file)) {
        continue;
      }
      if (status === 'A') {
        filesCreated.push(file);
      } else if (status === 'M' || status === 'D') {
        filesModified.push(file);
      }
    }
  }

  // Parse completed items from progress log
  const completedItems: string[] = [];
  const progressLines = progressContent.split('\n');

  for (const line of progressLines) {
    const match = line.match(/^[-*]\s+(.+)$/);
    if (match && match[1]) {
      completedItems.push(match[1]);
    }
  }

  // Build a minimal recovery handoff
  const recoveredContent = `# Recovered Handoff from Chunk: ${fromChunk}

> **Note:** This handoff was automatically recovered from PROGRESS.md and git history
> because the worker did not create a proper HANDOFF.md.

## What I Completed

${completedItems.map((item) => `- ${item}`).join('\n') || '- (Unable to determine from progress log)'}

## Files Created

${filesCreated.map((file) => `- ${file}`).join('\n') || '- None detected'}

## Files Modified

${filesModified.map((file) => `- ${file}`).join('\n') || '- None detected'}

## Key Decisions Made

- (Unable to recover decisions - review git history)

## Context for Next Chunk

This handoff was recovered automatically. The next worker should:
1. Review the git log for recent commits
2. Examine the files listed above
3. Understand the work that was done

Git commit history:
\`\`\`
${gitLog || '(No recent commits)'}
\`\`\`

## Integration Notes

Review the modified files directly for integration patterns.

## Remaining Work

Unknown - the previous chunk may not have completed fully.
`;

  return {
    fromChunk,
    toChunk,
    completedItems,
    filesCreated,
    filesModified,
    decisions: [],
    contextForNext: 'This handoff was recovered automatically. Review git history for details.',
    integrationNotes: 'Review modified files directly.',
    remainingWork: 'Unknown - previous chunk may not have completed.',
    rawContent: recoveredContent,
  };
}

/**
 * Format validation result for display.
 */
export function formatHandoffValidation(result: ValidationResult): string {
  if (result.valid && result.issues.length === 0) {
    return 'Handoff validation passed.';
  }

  let output = result.valid ? 'Handoff validation passed with warnings:\n' : 'Handoff validation failed:\n';

  for (const issue of result.issues) {
    const icon = issue.severity === 'error' ? '[ERROR]' : '[WARN]';
    output += `\n${icon} ${issue.code}: ${issue.message}`;
    if (issue.suggestion) {
      output += `\n       ${issue.suggestion}`;
    }
  }

  return output;
}
