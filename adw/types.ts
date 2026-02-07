/**
 * ADW Pipeline - Core Type Definitions
 */

// ============================================================================
// Configuration Types
// ============================================================================

export type Environment = 'api' | 'pro' | 'max5' | 'max20';

export interface PipelineConfig {
  /** Max tokens per chunk execution */
  chunkContextBudget: number;
  /** Target size for handoff documents (tokens) */
  handoffTargetSize: number;
  /** Maximum allowed handoff size (tokens) */
  handoffMaxSize: number;
  /** Worker should consider wrapping up (percentage) */
  contextWarningThreshold: number;
  /** Worker should start finishing (percentage) */
  contextCriticalThreshold: number;
  /** Worker must write HANDOFF.md immediately (percentage) */
  contextEmergencyThreshold: number;
  /** Max attempts to retry a failed chunk */
  maxChunkRetries: number;
  /** Max attempts to fix compile errors */
  maxCompileFixRetries: number;
  /** Environment profile */
  environment: Environment;
}

// ============================================================================
// Chunk Types
// ============================================================================

export type ChunkType =
  | 'setup'          // 00-setup: architecture, decisions, initial scaffolding
  | 'implementation' // 01a, 01b, 01c: actual implementation work
  | 'testing'        // 02a, 02b: unit/integration tests
  | 'review-fix'     // 03: PR review and fix issues
  | 'validation';    // 04: final validation

export type ChunkStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'skipped';

export interface Chunk {
  /** Unique chunk identifier (e.g., "00-META", "01-database") */
  id: string;
  /** Numeric ordering for execution (0, 1, 2, ...) */
  order: number;
  /** Human-readable name */
  name: string;
  /** Type of chunk for special handling */
  type: ChunkType;
  /** Chunk IDs this depends on */
  dependsOn: string[];
  /** Path to the chunk plan file */
  planPath: string;
  /** Estimated token budget for this chunk */
  estimatedTokens: number;
  /** Brief description of what this chunk does */
  description: string;
  /** Files this chunk is expected to create */
  expectedFiles?: string[];
  /** Files this chunk is expected to modify */
  expectedModifications?: string[];
}

// ============================================================================
// Handoff Types
// ============================================================================

export interface HandoffSection {
  /** Section heading */
  heading: string;
  /** Section content */
  content: string;
}

export interface Handoff {
  /** Source chunk ID */
  fromChunk: string;
  /** Target chunk ID */
  toChunk: string;
  /** What was completed */
  completedItems: string[];
  /** Files created with paths */
  filesCreated: string[];
  /** Files modified with paths */
  filesModified: string[];
  /** Key decisions made with rationale */
  decisions: Array<{
    decision: string;
    rationale: string;
    tradeoffs?: string;
  }>;
  /** Context for next chunk */
  contextForNext: string;
  /** Integration notes with code examples */
  integrationNotes: string;
  /** Remaining work (if any) */
  remainingWork?: string;
  /** Blockers or issues encountered */
  blockers?: string;
  /** Test status */
  testStatus?: string;
  /** Context usage metrics */
  contextUsage?: {
    finalPercent: number;
    peakPercent: number;
    finalTokens: number;
    peakTokens: number;
  };
  /** Raw markdown content */
  rawContent: string;
}

// ============================================================================
// State Types
// ============================================================================

export interface ChunkResult {
  chunkId: string;
  status: ChunkStatus;
  startTime: string;
  endTime?: string;
  handoffPath?: string;
  commitHash?: string;
  error?: string;
  compileAttempts?: number;
  retryCount?: number;
}

export interface PipelineState {
  /** Unique pipeline run ID */
  runId: string;
  /** Name of the plan being executed */
  planName: string;
  /** Path to original plan file */
  planPath: string;
  /** Path to the worktree */
  worktreePath: string;
  /** All chunks in this pipeline */
  chunks: Chunk[];
  /** Results for each chunk */
  results: Map<string, ChunkResult>;
  /** Current chunk being executed */
  currentChunkId?: string;
  /** Pipeline start time */
  startTime: string;
  /** Pipeline end time */
  endTime?: string;
  /** Overall pipeline status */
  status: 'initializing' | 'chunking' | 'executing' | 'completed' | 'failed';
  /** Pipeline configuration used */
  config: PipelineConfig;
}

/** Serializable version of PipelineState for JSON persistence */
export interface SerializedPipelineState {
  runId: string;
  planName: string;
  planPath: string;
  worktreePath: string;
  chunks: Chunk[];
  results: Array<[string, ChunkResult]>;
  currentChunkId?: string;
  startTime: string;
  endTime?: string;
  status: 'initializing' | 'chunking' | 'executing' | 'completed' | 'failed';
  config: PipelineConfig;
}

// ============================================================================
// Validation Types
// ============================================================================

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  severity: ValidationSeverity;
  code: string;
  message: string;
  location?: string;
  suggestion?: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

// ============================================================================
// Compile Validation Types
// ============================================================================

export interface CompileError {
  file: string;
  line?: number;
  column?: number;
  message: string;
  code?: string;
}

export interface CompileResult {
  success: boolean;
  errors: CompileError[];
  warnings: CompileError[];
  output: string;
  duration: number;
}

// ============================================================================
// Worker Types
// ============================================================================

export interface WorkerContext {
  /** META chunk content */
  metaContent: string;
  /** Prior handoff content (if any) */
  priorHandoff?: string;
  /** Current chunk plan content */
  chunkPlan: string;
  /** Context budget instructions */
  budgetInstructions: string;
}

export interface WorkerResult {
  /** Exit code of the worker process */
  exitCode: number;
  /** Whether HANDOFF.md was created */
  handoffCreated: boolean;
  /** Whether PROGRESS.md was updated */
  progressUpdated: boolean;
  /** Git commits made during execution */
  commits: string[];
}

// ============================================================================
// Report Types
// ============================================================================

export interface PipelineReport {
  runId: string;
  planName: string;
  status: 'completed' | 'failed' | 'partial';
  startTime: string;
  endTime: string;
  duration: string;
  chunks: Array<{
    id: string;
    name: string;
    status: ChunkStatus;
    duration?: string;
    commitHash?: string;
    error?: string;
  }>;
  summary: {
    totalChunks: number;
    completedChunks: number;
    failedChunks: number;
    skippedChunks: number;
  };
  gitHistory: string[];
  recommendations?: string[];
}
