import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { generateId } from '@/lib/utils';
import type {
  ExecutionMode,
  ExecutionAction,
  ActionStatus,
  ActionType,
  ActionDetails,
  ActionConfirmationRequest,
  ActionConfirmationResponse,
  ExecutionContext,
  ExecutionProgress,
  ExecutionSettings,
  ExecutionAuditEntry,
  ActionRiskLevel,
} from '@/types/execution';

interface ExecutionStore {
  // State
  executionMode: ExecutionMode;
  actions: ExecutionAction[];
  pendingConfirmation: ActionConfirmationRequest | null;
  isExecuting: boolean;
  isPaused: boolean;
  currentActionId: string | null;
  executionContext: ExecutionContext | null;
  auditLog: ExecutionAuditEntry[];
  settings: ExecutionSettings;

  // Mode management
  setExecutionMode: (mode: ExecutionMode) => void;
  getExecutionMode: () => ExecutionMode;

  // Action queue management
  queueAction: (
    type: ActionType,
    title: string,
    description: string,
    details: ActionDetails,
    riskLevel: ActionRiskLevel,
    threadId: string,
    planId?: string,
    planStepId?: string
  ) => ExecutionAction;
  queueActions: (actions: ExecutionAction[]) => void;
  removeAction: (actionId: string) => void;
  clearQueue: () => void;
  getActionById: (actionId: string) => ExecutionAction | undefined;
  getActionsByThread: (threadId: string) => ExecutionAction[];
  getPendingActions: (threadId?: string) => ExecutionAction[];
  getQueuedActions: (threadId?: string) => ExecutionAction[];

  // Action status updates
  updateActionStatus: (actionId: string, status: ActionStatus, result?: string, error?: string) => void;
  approveAction: (actionId: string, editedDetails?: ActionDetails, note?: string) => void;
  rejectAction: (actionId: string, note?: string) => void;
  approveAllPending: (threadId?: string) => void;
  rejectAllPending: (threadId?: string) => void;

  // Confirmation workflow
  requestConfirmation: (action: ExecutionAction, showDiff?: boolean, allowEdit?: boolean) => void;
  handleConfirmationResponse: (response: ActionConfirmationResponse) => void;
  cancelConfirmation: () => void;
  getPendingConfirmation: () => ActionConfirmationRequest | null;

  // Execution control
  startExecution: (threadId: string, context?: Partial<ExecutionContext>) => void;
  pauseExecution: () => void;
  resumeExecution: () => void;
  cancelExecution: () => void;
  completeCurrentAction: (result?: string) => void;
  failCurrentAction: (error: string) => void;
  skipCurrentAction: () => void;

  // Progress tracking
  getProgress: (threadId?: string) => ExecutionProgress;
  getNextAction: (threadId?: string) => ExecutionAction | undefined;

  // Settings management
  updateSettings: (settings: Partial<ExecutionSettings>) => void;

  // Audit log
  addAuditEntry: (action: ExecutionAction, success: boolean, userApproved: boolean, error?: string) => void;
  getAuditLog: (threadId?: string) => ExecutionAuditEntry[];
  clearAuditLog: () => void;

  // Utility
  shouldConfirmAction: (action: ExecutionAction) => boolean;
  reset: () => void;
}

const defaultSettings: ExecutionSettings = {
  defaultExecutionMode: 'assisted',
  alwaysConfirmDangerous: true,
  alwaysConfirmGitOperations: true,
  alwaysConfirmFileDeletions: true,
  stopOnError: true,
  enableAuditLog: true,
  autonomousTimeout: 60,
  maxActionsPerBatch: 50,
};

