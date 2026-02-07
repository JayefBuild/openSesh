/**
 * ADW Pipeline - Deterministic Plan Chunker
 *
 * Splits plans at section boundaries WITHOUT rewriting content.
 * The concatenation of all chunks equals the original plan (lossless).
 *
 * Phase Structure:
 * - 00-setup: Architecture, decisions, initial scaffolding
 * - 01-implementation: All implementation work (sub-chunks: 01a, 01b, 01c...)
 * - 02-testing: Unit/integration tests
 * - 03-review-fix: PR review and fix issues
 * - 04-validation: Final validation
 *
 * Strategy:
 * - Everything before implementation sections goes into 00-setup
 * - Split on "Implementation Changes", "Implementation Phases" subsections
 * - Each h4 subsection becomes 01a, 01b, 01c, etc.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  Chunk,
  ChunkType,
  ValidationResult,
  ValidationIssue,
  PipelineConfig,
} from './types.ts';
import { getTargetChunkSize } from './config.ts';

// ============================================================================
// Section Detection
// ============================================================================

/**
 * Headers that mark the START of implementation subsections to be chunked.
 * We split on h3 sections that EXACTLY match these patterns.
 *
 * NOTE: "Implementation Details" is NOT included because it typically contains
 * code examples/reference material, not separate work phases.
 */
const IMPLEMENTATION_CONTAINER_PATTERNS = [
  'implementation changes',
  'implementation phases',
];

/**
 * Check if a section title matches an implementation container pattern
 */
function isImplementationContainer(title: string): boolean {
  const normalized = title.toLowerCase().trim();
  return IMPLEMENTATION_CONTAINER_PATTERNS.some((pattern) => normalized.includes(pattern));
}

// ============================================================================
// Token Estimation
// ============================================================================

/**
 * Rough token estimation (4 chars per token average).
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ============================================================================
// Chunking Logic
// ============================================================================

interface ChunkContent {
  id: string;
  name: string;
  type: ChunkType;
  content: string;
  order: number;
  dependsOn: string[];
}

interface ImplementationSection {
  title: string;
  startLine: number;
  endLine: number;
}

/**
 * Find implementation subsections (h4 level) within implementation container sections.
 *
 * Looks for patterns like:
 * - ### Implementation Changes
 *   #### 1. StatusBarController.swift
 *   #### 2. FloatingWaveformWindow.swift
 *
 * - ### Implementation Phases
 *   #### Phase 1: Core Menu Enhancement
 *   #### Phase 2: Utility Features
 *
 * Sections terminate at:
 * - Next h4 header (sibling section)
 * - Next h3 header (exits container)
 * - Next h2 header (exits parent)
 * - End of file
 */
