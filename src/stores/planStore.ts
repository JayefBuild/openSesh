import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Plan,
  PlanStep,
  PlanStatus,
  PlanStepStatus,
  PlanStepType,
  PlanStepDetails,
  PlanExecutionOptions,
} from '@/types/plan';
import { generateId } from '@/lib/utils';

interface PlanStore {
  // State
  plans: Plan[];
  activePlanId: string | null;
  isGeneratingPlan: boolean;
  isExecutingPlan: boolean;
  executionOptions: PlanExecutionOptions;

  // Plan management
  createPlan: (
    threadId: string,
    messageId: string,
    userRequest: string,
    title: string,
    summary: string
  ) => Plan;
  updatePlan: (planId: string, updates: Partial<Plan>) => void;
  deletePlan: (planId: string) => void;
  setActivePlan: (planId: string | null) => void;
  getActivePlan: () => Plan | null;
  getPlanById: (planId: string) => Plan | null;
  getPlansByThread: (threadId: string) => Plan[];
  getCurrentPlanForThread: (threadId: string) => Plan | null;

  // Step management
  addStep: (
    planId: string,
    type: PlanStepType,
    title: string,
    description: string,
    details: PlanStepDetails | Record<string, unknown>,
    dependsOn?: string[]
  ) => PlanStep;
  updateStep: (planId: string, stepId: string, updates: Partial<PlanStep>) => void;
  removeStep: (planId: string, stepId: string) => void;
  reorderSteps: (planId: string, stepIds: string[]) => void;
  getStepById: (planId: string, stepId: string) => PlanStep | undefined;

  // Approval workflow
  approveStep: (planId: string, stepId: string) => void;
  rejectStep: (planId: string, stepId: string, reason?: string) => void;
  approveAllSteps: (planId: string) => void;
  rejectAllSteps: (planId: string) => void;
  approvePlan: (planId: string) => void;
  rejectPlan: (planId: string) => void;

  // Execution
  startExecution: (planId: string) => void;
  completeStepExecution: (planId: string, stepId: string, result?: string) => void;
  failStepExecution: (planId: string, stepId: string, error: string) => void;
  skipStep: (planId: string, stepId: string) => void;
  cancelExecution: (planId: string) => void;
  finishExecution: (planId: string) => void;

  // Generation state
  setIsGeneratingPlan: (isGenerating: boolean) => void;
  setIsExecutingPlan: (isExecuting: boolean) => void;

  // Execution options
  setExecutionOptions: (options: Partial<PlanExecutionOptions>) => void;

  // Utility
  getNextPendingStep: (planId: string) => PlanStep | undefined;
  canExecuteStep: (planId: string, stepId: string) => boolean;
  getPlanProgress: (planId: string) => { completed: number; total: number; percentage: number };
}

const defaultExecutionOptions: PlanExecutionOptions = {
  stopOnError: true,
  skipRejected: true,
  autoApproveInformation: true,
};

