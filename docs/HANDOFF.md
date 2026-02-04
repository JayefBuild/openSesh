# Open Sesh - Handoff Document

**Date:** February 4, 2025
**Status:** Phase 2 & 3 Complete
**Repository:** https://github.com/JayefBuild/openSesh

---

## Overview

Open Sesh is an open-source, model-agnostic AI coding workbench inspired by the OpenAI Codex app. It provides a native macOS desktop application for collaborating with AI across chat, filesystem, terminal, and git.

## What Was Built

### Technology Stack

| Layer | Technology |
|-------|------------|
| Desktop Shell | Tauri v2 + Rust |
| Frontend | React 18 + TypeScript + Vite |
| State Management | Zustand (with persistence) |
| Styling | Tailwind CSS |
| Code Editor | Monaco Editor |
| Terminal | xterm.js + portable-pty |
| Animations | Framer Motion |
| Dialog | tauri-plugin-dialog |

### Project Structure

```
openSesh/
├── src/                          # React frontend
│   ├── components/
│   │   ├── chat/                 # Chat interface
│   │   │   ├── ChatPane.tsx
│   │   │   ├── ChatInput.tsx     # With Plan Mode toggle
│   │   │   ├── MessageList.tsx
│   │   │   ├── MessageBubble.tsx
│   │   │   └── ModelSelector.tsx
│   │   ├── diff/                 # Git diff viewer
│   │   │   ├── DiffPane.tsx      # With error boundary
│   │   │   ├── DiffViewer.tsx    # Custom styled diff (green/red highlighting)
│   │   │   ├── FileTree.tsx
│   │   │   └── CommitPanel.tsx
│   │   ├── terminal/
│   │   │   └── TerminalPane.tsx  # Real PTY integration
│   │   ├── sidebar/
│   │   │   ├── ProjectList.tsx
│   │   │   ├── ThreadList.tsx
│   │   │   └── ThreadItem.tsx
│   │   ├── layout/
│   │   │   ├── MainLayout.tsx
│   │   │   ├── Sidebar.tsx       # With folder picker
│   │   │   ├── Header.tsx        # With Source Control toggle
│   │   │   ├── ResizablePanels.tsx
│   │   │   └── SettingsModal.tsx
│   │   ├── plan/                 # Plan Mode (Phase 3)
│   │   │   ├── PlanView.tsx
│   │   │   ├── PlanStepItem.tsx
│   │   │   ├── PlanModeToggle.tsx
│   │   │   └── index.ts
│   │   ├── execution/            # Execution Modes (Phase 3)
│   │   │   ├── ExecutionModeSelector.tsx
│   │   │   ├── ActionConfirmationModal.tsx
│   │   │   ├── ExecutionProgress.tsx
│   │   │   ├── ActionQueue.tsx
│   │   │   ├── ExecutionSettingsPanel.tsx
│   │   │   └── index.ts
│   │   ├── skills/               # Skills System (Phase 3)
│   │   │   ├── SkillsPanel.tsx
│   │   │   ├── SkillCard.tsx
│   │   │   ├── SkillBadges.tsx
│   │   │   └── index.ts
│   │   ├── changes/              # File Change Approval (Phase 2)
│   │   │   ├── FileChangePreview.tsx
│   │   │   ├── FileApprovalActions.tsx
│   │   │   ├── PendingChangesPanel.tsx
│   │   │   ├── PendingChangesModal.tsx
│   │   │   └── index.ts
│   │   ├── command-palette/
│   │   │   └── CommandPalette.tsx
│   │   └── ui/
│   │       ├── Button.tsx
│   │       ├── Input.tsx
│   │       ├── Dropdown.tsx
│   │       └── Modal.tsx
│   ├── stores/
│   │   ├── projectStore.ts       # With migration for stale data
│   │   ├── threadStore.ts
│   │   ├── messageStore.ts
│   │   ├── settingsStore.ts
│   │   ├── uiStore.ts
│   │   ├── gitStore.ts           # NEW: Git state management
│   │   ├── planStore.ts          # NEW: Plan Mode state
│   │   ├── executionStore.ts     # NEW: Execution state
│   │   ├── skillStore.ts         # NEW: Skills state
│   │   └── pendingChangesStore.ts # NEW: File approval state
│   ├── hooks/
│   │   ├── useKeyboardShortcuts.ts
│   │   ├── useTerminal.ts        # PTY integration
│   │   └── useTauri.ts
│   ├── lib/
│   │   ├── tauri.ts              # All Tauri IPC wrappers
│   │   └── utils.ts
│   └── types/
│       ├── index.ts
│       ├── plan.ts               # NEW: Plan types
│       ├── execution.ts          # NEW: Execution types
│       └── skills.ts             # NEW: Skills types
├── src-tauri/
│   └── src/
│       ├── main.rs
│       ├── lib.rs                # With dialog plugin
│       ├── state.rs
│       ├── commands/
│       │   ├── chat.rs           # Streaming AI chat
│       │   ├── files.rs          # With select_directory
│       │   ├── git.rs            # Full git operations
│       │   └── terminal.rs       # Real PTY with portable-pty
│       ├── providers/
│       │   ├── anthropic.rs
│       │   ├── openai.rs
│       │   └── types.rs
│       └── tools/
│           ├── file_ops.rs
│           ├── search.rs
│           └── executor.rs
└── docs/
    ├── PRD.md
    ├── BUILD_LOG.md
    ├── DEVELOPMENT.md
    └── HANDOFF.md
```

