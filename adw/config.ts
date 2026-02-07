/**
 * ADW Pipeline - Configuration Module
 *
 * Handles environment detection and configuration loading.
 * All critical parameters are configurable via environment variables.
 */

import type { PipelineConfig, Environment } from './types.ts';

// ============================================================================
// Default Configurations per Environment
// ============================================================================

const API_DEFAULTS: PipelineConfig = {
  chunkContextBudget: 80_000,
  handoffTargetSize: 5_000,
  handoffMaxSize: 10_000,
  contextWarningThreshold: 0.70,
  contextCriticalThreshold: 0.80,
  contextEmergencyThreshold: 0.85,
  maxChunkRetries: 3,
  maxCompileFixRetries: 3,
  environment: 'api',
};

const PRO_DEFAULTS: PipelineConfig = {
  chunkContextBudget: 40_000,
  handoffTargetSize: 2_000,
  handoffMaxSize: 4_000,
  contextWarningThreshold: 0.70,
  contextCriticalThreshold: 0.80,
  contextEmergencyThreshold: 0.85,
  maxChunkRetries: 3,
  maxCompileFixRetries: 3,
  environment: 'pro',
};

const MAX5_DEFAULTS: PipelineConfig = {
  chunkContextBudget: 100_000,
  handoffTargetSize: 6_000,
  handoffMaxSize: 12_000,
  contextWarningThreshold: 0.70,
  contextCriticalThreshold: 0.80,
  contextEmergencyThreshold: 0.85,
  maxChunkRetries: 3,
  maxCompileFixRetries: 3,
  environment: 'max5',
};

const MAX20_DEFAULTS: PipelineConfig = {
  chunkContextBudget: 150_000,
  handoffTargetSize: 8_000,
  handoffMaxSize: 15_000,
  contextWarningThreshold: 0.70,
  contextCriticalThreshold: 0.80,
  contextEmergencyThreshold: 0.85,
  maxChunkRetries: 3,
  maxCompileFixRetries: 3,
  environment: 'max20',
};

const ENVIRONMENT_CONFIGS: Record<Environment, PipelineConfig> = {
  api: API_DEFAULTS,
  pro: PRO_DEFAULTS,
  max5: MAX5_DEFAULTS,
  max20: MAX20_DEFAULTS,
};

// ============================================================================
// Environment Detection
// ============================================================================

/**
 * Detect the environment from CLAUDE_ENVIRONMENT variable.
 * Defaults to 'api' if not set or invalid.
 */
export function detectEnvironment(): Environment {
  const env = process.env['CLAUDE_ENVIRONMENT']?.toLowerCase();

  if (env && isValidEnvironment(env)) {
    return env;
  }

  return 'api';
}

function isValidEnvironment(value: string): value is Environment {
  return ['api', 'pro', 'max5', 'max20'].includes(value);
}

/**
 * Get the default configuration for the detected environment.
 */
export function detectConfig(): PipelineConfig {
  const env = detectEnvironment();
  return { ...ENVIRONMENT_CONFIGS[env] };
}

// ============================================================================
// Configuration Loading
// ============================================================================

/**
 * Parse an integer from an environment variable, with fallback.
 */
function parseIntEnv(key: string, fallback: number): number {
  const value = process.env[key];
  if (value === undefined) return fallback;

  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

/**
 * Parse a float from an environment variable, with fallback.
 */
function parseFloatEnv(key: string, fallback: number): number {
  const value = process.env[key];
  if (value === undefined) return fallback;

  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

/**
 * Load the full pipeline configuration.
 *
 * 1. Detects environment from CLAUDE_ENVIRONMENT
 * 2. Loads environment-specific defaults
 * 3. Applies any environment variable overrides
 */
export function loadConfig(): PipelineConfig {
  const base = detectConfig();

  return {
    chunkContextBudget: parseIntEnv('CHUNK_CONTEXT_BUDGET', base.chunkContextBudget),
    handoffTargetSize: parseIntEnv('HANDOFF_TARGET_SIZE', base.handoffTargetSize),
    handoffMaxSize: parseIntEnv('HANDOFF_MAX_SIZE', base.handoffMaxSize),
    contextWarningThreshold: parseFloatEnv('CONTEXT_WARNING_THRESHOLD', base.contextWarningThreshold),
    contextCriticalThreshold: parseFloatEnv('CONTEXT_CRITICAL_THRESHOLD', base.contextCriticalThreshold),
    contextEmergencyThreshold: parseFloatEnv('CONTEXT_EMERGENCY_THRESHOLD', base.contextEmergencyThreshold),
    maxChunkRetries: parseIntEnv('MAX_CHUNK_RETRIES', base.maxChunkRetries),
    maxCompileFixRetries: parseIntEnv('MAX_COMPILE_FIX_RETRIES', base.maxCompileFixRetries),
    environment: detectEnvironment(),
  };
}

// ============================================================================
// Configuration Utilities
// ============================================================================

/**
 * Calculate the target chunk size based on context budget.
 * Chunks should target 60-70% of the context budget.
 */
export function getTargetChunkSize(config: PipelineConfig): { min: number; max: number; target: number } {
  return {
    min: Math.floor(config.chunkContextBudget * 0.50),
    target: Math.floor(config.chunkContextBudget * 0.65),
    max: Math.floor(config.chunkContextBudget * 0.70),
  };
}

/**
 * Calculate context thresholds in absolute token counts.
 */
export function getContextThresholds(config: PipelineConfig): {
  warning: number;
  critical: number;
  emergency: number;
} {
  return {
    warning: Math.floor(config.chunkContextBudget * config.contextWarningThreshold),
    critical: Math.floor(config.chunkContextBudget * config.contextCriticalThreshold),
    emergency: Math.floor(config.chunkContextBudget * config.contextEmergencyThreshold),
  };
}

/**
 * Format configuration for display/logging.
 */
export function formatConfig(config: PipelineConfig): string {
  const thresholds = getContextThresholds(config);
  const chunkSizes = getTargetChunkSize(config);

  return `
Pipeline Configuration (${config.environment})
${'='.repeat(50)}

Context Budget:
  - Chunk Budget:     ${config.chunkContextBudget.toLocaleString()} tokens
  - Target Chunk:     ${chunkSizes.target.toLocaleString()} tokens (65%)
  - Max Chunk:        ${chunkSizes.max.toLocaleString()} tokens (70%)

Handoff Sizing:
  - Target Size:      ${config.handoffTargetSize.toLocaleString()} tokens
  - Max Size:         ${config.handoffMaxSize.toLocaleString()} tokens

Context Thresholds:
  - Warning (70%):    ${thresholds.warning.toLocaleString()} tokens
  - Critical (80%):   ${thresholds.critical.toLocaleString()} tokens
  - Emergency (85%):  ${thresholds.emergency.toLocaleString()} tokens

Retry Limits:
  - Chunk Retries:    ${config.maxChunkRetries}
  - Compile Retries:  ${config.maxCompileFixRetries}
`.trim();
}
