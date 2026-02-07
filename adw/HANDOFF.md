# ADW Pipeline - Handoff Document

## Status: Chunker & Organization Complete

Both the deterministic chunker and plan organization are working.

## What Was Done

### 1. Chunker Logic
- Only splits on `### Implementation Changes` and `### Implementation Phases` containers
- Each `#### Phase 1`, `#### 1. File.swift` becomes its own implementation chunk
- h3/h2 headers properly terminate h4 sections
- "Implementation Details" (code examples) stays in META

### 2. Plan Organization
- Running `pipeline chunk <plan.md>` automatically organizes:
  ```
  plans/feat-x.md  →  plans/feat-x/
                           ├── plan.md
                           └── chunks/
                                 ├── 00-META.md
                                 ├── 01-phase-1.md
                                 └── ...
  ```
- Idempotent: re-running doesn't re-organize
- Accepts directory path, plan.md path, or raw .md file

## Folder Structure

```
plans/
├── feat-double-esc-cancel/      # Organized (pipeline touched)
│   ├── plan.md
│   └── chunks/
│       ├── 00-META.md
│       ├── 01-1-statusbarcontroller-swift.md
│       ├── 02-2-floatingwaveformwindow-swift.md
│       └── 03-3-minirecordingwindow.md
├── mirror-voiceink-menu-bar/    # Organized
│   ├── plan.md
│   └── chunks/
├── revamp-model-grading-system/ # Organized
│   ├── plan.md
│   └── chunks/
└── new-feature.md               # Raw file (not yet processed)
```

**Key insight:** Presence of folder = pipeline has started on this plan.

## Commands

```bash
# Process a raw plan (organizes + chunks)
bun run pipeline chunk plans/new-feature.md

# Re-chunk an existing plan (no reorganization)
bun run pipeline chunk plans/feat-double-esc-cancel

# View chunks
ls plans/feat-double-esc-cancel/chunks/
```

## Test Results

| Plan | Chunks | Status |
|------|--------|--------|
| feat-double-esc-cancel | META + 3 file changes | ✓ |
| mirror-voiceink-menu-bar | META + 3 phases | ✓ |
| revamp-model-grading-system | META + 4 phases | ✓ |

## What's Next

1. **Add fixed stage prompts** for:
   - Unit Tests
   - Integration Tests
   - PR Review & Fix
   - Final Validation

2. **Wire up orchestrator** to use organized folder structure

3. **Add more pipeline artifacts** to folder structure:
   - `logs/` - execution logs
   - `handoffs/` - chunk handoff documents
   - `state.json` - pipeline state

## Key Files

| File | Purpose |
|------|---------|
| `chunker.ts` | Deterministic markdown parser |
| `orchestrator.ts` | `organizePlan()` + `chunkOnly()` |
| `cli.ts` | Command-line interface |
