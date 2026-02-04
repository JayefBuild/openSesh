import React, { useState } from 'react';
import {
  FileText,
  FilePlus,
  Terminal,
  GitBranch,
  GitCommit,
  Search,
  Code,
  Shield,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSkillStore } from '@/stores/skillStore';
import { SkillsPanel } from './SkillsPanel';

interface SkillBadgesProps {
  threadId: string;
  className?: string;
  maxVisible?: number;
}

// Icon mapping for skills
const skillIcons: Record<string, React.ReactNode> = {
  file_read: <FileText className="h-3 w-3" />,
  file_write: <FilePlus className="h-3 w-3" />,
  terminal: <Terminal className="h-3 w-3" />,
  git_read: <GitBranch className="h-3 w-3" />,
  git_write: <GitCommit className="h-3 w-3" />,
  web_search: <Search className="h-3 w-3" />,
  code_generation: <Code className="h-3 w-3" />,
};

// Risk level colors
const riskColors: Record<string, string> = {
  safe: 'bg-green-500/10 text-green-400 border-green-500/30',
  moderate: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  dangerous: 'bg-red-500/10 text-red-400 border-red-500/30',
};

export function SkillBadges({
  threadId,
  className,
  maxVisible = 4,
}: SkillBadgesProps) {
  const [showPanel, setShowPanel] = useState(false);
  const { getEnabledSkillsForThread } = useSkillStore();

  const enabledSkills = getEnabledSkillsForThread(threadId);

  const visibleSkills = enabledSkills.slice(0, maxVisible);
  const hiddenCount = enabledSkills.length - maxVisible;

  return (
    <div className={cn('relative', className)}>
      <div className="flex items-center gap-1">
        {/* Skill icon badges */}
        {visibleSkills.map((skill) => (
          <div
            key={skill.id}
            title={skill.name}
            className={cn(
              'flex items-center justify-center w-6 h-6 rounded border',
              riskColors[skill.riskLevel]
            )}
          >
            {skillIcons[skill.id] || <Code className="h-3 w-3" />}
          </div>
        ))}

        {/* Overflow count */}
        {hiddenCount > 0 && (
          <div
            title={`${hiddenCount} more skills`}
            className="flex items-center justify-center w-6 h-6 rounded bg-[#252525] text-[#666] text-xs border border-[#333]"
          >
            +{hiddenCount}
          </div>
        )}

        {/* Settings button */}
        <button
          onClick={() => setShowPanel(!showPanel)}
          className={cn(
            'flex items-center justify-center w-6 h-6 rounded border transition-colors',
            showPanel
              ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
              : 'bg-[#252525] text-[#666] border-[#333] hover:text-white hover:border-[#444]'
          )}
          title="Configure skills"
        >
          <Settings className="h-3 w-3" />
        </button>
      </div>

      {/* Dropdown panel */}
      {showPanel && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowPanel(false)}
          />

          {/* Panel */}
          <div className="absolute top-full right-0 mt-2 w-80 max-h-[70vh] bg-[#1a1a1a] border border-[#333] rounded-lg shadow-xl z-50 overflow-hidden">
            <SkillsPanel
              threadId={threadId}
              mode="thread"
              onClose={() => setShowPanel(false)}
            />
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Compact inline skill list for display in thread info
 */
interface SkillListInlineProps {
  threadId: string;
  className?: string;
}

export function SkillListInline({ threadId, className }: SkillListInlineProps) {
  const { getEnabledSkillsForThread, getThreadSkillConfig } = useSkillStore();

  const enabledSkills = getEnabledSkillsForThread(threadId);
  const config = getThreadSkillConfig(threadId);

  return (
    <div className={cn('flex items-center gap-1.5 text-xs', className)}>
      <Shield className="h-3 w-3 text-[#666]" />
      <span className="text-[#666]">
        {enabledSkills.length} skill{enabledSkills.length !== 1 ? 's' : ''}
        {config.useCustomConfig && (
          <span className="text-blue-400 ml-1">(custom)</span>
        )}
      </span>
    </div>
  );
}
