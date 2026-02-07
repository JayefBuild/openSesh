# ADW Pipeline

AI Development Workflow - Sequential, context-aware orchestration for AI workers.

## Overview

ADW Pipeline enables AI workers to implement complex features without context overflow or information loss through intelligent plan chunking and explicit handoffs.

**Key Principles:**

- **No Auto-Compaction** - Context transitions are explicit and reviewable
- **Atomic Chunks** - One chunk, one responsibility
- **Sequential First** - Iron-clad sequential execution before parallelization
- **Validation First** - Every transition point is validated
- **Clear Artifacts** - Everything in `Phases/` is self-documenting

## Installation

```bash
# Install dependencies
cd ~/adw/pipeline
bun install
```

## Usage

### Execute a Pipeline

```bash
# Run from anywhere, targeting a plan in any repo
bun pipeline/cli.ts run ~/my-project/plans/feature-auth.md
```

### Resume a Failed Pipeline

```bash
bun pipeline/cli.ts run ~/my-project/plans/feature-auth.md --resume
```

### Chunk a Plan (Dry Run)

```bash
bun pipeline/cli.ts chunk ~/my-project/plans/feature-auth.md
```

### Show Pipeline Status

```bash
bun pipeline/cli.ts status ~/my-project/.worktrees/feature-auth
```

### Watch Logs in Real-Time

```bash
bun pipeline/cli.ts watch ~/my-project/.worktrees/feature-auth
```

### Show Configuration

```bash
bun pipeline/cli.ts config
```

## Configuration

Environment-aware configuration with support for different Claude access tiers.

| Environment | Context Budget | Handoff Target | Handoff Max |
|-------------|----------------|----------------|-------------|
| `api`       | 80,000 tokens  | 5,000 tokens   | 10,000 tokens |
| `pro`       | 40,000 tokens  | 2,000 tokens   | 4,000 tokens |
| `max5`      | 100,000 tokens | 6,000 tokens   | 12,000 tokens |
| `max20`     | 150,000 tokens | 8,000 tokens   | 15,000 tokens |

### Environment Variables

```bash
CLAUDE_ENVIRONMENT=api        # Environment profile
CHUNK_CONTEXT_BUDGET=80000    # Override context budget
HANDOFF_TARGET_SIZE=5000      # Override handoff target
HANDOFF_MAX_SIZE=10000        # Override handoff max
MAX_CHUNK_RETRIES=3           # Chunk retry limit
MAX_COMPILE_FIX_RETRIES=3     # Compile fix retry limit
```

## How It Works

### 1. Plan Chunking

Deterministic markdown parsing breaks plans into atomic chunks:

