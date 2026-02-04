import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { Project, Thread, Message, Settings } from '@/types';

/**
 * Tauri command wrappers for type-safe invocations
 */

// Project Commands
export async function getProjects(): Promise<Project[]> {
  return invoke('get_projects');
}

export async function createProject(path: string): Promise<Project> {
  return invoke('create_project', { path });
}

export async function openProject(projectId: string): Promise<void> {
  return invoke('open_project', { projectId });
}

export async function deleteProject(projectId: string): Promise<void> {
  return invoke('delete_project', { projectId });
}

// Thread Commands
export async function getThreads(projectId: string): Promise<Thread[]> {
  return invoke('get_threads', { projectId });
}

export async function createThread(projectId: string, title?: string): Promise<Thread> {
  return invoke('create_thread', { projectId, title });
}

export async function updateThread(threadId: string, updates: Partial<Thread>): Promise<Thread> {
  return invoke('update_thread', { threadId, updates });
}

export async function deleteThread(threadId: string): Promise<void> {
  return invoke('delete_thread', { threadId });
}

// Message Commands
export async function getMessages(threadId: string): Promise<Message[]> {
  return invoke('get_messages', { threadId });
}

// Chat Message Types for Rust backend
export interface ChatMessageInput {
  role: string;
  content: string;
}

export interface SendMessageRequest {
  messages: ChatMessageInput[];
  system_prompt?: string;
  enable_tools?: boolean;
  stream?: boolean;
  provider?: string;
  model?: string;
}

// Stream event types matching Rust backend
export type StreamEvent =
  | { type: 'message_start'; id: string; model: string }
  | { type: 'content_block_start'; index: number; block_type: string }
  | { type: 'text_delta'; index: number; text: string }
  | { type: 'tool_use_delta'; index: number; partial_json: string }
  | { type: 'content_block_stop'; index: number }
  | { type: 'message_delta'; stop_reason: string | null }
  | { type: 'error'; message: string }
  | { type: 'done' };

/**
 * Send a message with streaming response
 * @param request The message request
 * @param streamId Unique identifier for this stream
 * @param onEvent Callback for each stream event
 * @returns A function to stop listening
 */
export async function sendMessageStream(
  request: SendMessageRequest,
  streamId: string,
  onEvent: (event: StreamEvent) => void
): Promise<UnlistenFn> {
  // Set up event listener before sending the request
  const eventName = `chat-stream-${streamId}`;
  const unlisten = await listen<StreamEvent>(eventName, (event) => {
    onEvent(event.payload);
  });

  try {
    // Invoke the streaming command
    await invoke('send_message_stream', {
      request,
      streamId,
    });
  } catch (error) {
    // Clean up listener on error
    unlisten();
    throw error;
  }

  return unlisten;
}

/**
 * Send a non-streaming message
 */
export interface ChatResponseOutput {
  id: string;
  content: string;
  tool_calls: ToolCallOutput[];
  stop_reason: string | null;
  usage: { input_tokens: number; output_tokens: number };
  model: string;
}

