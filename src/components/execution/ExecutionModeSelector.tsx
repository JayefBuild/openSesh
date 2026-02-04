import React from 'react';
import { UserCheck, Zap, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useExecutionStore } from '@/stores/executionStore';
import type { ExecutionMode } from '@/types/execution';

interface ExecutionModeSelectorProps {
  className?: string;
  disabled?: boolean;
  compact?: boolean;
}

const modeConfig: Record<
  ExecutionMode,
  {
    icon: React.ReactNode;
    label: string;
    shortLabel: string;
    description: string;
    color: string;
    bgColor: string;
  }
> = {
  assisted: {
    icon: <UserCheck className="h-3 w-3" />,
    label: 'Assisted',
    shortLabel: 'Assist',
    description: 'Approve each action before execution',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
  },
  autonomous: {
    icon: <Zap className="h-3 w-3" />,
    label: 'Autonomous',
    shortLabel: 'Auto',
    description: 'Execute actions automatically',
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
  },
};

export function ExecutionModeSelector({
  className,
  disabled = false,
  compact = false,
}: ExecutionModeSelectorProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  const executionMode = useExecutionStore((state) => state.executionMode);
  const setExecutionMode = useExecutionStore((state) => state.setExecutionMode);
  const isExecuting = useExecutionStore((state) => state.isExecuting);

  const currentConfig = modeConfig[executionMode];

  // Close dropdown when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleModeChange = (mode: ExecutionMode) => {
    if (!disabled && !isExecuting) {
      setExecutionMode(mode);
      setIsOpen(false);
    }
  };

  return (
    <div ref={dropdownRef} className={cn('relative', className)}>
      {/* Selector Button */}
      <button
        onClick={() => !disabled && !isExecuting && setIsOpen(!isOpen)}
        disabled={disabled || isExecuting}
        className={cn(
          'flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors',
          'hover:bg-[#252525]',
          currentConfig.color,
          (disabled || isExecuting) && 'opacity-50 cursor-not-allowed'
        )}
        title={currentConfig.description}
      >
        {currentConfig.icon}
        <span>{compact ? currentConfig.shortLabel : currentConfig.label}</span>
        <ChevronDown className={cn('h-3 w-3 transition-transform', isOpen && 'rotate-180')} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 top-full mt-1 w-56 bg-[#1a1a1a] border border-[#333] rounded-lg shadow-xl z-50 overflow-hidden">
          <div className="p-2">
            <p className="text-xs text-[#666] px-2 pb-2 font-medium uppercase tracking-wider">
              Execution Mode
            </p>

            {(Object.entries(modeConfig) as [ExecutionMode, typeof modeConfig.assisted][]).map(
              ([mode, config]) => (
                <button
                  key={mode}
                  onClick={() => handleModeChange(mode)}
                  className={cn(
                    'flex items-start gap-3 w-full p-2 rounded transition-colors text-left',
                    mode === executionMode
                      ? cn(config.bgColor, config.color)
                      : 'hover:bg-[#252525] text-[#a0a0a0]'
                  )}
                >
                  <div className={cn('p-1 rounded', mode === executionMode ? config.bgColor : 'bg-[#252525]')}>
                    {config.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-sm font-medium', mode === executionMode && config.color)}>
                      {config.label}
                    </p>
                    <p className="text-xs text-[#666] mt-0.5">
                      {config.description}
                    </p>
                  </div>
                  {mode === executionMode && (
                    <div className={cn('w-2 h-2 rounded-full mt-1', config.color.replace('text-', 'bg-'))} />
                  )}
                </button>
              )
            )}
          </div>

          {/* Mode-specific info */}
          <div className="p-2 bg-[#141414] border-t border-[#252525]">
            {executionMode === 'assisted' ? (
              <p className="text-xs text-[#666]">
                Each action will require your approval before execution. Safer for critical work.
              </p>
            ) : (
              <p className="text-xs text-[#666]">
                Actions execute automatically. Dangerous actions still require confirmation.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Simple toggle version of the execution mode selector
 */
interface ExecutionModeToggleProps {
  className?: string;
  disabled?: boolean;
}

export function ExecutionModeToggle({ className, disabled = false }: ExecutionModeToggleProps) {
  const executionMode = useExecutionStore((state) => state.executionMode);
  const setExecutionMode = useExecutionStore((state) => state.setExecutionMode);
  const isExecuting = useExecutionStore((state) => state.isExecuting);

  const toggleMode = () => {
    if (!disabled && !isExecuting) {
      setExecutionMode(executionMode === 'assisted' ? 'autonomous' : 'assisted');
    }
  };

  const config = modeConfig[executionMode];

  return (
    <button
      onClick={toggleMode}
      disabled={disabled || isExecuting}
      className={cn(
        'flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors',
        'hover:bg-[#252525]',
        config.color,
        (disabled || isExecuting) && 'opacity-50 cursor-not-allowed',
        className
      )}
      title={`${config.label}: ${config.description}. Click to switch.`}
    >
      {config.icon}
      <span>{config.label}</span>
    </button>
  );
}