- **00-setup** - Architecture decisions and success criteria
- **01a, 01b, 01c...** - Implementation chunks (based on plan's h4 sections)

After all chunks complete, the orchestrator automatically runs:
- **PR Review Stage** - Multi-agent code review via `/compound-engineering:workflows:review`

### 2. Sequential Execution

Each chunk executes in a fresh Claude Code session:

1. Orchestrator creates phase directory (e.g., `Phases/01-IMPLEMENTATION/01a_feature/`)
2. Orchestrator writes `work_prompt.md` (context + chunk plan + budget instructions)
3. Orchestrator writes `handoff.md` template
4. Worker implements the chunk
5. Execution logged to `worker.log` with heartbeat monitoring
6. Worker fills out `handoff.md` before exiting
7. Orchestrator validates handoff and runs compile check
8. Orchestrator commits and proceeds to next chunk

### 3. Context Management

Workers receive explicit budget instructions:

| Threshold | Usage | Action |
|-----------|-------|--------|
| Normal    | < 70% | Continue working |
| Warning   | 70%   | Consider wrapping up |
| Critical  | 80%   | Start finishing, prepare handoff |
| Emergency | 85%   | Stop new work, fill out handoff.md |

### 4. Self-Healing

Implementation chunks include compile validation with automatic fix attempts:

1. Run `xcodebuild` or `swift build`
2. If fails, spawn fix worker with error context
3. Retry up to 3 times
4. Fail pipeline if still broken

## Directory Structure

```
ADW Pipeline (control center)
~/adw/pipeline/
├── cli.ts                      # CLI entry point
├── orchestrator.ts             # Main pipeline controller
├── chunker.ts                  # Deterministic plan chunking
├── paths.ts                    # Centralized path management
├── worker.ts                   # Claude Code worker spawning
├── compile-validator.ts        # Build validation
├── handoff-validator.ts        # Handoff validation
├── state.ts                    # Pipeline state management
├── config.ts                   # Configuration loading
└── types.ts                    # TypeScript types

Target Repo (where plans live and code changes happen)
~/my-project/
├── plans/                      # Your feature plans
│   └── feat-double-esc.md
├── Sources/                    # Your actual code
├── Tests/
└── .worktrees/                 # Git worktrees (auto-created)

Worktree with Phases-based artifact organization
~/my-project/.worktrees/feat-double-esc/
├── Sources/                    # Code changes happen here
├── Tests/
└── .pipeline/                  # ALL pipeline artifacts in one place
    ├── plan.md                 # Copy of original plan
    ├── state.json              # Pipeline state
    └── Phases/                 # Chronological phase execution
        ├── 00-CONTEXT/         # Setup & shared context
        │   ├── plan_context.md # Shared context for all workers
        │   └── Chunks/         # Chunk definitions
        │       ├── 00-setup.md
        │       ├── 01a-feature-a.md
        │       └── 01b-feature-b.md
        ├── 01-IMPLEMENTATION/  # Implementation work
        │   ├── 00-setup/       # Setup chunk output
        │   │   ├── work_prompt.md
        │   │   ├── worker.log
        │   │   └── handoff.md
        │   ├── 01a_feature-a/  # First impl chunk
        │   │   ├── work_prompt.md
        │   │   ├── worker.log
        │   │   └── handoff.md
        │   └── 01b_feature-b/
        │       └── ...
        ├── 02-UNIT-TESTS/      # Unit test phase
        │   ├── prompt.md
        │   ├── worker.log
        │   └── handoff.md
        ├── 03-BRANCH-REVIEW/   # Multi-agent code review
        │   ├── prompt.md
        │   ├── worker.log
        │   └── handoff.md
        └── 04-FINAL-VALIDATION/
            └── ...
```

### At a Glance

The **Phases/** structure makes it trivial to understand pipeline state:

- `plan.md` - What we're building
- `state.json` - Where we are in the pipeline
- `Phases/` - Everything that happened, in chronological order

Each phase directory contains:
- `work_prompt.md` or `prompt.md` - Input (what the worker was asked to do)
- `worker.log` - Execution log (what happened)
- `handoff.md` - Output (what was accomplished, context for next)

## Writing Plans

Plans should be detailed markdown documents:

```markdown
# Feature Name

## Overview
Brief description of the feature.

## Requirements
1. Requirement one
2. Requirement two

## Technical Approach

### Architecture
- Technology choices
- Integration points

### Implementation Phases

#### Phase 1: Database
- Create tables
- Add migrations

#### Phase 2: API
- Build endpoints
- Add validation

## Success Criteria
- [ ] Criterion one
- [ ] Criterion two
```

## Handoff Protocol

Workers fill out handoffs with:

- **What I Completed** - Checkmarked items
- **Files Created/Modified** - With paths
- **Key Decisions** - With rationale and tradeoffs
- **Context for Next Chunk** - Detailed orientation (300+ words)
- **Integration Notes** - Code examples
- **Remaining Work** - If any

## Recovery

If a worker crashes without filling out `handoff.md`:

1. Orchestrator runs `git diff` and `git log`
2. Orchestrator generates recovery handoff from git history
3. Pipeline continues (or flags for review)

## Requirements

- [Bun](https://bun.sh) runtime
- Anthropic API key (`ANTHROPIC_API_KEY`)
- Git
- Claude Code CLI (for worker execution)
