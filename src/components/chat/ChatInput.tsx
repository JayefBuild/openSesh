import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send,
  Paperclip,
  StopCircle,
} from 'lucide-react';
import { cn, generateId } from '@/lib/utils';
import { useMessageStore } from '@/stores/messageStore';
import { useThreadStore } from '@/stores/threadStore';
import { usePlanStore } from '@/stores/planStore';
// import { useSettingsStore } from '@/stores/settingsStore';
import { Button } from '@/components/ui/Button';
import { ModelSelector } from './ModelSelector';
import { PlanModeToggle } from '@/components/plan/PlanModeToggle';
import { ExecutionModeSelector } from '@/components/execution/ExecutionModeSelector';
import { sendMessageStream, type StreamEvent, type ChatMessageInput } from '@/lib/tauri';
import type { UnlistenFn } from '@tauri-apps/api/event';

interface ChatInputProps {
  threadId: string;
  className?: string;
}

export function ChatInput({ threadId, className }: ChatInputProps) {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const addMessage = useMessageStore((state) => state.addMessage);
  const appendToMessage = useMessageStore((state) => state.appendToMessage);
  const updateMessage = useMessageStore((state) => state.updateMessage);
  const getMessages = useMessageStore((state) => state.getMessages);
  const isGenerating = useMessageStore((state) => state.isGenerating);
  const setIsGenerating = useMessageStore((state) => state.setIsGenerating);
  const setCurrentStreamingMessage = useMessageStore((state) => state.setCurrentStreamingMessage);

  const activeThread = useThreadStore((state) => state.getActiveThread());
  const updateThread = useThreadStore((state) => state.updateThread);

  // Plan mode state
  const isGeneratingPlan = usePlanStore((state) => state.isGeneratingPlan);
  const setIsGeneratingPlan = usePlanStore((state) => state.setIsGeneratingPlan);
  const createPlan = usePlanStore((state) => state.createPlan);
  const updatePlan = usePlanStore((state) => state.updatePlan);
  const addStep = usePlanStore((state) => state.addStep);

  // Plan mode enabled for the current thread
  const planModeEnabled = activeThread?.planModeEnabled ?? false;

  // Keep track of the current stream's unlisten function for cleanup/stop
  const unlistenRef = useRef<UnlistenFn | null>(null);
  const currentAssistantMessageIdRef = useRef<string | null>(null);

  // Model info can be used for context display
  // const getModelById = useSettingsStore((state) => state.getModelById);
  // const currentModel = activeThread
  //   ? getModelById(activeThread.providerId, activeThread.modelId)
  //   : null;

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [message]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
    };
  }, []);

  const handleTogglePlanMode = useCallback(() => {
    if (activeThread) {
      updateThread(activeThread.id, { planModeEnabled: !planModeEnabled });
    }
  }, [activeThread, planModeEnabled, updateThread]);

  // Parse plan from AI response and create steps
  const parsePlanFromResponse = useCallback((planId: string, response: string) => {
    // Extract title from "## Plan: [Title]"
    const titleMatch = response.match(/##\s*Plan:\s*(.+)/i);
    const title = titleMatch ? titleMatch[1].trim() : 'Generated Plan';

    // Extract summary (text between title and ### Steps)
    const summaryMatch = response.match(/##\s*Plan:.*\n\n([\s\S]*?)(?=###\s*Steps:|$)/i);
    const summary = summaryMatch ? summaryMatch[1].trim() : '';

    updatePlan(planId, { title, summary });

    // Parse steps - looking for numbered items with step type in bold
    const stepRegex = /(\d+)\.\s*\*\*\[?(\w+(?:_\w+)?)\]?\*\*:?\s*(.+?)(?:\n\s*-\s*Description:\s*(.+?))?(?:\n\s*-\s*(?:File|Command|File\/Command):\s*(.+?))?(?=\n\d+\.|$)/gis;

    let match;
    while ((match = stepRegex.exec(response)) !== null) {
      const rawType = match[2].toLowerCase().replace(/\s+/g, '_');
      const stepTitle = match[3].trim();
      const description = match[4]?.trim() || stepTitle;
      const fileOrCommand = match[5]?.trim();

      // Map the type
      let type: 'file_edit' | 'file_create' | 'file_delete' | 'terminal_command' | 'git_operation' | 'information';
      switch (rawType) {
        case 'file_edit':
        case 'edit':
          type = 'file_edit';
          break;
        case 'file_create':
        case 'create':
          type = 'file_create';
          break;
        case 'file_delete':
        case 'delete':
          type = 'file_delete';
          break;
        case 'terminal_command':
        case 'command':
        case 'terminal':
          type = 'terminal_command';
          break;
        case 'git_operation':
        case 'git':
          type = 'git_operation';
          break;
        default:
          type = 'information';
      }

      // Build details based on type
      let details: Record<string, unknown>;
      switch (type) {
        case 'file_edit':
        case 'file_create':
        case 'file_delete':
          details = {
            filePath: fileOrCommand || '',
            description,
          };
          break;
        case 'terminal_command':
          details = {
            command: fileOrCommand || '',
            description,
          };
          break;
        case 'git_operation':
          details = {
            operation: 'other',
            command: fileOrCommand,
            description,
          };
          break;
        default:
          details = {
            description,
          };
      }

      addStep(planId, type, stepTitle, description, details);
    }
  }, [updatePlan, addStep]);

  const handlePlanModeSubmit = useCallback(async (userMessage: string) => {
    // In plan mode, we ask the AI to generate a plan
    setIsGeneratingPlan(true);

    // Add user message
    addMessage(threadId, {
      threadId,
      role: 'user',
      content: userMessage,
    });

    // Create assistant message for the plan generation response
    const assistantMessage = addMessage(threadId, {
      threadId,
      role: 'assistant',
      content: '',
      isStreaming: true,
    });
    currentAssistantMessageIdRef.current = assistantMessage.id;
    setCurrentStreamingMessage(assistantMessage.id);

    // Create a plan object
    const plan = createPlan(
      threadId,
      assistantMessage.id,
      userMessage,
      'Generating plan...',
      ''
    );

    // Update thread with the current plan
    updateThread(threadId, { currentPlanId: plan.id });

    // Build message history for the API with plan mode instructions
    const allMessages = getMessages(threadId);
    const planModeSystemPrompt = `You are in PLAN MODE. Instead of making changes directly, you must:

1. Analyze the user's request
2. Create a detailed plan with numbered steps
3. Each step should be one of these types:
   - file_edit: Editing an existing file
   - file_create: Creating a new file
   - file_delete: Deleting a file
   - terminal_command: Running a terminal command
   - git_operation: A git operation
   - information: An informational note

Format your response as a structured plan:

## Plan: [Title]

[Brief summary of what this plan will accomplish]

### Steps:

1. **[Step Type]**: [Step Title]
   - Description: [What this step does]
   - File/Command: [The file path or command, if applicable]

2. **[Step Type]**: [Step Title]
   - Description: [What this step does]
   - File/Command: [The file path or command, if applicable]

... continue for all steps ...

After the user reviews and approves the plan, you will execute each step.`;

    const chatMessages: ChatMessageInput[] = [
      { role: 'user', content: planModeSystemPrompt },
      ...allMessages
        .filter((m) => m.role !== 'system')
        .map((m) => ({
          role: m.role,
          content: m.content,
        })),
    ];

    const streamId = generateId();
    let fullResponse = '';

    try {
      const handleStreamEvent = (event: StreamEvent) => {
        const messageId = currentAssistantMessageIdRef.current;
        if (!messageId) return;

        switch (event.type) {
          case 'text_delta':
            fullResponse += event.text;
            appendToMessage(threadId, messageId, event.text);
            break;

          case 'error':
            console.error('Stream error:', event.message);
            updateMessage(threadId, messageId, {
              content: `Error generating plan: ${event.message}`,
              isStreaming: false,
            });
            updatePlan(plan.id, { status: 'error' });
            cleanupStream();
            break;

          case 'done':
            // Parse the plan from the response and populate steps
            parsePlanFromResponse(plan.id, fullResponse);
            updateMessage(threadId, messageId, { isStreaming: false });
            updatePlan(plan.id, { status: 'pending' });
            cleanupStream();
            break;
        }
      };

      const cleanupStream = () => {
        if (unlistenRef.current) {
          unlistenRef.current();
          unlistenRef.current = null;
        }
        currentAssistantMessageIdRef.current = null;
        setCurrentStreamingMessage(null);
        setIsGeneratingPlan(false);
      };

      const unlisten = await sendMessageStream(
        {
          messages: chatMessages,
          stream: true,
          provider: activeThread?.providerId,
          model: activeThread?.modelId,
          enable_tools: false,
        },
        streamId,
        handleStreamEvent
      );

      unlistenRef.current = unlisten;
    } catch (error) {
      console.error('Failed to generate plan:', error);

      if (currentAssistantMessageIdRef.current) {
        updateMessage(threadId, currentAssistantMessageIdRef.current, {
          content: `Failed to generate plan: ${error instanceof Error ? error.message : 'Unknown error'}`,
          isStreaming: false,
        });
      }

      updatePlan(plan.id, { status: 'error' });

      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
      currentAssistantMessageIdRef.current = null;
      setCurrentStreamingMessage(null);
      setIsGeneratingPlan(false);
    }
  }, [
    threadId,
    addMessage,
    appendToMessage,
    updateMessage,
    getMessages,
    setCurrentStreamingMessage,
    activeThread,
    updateThread,
    createPlan,
    updatePlan,
    setIsGeneratingPlan,
    parsePlanFromResponse,
  ]);

  const handleSubmit = useCallback(async () => {
    if (!message.trim() || isGenerating || isGeneratingPlan) return;

    const userMessage = message.trim();

    // Update thread title if it's still "New Thread"
    if (activeThread?.title === 'New Thread') {
      const truncatedTitle = userMessage.slice(0, 50) + (userMessage.length > 50 ? '...' : '');
      updateThread(threadId, { title: truncatedTitle });
    }

    setMessage('');

    // If plan mode is enabled, generate a plan instead of direct response
    if (planModeEnabled) {
      await handlePlanModeSubmit(userMessage);
      return;
    }

    // Regular direct mode
    // Add user message
    addMessage(threadId, {
      threadId,
      role: 'user',
      content: userMessage,
    });

    setIsGenerating(true);

    // Create assistant message placeholder for streaming
    const assistantMessage = addMessage(threadId, {
      threadId,
      role: 'assistant',
      content: '',
      isStreaming: true,
    });
    currentAssistantMessageIdRef.current = assistantMessage.id;
    setCurrentStreamingMessage(assistantMessage.id);

    // Build message history for the API
    const allMessages = getMessages(threadId);
    const chatMessages: ChatMessageInput[] = allMessages
      .filter((m) => m.role !== 'system') // Don't include system messages in history
      .map((m) => ({
        role: m.role,
        content: m.content,
      }));

    // Generate unique stream ID
    const streamId = generateId();

    try {
      // Set up stream event handler
      const handleStreamEvent = (event: StreamEvent) => {
        const messageId = currentAssistantMessageIdRef.current;
        if (!messageId) return;

        switch (event.type) {
          case 'message_start':
            // Message started, we can store the model info if needed
            break;

          case 'content_block_start':
            // Content block started, typically 'text' or 'tool_use'
            break;

          case 'text_delta':
            // Append text delta to the message
            appendToMessage(threadId, messageId, event.text);
            break;

          case 'tool_use_delta':
            // Handle tool use streaming (for future tool call support)
            // Could append to a tool call buffer here
            break;

          case 'content_block_stop':
            // Content block finished
            break;

          case 'message_delta':
            // Message metadata update (stop reason)
            break;

          case 'error':
            // Handle error
            console.error('Stream error:', event.message);
            updateMessage(threadId, messageId, {
              content: `Error: ${event.message}`,
              isStreaming: false,
            });
            cleanupStream();
            break;

          case 'done':
            // Stream completed
            updateMessage(threadId, messageId, { isStreaming: false });
            cleanupStream();
            break;
        }
      };

      const cleanupStream = () => {
        if (unlistenRef.current) {
          unlistenRef.current();
          unlistenRef.current = null;
        }
        currentAssistantMessageIdRef.current = null;
        setCurrentStreamingMessage(null);
        setIsGenerating(false);
      };

      // Start the stream
      const unlisten = await sendMessageStream(
        {
          messages: chatMessages,
          stream: true,
          provider: activeThread?.providerId,
          model: activeThread?.modelId,
          enable_tools: false, // Enable later when tool support is ready
        },
        streamId,
        handleStreamEvent
      );

      unlistenRef.current = unlisten;
    } catch (error) {
      console.error('Failed to send message:', error);

      // Update the assistant message with error
      if (currentAssistantMessageIdRef.current) {
        updateMessage(threadId, currentAssistantMessageIdRef.current, {
          content: `Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`,
          isStreaming: false,
        });
      }

      // Cleanup
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
      currentAssistantMessageIdRef.current = null;
      setCurrentStreamingMessage(null);
      setIsGenerating(false);
    }
  }, [
    message,
    threadId,
    isGenerating,
    isGeneratingPlan,
    planModeEnabled,
    addMessage,
    appendToMessage,
    updateMessage,
    getMessages,
    setIsGenerating,
    setCurrentStreamingMessage,
    activeThread,
    updateThread,
    handlePlanModeSubmit,
  ]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Submit on Cmd/Ctrl + Enter
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleStopGeneration = useCallback(() => {
    // Clean up the event listener
    if (unlistenRef.current) {
      unlistenRef.current();
      unlistenRef.current = null;
    }

    // Update the streaming message to mark it as stopped
    if (currentAssistantMessageIdRef.current) {
      updateMessage(threadId, currentAssistantMessageIdRef.current, {
        isStreaming: false,
      });
      currentAssistantMessageIdRef.current = null;
    }

    setCurrentStreamingMessage(null);
    setIsGenerating(false);
    setIsGeneratingPlan(false);
  }, [threadId, updateMessage, setCurrentStreamingMessage, setIsGenerating, setIsGeneratingPlan]);

  const handleModelChange = (providerId: string, modelId: string) => {
    if (activeThread) {
      updateThread(activeThread.id, { providerId, modelId });
    }
  };

  const isProcessing = isGenerating || isGeneratingPlan;

  return (
    <div className={cn('p-4', className)}>
      <div className="bg-[#1a1a1a] border border-[#333] rounded-lg">
        {/* Textarea */}
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              planModeEnabled
                ? 'Describe what you want to build... (Plan Mode)'
                : 'Ask a question or describe what you want to build...'
            }
            className="w-full min-h-[56px] max-h-[200px] px-4 py-3 bg-transparent text-white placeholder:text-[#666] resize-none focus:outline-none"
            disabled={isProcessing}
            rows={1}
          />
        </div>

        {/* Bottom toolbar */}
        <div className="flex items-center justify-between px-3 py-2 border-t border-[#333] gap-2 min-w-0">
          {/* Left side - Model selector and modes */}
          <div className="flex items-center gap-2 min-w-0 overflow-x-auto flex-shrink">
            <ModelSelector
              providerId={activeThread?.providerId || 'anthropic'}
              modelId={activeThread?.modelId || 'claude-sonnet-4-20250514'}
              onChange={handleModelChange}
            />

            {/* Plan mode toggle */}
            <PlanModeToggle
              enabled={planModeEnabled}
              onToggle={handleTogglePlanMode}
              disabled={isProcessing}
            />

            {/* Execution mode selector */}
            <ExecutionModeSelector disabled={isProcessing} />
          </div>

          {/* Right side - Actions */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Attachment button */}
            <button
              className="p-2 rounded hover:bg-[#252525] text-[#666] hover:text-white transition-colors"
              title="Attach file"
            >
              <Paperclip className="h-4 w-4" />
            </button>

            {/* Send/Stop button */}
            {isProcessing ? (
              <Button
                variant="danger"
                size="sm"
                leftIcon={<StopCircle className="h-4 w-4" />}
                onClick={handleStopGeneration}
              >
                Stop
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Send className="h-4 w-4" />}
                onClick={handleSubmit}
                disabled={!message.trim()}
              >
                {planModeEnabled ? 'Plan' : 'Send'}
              </Button>
            )}
          </div>
        </div>

        {/* Keyboard shortcut hint */}
        <div className="px-3 pb-2">
          <p className="text-xs text-[#666]">
            Press <kbd className="px-1 py-0.5 bg-[#252525] rounded text-[10px]">Cmd</kbd> +{' '}
            <kbd className="px-1 py-0.5 bg-[#252525] rounded text-[10px]">Enter</kbd> to{' '}
            {planModeEnabled ? 'generate plan' : 'send'}
          </p>
        </div>
      </div>
    </div>
  );
}