function findImplementationSections(lines: string[]): ImplementationSection[] {
  const sections: ImplementationSection[] = [];
  let inImplementationContainer = false;
  let currentSection: ImplementationSection | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';

    // Check for h2 - exits any implementation container
    if (line.match(/^##\s+/)) {
      inImplementationContainer = false;
      // Close any open section
      if (currentSection) {
        currentSection.endLine = i;
        sections.push(currentSection);
        currentSection = null;
      }
      continue;
    }

    // Check for h3 - may enter or exit implementation container
    const h3Match = line.match(/^###\s+(.+)$/);
    if (h3Match) {
      // Close any open section first (h3 terminates h4 sections)
      if (currentSection) {
        currentSection.endLine = i;
        sections.push(currentSection);
        currentSection = null;
      }

      const title = h3Match[1]?.trim() ?? '';
      inImplementationContainer = isImplementationContainer(title);
      continue;
    }

    // Only look for h4 sections when inside an implementation container
    if (!inImplementationContainer) continue;

    // Check for h4 implementation subsection (#### 1. File.swift, #### Phase 1, etc.)
    const h4Match = line.match(/^####\s+(.+)$/);
    if (h4Match) {
      // Close previous section if open
      if (currentSection) {
        currentSection.endLine = i;
        sections.push(currentSection);
      }

      currentSection = {
        title: h4Match[1]?.trim() ?? '',
        startLine: i,
        endLine: lines.length, // Will be updated when next section found
      };
    }
  }

  // Close final section
  if (currentSection) {
    sections.push(currentSection);
  }

  return sections;
}

/**
 * Split a plan into chunks deterministically.
 *
 * Strategy:
 * 1. Find all h4 implementation subsections within implementation containers
 * 2. If no implementation subsections found, entire plan is META
 * 3. If found, everything EXCEPT those subsections goes into META
 * 4. Each implementation subsection becomes its own chunk
 */
function splitPlanIntoChunks(
  planContent: string,
  _config: PipelineConfig
): ChunkContent[] {
  const lines = planContent.split('\n');
  const implSections = findImplementationSections(lines);

  // If no implementation sections, entire plan is setup
  if (implSections.length === 0) {
    return [{
      id: '00-setup',
      name: 'Setup & Architecture',
      type: 'setup',
      content: planContent.trim(),
      order: 0,
      dependsOn: [],
    }];
  }

  const chunks: ChunkContent[] = [];

  // Build META: everything except implementation sections
  const metaLines: string[] = [];
  let skipUntilLine = -1;

  for (let i = 0; i < lines.length; i++) {
    // Check if we're in an implementation section to skip
    const inImplSection = implSections.some(
      (section) => i >= section.startLine && i < section.endLine
    );

    if (!inImplSection) {
      metaLines.push(lines[i] ?? '');
    }
  }

  // Clean up setup content
  // 1. Remove consecutive blank lines > 2
  // 2. Remove empty container headers (### Implementation Phases/Changes with no content before next ##)
  const setupContent = metaLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    // Remove empty implementation container headers (### header followed by ## or end)
    .replace(/###\s+Implementation\s+(Phases|Changes)\s*\n+(?=##|$)/gi, '')
    .trim();

  chunks.push({
    id: '00-setup',
    name: 'Setup & Architecture',
    type: 'setup',
    content: setupContent,
    order: 0,
    dependsOn: [],
  });

  // Build implementation chunks with letter suffixes (01a, 01b, 01c, ...)
  for (let i = 0; i < implSections.length; i++) {
    const section = implSections[i];
    if (!section) continue;

    const sectionContent = lines.slice(section.startLine, section.endLine).join('\n').trim();
    const letter = String.fromCharCode(97 + i); // 'a', 'b', 'c', ...
    const chunkId = `01${letter}-${slugify(section.title)}`;

    chunks.push({
      id: chunkId,
      name: section.title,
      type: 'implementation',
      content: sectionContent,
      order: i + 1,
      dependsOn: i === 0 ? ['00-setup'] : [chunks[chunks.length - 1]?.id ?? '00-setup'],
    });
  }

  return chunks;
}

/**
 * Create a URL-friendly slug from a title.
 */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30);
}

// ============================================================================
// Chunk Validation
// ============================================================================

/**
 * Validate chunks for correctness and constraints.
 */
export function validateChunks(chunks: Chunk[], config: PipelineConfig): ValidationResult {
  const issues: ValidationIssue[] = [];
  const chunkSizes = getTargetChunkSize(config);

  // Check for 00-setup first
  const setupChunk = chunks.find((c) => c.id === '00-setup');
  if (!setupChunk) {
    issues.push({
      severity: 'error',
      code: 'MISSING_SETUP',
      message: 'Missing 00-setup chunk',
      suggestion: 'Ensure the plan has recognizable setup sections (Overview, Problem Statement, etc.)',
    });
  } else if (setupChunk.order !== 0) {
    issues.push({
      severity: 'error',
      code: 'SETUP_NOT_FIRST',
      message: `00-setup has order ${setupChunk.order}, should be 0`,
    });
  }

  // Check token budgets
  for (const chunk of chunks) {
    if (chunk.estimatedTokens > chunkSizes.max) {
      issues.push({
        severity: 'warning',
        code: 'CHUNK_LARGE',
        message: `Chunk ${chunk.id} estimated at ${chunk.estimatedTokens.toLocaleString()} tokens, exceeds target of ${chunkSizes.max.toLocaleString()}`,
        location: chunk.id,
        suggestion: 'Consider breaking this section into smaller phases in your plan',
      });
    }
  }

  // Check for missing dependencies
  const chunkIds = new Set(chunks.map((c) => c.id));
  for (const chunk of chunks) {
    for (const dep of chunk.dependsOn) {
      if (!chunkIds.has(dep)) {
        issues.push({
          severity: 'error',
          code: 'MISSING_DEPENDENCY',
          message: `Chunk ${chunk.id} depends on non-existent chunk: ${dep}`,
          location: chunk.id,
        });
      }
    }
  }

  // Check for at least one implementation chunk
  const implChunks = chunks.filter((c) => c.type === 'implementation');
  if (implChunks.length === 0) {
    issues.push({
      severity: 'warning',
      code: 'NO_IMPLEMENTATION',
      message: 'No implementation chunks found',
      suggestion: 'Ensure the plan has a "Technical Approach" or "Implementation" section',
    });
  }

  const hasErrors = issues.some((i) => i.severity === 'error');

  return {
    valid: !hasErrors,
    issues,
  };
}

// ============================================================================
// Chunk Writing
// ============================================================================

/**
 * Write chunk plans to disk.
 */
export async function writeChunks(
  chunkContents: ChunkContent[],
  outputDir: string
): Promise<Chunk[]> {
  await mkdir(outputDir, { recursive: true });

  const chunks: Chunk[] = [];

  for (const cc of chunkContents) {
    const filename = `${cc.id}.md`;
    const planPath = join(outputDir, filename);

    await writeFile(planPath, cc.content, 'utf-8');

    chunks.push({
      id: cc.id,
      order: cc.order,
      name: cc.name,
      type: cc.type,
      dependsOn: cc.dependsOn,
      planPath,
      estimatedTokens: estimateTokens(cc.content),
      description: cc.name,
    });
  }

  return chunks;
}

// ============================================================================
// Main Chunking Functions
// ============================================================================

/**
 * Chunk a plan deterministically (no LLM call).
 */
export async function chunkPlan(
  planPath: string,
  config: PipelineConfig
): Promise<{ chunks: Chunk[]; plans: Map<string, string>; validation: ValidationResult }> {
  const planContent = await readFile(planPath, 'utf-8');

  console.log('Parsing plan structure...');
  const chunkContents = splitPlanIntoChunks(planContent, config);

  console.log(`Found ${chunkContents.length} chunks`);

  // Convert to Chunk objects for validation
  const chunks: Chunk[] = chunkContents.map((cc) => ({
    id: cc.id,
    order: cc.order,
    name: cc.name,
    type: cc.type,
    dependsOn: cc.dependsOn,
    planPath: '',
    estimatedTokens: estimateTokens(cc.content),
    description: cc.name,
  }));

  // Build plans map
  const plans = new Map<string, string>();
  for (const cc of chunkContents) {
    plans.set(cc.id, cc.content);
  }

  const validation = validateChunks(chunks, config);

  return { chunks, plans, validation };
}

/**
 * Chunk a plan with automatic validation (no retry needed - deterministic).
 */
export async function chunkPlanWithRetry(
  planPath: string,
  outputDir: string,
  config: PipelineConfig,
  _maxRetries: number = 2  // Unused - kept for API compatibility
): Promise<{ chunks: Chunk[]; validation: ValidationResult }> {
  const { chunks: parsedChunks, plans, validation } = await chunkPlan(planPath, config);

  // Write chunks to disk
  const chunkContents: ChunkContent[] = [];
  for (const chunk of parsedChunks) {
    const content = plans.get(chunk.id);
    if (content) {
      chunkContents.push({
        id: chunk.id,
        name: chunk.name,
        type: chunk.type,
        content,
        order: chunk.order,
        dependsOn: chunk.dependsOn,
      });
    }
  }

  const chunks = await writeChunks(chunkContents, outputDir);

  return {
    chunks,
    validation,
  };
}

/**
 * Format validation result for display.
 */
export function formatValidation(validation: ValidationResult): string {
  if (validation.valid && validation.issues.length === 0) {
    return 'Validation passed with no issues.';
  }

  let output = validation.valid ? 'Validation passed with warnings:\n' : 'Validation failed:\n';

  for (const issue of validation.issues) {
    const icon = issue.severity === 'error' ? '[ERROR]' : issue.severity === 'warning' ? '[WARN]' : '[INFO]';
    output += `\n${icon} ${issue.code}: ${issue.message}`;
    if (issue.location) {
      output += `\n       Location: ${issue.location}`;
    }
    if (issue.suggestion) {
      output += `\n       Suggestion: ${issue.suggestion}`;
    }
  }

  return output;
}