---

## Features Implemented

### Phase 1 (UI Foundation) ✅
- [x] Sidebar with projects/threads navigation
- [x] Chat interface with markdown rendering
- [x] Model selector (Anthropic/OpenAI/Google)
- [x] Monaco-based code editor
- [x] xterm.js terminal pane
- [x] Command palette (Cmd+K)
- [x] Settings modal
- [x] Keyboard shortcuts
- [x] Dark theme
- [x] Responsive panel resizing

### Phase 2 (Core Integration) ✅
- [x] **Chat → Backend Wiring**: Frontend sends messages to Rust, streams responses
- [x] **Streaming Display**: Real-time text streaming with auto-scroll
- [x] **Real PTY Terminal**: Using portable-pty for actual shell sessions
- [x] **Git Integration**:
  - Real git status, diff, stage/unstage, commit
  - Custom diff viewer with green/red line highlighting
  - Dual line numbers (old/new)
  - Source Control panel toggle in header
- [x] **File Change Approval**: Pending changes store, approve/reject workflow
- [x] **Project Folder Picker**: Native macOS folder dialog via tauri-plugin-dialog

### Phase 3 (Advanced Features) ✅
- [x] **Plan Mode**:
  - AI generates execution plans before changes
  - Step-by-step approval (approve/reject/edit per step)
  - Plan execution with progress tracking
  - Step types: file_edit, file_create, file_delete, terminal_command, git_operation, information
- [x] **Execution Modes**:
  - Assisted: Requires human approval for each action
  - Autonomous: Auto-execute with progress reporting
  - Confirmation modal for dangerous actions
  - Pause/resume/cancel controls
- [x] **Skills System**:
  - 7 built-in skills: file_read, file_write, terminal, git_read, git_write, web_search, code_generation
  - Risk levels: safe, moderate, dangerous
  - Per-thread skill configuration
  - Skills panel in settings

### Backend (Rust) ✅
- [x] Anthropic provider with SSE streaming
- [x] OpenAI provider with streaming
- [x] File operations (read, write, list, search, grep)
- [x] Git commands (status, diff, diff_file, log, stage, unstage, commit, push, pull, branches)
- [x] Real PTY shell sessions with portable-pty
- [x] Native folder picker with tauri-plugin-dialog

---

## Configuration

### Environment Variables

Create a `.env` file in the project root:

```bash
# Required: At least one API key
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
```

### Running the App

```bash
# Development (hot reload)
pnpm tauri dev

# Production build
pnpm tauri build

# Run frontend only (browser)
pnpm dev
# Then open http://localhost:1420
```

---

## Key Implementation Details

### Tauri Parameter Naming
Tauri automatically converts Rust snake_case parameters to JavaScript camelCase:
- Rust: `file_path: String` → JS: `filePath`
- Rust: `git_ref: String` → JS: `gitRef`

### Git Diff Viewer
Custom React component (not Monaco) for proper diff styling:
- Green background + border for added lines
- Red background + border for removed lines
- Blue for hunk headers
- Dual line number columns

### PTY Terminal
Uses portable-pty crate for cross-platform PTY:
- Real shell sessions (bash/zsh on macOS)
- Bidirectional data flow via Tauri events
- Resize handling
- Proper cleanup on close

### State Persistence
Zustand stores with persistence middleware:
- Projects, threads, settings persist to localStorage
- Migration system to clear stale/mock data

---

## Known Issues / TODO

### Minor Issues
- [ ] DiffViewer error boundary shows when diff fails to load (needs better error messages)
- [ ] Terminal may need restart if PTY dies

### Future Enhancements
- [ ] Git worktree support for parallel threads
- [ ] SQLite persistence for messages/threads
- [ ] Automations with scheduling
- [ ] Multi-file diff view
- [ ] Side-by-side diff mode

---

## Build Statistics

| Metric | Value |
|--------|-------|
| Total source files | 124 |
| Frontend bundle | ~985 KB (280 KB gzipped) |
| Build time (Rust) | ~30 seconds (first build) |
| Build time (Frontend) | ~2 seconds |

---

## Commands Reference

```bash
# Install dependencies
./setup.sh           # First time setup
pnpm install         # Install node modules

# Development
pnpm dev             # Vite dev server only
pnpm tauri dev       # Full app with hot reload

# Build
pnpm build           # Frontend only
pnpm tauri build     # Full app bundle

# Rust
cd src-tauri && cargo build   # Build backend only
cd src-tauri && cargo test    # Run tests

# Git
gh repo view         # View on GitHub
```

---

## Repository

**GitHub:** https://github.com/JayefBuild/openSesh

```bash
git clone https://github.com/JayefBuild/openSesh.git
cd openSesh
pnpm install
pnpm tauri dev
```
