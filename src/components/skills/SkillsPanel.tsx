import React, { useState } from 'react';
import {
  Shield,
  Settings,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  FileText,
  Terminal,
  GitBranch,
  Search,
  Code,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSkillStore } from '@/stores/skillStore';
import { SkillCard } from './SkillCard';
import { Button } from '@/components/ui/Button';
import type { SkillCategory } from '@/types/skills';

interface SkillsPanelProps {
  threadId?: string;
  mode?: 'thread' | 'global';
  onClose?: () => void;
  className?: string;
}

const categoryLabels: Record<SkillCategory, { label: string; icon: React.ReactNode }> = {
  file: { label: 'File Operations', icon: <FileText className="h-4 w-4" /> },
  terminal: { label: 'Terminal', icon: <Terminal className="h-4 w-4" /> },
  git: { label: 'Git', icon: <GitBranch className="h-4 w-4" /> },
  web: { label: 'Web', icon: <Search className="h-4 w-4" /> },
  code: { label: 'Code', icon: <Code className="h-4 w-4" /> },
};

const categoryOrder: SkillCategory[] = ['file', 'terminal', 'git', 'web', 'code'];

export function SkillsPanel({
  threadId,
  mode = 'thread',
  className,
}: SkillsPanelProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<SkillCategory>>(
    new Set(categoryOrder)
  );

  const {
    skillDefinitions,
    globalSettings,
    getThreadSkillConfig,
    toggleThreadSkill,
    toggleDefaultSkill,
    resetThreadToDefaults,
    setThreadUseCustomConfig,
    isSkillEnabledForThread,
    doesSkillRequireConfirmation,
    toggleRequireConfirmation,
  } = useSkillStore();

  const threadConfig = threadId ? getThreadSkillConfig(threadId) : null;

  // Group skills by category
  const skillsByCategory = React.useMemo(() => {
    const grouped: Record<SkillCategory, typeof skillDefinitions> = {
      file: [],
      terminal: [],
      git: [],
      web: [],
      code: [],
    };

    for (const skill of skillDefinitions) {
      grouped[skill.category].push(skill);
    }

    return grouped;
  }, [skillDefinitions]);

  const toggleCategory = (category: SkillCategory) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const handleToggle = (skillId: string) => {
    if (mode === 'global') {
      toggleDefaultSkill(skillId);
    } else if (threadId) {
      toggleThreadSkill(threadId, skillId);
    }
  };

  const isSkillEnabled = (skillId: string) => {
    if (mode === 'global') {
      return globalSettings.defaultEnabledSkillIds.includes(skillId);
    }
    return threadId ? isSkillEnabledForThread(threadId, skillId) : false;
  };

  // Count enabled skills
  const enabledCount = skillDefinitions.filter((s) => isSkillEnabled(s.id)).length;
  const totalCount = skillDefinitions.length;

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[#333]">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-blue-400" />
          <div>
            <h3 className="font-medium text-sm">
              {mode === 'global' ? 'Default Skills' : 'Thread Skills'}
            </h3>
            <p className="text-xs text-[#666]">
              {enabledCount} of {totalCount} skills enabled
            </p>
          </div>
        </div>

        {mode === 'thread' && threadId && (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => resetThreadToDefaults(threadId)}
              leftIcon={<RefreshCw className="h-3 w-3" />}
            >
              Reset
            </Button>
          </div>
        )}
      </div>

      {/* Thread custom config toggle */}
      {mode === 'thread' && threadId && threadConfig && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#252525] bg-[#0f0f0f]">
          <div>
            <span className="text-sm">Custom configuration</span>
            <p className="text-xs text-[#666]">
              {threadConfig.useCustomConfig
                ? 'Using thread-specific settings'
                : 'Using default skills'}
            </p>
          </div>
          <button
            onClick={() =>
              setThreadUseCustomConfig(threadId, !threadConfig.useCustomConfig)
            }
            className={cn(
              'relative w-10 h-5 rounded-full transition-colors',
              threadConfig.useCustomConfig ? 'bg-blue-500' : 'bg-[#333]'
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                threadConfig.useCustomConfig ? 'translate-x-5' : 'translate-x-0.5'
              )}
            />
          </button>
        </div>
      )}

      {/* Skills list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {categoryOrder.map((category) => {
          const skills = skillsByCategory[category];
          if (skills.length === 0) return null;

          const categoryInfo = categoryLabels[category];
          const isExpanded = expandedCategories.has(category);
          const enabledInCategory = skills.filter((s) => isSkillEnabled(s.id)).length;

          return (
            <div key={category} className="space-y-2">
              {/* Category header */}
              <button
                onClick={() => toggleCategory(category)}
                className="w-full flex items-center justify-between py-1 text-sm font-medium text-[#a0a0a0] hover:text-white transition-colors"
              >
                <div className="flex items-center gap-2">
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  {categoryInfo.icon}
                  <span>{categoryInfo.label}</span>
                </div>
                <span className="text-xs text-[#666]">
                  {enabledInCategory}/{skills.length}
                </span>
              </button>

              {/* Skills in category */}
              {isExpanded && (
                <div className="space-y-2 pl-2">
                  {skills.map((skill) => {
                    // Check if skill is disabled due to missing dependencies
                    const missingDeps = skill.dependencies?.filter(
                      (depId) => !isSkillEnabled(depId)
                    );
                    const isDisabled =
                      mode === 'thread' &&
                      threadConfig !== null &&
                      !threadConfig.useCustomConfig;

                    return (
                      <SkillCard
                        key={skill.id}
                        skill={skill}
                        enabled={isSkillEnabled(skill.id)}
                        requiresConfirmation={doesSkillRequireConfirmation(skill.id)}
                        onToggle={() => handleToggle(skill.id)}
                        onToggleConfirmation={
                          mode === 'global'
                            ? () => toggleRequireConfirmation(skill.id)
                            : undefined
                        }
                        disabled={isDisabled}
                        disabledReason={
                          isDisabled
                            ? 'Enable custom configuration to modify'
                            : missingDeps && missingDeps.length > 0
                            ? `Requires: ${missingDeps.join(', ')}`
                            : undefined
                        }
                      />
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-[#333] bg-[#0f0f0f]">
        <div className="flex items-center gap-2 text-xs text-[#666]">
          <Settings className="h-3 w-3" />
          <span>
            {mode === 'global'
              ? 'These settings apply to all new threads'
              : 'Configure which AI capabilities are available'}
          </span>
        </div>
      </div>
    </div>
  );
}
