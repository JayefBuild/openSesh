import React from 'react';
import {
  FileText,
  FilePlus,
  Terminal,
  GitBranch,
  GitCommit,
  Search,
  Code,
  Shield,
  ShieldAlert,
  ShieldOff,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SkillDefinition, SkillRiskLevel } from '@/types/skills';

interface SkillCardProps {
  skill: SkillDefinition;
  enabled: boolean;
  requiresConfirmation?: boolean;
  onToggle: () => void;
  onToggleConfirmation?: () => void;
  compact?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}

// Icon mapping for skill categories
const categoryIcons: Record<string, React.ReactNode> = {
  file_read: <FileText className="h-4 w-4" />,
  file_write: <FilePlus className="h-4 w-4" />,
  terminal: <Terminal className="h-4 w-4" />,
  git_read: <GitBranch className="h-4 w-4" />,
  git_write: <GitCommit className="h-4 w-4" />,
  web_search: <Search className="h-4 w-4" />,
  code_generation: <Code className="h-4 w-4" />,
};

// Risk level colors and icons
const riskLevelConfig: Record<
  SkillRiskLevel,
  { color: string; bgColor: string; icon: React.ReactNode; label: string }
> = {
  safe: {
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
    icon: <Shield className="h-3 w-3" />,
    label: 'Safe',
  },
  moderate: {
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/10',
    icon: <ShieldAlert className="h-3 w-3" />,
    label: 'Moderate',
  },
  dangerous: {
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    icon: <ShieldOff className="h-3 w-3" />,
    label: 'Dangerous',
  },
};

export function SkillCard({
  skill,
  enabled,
  requiresConfirmation,
  onToggle,
  onToggleConfirmation,
  compact = false,
  disabled = false,
  disabledReason,
}: SkillCardProps) {
  const [expanded, setExpanded] = React.useState(false);
  const riskConfig = riskLevelConfig[skill.riskLevel];
  const icon = categoryIcons[skill.id] || <Code className="h-4 w-4" />;

  if (compact) {
    return (
      <button
        onClick={onToggle}
        disabled={disabled}
        title={disabled ? disabledReason : skill.description}
        className={cn(
          'flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors',
          enabled
            ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
            : 'bg-[#252525] text-[#666] border border-[#333] hover:border-[#444]',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        {icon}
        <span>{skill.name}</span>
      </button>
    );
  }

  return (
    <div
      className={cn(
        'rounded-lg border transition-colors',
        enabled
          ? 'bg-[#1a1a1a] border-[#333]'
          : 'bg-[#141414] border-[#252525]',
        disabled && 'opacity-50'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-3">
          {/* Icon */}
          <div
            className={cn(
              'p-2 rounded-md',
              enabled ? 'bg-[#252525]' : 'bg-[#1a1a1a]'
            )}
          >
            {icon}
          </div>

          {/* Info */}
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{skill.name}</span>
              <span
                className={cn(
                  'flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium',
                  riskConfig.color,
                  riskConfig.bgColor
                )}
              >
                {riskConfig.icon}
                {riskConfig.label}
              </span>
            </div>
            <p className="text-xs text-[#666] mt-0.5">{skill.description}</p>
          </div>
        </div>

        {/* Toggle */}
        <button
          onClick={onToggle}
          disabled={disabled}
          title={disabled ? disabledReason : undefined}
          className={cn(
            'relative w-10 h-5 rounded-full transition-colors',
            enabled ? 'bg-blue-500' : 'bg-[#333]',
            disabled && 'cursor-not-allowed'
          )}
        >
          <span
            className={cn(
              'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
              enabled ? 'translate-x-5' : 'translate-x-0.5'
            )}
          />
        </button>
      </div>

      {/* Expandable tools section */}
      {skill.tools.length > 0 && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-between px-3 py-2 border-t border-[#252525] text-xs text-[#666] hover:text-[#a0a0a0] transition-colors"
          >
            <span>{skill.tools.length} tools</span>
            {expanded ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </button>

          {expanded && (
            <div className="px-3 pb-3 space-y-1">
              {skill.tools.map((tool) => (
                <div
                  key={tool.name}
                  className="flex items-center justify-between py-1 text-xs"
                >
                  <code className="text-[#a0a0a0] font-mono">{tool.name}</code>
                  <span className="text-[#666]">{tool.description}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Confirmation toggle (for dangerous skills) */}
      {enabled && onToggleConfirmation && skill.riskLevel !== 'safe' && (
        <div className="flex items-center justify-between px-3 py-2 border-t border-[#252525]">
          <span className="text-xs text-[#666]">Require confirmation</span>
          <button
            onClick={onToggleConfirmation}
            className={cn(
              'relative w-8 h-4 rounded-full transition-colors',
              requiresConfirmation ? 'bg-yellow-500' : 'bg-[#333]'
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform',
                requiresConfirmation ? 'translate-x-4' : 'translate-x-0.5'
              )}
            />
          </button>
        </div>
      )}

      {/* Dependencies info */}
      {skill.dependencies && skill.dependencies.length > 0 && (
        <div className="px-3 pb-2 text-[10px] text-[#555]">
          Requires: {skill.dependencies.join(', ')}
        </div>
      )}
    </div>
  );
}
