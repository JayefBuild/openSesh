import { useCallback } from 'react';
import { cn } from '@/lib/utils';
import { useThreadStore } from '@/stores/threadStore';
import { usePlanStore } from '@/stores/planStore';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { PlanView } from '@/components/plan/PlanView';
import { PlanModeIndicator } from '@/components/plan/PlanModeToggle';
import { MessageSquare, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useProjectStore } from '@/stores/projectStore';

interface ChatPaneProps {
  className?: string;
}

export function ChatPane({ className }: ChatPaneProps) {
  const activeThread = useThreadStore((state) => state.getActiveThread());
  const activeProject = useProjectStore((state) => state.getActiveProject());
  const createThread = useThreadStore((state) => state.createThread);
  const updateThread = useThreadStore((state) => state.updateThread);

  // Plan store
  const getPlanById = usePlanStore((state) => state.getPlanById);
  const startExecution = usePlanStore((state) => state.startExecution);
  const cancelExecution = usePlanStore((state) => state.cancelExecution);
  const finishExecution = usePlanStore((state) => state.finishExecution);
  const updateStep = usePlanStore((state) => state.updateStep);
  const completeStepExecution = usePlanStore((state) => state.completeStepExecution);
  const failStepExecution = usePlanStore((state) => state.failStepExecution);
  const deletePlan = usePlanStore((state) => state.deletePlan);

  // Get the current plan for this thread
  const currentPlan = activeThread?.currentPlanId
    ? getPlanById(activeThread.currentPlanId)
    : null;

  // Check if plan mode is enabled
  const planModeEnabled = activeThread?.planModeEnabled ?? false;

  const handleCreateThread = () => {
    if (activeProject) {
      createThread(activeProject.id);
    }
  };

  const handleExecutePlan = useCallback(async () => {
    if (!currentPlan) return;

    startExecution(currentPlan.id);

    // Execute steps sequentially
    let hasError = false;
    const executionOptions = usePlanStore.getState().executionOptions;

    for (const step of currentPlan.steps) {
      // Check if we should stop execution
      if (hasError && executionOptions.stopOnError) {
        break;
      }

      // Skip rejected steps if configured
      if (step.status === 'rejected' && executionOptions.skipRejected) {
        continue;
      }

      // Skip already completed or skipped steps
      if (['completed', 'skipped', 'error'].includes(step.status)) {
        continue;
      }

      // Only execute approved steps (or pending information steps if auto-approve is on)
      if (step.status !== 'approved') {
        if (
          step.type === 'information' &&
          step.status === 'pending' &&
          executionOptions.autoApproveInformation
        ) {
          // Auto-approve information steps
        } else {
          continue;
        }
      }

      // Mark step as in progress
      updateStep(currentPlan.id, step.id, { status: 'in_progress' });

      try {
        // Execute the step based on its type
        // For now, we'll just simulate execution with a delay
        // In a real implementation, this would call the appropriate backend functions
        await executeStep(step);

        completeStepExecution(currentPlan.id, step.id, 'Step completed successfully');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        failStepExecution(currentPlan.id, step.id, errorMessage);
        hasError = true;
      }
    }

    finishExecution(currentPlan.id);
  }, [
    currentPlan,
    startExecution,
    updateStep,
    completeStepExecution,
    failStepExecution,
    finishExecution,
  ]);

  // Stub function to execute a step - would integrate with actual backend
  const executeStep = async (_step: { type: string }) => {
    // Simulate execution delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    // In a real implementation, this would:
    // - file_edit/file_create/file_delete: Call file system APIs
    // - terminal_command: Execute command through PTY
    // - git_operation: Call git commands
    // - information: Just mark as complete

    // For now, just simulate success
    return true;
  };

  const handleCancelPlan = useCallback(() => {
    if (!currentPlan) return;

    if (currentPlan.status === 'executing') {
      cancelExecution(currentPlan.id);
    } else {
      // Delete the plan and clear from thread
      deletePlan(currentPlan.id);
      updateThread(activeThread!.id, { currentPlanId: null });
    }
  }, [currentPlan, cancelExecution, deletePlan, updateThread, activeThread]);

  if (!activeThread) {
    return (
      <div className={cn('h-full flex flex-col items-center justify-center p-8', className)}>
        <div className="max-w-md text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#252525] flex items-center justify-center">
            <MessageSquare className="h-8 w-8 text-[#666]" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Start a conversation</h2>
          <p className="text-[#a0a0a0] mb-6">
            {activeProject
              ? 'Create a new thread to start chatting with AI about your code.'
              : 'Open a project first, then create a thread to start chatting.'}
          </p>
          {activeProject && (
            <Button
              variant="primary"
              rightIcon={<ArrowRight className="h-4 w-4" />}
              onClick={handleCreateThread}
            >
              New Thread
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('h-full flex flex-col bg-[#0f0f0f]', className)}>
      {/* Plan mode indicator in header */}
      {planModeEnabled && (
        <div className="px-4 py-2 border-b border-[#252525] bg-[#141414]">
          <PlanModeIndicator enabled={planModeEnabled} />
        </div>
      )}

      {/* Message list and Plan view */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <MessageList threadId={activeThread.id} />

        {/* Show PlanView if there's an active plan */}
        {currentPlan && (
          <div className="px-4 py-4">
            <PlanView
              plan={currentPlan}
              onExecute={handleExecutePlan}
              onCancel={handleCancelPlan}
            />
          </div>
        )}
      </div>

      {/* Chat input */}
      <div className="flex-shrink-0 border-t border-[#333]">
        <ChatInput threadId={activeThread.id} />
      </div>
    </div>
  );
}
