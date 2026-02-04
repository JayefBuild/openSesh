# Development Guide

## Prerequisites

Run the setup script to install all dependencies:

```bash
./setup.sh
```

This installs:
- Rust (via rustup)
- Node.js (via Homebrew)
- pnpm (via npm)
- Tauri CLI (via cargo)

## Environment Variables

Create a `.env` file in the project root:

```bash
# At least one of these is required
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# Optional: Default provider (anthropic or openai)
DEFAULT_PROVIDER=anthropic

# Optional: Default model
DEFAULT_MODEL=claude-sonnet-4-20250514
```

## Running the App

### Development Mode

```bash
pnpm tauri dev
```

This starts:
- Vite dev server on http://localhost:1420
- Tauri app with hot reload

### Build for Production

```bash
pnpm tauri build
```

The built app will be in `src-tauri/target/release/bundle/`.

## Project Structure

```
openSesh/
├── src/                    # React frontend
│   ├── components/         # UI components
│   ├── stores/            # Zustand state stores
│   ├── hooks/             # Custom React hooks
│   ├── lib/               # Utilities
│   └── types/             # TypeScript types
├── src-tauri/             # Rust backend
│   ├── src/
│   │   ├── commands/      # Tauri IPC commands
│   │   ├── providers/     # AI provider adapters
│   │   └── tools/         # Tool implementations
│   └── Cargo.toml
├── docs/                  # Documentation
└── .env                   # Environment variables (not committed)
```

## Architecture

### Frontend (React + TypeScript)

- **State Management**: Zustand stores for projects, threads, messages, UI state
- **Styling**: Tailwind CSS with custom dark theme
- **Components**:
  - Monaco Editor for diff viewing
  - xterm.js for terminal
  - Framer Motion for animations

### Backend (Rust + Tauri)

- **Provider Adapters**: Anthropic and OpenAI with streaming support
- **Tools**: File operations, search, git commands
- **Terminal**: PTY spawning with portable-pty
- **IPC**: Tauri commands exposed to frontend

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Cmd+K | Command palette |
| Cmd+J | Toggle terminal |
| Cmd+N | New thread |
| Cmd+, | Settings |
| Cmd+Enter | Send message |
| Escape | Close modal/palette |

## Adding a New Provider

1. Create `src-tauri/src/providers/your_provider.rs`
2. Implement the `Provider` trait
3. Add to `src-tauri/src/providers/mod.rs`
4. Update frontend provider list in `src/stores/settingsStore.ts`

## Testing

### Frontend
```bash
pnpm test        # Run tests
pnpm test:watch  # Watch mode
```

### Backend
```bash
cd src-tauri
cargo test
```

## Troubleshooting

### "Browser not found" error
Install WebKit: Tauri uses the system WebView. On macOS this is Safari's WebKit.

### Rust compilation errors
Ensure you have the latest Rust:
```bash
rustup update
```

### pnpm not found
Run the setup script or install manually:
```bash
npm install -g pnpm
```
