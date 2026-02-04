// Skills Type Definitions
// Skills represent capabilities that the AI can use

/**
 * Risk level for a skill
 * - safe: No destructive operations, read-only or non-impactful
 * - moderate: Can modify files or state but within bounds
 * - dangerous: Can execute arbitrary commands or have wide-ranging effects
 */
export type SkillRiskLevel = 'safe' | 'moderate' | 'dangerous';

/**
 * Skill category for grouping in UI
 */
export type SkillCategory = 'file' | 'terminal' | 'git' | 'web' | 'code';

/**
 * The tools that belong to a skill
 */
export interface SkillTool {
  name: string;
  description: string;
}

/**
 * A skill definition - static metadata about a skill
 */
export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  category: SkillCategory;
  riskLevel: SkillRiskLevel;
  tools: SkillTool[];
  icon?: string;
  // Skills that this skill depends on
  dependencies?: string[];
}

/**
 * A skill's state - whether it's enabled, etc.
 */
export interface SkillState {
  skillId: string;
  enabled: boolean;
}

/**
 * Thread-specific skill configuration
 */
export interface ThreadSkillConfig {
  threadId: string;
  // Skill IDs that are enabled for this thread (overrides defaults)
  enabledSkillIds: string[];
  // If true, use the thread-specific config; if false, use defaults
  useCustomConfig: boolean;
}

/**
 * Global skill settings
 */
export interface GlobalSkillSettings {
  // Default skills enabled for new threads
  defaultEnabledSkillIds: string[];
  // Skills that require confirmation before execution
  requireConfirmationSkillIds: string[];
}
