# Product Requirements Document

## Product Name

**Open Sesh** (working name: Open Codex Workbench)

## Vision

Open Sesh is an open-source, model-agnostic AI coding workbench inspired by the [OpenAI Codex macOS app](https://openai.com/index/introducing-the-codex-app/). It provides a calm, powerful, keyboard-first environment where developers collaborate with AI across chat, filesystem, terminal, and git — without being locked into a single vendor, cloud, or subscription model.

The product prioritizes **trust, visibility, and control**. AI actions are always inspectable. File changes are diff-first. Nothing happens silently.

This is a **Simply Lovable Product**: limited in scope, but polished end-to-end.

## Core Principles

1. **Open source** by value and license
2. **Model-agnostic** by architecture — use OpenAI, Anthropic, Gemini, local models, or any OpenAI-compatible endpoint
3. **Local-first** execution — your code never leaves your machine unless you choose a cloud provider
4. **Diff-first**, not chat-first — every change is reviewable before applied
5. **Keyboard-first** UX — power users should never need to reach for the mouse
6. **Safe by default**, powerful by choice — graduated trust model

## Target Users

- Individual developers building side projects or exploring codebases
- Power users who want full control over their AI tooling
- Small teams who need a shared, vendor-neutral workflow

The product must scale from casual use to expert workflows without changing mental models.

## Non-Goals

- Replacing full IDEs (VSCode, JetBrains, etc.)
- Acting as a code editor of record
- Long-running autonomous agents (v1)
- Cloud-only workflows
- Prompt marketplace or persona systems
- Bundled language servers or linters

---

## Competitive Analysis: OpenAI Codex App

Based on analysis of the [Codex app](https://developers.openai.com/codex/app):

| Feature | Codex App | Open Sesh |
|---------|-----------|-----------|
| Provider | OpenAI only | Any provider |
| Pricing | ChatGPT subscription | Free + BYOK |
| Platform | macOS (Apple Silicon) | macOS (universal), future cross-platform |
| Multi-agent | Yes (parallel threads) | Yes (worktree isolation) |
| Git worktrees | Yes | Yes |
| Automations | Yes (scheduled) | Phase 2 |
| Skills/Plugins | Yes (OpenAI ecosystem) | Yes (open plugin system) |
| Plan Mode | Yes | Yes |
| Offline | No | Yes (with local models) |

**Our differentiation**: Provider freedom, offline capability, transparency, and community ownership.

---

## Supported Platforms

- **macOS** (primary) — Universal binary (Intel + Apple Silicon)
- Architecture supports future Linux and Windows builds

---

## Technology Stack

### Desktop Shell
- **Tauri v2** — Native performance, small binary, system webview
- **Rust backend** — File operations, git commands, process management

### Frontend
- **React 18+** with TypeScript
- **Vite** for fast builds
- **Zustand** for lightweight state management
- **Tailwind CSS** for styling
- **Framer Motion** for polished animations

### Embedded Components
- **Monaco Editor** — Diff viewer, file viewer, inline editing
- **xterm.js** — Full terminal emulation

### Git Integration
- Invoke **system-installed git** binary
- No bundled git implementation
- **Worktree support** for parallel agent work

### Storage
- **SQLite** for thread/project metadata (fast, portable, queryable)
- **Plain JSON** for settings and provider configs
- **Markdown** for optional conversation export
- **OS Keychain** for secrets (macOS Keychain, future: libsecret on Linux)

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         UI Shell (React)                        │
├─────────────┬─────────────┬─────────────┬─────────────┬─────────┤
│   Sidebar   │  Chat Pane  │  Diff Pane  │  Terminal   │ Header  │
└─────────────┴──────┬──────┴──────┬──────┴──────┬──────┴─────────┘
                     │             │             │
              ┌──────▼─────────────▼─────────────▼──────┐
              │              Tauri IPC Bridge           │
              └──────┬─────────────┬─────────────┬──────┘
                     │             │             │
┌────────────────────▼─┐ ┌────────▼────────┐ ┌──▼──────────────────┐
│   Workspace Manager  │ │   AI Runtime    │ │   Tooling Layer     │
│  - Projects          │ │  - Provider     │ │  - File Ops         │
│  - Threads           │ │    Adapters     │ │  - Git Commands     │
│  - Worktrees         │ │  - Tool Router  │ │  - Shell Executor   │
│  - State Persistence │ │  - Streaming    │ │  - Search/Grep      │
└──────────────────────┘ └─────────────────┘ └─────────────────────┘
```

Each subsystem is isolated by clear Rust trait boundaries.

---

## Data Model

### Project

A project represents a filesystem root the user is working with.

```typescript
interface Project {
  id: string;
  name: string;
  rootPath: string;
  isGitRepo: boolean;
  gitRemotes?: GitRemote[];
  defaultProviderId?: string;
  defaultModelId?: string;
  createdAt: Date;
  lastOpenedAt: Date;
}
```

### Thread

A thread represents a working session scoped to a project. Threads are the primary unit of work.

```typescript
interface Thread {
  id: string;
  projectId: string;
  title: string;                    // Auto-generated or user-set
  providerId: string;
  modelId: string;
  executionMode: 'safe' | 'assisted' | 'autonomous';
  worktreePath?: string;            // If using isolated worktree
  messages: Message[];
  pendingChanges: FileChange[];     // Unapplied diffs
  createdAt: Date;
  updatedAt: Date;
}
```

### Message

```typescript
interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  fileReferences?: FileReference[];  // Clickable file links
  timestamp: Date;
}
```

### FileChange

Represents a proposed change before user approval.

```typescript
interface FileChange {
  id: string;
  threadId: string;
  filePath: string;
  changeType: 'create' | 'modify' | 'delete';
  originalContent?: string;
  proposedContent?: string;
  hunks: DiffHunk[];                // For partial staging
  status: 'pending' | 'approved' | 'rejected' | 'applied';
}
```

Threads persist state across app restarts.

---

## Provider System

### Built-in Providers

| Provider | Protocol | Tool Calling | Streaming |
|----------|----------|--------------|-----------|
| OpenAI | OpenAI API | ✓ | ✓ |
| Anthropic | Messages API | ✓ | ✓ |
| Google Gemini | Gemini API | ✓ | ✓ |
| Ollama | OpenAI-compatible | ✓ | ✓ |
| LM Studio | OpenAI-compatible | ✓ | ✓ |

### Custom Provider

Users can define custom endpoints:

```typescript
interface CustomProvider {
  id: string;
  name: string;
  baseUrl: string;
  protocol: 'openai' | 'anthropic' | 'custom';
  authType: 'bearer' | 'api-key' | 'none';
  defaultHeaders?: Record<string, string>;
  models: ModelDefinition[];
}
```

### Provider Adapter Interface

Each provider implements:

```rust
trait ProviderAdapter {
    fn chat_completion(&self, request: ChatRequest) -> Stream<ChatChunk>;
    fn list_models(&self) -> Vec<Model>;
    fn supports_tools(&self) -> bool;
    fn format_tools(&self, tools: Vec<Tool>) -> Value;
    fn parse_tool_calls(&self, response: Value) -> Vec<ToolCall>;
}
```

---

## Authentication

### Supported Auth Modes

1. **API Key** (primary) — User enters key, stored in OS keychain
2. **OAuth** (optional) — For providers that support it (OpenAI, Google)

### OAuth Flow

1. App opens system browser to provider auth page
2. User authenticates on provider's website
3. Token returned via localhost callback or device flow
4. Refresh tokens stored securely in keychain

### Security

- API keys never logged or transmitted except to configured provider
- Keys stored using OS-native secure storage
- Optional key rotation reminders

---

## AI Capabilities & Tools

The AI has access to these tools (inspired by Claude Code):

### File Operations
| Tool | Description | Requires Approval |
|------|-------------|-------------------|
| `read_file` | Read file contents | No |
| `write_file` | Create or overwrite file | Yes (Safe mode) |
| `edit_file` | Apply targeted edits | Yes (Safe mode) |
| `list_directory` | List files in directory | No |
| `search_files` | Glob pattern search | No |
| `grep` | Search file contents | No |

### Terminal
| Tool | Description | Requires Approval |
|------|-------------|-------------------|
| `run_command` | Execute shell command | Yes |
| `background_command` | Run command in background | Yes |

### Git
| Tool | Description | Requires Approval |
|------|-------------|-------------------|
| `git_status` | Show working tree status | No |
| `git_diff` | Show changes | No |
| `git_log` | Show commit history | No |
| `git_stage` | Stage files | No |
| `git_commit` | Create commit | Yes |
| `git_push` | Push to remote | Yes |

### Web (optional)
| Tool | Description | Requires Approval |
|------|-------------|-------------------|
| `web_search` | Search the web | No |
| `fetch_url` | Fetch URL content | No |

---

## Safety Model

### Execution Modes

#### Safe (Default)
- AI may read files and propose changes
- All file writes require explicit user approval
- All shell commands require explicit user approval
- Changes shown as diffs before applying

#### Assisted
- AI may batch file writes (approve all at once)
- Shell commands still require individual approval
- Visual indicator shows pending changes count

#### Autonomous
- AI may write files and run commands without confirmation
- **Persistent red border** around app window
- Activity log always visible
- **Auto-timeout** after configurable period (default: 30 minutes)
- One-click emergency stop

### Sandbox Boundaries

All modes enforce:
- No operations outside project root without explicit path approval
- No modification of dotfiles (`.git`, `.env`) without warning
- No network requests from shell without approval
- Blocklist for dangerous commands (`rm -rf /`, `sudo`, etc.)

---

## User Interface Specification

### Layout (from screenshots)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [●●●] [⊞] [☐]  Thread Title  project-name  ···  ▷  ☐ Open  ⚙ Commit ▾  │ HEADER
├────────────────┬─────────────────────────────────────┬───────────────────┤
│                │                                     │ Uncommitted ▾     │
│ ☐ New thread   │  [Chat conversation...]             │ ┌───────────────┐ │
│                │                                     │ │ index.html +5 │ │
│ Automations    │  Files updated                      │ │ main.js +26   │ │
│ Skills         │  • index.html                       │ │ style.css +87 │ │
│ ───────────    │  • style.css                        │ └───────────────┘ │
│ Threads        │  • main.js                          │                   │
│  ▾ project-1   │                                     │ [Diff viewer]     │
│    Thread A    │  Checklist of improvements:         │                   │
│    Thread B    │  1. Hero background glow            │  67 │ <header...  │
│  ▾ project-2   │  2. Scroll parallax motion          │  68 │   <div...   │
│    Thread C    │  ...                                │  69 │     ...     │
│                │                                     │                   │
│                │  ┌─────────────────────────────┐    │ [Revert] [Stage]  │
│                │  │ 3 files changed +118 -0    │    │                   │
│                │  │ index.html    +5 -0        │    │                   │
│                │  │ src/main.js   +26 -0       │    │                   │
│                │  │ src/style.css +87 -0       │    │                   │
│                │  └─────────────────────────────┘    │                   │
│                │                                     │                   │
│                │  ┌─────────────────────────────────┐│                   │
│                │  │ Ask for follow-up changes       ││                   │
│                │  │ + GPT-5.2-Codex Medium ▾    ⏎  ││                   │
│                │  └─────────────────────────────────┘│                   │
│                │  ☐ Local ▾              ⎇ main ○   │                   │
│ ⚙ Settings     │                                     │                   │
├────────────────┴─────────────────────────────────────┴───────────────────┤
│ Terminal /bin/zsh                                                    ✕   │
│ $ npm run dev                                                            │
│ VITE v7.3.1 ready in 96ms                                               │
│ → Local: http://localhost:5173/                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Sidebar

- **New Thread** button (Cmd+N)
- **Automations** section (Phase 2)
- **Skills** section (Phase 2)
- **Threads** grouped by project
  - Collapse/expand project groups
  - Thread title with change indicator (+N -M)
  - Relative timestamp (10h, 19h)
- **Settings** at bottom

### Header Bar

- Window controls (macOS traffic lights)
- Toggle sidebar button
- Thread title (editable on click)
- Project name badge
- **Actions menu** (···)
- **Run button** (▷) — execute current plan
- **Open** dropdown — open in VSCode, Cursor, Terminal, Finder
- **Commit** dropdown — commit, push, create PR
- **Change summary** badge (+118 -0)

### Main Chat Pane

- **Message bubbles** with markdown rendering
- **File references** as clickable links (opens in diff pane)
- **Inline change summaries** showing files modified
- **Collapsible tool results**
- **Input area**:
  - Multi-line text input
  - Model selector dropdown (e.g., "GPT-5.2-Codex Medium")
  - Attachment button (+)
  - Voice input button (microphone)
  - Submit button
- **Status bar**:
  - Execution mode indicator (Local/Cloud)
  - Git branch with sync status

### Diff Pane (Right Panel)

- **Uncommitted changes** header with dropdown
- **File filter** input
- **File tree** of modified files
  - Grouped by: Staged / Unstaged
  - Shows line changes (+N -M)
- **Diff viewer** (Monaco)
  - Unified or side-by-side toggle
  - Syntax highlighting
  - Line-by-line or hunk selection
- **Actions**: Revert all, Stage all, per-file actions

### Terminal Pane (Bottom)

- Toggle via **Cmd+J**
- Shows shell type (`/bin/zsh`)
- Full xterm.js terminal
- Close button (×)
- Multiple terminal tabs (Phase 2)

### Command Palette (Cmd+K)

From screenshot — modal overlay with:

- **Search input**: "Search commands"
- **Suggested section**:
  - New thread (Cmd+N)
  - Open folder (Cmd+O)
  - Settings (Cmd+,)
- **Navigation section**:
  - Previous thread (Cmd+Opt+[)
  - Next thread (Cmd+Opt+])
  - Find (Cmd+F)
  - Back (Cmd+[)
  - Forward (Cmd+])

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Cmd+K | Command palette |
| Cmd+J | Toggle terminal |
| Cmd+N | New thread |
| Cmd+O | Open folder/project |
| Cmd+, | Settings |
| Cmd+Opt+[ | Previous thread |
| Cmd+Opt+] | Next thread |
| Cmd+F | Find in conversation |
| Cmd+[ | Navigate back |
| Cmd+] | Navigate forward |
| Cmd+Enter | Submit message |
| Cmd+Shift+Enter | Submit and run |
| Escape | Cancel current operation |
| Cmd+. | Stop AI generation |

---

## Plan Mode

Before executing complex changes, the AI can enter **Plan Mode**:

1. AI analyzes the request and codebase in **read-only mode**
2. AI presents a structured plan with:
   - Files to modify
   - Approach summary
   - Potential risks
   - Estimated scope
3. User can discuss, refine, or approve the plan
4. On approval, AI executes the plan

This builds confidence before autonomous execution.

---

## Worktree Support

For parallel agent work on the same repository:

1. Each thread can optionally use an **isolated git worktree**
2. Worktrees are created in `.opensesh/worktrees/<thread-id>/`
3. Changes in worktrees don't affect main working directory
4. User can merge worktree changes back to main
5. Worktrees are cleaned up when thread is deleted

---

## Skills System (Phase 2)

Skills extend the AI with reusable capabilities:

```typescript
interface Skill {
  id: string;
  name: string;
  description: string;
  instructions: string;          // System prompt additions
  tools?: ToolDefinition[];      // Custom tools
  resources?: Resource[];        // Files, URLs to include
  triggers?: Trigger[];          // Auto-activation conditions
}
```

Skills are stored as JSON/YAML files in `~/.opensesh/skills/`.

---

## Automations (Phase 2)

Scheduled background tasks:

```typescript
interface Automation {
  id: string;
  name: string;
  projectId: string;
  skillId?: string;
  prompt: string;
  schedule: CronExpression;
  executionMode: 'safe' | 'assisted';
  notifyOnComplete: boolean;
}
```

Results appear in an **Inbox** for review.

---

## Extensibility

### Phase 1
- Provider adapter plugins (TypeScript interface)
- Custom tool definitions via JSON

### Phase 2
- Skill packages (installable)
- MCP (Model Context Protocol) server support
- Custom UI panels (webview-based)

No plugin UI is required in v1.

---

## Telemetry

- **None by default**
- Optional opt-in crash reporting
- Optional anonymous usage analytics
- All telemetry clearly documented and controllable

---

## Open Source Strategy

- **License**: MIT or Apache 2.0
- **Repository**: Public GitHub
- **Contribution**: Clear guidelines, code of conduct, PR templates
- **Architecture**: Modular for community extensions
- **Documentation**: Comprehensive docs site

---

## Milestones

### Phase 1: Foundation (MVP)
- [ ] Tauri app shell with React frontend
- [ ] Project and thread management
- [ ] OpenAI provider adapter
- [ ] Basic chat with streaming
- [ ] File read/write tools
- [ ] Monaco diff viewer
- [ ] Safe execution mode with approvals

### Phase 2: Multi-Provider & Git
- [ ] Anthropic and Gemini adapters
- [ ] Ollama/local model support
- [ ] Full terminal integration (xterm.js)
- [ ] Git status, diff, stage, commit, push
- [ ] Worktree support for parallel threads
- [ ] Command palette (Cmd+K)

### Phase 3: Polish & Power Features
- [ ] Plan mode
- [ ] Assisted and Autonomous execution modes
- [ ] Skills system
- [ ] Automations with scheduling
- [ ] Keyboard shortcut customization
- [ ] Performance optimization

### Phase 4: Ecosystem
- [ ] Plugin/extension API
- [ ] MCP server support
- [ ] Community skill sharing
- [ ] Windows/Linux builds

---

## Success Criteria

- Users can complete real coding tasks end-to-end
- Switching providers mid-conversation works seamlessly
- No hidden file changes — every modification is visible
- App feels fast, calm, and trustworthy
- Cold start under 2 seconds
- Memory usage under 500MB typical

---

## Open Questions

1. **OAuth complexity**: Each provider has different OAuth scopes and flows. Should we prioritize API keys for simplicity?
2. **Worktree UX**: How do we clearly communicate which worktree is active?
3. **Plugin security**: How do we sandbox third-party skills/plugins?
4. **Cross-platform timeline**: When should we invest in Windows/Linux?
5. **Offline model defaults**: Should we bundle a small local model for offline use?

---

## References

- [OpenAI Codex App Announcement](https://openai.com/index/introducing-the-codex-app/)
- [Codex App Documentation](https://developers.openai.com/codex/app)
- [9to5Mac Coverage](https://9to5mac.com/2026/02/02/openai-launches-codex-app-for-macos-here-are-the-details/)
- [Tauri v2 Documentation](https://v2.tauri.app/)
- [Claude Code](https://claude.ai/claude-code) — Tool calling patterns
