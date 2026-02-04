# Open Sesh

**Model-agnostic AI coding workbench** — an open-source alternative to the Codex app.

Work with AI across chat, filesystem, terminal, and git without vendor lock-in.

## Features

- **Multi-provider support**: Anthropic (Claude), OpenAI (GPT), with extensible adapter system
- **Chat interface**: Markdown rendering, file references, tool result summaries
- **Diff viewer**: Monaco-based unified diff view with stage/revert actions
- **Terminal**: Integrated xterm.js terminal with PTY support
- **Git integration**: Status, diff, log, stage, commit
- **File operations**: Read, write, edit, search (glob), grep
- **Keyboard-first**: Command palette (Cmd+K), comprehensive shortcuts
- **Safe by default**: All destructive operations require approval

## Quick Start

### Prerequisites

Run the setup script to install dependencies:

```bash
./setup.sh
```

### Configuration

Create a `.env` file with your API keys:

```bash
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
```

### Development

```bash
pnpm install
pnpm tauri dev
```

### Build

```bash
pnpm tauri build
```

## Architecture

```
openSesh/
├── src/                    # React frontend (TypeScript)
│   ├── components/         # UI components
│   │   ├── chat/          # Chat interface
│   │   ├── diff/          # Diff viewer
│   │   ├── terminal/      # Terminal pane
│   │   ├── sidebar/       # Project/thread navigation
│   │   ├── layout/        # App layout components
│   │   ├── command-palette/
│   │   └── ui/            # Reusable UI primitives
│   ├── stores/            # Zustand state management
│   ├── hooks/             # Custom React hooks
│   └── lib/               # Utilities
├── src-tauri/             # Rust backend
│   └── src/
│       ├── commands/      # Tauri IPC commands
│       ├── providers/     # AI provider adapters
│       └── tools/         # Tool implementations
└── docs/                  # Documentation
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Cmd+K | Command palette |
| Cmd+J | Toggle terminal |
| Cmd+N | New thread |
| Cmd+, | Settings |
| Cmd+Enter | Send message |
| Escape | Close modal/palette |

## Tech Stack

- **Desktop**: Tauri v2 + Rust
- **Frontend**: React + TypeScript + Vite
- **State**: Zustand
- **Styling**: Tailwind CSS
- **Editor**: Monaco Editor
- **Terminal**: xterm.js

## License

MIT
