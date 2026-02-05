# Open Sesh

**An open-source, model-agnostic AI coding workbench** — inspired by the Codex app.

Work with AI across chat, filesystem, terminal, and git — without vendor lock-in, subscriptions, or your code leaving your machine.

![Open Sesh Screenshot](docs/screenshot.png)

## Why Open Sesh?

- **Use any AI provider** — Anthropic, OpenAI, Gemini, Ollama, or any OpenAI-compatible endpoint
- **Local-first** — Your code stays on your machine unless you choose a cloud provider
- **Diff-first** — Every change is reviewable before applied
- **Keyboard-first** — Power users never need to reach for the mouse
- **Open source** — MIT licensed, community-driven

## Features

- **Multi-provider chat** with streaming, markdown rendering, and file references
- **Monaco diff viewer** with syntax highlighting, stage/unstage, revert, and collapsible file tree
- **Integrated terminal** with full PTY support (sessions persist when hidden)
- **Git integration** — status, diff, stage, commit, branch management
- **File operations** — read, write, edit, glob search, grep
- **Command palette** (Cmd+K) with fuzzy search
- **Plan mode** — AI generates execution plans for approval before making changes
- **Safe by default** — destructive operations require explicit approval

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/)
- [pnpm](https://pnpm.io/)

### Setup

```bash
# Clone the repo
git clone https://github.com/JayefBuild/openSesh.git
cd openSesh

# Install dependencies
pnpm install

# Create .env with your API keys
cp .env.example .env
# Edit .env and add your keys
```

### Configuration

Add your API keys to `.env`:

```bash
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
```

### Development

```bash
pnpm tauri dev
```

### Build

```bash
pnpm tauri build
```

The built app will be in `src-tauri/target/release/bundle/`.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+K` | Command palette |
| `Cmd+J` | Toggle terminal |
| `Cmd+N` | New thread |
| `Cmd+O` | Open project |
| `Cmd+,` | Settings |
| `Cmd+Enter` | Send message |
| `Cmd+.` | Stop generation |
| `Escape` | Close modal/cancel |

## Architecture

```
openSesh/
├── src/                    # React frontend (TypeScript)
│   ├── components/         # UI components
│   │   ├── chat/          # Chat interface
│   │   ├── diff/          # Diff viewer & file tree
│   │   ├── terminal/      # Terminal pane
│   │   ├── layout/        # App shell (Header, Sidebar)
│   │   └── ui/            # Reusable primitives
│   ├── stores/            # Zustand state management
│   ├── hooks/             # Custom React hooks
│   └── lib/               # Utilities & Tauri bindings
├── src-tauri/             # Rust backend
│   └── src/
│       ├── commands/      # Tauri IPC commands
│       ├── providers/     # AI provider adapters
│       └── tools/         # File, git, terminal tools
└── PRD.md                 # Product requirements document
```

## Tech Stack

- **Desktop shell**: [Tauri v2](https://v2.tauri.app/) + Rust
- **Frontend**: React 18 + TypeScript + [Vite](https://vite.dev/)
- **State**: [Zustand](https://zustand-demo.pmnd.rs/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Editor/Diff**: [Monaco Editor](https://microsoft.github.io/monaco-editor/)
- **Terminal**: [xterm.js](https://xtermjs.org/) + portable-pty

## Roadmap

- [ ] Ollama / local model support
- [ ] Google Gemini provider
- [ ] Git worktree support for parallel threads
- [ ] Skills/plugin system
- [ ] Scheduled automations
- [ ] Windows & Linux builds

See [PRD.md](PRD.md) for the full product vision.

## Contributing

Contributions welcome! Please read the PRD to understand the product direction.

## License

MIT
