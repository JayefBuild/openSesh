import { ClipboardList, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PlanModeToggleProps {
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

export function PlanModeToggle({
  enabled,
  onToggle,
  disabled = false,
  size = 'sm',
  className,
}: PlanModeToggleProps) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      title={
        enabled
          ? 'Plan Mode: AI will create a plan before making changes'
          : 'Direct Mode: AI will make changes immediately'
      }
      className={cn(
        'flex items-center gap-1.5 rounded transition-colors',
        size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm',
        enabled
          ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30 hover:bg-purple-500/30'
          : 'bg-[#252525] text-[#666] border border-[#333] hover:border-[#444] hover:text-[#a0a0a0]',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      {enabled ? (
        <>
          <ClipboardList className={cn(size === 'sm' ? 'h-3 w-3' : 'h-4 w-4')} />
          <span>Plan</span>
        </>
      ) : (
        <>
          <Zap className={cn(size === 'sm' ? 'h-3 w-3' : 'h-4 w-4')} />
          <span>Direct</span>
        </>
      )}
    </button>
  );
}

interface PlanModeIndicatorProps {
  enabled: boolean;
  className?: string;
}

export function PlanModeIndicator({ enabled, className }: PlanModeIndicatorProps) {
  if (!enabled) return null;

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 px-2 py-1 rounded text-xs',
        'bg-purple-500/10 text-purple-400 border border-purple-500/20',
        className
      )}
    >
      <ClipboardList className="h-3 w-3" />
      <span>Plan Mode Active</span>
    </div>
  );
}