export const usePlanStore = create<PlanStore>()(
  persist(
    (set, get) => ({
      plans: [],
      activePlanId: null,
      isGeneratingPlan: false,
      isExecutingPlan: false,
      executionOptions: defaultExecutionOptions,

      // Plan management
      createPlan: (threadId, messageId, userRequest, title, summary) => {
        const now = new Date();
        const plan: Plan = {
          id: generateId(),
          threadId,
          messageId,
          userRequest,
          title,
          summary,
          steps: [],
          status: 'generating',
          createdAt: now,
          updatedAt: now,
          totalSteps: 0,
          completedSteps: 0,
          failedSteps: 0,
          rejectedSteps: 0,
        };

        set((state) => ({
          plans: [plan, ...state.plans],
          activePlanId: plan.id,
        }));

        return plan;
      },

      updatePlan: (planId, updates) => {
        set((state) => ({
          plans: state.plans.map((p) =>
            p.id === planId
              ? { ...p, ...updates, updatedAt: new Date() }
              : p
          ),
        }));
      },

      deletePlan: (planId) => {
        set((state) => ({
          plans: state.plans.filter((p) => p.id !== planId),
          activePlanId: state.activePlanId === planId ? null : state.activePlanId,
        }));
      },

      setActivePlan: (planId) => {
        set({ activePlanId: planId });
      },

      getActivePlan: () => {
        const { plans, activePlanId } = get();
        return plans.find((p) => p.id === activePlanId) || null;
      },

      getPlanById: (planId) => {
        return get().plans.find((p) => p.id === planId) || null;
      },

      getPlansByThread: (threadId) => {
        return get().plans
          .filter((p) => p.threadId === threadId)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      },

      getCurrentPlanForThread: (threadId) => {
        const plans = get().getPlansByThread(threadId);
        // Return the most recent plan that is not completed or cancelled
        return plans.find(
          (p) => !['completed', 'cancelled', 'error'].includes(p.status)
        ) || null;
      },

      // Step management
      addStep: (planId, type, title, description, details, dependsOn) => {
        const plan = get().getPlanById(planId);
        if (!plan) throw new Error(`Plan ${planId} not found`);

        const step: PlanStep = {
          id: generateId(),
          planId,
          stepNumber: plan.steps.length + 1,
          type,
          title,
          description,
          details: details as PlanStepDetails,
          status: 'pending',
          dependsOn,
        };

        set((state) => ({
          plans: state.plans.map((p) =>
            p.id === planId
              ? {
                  ...p,
                  steps: [...p.steps, step],
                  totalSteps: p.totalSteps + 1,
                  updatedAt: new Date(),
                }
              : p
          ),
        }));

        return step;
      },

      updateStep: (planId, stepId, updates) => {
        set((state) => ({
          plans: state.plans.map((p) =>
            p.id === planId
              ? {
                  ...p,
                  steps: p.steps.map((s) =>
                    s.id === stepId ? { ...s, ...updates } : s
                  ),
                  updatedAt: new Date(),
                }
              : p
          ),
        }));
      },

      removeStep: (planId, stepId) => {
        set((state) => ({
          plans: state.plans.map((p) => {
            if (p.id !== planId) return p;

            const filteredSteps = p.steps.filter((s) => s.id !== stepId);
            // Renumber steps
            const renumberedSteps = filteredSteps.map((s, index) => ({
              ...s,
              stepNumber: index + 1,
            }));

            return {
              ...p,
              steps: renumberedSteps,
              totalSteps: renumberedSteps.length,
              updatedAt: new Date(),
            };
          }),
        }));
      },

      reorderSteps: (planId, stepIds) => {
        set((state) => ({
          plans: state.plans.map((p) => {
            if (p.id !== planId) return p;

            const stepMap = new Map(p.steps.map((s) => [s.id, s]));
            const reorderedSteps = stepIds
              .map((id, index) => {
                const step = stepMap.get(id);
                return step ? { ...step, stepNumber: index + 1 } : null;
              })
              .filter((s): s is PlanStep => s !== null);

            return {
              ...p,
              steps: reorderedSteps,
              updatedAt: new Date(),
            };
          }),
        }));
      },

      getStepById: (planId, stepId) => {
        const plan = get().getPlanById(planId);
        return plan?.steps.find((s) => s.id === stepId);
      },

      // Approval workflow
      approveStep: (planId, stepId) => {
        get().updateStep(planId, stepId, { status: 'approved' });
      },

      rejectStep: (planId, stepId, reason) => {
        set((state) => ({
          plans: state.plans.map((p) => {
            if (p.id !== planId) return p;

            return {
              ...p,
              steps: p.steps.map((s) =>
                s.id === stepId
                  ? { ...s, status: 'rejected' as PlanStepStatus, userNote: reason }
                  : s
              ),
              rejectedSteps: p.rejectedSteps + 1,
              updatedAt: new Date(),
            };
          }),
        }));
      },

      approveAllSteps: (planId) => {
        set((state) => ({
          plans: state.plans.map((p) => {
            if (p.id !== planId) return p;

            return {
              ...p,
              steps: p.steps.map((s) =>
                s.status === 'pending'
                  ? { ...s, status: 'approved' as PlanStepStatus }
                  : s
              ),
              updatedAt: new Date(),
            };
          }),
        }));
      },

      rejectAllSteps: (planId) => {
        set((state) => ({
          plans: state.plans.map((p) => {
            if (p.id !== planId) return p;

            const pendingCount = p.steps.filter((s) => s.status === 'pending').length;
            return {
              ...p,
              steps: p.steps.map((s) =>
                s.status === 'pending'
                  ? { ...s, status: 'rejected' as PlanStepStatus }
                  : s
              ),
              rejectedSteps: p.rejectedSteps + pendingCount,
              updatedAt: new Date(),
            };
          }),
        }));
      },

      approvePlan: (planId) => {
        const { approveAllSteps, updatePlan } = get();
        approveAllSteps(planId);
        updatePlan(planId, { status: 'approved' });
      },

      rejectPlan: (planId) => {
        const { rejectAllSteps, updatePlan } = get();
        rejectAllSteps(planId);
        updatePlan(planId, { status: 'cancelled' });
      },

      // Execution
      startExecution: (planId) => {
        set((state) => ({
          plans: state.plans.map((p) =>
            p.id === planId
              ? {
                  ...p,
                  status: 'executing' as PlanStatus,
                  startedAt: new Date(),
                  updatedAt: new Date(),
                }
              : p
          ),
          isExecutingPlan: true,
        }));
      },

      completeStepExecution: (planId, stepId, result) => {
        set((state) => ({
          plans: state.plans.map((p) => {
            if (p.id !== planId) return p;

            return {
              ...p,
              steps: p.steps.map((s) =>
                s.id === stepId
                  ? {
                      ...s,
                      status: 'completed' as PlanStepStatus,
                      executionResult: result,
                      executedAt: new Date(),
                    }
                  : s
              ),
              completedSteps: p.completedSteps + 1,
              updatedAt: new Date(),
            };
          }),
        }));
      },

      failStepExecution: (planId, stepId, error) => {
        set((state) => ({
          plans: state.plans.map((p) => {
            if (p.id !== planId) return p;

            return {
              ...p,
              steps: p.steps.map((s) =>
                s.id === stepId
                  ? {
                      ...s,
                      status: 'error' as PlanStepStatus,
                      error,
                      executedAt: new Date(),
                    }
                  : s
              ),
              failedSteps: p.failedSteps + 1,
              updatedAt: new Date(),
            };
          }),
        }));
      },

      skipStep: (planId, stepId) => {
        get().updateStep(planId, stepId, { status: 'skipped' });
      },

      cancelExecution: (planId) => {
        set((state) => ({
          plans: state.plans.map((p) =>
            p.id === planId
              ? {
                  ...p,
                  status: 'cancelled' as PlanStatus,
                  updatedAt: new Date(),
                }
              : p
          ),
          isExecutingPlan: false,
        }));
      },

      finishExecution: (planId) => {
        const plan = get().getPlanById(planId);
        if (!plan) return;

        // Determine final status
        let status: PlanStatus = 'completed';
        if (plan.failedSteps > 0 || plan.rejectedSteps > 0) {
          status = 'partial';
        }
        if (plan.completedSteps === 0 && plan.failedSteps > 0) {
          status = 'error';
        }

        set((state) => ({
          plans: state.plans.map((p) =>
            p.id === planId
              ? {
                  ...p,
                  status,
                  completedAt: new Date(),
                  updatedAt: new Date(),
                }
              : p
          ),
          isExecutingPlan: false,
        }));
      },

      // Generation state
      setIsGeneratingPlan: (isGenerating) => {
        set({ isGeneratingPlan: isGenerating });
      },

      setIsExecutingPlan: (isExecuting) => {
        set({ isExecutingPlan: isExecuting });
      },

      // Execution options
      setExecutionOptions: (options) => {
        set((state) => ({
          executionOptions: { ...state.executionOptions, ...options },
        }));
      },

      // Utility
      getNextPendingStep: (planId) => {
        const plan = get().getPlanById(planId);
        if (!plan) return undefined;

        const { executionOptions } = get();

        return plan.steps.find((step) => {
          // Skip rejected steps if configured
          if (executionOptions.skipRejected && step.status === 'rejected') {
            return false;
          }

          // Only return approved or auto-approved steps
          if (step.status === 'approved') {
            return true;
          }

          // Auto-approve information steps
          if (
            executionOptions.autoApproveInformation &&
            step.type === 'information' &&
            step.status === 'pending'
          ) {
            return true;
          }

          return false;
        });
      },

      canExecuteStep: (planId, stepId) => {
        const plan = get().getPlanById(planId);
        if (!plan) return false;

        const step = plan.steps.find((s) => s.id === stepId);
        if (!step) return false;

        // Check if step is in an executable state
        if (!['pending', 'approved'].includes(step.status)) {
          return false;
        }

        // Check dependencies
        if (step.dependsOn && step.dependsOn.length > 0) {
          return step.dependsOn.every((depId) => {
            const depStep = plan.steps.find((s) => s.id === depId);
            return depStep && depStep.status === 'completed';
          });
        }

        return true;
      },

      getPlanProgress: (planId) => {
        const plan = get().getPlanById(planId);
        if (!plan || plan.totalSteps === 0) {
          return { completed: 0, total: 0, percentage: 0 };
        }

        return {
          completed: plan.completedSteps,
          total: plan.totalSteps,
          percentage: Math.round((plan.completedSteps / plan.totalSteps) * 100),
        };
      },
    }),
    {
      name: 'opensesh-plans',
      partialize: (state) => ({
        plans: state.plans,
        executionOptions: state.executionOptions,
      }),
    }
  )
);
