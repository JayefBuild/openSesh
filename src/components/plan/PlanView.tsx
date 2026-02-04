import React, { useState } from 'react';
import {
  ClipboardList,
  Check,
  X,
  Play,
  Loader2,
  ChevronDown,
  ChevronUp,
  Settings,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { PlanStepItem } from './PlanStepItem';
import { usePlanStore } from '@/stores/planStore';
import type { Plan, PlanStatus } from '@/types/plan';

interface PlanViewProps {
  plan: Plan;
  onExecute?: () => void;
  onCancel?: () => void;
  className?: string;
}

// Status configuration for the plan
const planStatusConfig: Record<
  PlanStatus,
  { color: string; bgColor: string; icon: React.ReactNode; label: string }
> = {
  generating: {
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    icon: <Loader2 className="h-4 w-4 animate-spin" />,
    label: 'Generating Plan',
  },
  pending: {
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/10',
    icon: <Clock className="h-4 w-4" />,
    label: 'Awaiting Approval',
  },
  approved: {
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    icon: <Check className="h-4 w-4" />,
    label: 'Ready to Execute',
  },
  executing: {
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/10',
    icon: <Loader2 className="h-4 w-4 animate-spin" />,
    label: 'Executing',
  },
  completed: {
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
    icon: <CheckCircle className="h-4 w-4" />,
    label: 'Completed',
  },
  partial: {
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/10',
    icon: <AlertTriangle className="h-4 w-4" />,
    label: 'Partially Completed',
  },
  cancelled: {
    color: 'text-[#666]',
    bgColor: 'bg-[#252525]',
    icon: <X className="h-4 w-4" />,
    label: 'Cancelled',
  },
  error: {
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    icon: <XCircle className="h-4 w-4" />,
    label: 'Error',
  },
};

export function PlanView({ plan, onExecute, onCancel, className }: PlanViewProps) {
  const [showOptions, setShowOptions] = useState(false);
  const [expandedView, setExpandedView] = useState(true);

  const approveStep = usePlanStore((state) => state.approveStep);
  const rejectStep = usePlanStore((state) => state.rejectStep);
  const approvePlan = usePlanStore((state) => state.approvePlan);
  const rejectPlan = usePlanStore((state) => state.rejectPlan);
  const executionOptions = usePlanStore((state) => state.executionOptions);
  const setExecutionOptions = usePlanStore((state) => state.setExecutionOptions);
  const isExecutingPlan = usePlanStore((state) => state.isExecutingPlan);
  const getPlanProgress = usePlanStore((state) => state.getPlanProgress);

  const config = planStatusConfig[plan.status];
  const progress = getPlanProgress(plan.id);

  const pendingSteps = plan.steps.filter((s) => s.status === 'pending').length;
  const approvedSteps = plan.steps.filter((s) => s.status === 'approved').length;
  const completedSteps = plan.completedSteps;
  const failedSteps = plan.failedSteps;

  const canApproveAll = pendingSteps > 0;
  const canRejectAll = pendingSteps > 0 || approvedSteps > 0;
  const canExecute =
    plan.status === 'approved' ||
    (plan.status === 'pending' && approvedSteps > 0);
  const isFinished = ['completed', 'cancelled', 'error'].includes(plan.status);

  const handleApproveStep = (stepId: string) => {
    approveStep(plan.id, stepId);
  };

  const handleRejectStep = (stepId: string, reason?: string) => {
    rejectStep(plan.id, stepId, reason);
  };

  const handleApproveAll = () => {
    approvePlan(plan.id);
  };

  const handleRejectAll = () => {
    rejectPlan(plan.id);
  };

  return (
    <div className={cn('rounded-lg border border-[#333] bg-[#141414]', className)}>
      {/* Header */}
      <div className="p-4 border-b border-[#252525]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-md bg-[#252525]">
              <ClipboardList className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">{plan.title}</h3>
              <p className="text-sm text-[#666] mt-0.5">{plan.summary}</p>
            </div>
          </div>

          {/* Status badge */}
          <div
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md',
              config.color,
              config.bgColor
            )}
          >
            {config.icon}
            <span className="text-sm font-medium">{config.label}</span>
          </div>
        </div>

        {/* Progress bar (when executing) */}
        {plan.status === 'executing' && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-[#666] mb-1">
              <span>Progress</span>
              <span>
                {progress.completed}/{progress.total} steps ({progress.percentage}%)
              </span>
            </div>
            <div className="h-2 bg-[#252525] rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${progress.percentage}%` }}
              />
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="flex items-center gap-4 mt-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-[#666]">Total:</span>
            <span className="font-medium">{plan.totalSteps}</span>
          </div>
          {pendingSteps > 0 && (
            <div className="flex items-center gap-1.5 text-yellow-400">
              <Clock className="h-3 w-3" />
              <span>{pendingSteps} pending</span>
            </div>
          )}
          {approvedSteps > 0 && (
            <div className="flex items-center gap-1.5 text-blue-400">
              <Check className="h-3 w-3" />
              <span>{approvedSteps} approved</span>
            </div>
          )}
          {completedSteps > 0 && (
            <div className="flex items-center gap-1.5 text-green-400">
              <CheckCircle className="h-3 w-3" />
              <span>{completedSteps} completed</span>
            </div>
          )}
          {failedSteps > 0 && (
            <div className="flex items-center gap-1.5 text-red-400">
              <XCircle className="h-3 w-3" />
              <span>{failedSteps} failed</span>
            </div>
          )}
        </div>
      </div>

      {/* Steps list */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setExpandedView(!expandedView)}
            className="flex items-center gap-1.5 text-sm text-[#666] hover:text-white transition-colors"
          >
            {expandedView ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
            <span>Steps</span>
          </button>

          {/* Options toggle */}
          <button
            onClick={() => setShowOptions(!showOptions)}
            className={cn(
              'flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors',
              showOptions
                ? 'bg-[#252525] text-white'
                : 'text-[#666] hover:text-white'
            )}
          >
            <Settings className="h-3 w-3" />
            Options
          </button>
        </div>

        {/* Execution options */}
        {showOptions && (
          <div className="mb-4 p-3 rounded-md bg-[#1a1a1a] border border-[#252525] space-y-2">
            <label className="flex items-center justify-between text-sm">
              <span className="text-[#a0a0a0]">Stop on error</span>
              <button
                onClick={() =>
                  setExecutionOptions({ stopOnError: !executionOptions.stopOnError })
                }
                className={cn(
                  'relative w-8 h-4 rounded-full transition-colors',
                  executionOptions.stopOnError ? 'bg-blue-500' : 'bg-[#333]'
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform',
                    executionOptions.stopOnError ? 'translate-x-4' : 'translate-x-0.5'
                  )}
                />
              </button>
            </label>
            <label className="flex items-center justify-between text-sm">
              <span className="text-[#a0a0a0]">Skip rejected steps</span>
              <button
                onClick={() =>
                  setExecutionOptions({ skipRejected: !executionOptions.skipRejected })
                }
                className={cn(
                  'relative w-8 h-4 rounded-full transition-colors',
                  executionOptions.skipRejected ? 'bg-blue-500' : 'bg-[#333]'
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform',
                    executionOptions.skipRejected ? 'translate-x-4' : 'translate-x-0.5'
                  )}
                />
              </button>
            </label>
            <label className="flex items-center justify-between text-sm">
              <span className="text-[#a0a0a0]">Auto-approve information steps</span>
              <button
                onClick={() =>
                  setExecutionOptions({
                    autoApproveInformation: !executionOptions.autoApproveInformation,
                  })
                }
                className={cn(
                  'relative w-8 h-4 rounded-full transition-colors',
                  executionOptions.autoApproveInformation ? 'bg-blue-500' : 'bg-[#333]'
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform',
                    executionOptions.autoApproveInformation
                      ? 'translate-x-4'
                      : 'translate-x-0.5'
                  )}
                />
              </button>
            </label>
          </div>
        )}

        {/* Steps */}
        {expandedView && (
          <div className="space-y-2">
            {plan.steps.map((step) => (
              <PlanStepItem
                key={step.id}
                step={step}
                isActive={step.status === 'in_progress'}
                isExecuting={step.status === 'in_progress'}
                onApprove={() => handleApproveStep(step.id)}
                onReject={(reason) => handleRejectStep(step.id, reason)}
                showActions={!isFinished && plan.status !== 'executing'}
              />
            ))}
          </div>
        )}

        {!expandedView && (
          <div className="space-y-1">
            {plan.steps.map((step) => (
              <PlanStepItem
                key={step.id}
                step={step}
                compact
                onApprove={() => handleApproveStep(step.id)}
                onReject={(reason) => handleRejectStep(step.id, reason)}
                showActions={false}
              />
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      {!isFinished && (
        <div className="p-4 border-t border-[#252525] flex items-center justify-between">
          <div className="flex items-center gap-2">
            {canApproveAll && (
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Check className="h-3 w-3" />}
                onClick={handleApproveAll}
              >
                Approve All
              </Button>
            )}
            {canRejectAll && (
              <Button
                variant="danger"
                size="sm"
                leftIcon={<X className="h-3 w-3" />}
                onClick={handleRejectAll}
              >
                Reject All
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {onCancel && plan.status !== 'executing' && (
              <Button variant="ghost" size="sm" onClick={onCancel}>
                Cancel
              </Button>
            )}
            {canExecute && onExecute && (
              <Button
                variant="primary"
                size="sm"
                leftIcon={
                  isExecutingPlan ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Play className="h-3 w-3" />
                  )
                }
                onClick={onExecute}
                disabled={isExecutingPlan}
              >
                {isExecutingPlan ? 'Executing...' : 'Execute Plan'}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Finished state */}
      {isFinished && (
        <div className="p-4 border-t border-[#252525]">
          <div
            className={cn(
              'flex items-center gap-2 p-3 rounded-md',
              config.bgColor
            )}
          >
            {config.icon}
            <span className={cn('text-sm', config.color)}>
              {plan.status === 'completed' && 'Plan executed successfully.'}
              {plan.status === 'partial' &&
                `Plan partially completed. ${completedSteps} of ${plan.totalSteps} steps succeeded.`}
              {plan.status === 'cancelled' && 'Plan was cancelled.'}
              {plan.status === 'error' && 'Plan execution failed.'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
