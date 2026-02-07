# Feature: ADW Pipeline Dashboard in OpenSesh

## Summary

Integrate ADW (Agentic Development Workflow) pipeline monitoring into OpenSesh so you can kick off, monitor, and review multi-phase coding pipelines from a single UI — no terminal switching. Includes smart routing to automatically choose between direct chat, plan mode, or full ADW pipeline based on task complexity.

## Motivation

Right now, running an ADW pipeline means:
1. Terminal → `adw run plan.md`
2. Switch terminals to tail logs
3. Read raw JSON state files
4. Switch back to check progress
5. Repeat for each pipeline

With 2-3 pipelines running across different repos, this becomes unmanageable. OpenSesh already has plan mode, execution tracking, and a polished UI — it just needs to understand ADW's state files.

## Architecture

**Principle: OpenSesh is a read-only observer of ADW state.**

ADW continues to run independently (spawning workers, writing state.json, committing code). OpenSesh polls the state files and renders a dashboard. This keeps the two systems decoupled — ADW doesn't need to know OpenSesh exists.

```
┌─────────────────────────────────────────────┐
│                  OpenSesh UI                │
│  ┌──────────┬──────────────────────────────┐│
│  │ Sidebar  │  Pipeline Dashboard          ││
│  │          │  ┌─────────────────────────┐ ││
│  │ Threads  │  │ Chunk Progress Timeline │ ││
│  │ ──────── │  │ ░░░░░████████░░░░░░░░░ │ ││
│  │ Pipelines│  └─────────────────────────┘ ││
│  │  ● OTO   │  ┌──────────┬──────────────┐ ││
│  │    hotkeys│  │ Chunk    │ Live Worker  │ ││
│  │  ○ Other │  │ Details  │ Log Stream   │ ││
│  │          │  │          │              │ ││
│  └──────────┴──┴──────────┴──────────────┘ ││
└─────────────────────────────────────────────┘
         │                        │
         │ polls every 2s         │ tails worker.log
         ▼                        ▼
  .pipeline/state.json    .pipeline/Phases/*/worker.log
```

---

## Phase 0: Prerequisites & Setup

### 0a. Fix ADW CLI PATH collision
- `/opt/homebrew/bin/adw` (Python package) shadows the bun wrapper
- Either: uninstall the Python `adw` package, rename the wrapper to `adw-pipeline`, or reorder PATH
- **Files:** Shell profile (~/.zshrc or similar)

### 0b. Add Tauri command for filesystem watching
- New Rust command: `watch_file(path, interval_ms)` → emits events on change
- More efficient than polling from JS — Rust can use `notify` crate for native FS events
- **Files:** `src-tauri/src/commands/files.rs`, `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml`

---

## Phase 1: Data Layer — Pipeline Types & Store

### 1a. TypeScript types for ADW state
Map ADW's `state.json` structure to OpenSesh types. The key insight: ADW serializes `Map<string, ChunkResult>` as `Array<[string, ChunkResult]>` — we need to handle that.

**New file:** `src/types/pipeline.ts`

```typescript
// Mirror ADW's state.json shape
export interface PipelineState {
  runId: string;
  planName: string;
  planPath: string;
  worktreePath: string;
  chunks: PipelineChunk[];
  results: Array<[string, ChunkResult]>;  // ADW serializes Map as tuples
  currentChunkId?: string;
  startTime: string;
  endTime?: string;
  status: 'initializing' | 'chunking' | 'executing' | 'completed' | 'failed';
  config: PipelineConfig;
}

export interface PipelineChunk {
  id: string;
  order: number;
  name: string;
  type: 'setup' | 'implementation' | 'testing' | 'review-fix' | 'validation';
  dependsOn: string[];
  estimatedTokens: number;
  description: string;
}

export interface ChunkResult {
  chunkId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  startTime: string;
  endTime?: string;
  handoffPath?: string;
  commitHash?: string;
  error?: string;
}

export interface PipelineConfig {
  environment: 'api' | 'pro' | 'max5' | 'max20';
  chunkContextBudget: number;
}

// OpenSesh-specific wrapper
export interface TrackedPipeline {
  id: string;                    // Derived from runId
  statePath: string;             // Absolute path to state.json
  worktreePath: string;
  state: PipelineState | null;   // null if state.json not yet readable
  lastPolled: Date;
  isActive: boolean;             // Still running?
}
```

**Update:** `src/types/index.ts` — re-export pipeline types

### 1b. Pipeline Zustand store
Follow the `gitStore` polling pattern.

**New file:** `src/stores/pipelineStore.ts`

```
State:
  pipelines: TrackedPipeline[]
  activePipelineId: string | null
  pollIntervalId: number | null

Actions:
  addPipeline(statePath: string)         // Register a new pipeline to track
  removePipeline(id: string)             // Stop tracking
  setActivePipeline(id: string | null)   // Select for dashboard view
  fetchPipelineState(id: string)         // Read state.json via Tauri command
  fetchAllStates()                       // Refresh all tracked pipelines
  startPolling(intervalMs?: number)      // Default 2000ms
  stopPolling()

Derived:
  getProgress(id)                        // { total, completed, failed, percent }
  getActiveChunk(id)                     // Currently executing chunk
  isAnyActive()                          // Any pipeline still running?
```