export const useExecutionStore = create<ExecutionStore>()(
  persist(
    (set, get) => ({
      // Initial state
      executionMode: 'assisted',
      actions: [],
      pendingConfirmation: null,
      isExecuting: false,
      isPaused: false,
      currentActionId: null,
      executionContext: null,
      auditLog: [],
      settings: defaultSettings,

      // Mode management
      setExecutionMode: (mode) => {
        set({ executionMode: mode });
      },

      getExecutionMode: () => {
        return get().executionMode;
      },

      // Action queue management
      queueAction: (type, title, description, details, riskLevel, threadId, planId, planStepId) => {
        const action: ExecutionAction = {
          id: generateId(),
          type,
          title,
          description,
          details,
          status: 'pending',
          riskLevel,
          createdAt: new Date(),
          threadId,
          planId,
          planStepId,
        };

        set((state) => ({
          actions: [...state.actions, action],
        }));

        return action;
      },

      queueActions: (actions) => {
        set((state) => ({
          actions: [...state.actions, ...actions],
        }));
      },

      removeAction: (actionId) => {
        set((state) => ({
          actions: state.actions.filter((a) => a.id !== actionId),
        }));
      },

      clearQueue: () => {
        set({ actions: [], currentActionId: null });
      },

      getActionById: (actionId) => {
        return get().actions.find((a) => a.id === actionId);
      },

      getActionsByThread: (threadId) => {
        return get().actions.filter((a) => a.threadId === threadId);
      },

      getPendingActions: (threadId) => {
        const actions = get().actions;
        const filtered = threadId
          ? actions.filter((a) => a.threadId === threadId)
          : actions;
        return filtered.filter((a) => ['pending', 'awaiting_confirmation', 'approved'].includes(a.status));
      },

      getQueuedActions: (threadId) => {
        const actions = get().actions;
        const filtered = threadId
          ? actions.filter((a) => a.threadId === threadId)
          : actions;
        return filtered.filter((a) => a.status !== 'completed' && a.status !== 'failed' && a.status !== 'cancelled' && a.status !== 'rejected');
      },

      // Action status updates
      updateActionStatus: (actionId, status, result, error) => {
        set((state) => ({
          actions: state.actions.map((a) =>
            a.id === actionId
              ? {
                  ...a,
                  status,
                  result: result ?? a.result,
                  error: error ?? a.error,
                  executedAt: ['completed', 'failed'].includes(status) ? new Date() : a.executedAt,
                }
              : a
          ),
        }));
      },

      approveAction: (actionId, editedDetails, note) => {
        set((state) => ({
          actions: state.actions.map((a) =>
            a.id === actionId
              ? {
                  ...a,
                  status: 'approved' as ActionStatus,
                  userModifiedDetails: editedDetails,
                  userNote: note,
                }
              : a
          ),
          pendingConfirmation: state.pendingConfirmation?.action.id === actionId
            ? null
            : state.pendingConfirmation,
        }));
      },

      rejectAction: (actionId, note) => {
        set((state) => ({
          actions: state.actions.map((a) =>
            a.id === actionId
              ? {
                  ...a,
                  status: 'rejected' as ActionStatus,
                  userNote: note,
                }
              : a
          ),
          pendingConfirmation: state.pendingConfirmation?.action.id === actionId
            ? null
            : state.pendingConfirmation,
        }));
      },

      approveAllPending: (threadId) => {
        set((state) => ({
          actions: state.actions.map((a) =>
            (a.status === 'pending' || a.status === 'awaiting_confirmation') &&
            (!threadId || a.threadId === threadId)
              ? { ...a, status: 'approved' as ActionStatus }
              : a
          ),
          pendingConfirmation: null,
        }));
      },

      rejectAllPending: (threadId) => {
        set((state) => ({
          actions: state.actions.map((a) =>
            (a.status === 'pending' || a.status === 'awaiting_confirmation') &&
            (!threadId || a.threadId === threadId)
              ? { ...a, status: 'rejected' as ActionStatus }
              : a
          ),
          pendingConfirmation: null,
        }));
      },

      // Confirmation workflow
      requestConfirmation: (action, showDiff = false, allowEdit = true) => {
        // Update action status to awaiting confirmation
        set((state) => ({
          actions: state.actions.map((a) =>
            a.id === action.id
              ? { ...a, status: 'awaiting_confirmation' as ActionStatus }
              : a
          ),
          pendingConfirmation: {
            action,
            showDiff,
            allowEdit,
            warningMessage: action.riskLevel === 'dangerous'
              ? 'This action may have significant effects. Please review carefully.'
              : undefined,
          },
        }));
      },

      handleConfirmationResponse: (response) => {
        const { actionId, decision, editedDetails, note } = response;

        switch (decision) {
          case 'approve':
            get().approveAction(actionId, undefined, note);
            break;
          case 'edit_and_approve':
            get().approveAction(actionId, editedDetails, note);
            break;
          case 'reject':
            get().rejectAction(actionId, note);
            break;
        }
      },

      cancelConfirmation: () => {
        set({ pendingConfirmation: null });
      },

      getPendingConfirmation: () => {
        return get().pendingConfirmation;
      },

      // Execution control
      startExecution: (threadId, context) => {
        set({
          isExecuting: true,
          isPaused: false,
          executionContext: {
            threadId,
            ...context,
          },
        });
      },

      pauseExecution: () => {
        set({ isPaused: true });
      },

      resumeExecution: () => {
        set({ isPaused: false });
      },

      cancelExecution: () => {
        // Mark all pending/queued actions as cancelled
        set((state) => ({
          actions: state.actions.map((a) =>
            ['pending', 'awaiting_confirmation', 'approved', 'executing'].includes(a.status)
              ? { ...a, status: 'cancelled' as ActionStatus }
              : a
          ),
          isExecuting: false,
          isPaused: false,
          currentActionId: null,
          pendingConfirmation: null,
        }));
      },

      completeCurrentAction: (result) => {
        const { currentActionId, settings, executionMode, actions } = get();
        if (!currentActionId) return;

        const action = actions.find((a) => a.id === currentActionId);
        if (!action) return;

        // Update status
        get().updateActionStatus(currentActionId, 'completed', result);

        // Add audit entry
        if (settings.enableAuditLog) {
          get().addAuditEntry(
            { ...action, status: 'completed', result },
            true,
            executionMode === 'assisted'
          );
        }

        set({ currentActionId: null });
      },

      failCurrentAction: (error) => {
        const { currentActionId, settings, executionMode, actions } = get();
        if (!currentActionId) return;

        const action = actions.find((a) => a.id === currentActionId);
        if (!action) return;

        // Update status
        get().updateActionStatus(currentActionId, 'failed', undefined, error);

        // Add audit entry
        if (settings.enableAuditLog) {
          get().addAuditEntry(
            { ...action, status: 'failed', error },
            false,
            executionMode === 'assisted',
            error
          );
        }

        set({ currentActionId: null });
      },

      skipCurrentAction: () => {
        const { currentActionId } = get();
        if (!currentActionId) return;

        get().updateActionStatus(currentActionId, 'cancelled');
        set({ currentActionId: null });
      },

      // Progress tracking
      getProgress: (threadId) => {
        const actions = threadId
          ? get().actions.filter((a) => a.threadId === threadId)
          : get().actions;

        const total = actions.length;
        const completed = actions.filter((a) => a.status === 'completed').length;
        const failed = actions.filter((a) => a.status === 'failed').length;
        const skipped = actions.filter((a) =>
          ['cancelled', 'rejected'].includes(a.status)
        ).length;

        const currentAction = get().currentActionId
          ? actions.find((a) => a.id === get().currentActionId)
          : undefined;

        return {
          totalActions: total,
          completedActions: completed,
          failedActions: failed,
          skippedActions: skipped,
          currentAction,
          percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
        };
      },

      getNextAction: (threadId) => {
        const { actions, executionMode, isExecuting, isPaused } = get();

        if (!isExecuting || isPaused) return undefined;

        const filtered = threadId
          ? actions.filter((a) => a.threadId === threadId)
          : actions;

        // In assisted mode, only execute approved actions
        // In autonomous mode, execute approved or pending (non-dangerous) actions
        return filtered.find((a) => {
          if (a.status === 'approved') return true;

          if (executionMode === 'autonomous' && a.status === 'pending') {
            // Check if this action needs confirmation
            if (!get().shouldConfirmAction(a)) {
              return true;
            }
          }

          return false;
        });
      },

      // Settings management
      updateSettings: (newSettings) => {
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        }));
      },

      // Audit log
      addAuditEntry: (action, success, userApproved, error) => {
        const entry: ExecutionAuditEntry = {
          id: generateId(),
          action,
          executedAt: new Date(),
          executionMode: get().executionMode,
          userApproved,
          success,
          error,
        };

        set((state) => ({
          auditLog: [entry, ...state.auditLog].slice(0, 1000), // Keep last 1000 entries
        }));
      },

      getAuditLog: (threadId) => {
        const { auditLog } = get();
        return threadId
          ? auditLog.filter((e) => e.action.threadId === threadId)
          : auditLog;
      },

      clearAuditLog: () => {
        set({ auditLog: [] });
      },

      // Utility
      shouldConfirmAction: (action) => {
        const { executionMode, settings } = get();

        // In assisted mode, always confirm
        if (executionMode === 'assisted') return true;

        // In autonomous mode, check settings
        if (settings.alwaysConfirmDangerous && action.riskLevel === 'dangerous') {
          return true;
        }

        if (settings.alwaysConfirmGitOperations && action.type === 'git_operation') {
          return true;
        }

        if (settings.alwaysConfirmFileDeletions && action.type === 'file_delete') {
          return true;
        }

        return false;
      },

      reset: () => {
        set({
          actions: [],
          pendingConfirmation: null,
          isExecuting: false,
          isPaused: false,
          currentActionId: null,
          executionContext: null,
        });
      },
    }),
    {
      name: 'opensesh-execution',
      partialize: (state) => ({
        executionMode: state.executionMode,
        settings: state.settings,
        auditLog: state.auditLog.slice(0, 100), // Only persist last 100 audit entries
      }),
    }
  )
);
