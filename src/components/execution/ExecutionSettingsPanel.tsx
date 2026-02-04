import React from 'react';
import {
  UserCheck,
  Zap,
  Shield,
  GitBranch,
  Trash2,
  AlertTriangle,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settingsStore';
import { useExecutionStore } from '@/stores/executionStore';
import type { ExecutionMode } from '@/types/execution';

interface ExecutionSettingsPanelProps {
  className?: string;
}

export function ExecutionSettingsPanel({ className }: ExecutionSettingsPanelProps) {
  const execution = useSettingsStore((state) => state.execution);
  const updateExecutionPreferences = useSettingsStore((state) => state.updateExecutionPreferences);
  const settings = useExecutionStore((state) => state.settings);
  const updateSettings = useExecutionStore((state) => state.updateSettings);

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-md bg-blue-500/10">
          <Settings className="h-5 w-5 text-blue-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Execution Settings</h3>
          <p className="text-sm text-[#666]">
            Configure how actions are executed in your sessions
          </p>
        </div>
      </div>

      {/* Default Execution Mode */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-[#a0a0a0]">Default Execution Mode</h4>
        <div className="grid grid-cols-2 gap-3">
          <ExecutionModeOption
            mode="assisted"
            icon={<UserCheck className="h-5 w-5" />}
            title="Assisted"
            description="Approve each action before execution"
            isSelected={execution.defaultExecutionMode === 'assisted'}
            onSelect={() => updateExecutionPreferences({ defaultExecutionMode: 'assisted' })}
          />
          <ExecutionModeOption
            mode="autonomous"
            icon={<Zap className="h-5 w-5" />}
            title="Autonomous"
            description="Execute actions automatically"
            isSelected={execution.defaultExecutionMode === 'autonomous'}
            onSelect={() => updateExecutionPreferences({ defaultExecutionMode: 'autonomous' })}
          />
        </div>
      </div>

      {/* Safety Settings */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-[#a0a0a0]">Safety Settings</h4>
        <p className="text-xs text-[#666]">
          These settings apply even in Autonomous mode
        </p>

        <div className="space-y-2">
          <ToggleSetting
            icon={<Shield className="h-4 w-4 text-red-400" />}
            title="Always confirm dangerous actions"
            description="Require approval for actions marked as dangerous"
            enabled={execution.alwaysConfirmDangerous}
            onChange={(enabled) => updateExecutionPreferences({ alwaysConfirmDangerous: enabled })}
          />

          <ToggleSetting
            icon={<GitBranch className="h-4 w-4 text-orange-400" />}
            title="Always confirm git operations"
            description="Require approval for commits, pushes, and other git operations"
            enabled={execution.alwaysConfirmGitOperations}
            onChange={(enabled) => updateExecutionPreferences({ alwaysConfirmGitOperations: enabled })}
          />

          <ToggleSetting
            icon={<Trash2 className="h-4 w-4 text-red-400" />}
            title="Always confirm file deletions"
            description="Require approval before deleting any files"
            enabled={execution.alwaysConfirmFileDeletions}
            onChange={(enabled) => updateExecutionPreferences({ alwaysConfirmFileDeletions: enabled })}
          />
        </div>
      </div>

      {/* Advanced Settings */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-[#a0a0a0]">Advanced Settings</h4>

        <div className="space-y-2">
          <ToggleSetting
            icon={<AlertTriangle className="h-4 w-4 text-yellow-400" />}
            title="Stop on error"
            description="Stop execution if any action fails"
            enabled={settings.stopOnError ?? true}
            onChange={(enabled) => updateSettings({ stopOnError: enabled })}
          />

          <ToggleSetting
            title="Enable audit log"
            description="Keep a log of all executed actions"
            enabled={settings.enableAuditLog}
            onChange={(enabled) => updateSettings({ enableAuditLog: enabled })}
          />

          <div className="flex items-center justify-between p-3 rounded-md bg-[#1a1a1a] border border-[#252525]">
            <div className="flex-1">
              <p className="text-sm font-medium">Autonomous timeout</p>
              <p className="text-xs text-[#666]">
                Maximum time (seconds) for autonomous execution
              </p>
            </div>
            <input
              type="number"
              value={settings.autonomousTimeout}
              onChange={(e) => updateSettings({ autonomousTimeout: parseInt(e.target.value) || 60 })}
              min={10}
              max={300}
              className="w-20 px-2 py-1 bg-[#0a0a0a] border border-[#333] rounded text-sm text-white text-center focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex items-center justify-between p-3 rounded-md bg-[#1a1a1a] border border-[#252525]">
            <div className="flex-1">
              <p className="text-sm font-medium">Max actions per batch</p>
              <p className="text-xs text-[#666]">
                Maximum number of actions to execute in one batch
              </p>
            </div>
            <input
              type="number"
              value={settings.maxActionsPerBatch}
              onChange={(e) => updateSettings({ maxActionsPerBatch: parseInt(e.target.value) || 50 })}
              min={1}
              max={100}
              className="w-20 px-2 py-1 bg-[#0a0a0a] border border-[#333] rounded text-sm text-white text-center focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Info box */}
      <div className="p-3 rounded-md bg-blue-500/5 border border-blue-500/20">
        <p className="text-xs text-blue-400">
          <strong>Tip:</strong> You can change the execution mode at any time using the
          selector in the chat input. The default mode applies to new sessions only.
        </p>
      </div>
    </div>
  );
}

// Execution mode option component
interface ExecutionModeOptionProps {
  mode: ExecutionMode;
  icon: React.ReactNode;
  title: string;
  description: string;
  isSelected: boolean;
  onSelect: () => void;
}

function ExecutionModeOption({
  mode,
  icon,
  title,
  description,
  isSelected,
  onSelect,
}: ExecutionModeOptionProps) {
  const colors = {
    assisted: { text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
    autonomous: { text: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/30' },
  };

  const style = colors[mode];

  return (
    <button
      onClick={onSelect}
      className={cn(
        'flex flex-col items-center gap-2 p-4 rounded-lg border transition-all text-left',
        isSelected
          ? cn(style.bg, style.border, style.text)
          : 'border-[#333] hover:border-[#444] hover:bg-[#1a1a1a]'
      )}
    >
      <div className={cn('p-2 rounded-md', isSelected ? style.bg : 'bg-[#252525]')}>
        <span className={isSelected ? style.text : 'text-[#666]'}>{icon}</span>
      </div>
      <div className="text-center">
        <p className={cn('font-medium', isSelected ? style.text : 'text-white')}>
          {title}
        </p>
        <p className="text-xs text-[#666] mt-0.5">{description}</p>
      </div>
      {isSelected && (
        <div className={cn('w-2 h-2 rounded-full', style.text.replace('text-', 'bg-'))} />
      )}
    </button>
  );
}

// Toggle setting component
interface ToggleSettingProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

function ToggleSetting({
  icon,
  title,
  description,
  enabled,
  onChange,
}: ToggleSettingProps) {
  return (
    <div className="flex items-center justify-between p-3 rounded-md bg-[#1a1a1a] border border-[#252525]">
      <div className="flex items-center gap-3 flex-1">
        {icon && <div className="flex-shrink-0">{icon}</div>}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-[#666]">{description}</p>
        </div>
      </div>
      <button
        onClick={() => onChange(!enabled)}
        className={cn(
          'relative w-10 h-5 rounded-full transition-colors flex-shrink-0',
          enabled ? 'bg-blue-500' : 'bg-[#333]'
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
  );
}