Persist: `pipelines` array (so tracked pipelines survive app restart), NOT poll state.

### 1c. Tauri command for reading state.json

**Modify:** `src-tauri/src/commands/files.rs`

```rust
#[tauri::command]
pub async fn read_pipeline_state(state_path: String) -> Result<String, String> {
    // Read file, return raw JSON string (frontend deserializes)
    // Returns error if file doesn't exist yet (pipeline still initializing)
}
```

**Modify:** `src-tauri/src/lib.rs` — register command

---

## Phase 2: Pipeline Discovery

### 2a. Auto-discover pipelines from worktrees
Scan known project directories for `.worktrees/*/. pipeline/state.json` files. This way you don't have to manually register each pipeline.

**New file:** `src/lib/pipelineDiscovery.ts`

```
discoverPipelines(projectPaths: string[]): TrackedPipeline[]
  - For each project path, look for .worktrees/*/. pipeline/state.json
  - Parse each state.json to get runId, status, planName
  - Return array of TrackedPipeline objects
```

**Tauri command:** `scan_for_pipelines(paths: string[])` — Rust walks directories efficiently

### 2b. Pipeline registration on project open
When a project is opened in OpenSesh, automatically scan for active pipelines and add them to the store.

**Modify:** `src/stores/projectStore.ts` — trigger pipeline discovery on project selection

---

## Phase 3: Dashboard UI

### 3a. Sidebar — Pipeline section

**Modify:** `src/components/layout/Sidebar.tsx`

Add new `<SidebarSection title="Pipelines">` after threads, containing:
- List of tracked pipelines with status indicator (colored dot)
- Pipeline name (from `planName`)
- Progress percentage
- Click to select → shows dashboard in main pane

### 3b. Pipeline Dashboard component

**New directory:** `src/components/pipeline/`

```
src/components/pipeline/
├── index.ts
├── PipelineDashboard.tsx      — Main dashboard view
├── PipelineHeader.tsx         — Name, status badge, elapsed time, controls
├── ChunkTimeline.tsx          — Horizontal timeline of chunks with status colors
├── ChunkDetail.tsx            — Selected chunk: handoff summary, commit hash, duration
├── WorkerLogViewer.tsx        — Live-tailing log viewer (streams worker.log content)
└── PipelineList.tsx           — Sidebar list component
```

**PipelineDashboard layout:**
```
┌─────────────────────────────────────────────────┐
│ Pipeline Header                                 │
│ "AI Enhancement Hotkeys"  ● Running  12m 34s    │
├─────────────────────────────────────────────────┤
│ Chunk Timeline                                  │
│ [✓ Setup][✓ Data][✓ Hotkey][▶ UI][○ Wire][○ Mig]│
├───────────────────────┬─────────────────────────┤
│ Chunk Detail          │ Worker Log              │
│ Phase 4: Settings UI  │ > Reading file...       │
│ Status: in_progress   │ > Analyzing patterns... │
│ Started: 2m ago       │ > Writing component...  │
│ Files: 2 created      │ > Build succeeded       │
│ Commit: abc123        │ >                       │
└───────────────────────┴─────────────────────────┘
```

### 3c. View switching integration

**Modify:** `src/components/chat/ChatPane.tsx`

```typescript
const { activePipelineId } = usePipelineStore();
const { showPipelineView } = useUIStore();

if (activePipelineId && showPipelineView) {
  return <PipelineDashboard pipelineId={activePipelineId} />;
}
// ... existing chat/plan view logic
```

### 3d. Worker log streaming

**Approach:** Use Tauri's `notify` crate to watch worker.log files for changes, emit events to frontend.

OR simpler: Poll the log file every 1s from the store, diff against previous content, append new lines. Less elegant but works immediately.

**New Tauri command:**
```rust
#[tauri::command]
pub async fn tail_file(path: String, from_byte: u64) -> Result<TailResult, String> {
    // Read file from byte offset, return new content + new offset
}
```

Frontend calls this every 1s, appending new content to a scrollable log view.

---

## Phase 4: Pipeline Launcher

### 4a. "New Pipeline" flow
Allow kicking off ADW pipelines from within OpenSesh.

**New component:** `src/components/pipeline/PipelineLauncher.tsx`
- File picker for plan markdown
- Environment selector (api/pro/max5/max20)
- "Chunk (dry run)" and "Run" buttons

**Tauri command:**
```rust
#[tauri::command]
pub async fn launch_pipeline(
    plan_path: String,
    environment: String,
    app: AppHandle
) -> Result<String, String> {
    // Spawn: bun ~/Documents/git/personal/adw/pipeline/cli.ts run {plan_path}
    // Return worktree path for tracking
    // Stream stdout to event channel for real-time output
}
```

### 4b. Pipeline controls
- **Pause/Resume** — Not yet supported by ADW, but stub the UI
- **Cancel** — Kill the worker process
- **Retry failed chunk** — `adw run --resume`

---