export interface ToolCallOutput {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export async function sendChatMessage(request: SendMessageRequest): Promise<ChatResponseOutput> {
  return invoke('send_message', { request });
}

export async function stopGeneration(threadId: string): Promise<void> {
  return invoke('stop_generation', { threadId });
}

// Settings Commands
export async function getSettings(): Promise<Settings> {
  return invoke('get_settings');
}

export async function updateSettings(settings: Partial<Settings>): Promise<Settings> {
  return invoke('update_settings', { settings });
}

// Git Commands - Types
export interface GitFileStatus {
  path: string;
  status: string;
  old_path: string | null;
}

export interface GitStatusResponse {
  branch: string;
  ahead: number;
  behind: number;
  staged: GitFileStatus[];
  unstaged: GitFileStatus[];
  untracked: string[];
  is_clean: boolean;
  has_conflicts: boolean;
}

export interface GitBranch {
  name: string;
  commit: string;
  upstream: string | null;
  is_current: boolean;
  is_remote: boolean;
}

export interface GitCommit {
  hash: string;
  short_hash: string;
  author: string;
  email: string;
  date: string;
  message: string;
  body: string;
}

// Git Commands - Functions
export async function gitStatus(path: string): Promise<GitStatusResponse> {
  return invoke('git_status', { path });
}

export async function gitDiff(path: string, staged: boolean): Promise<string> {
  return invoke('git_diff', { path, staged });
}

export async function gitDiffFile(path: string, filePath: string, staged: boolean): Promise<string> {
  return invoke('git_diff_file', { path, filePath, staged });
}

export async function gitLog(path: string, count: number): Promise<GitCommit[]> {
  return invoke('git_log', { path, count });
}

export async function gitStage(path: string, files: string[]): Promise<void> {
  return invoke('git_stage', { path, files });
}

export async function gitUnstage(path: string, files: string[]): Promise<void> {
  return invoke('git_unstage', { path, files });
}

export async function gitStageAll(path: string): Promise<void> {
  return invoke('git_stage_all', { path });
}

export async function gitCommit(path: string, message: string): Promise<GitCommit> {
  return invoke('git_commit', { path, message });
}

export async function gitDiscard(path: string, filePath: string): Promise<void> {
  return invoke('git_discard', { path, filePath });
}

export async function gitBranches(path: string): Promise<GitBranch[]> {
  return invoke('git_branches', { path });
}

export async function gitCheckout(path: string, branch: string): Promise<void> {
  return invoke('git_checkout', { path, branch });
}

export async function gitCreateBranch(path: string, name: string, checkout: boolean): Promise<void> {
  return invoke('git_create_branch', { path, name, checkout });
}

export async function gitPull(path: string): Promise<string> {
  return invoke('git_pull', { path });
}

export async function gitPush(path: string, setUpstream: boolean): Promise<string> {
  return invoke('git_push', { path, setUpstream });
}

export async function gitFetch(path: string): Promise<string> {
  return invoke('git_fetch', { path });
}

export async function isGitRepository(path: string): Promise<boolean> {
  return invoke('is_git_repository', { path });
}

export async function gitInit(path: string): Promise<void> {
  return invoke('git_init', { path });
}

export async function gitShowFile(path: string, filePath: string, gitRef: string): Promise<string> {
  return invoke('git_show_file', { path, filePath, gitRef });
}

// File System Commands
export async function readFile(path: string): Promise<string> {
  return invoke('read_file', { path });
}

export async function writeFile(path: string, content: string): Promise<void> {
  return invoke('write_file', { path, content });
}

export async function listDirectory(path: string): Promise<string[]> {
  return invoke('list_directory', { path });
}

// Terminal Commands
export async function createTerminal(cwd?: string): Promise<string> {
  return invoke('create_terminal', { cwd });
}

export async function writeToTerminal(terminalId: string, data: string): Promise<void> {
  return invoke('write_to_terminal', { terminalId, data });
}

export async function resizeTerminal(
  terminalId: string,
  cols: number,
  rows: number
): Promise<void> {
  return invoke('resize_terminal', { terminalId, cols, rows });
}

export async function closeTerminal(terminalId: string): Promise<void> {
  return invoke('close_terminal', { terminalId });
}

// Provider Commands
export async function getProviders(): Promise<{
  id: string;
  name: string;
  models: { id: string; name: string; contextWindow: number }[];
}[]> {
  return invoke('get_providers');
}

export async function setApiKey(providerId: string, apiKey: string): Promise<void> {
  return invoke('set_api_key', { providerId, apiKey });
}

// Window Commands
export async function minimizeWindow(): Promise<void> {
  return invoke('minimize_window');
}

export async function maximizeWindow(): Promise<void> {
  return invoke('maximize_window');
}

export async function closeWindow(): Promise<void> {
  return invoke('close_window');
}

// Dialog Commands
export async function openFileDialog(options?: {
  multiple?: boolean;
  directory?: boolean;
  filters?: { name: string; extensions: string[] }[];
}): Promise<string | string[] | null> {
  return invoke('open_file_dialog', { options });
}

export async function saveFileDialog(options?: {
  defaultPath?: string;
  filters?: { name: string; extensions: string[] }[];
}): Promise<string | null> {
  return invoke('save_file_dialog', { options });
}