## Phase 5: Smart Routing

### 5a. Complexity analyzer
When user sends a message, analyze it to suggest the right execution mode.

**New file:** `src/lib/complexityAnalyzer.ts`

```typescript
type ExecutionRoute = 'chat' | 'plan' | 'pipeline';

interface ComplexityAnalysis {
  route: ExecutionRoute;
  confidence: number;        // 0-1
  reasoning: string;
  estimatedFiles: number;
  estimatedPhases: number;
}

function analyzeComplexity(message: string, projectContext: ProjectContext): ComplexityAnalysis
```

**Heuristics:**
- Keywords: "refactor", "redesign", "migrate", "add feature across" → pipeline
- File count signals: mentions 5+ files, multiple directories → pipeline
- Scope signals: "all controllers", "every component", "system-wide" → pipeline
- Simple signals: "fix", "typo", "update this function", "add a button" → chat
- Medium signals: "add a new endpoint with tests", "implement feature X" → plan

### 5b. Route suggestion UI
When complexity is detected as `plan` or `pipeline`, show a subtle suggestion bar:

```
┌──────────────────────────────────────────────────────┐
│ 💡 This looks like a multi-phase feature.            │
│    [Use Plan Mode]  [Launch Pipeline]  [Just Chat]   │
└──────────────────────────────────────────────────────┘
```

**Modify:** `src/components/chat/ChatInput.tsx` — add suggestion bar above input

### 5c. Auto-plan generation for pipeline
If user chooses "Launch Pipeline", generate a plan markdown from the chat context, then feed it to ADW.

**Flow:**
1. User describes feature in chat
2. AI generates structured plan markdown (using existing plan mode)
3. User reviews/approves plan
4. "Launch as Pipeline" button saves plan to disk and kicks off ADW
5. Dashboard automatically picks up the new pipeline

---

## Phase 6: Polish & Notifications

### 6a. Desktop notifications
- Notify when a pipeline completes or fails
- Use Tauri's notification API

### 6b. Pipeline history
- Keep completed pipeline records in store
- Show in sidebar under "Completed" section
- Click to review: final diff, test results, review summary

### 6c. Multi-pipeline overview
- If 2+ pipelines are active, show a compact overview card in the sidebar
- Quick-glance progress bars for each

---

## Implementation Priority

**MVP (get the dashboard working):**
1. Phase 0a — Fix PATH collision (5 min)
2. Phase 1 — Types + Store + Tauri command
3. Phase 3a-3c — Sidebar + Dashboard + View switching

**v1 (full monitoring):**
4. Phase 2 — Auto-discovery
5. Phase 3d — Live log streaming

**v2 (launch from UI):**
6. Phase 4 — Pipeline launcher

**v3 (smart routing):**
7. Phase 5 — Complexity analyzer + route suggestions

---

## Files Changed Summary

### New Files (~12)
- `src/types/pipeline.ts`
- `src/stores/pipelineStore.ts`
- `src/lib/pipelineDiscovery.ts`
- `src/lib/complexityAnalyzer.ts`
- `src/components/pipeline/index.ts`
- `src/components/pipeline/PipelineDashboard.tsx`
- `src/components/pipeline/PipelineHeader.tsx`
- `src/components/pipeline/ChunkTimeline.tsx`
- `src/components/pipeline/ChunkDetail.tsx`
- `src/components/pipeline/WorkerLogViewer.tsx`
- `src/components/pipeline/PipelineList.tsx`
- `src/components/pipeline/PipelineLauncher.tsx`

### Modified Files (~6)
- `src/types/index.ts` — re-export pipeline types
- `src/stores/uiStore.ts` — add `showPipelineView` state
- `src/stores/projectStore.ts` — trigger pipeline discovery
- `src/components/layout/Sidebar.tsx` — add Pipelines section
- `src/components/chat/ChatPane.tsx` — pipeline view switching
- `src/components/chat/ChatInput.tsx` — smart routing suggestions

### Rust Backend (~3)
- `src-tauri/src/commands/files.rs` — `read_pipeline_state`, `tail_file`, `scan_for_pipelines`
- `src-tauri/src/commands/pipeline.rs` — `launch_pipeline` (new)
- `src-tauri/src/lib.rs` — register new commands
- `src-tauri/Cargo.toml` — add `notify` crate for FS watching (optional)

---

## Key Design Decisions

1. **Read-only observer pattern** — OpenSesh never writes to ADW's state. This keeps them decoupled and means ADW works exactly the same with or without OpenSesh.

2. **Poll-based (not event-based)** — ADW writes state.json to disk. Simplest integration is polling every 2s from Rust. Can upgrade to FS notify later.

3. **Reuse plan mode patterns** — Pipeline chunks map 1:1 to plan steps. Reuse the same visual patterns (status icons, progress bars, step details) rather than inventing new ones.

4. **Smart routing is suggestive, not automatic** — The complexity analyzer suggests a route but the user always chooses. No magic black box deciding how to handle your request.

5. **ADW stays a CLI tool** — It can still be run from terminal independent of OpenSesh. OpenSesh is an optional frontend, not a replacement.
