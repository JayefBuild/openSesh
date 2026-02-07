# Chunk Execution Context

You are executing **{{CHUNK_ID}}: {{CHUNK_NAME}}** as part of a larger implementation plan.

---

## Your Mission

1. Read this file completely (architecture + prior handoff)
2. Read CHUNK_PLAN.md for your specific tasks
3. Execute tasks, test continuously, commit frequently
4. Create HANDOFF.md before finishing (REQUIRED)

---

## Context Budget

| Level | Threshold | Action |
|-------|-----------|--------|
| **Normal** | < 70% | Continue working |
| **Warning** | {{WARNING_THRESHOLD}}% | Start wrapping up |
| **Critical** | {{CRITICAL_THRESHOLD}}% | Finish current task, create HANDOFF.md |
| **Emergency** | {{EMERGENCY_THRESHOLD}}% | STOP. Create HANDOFF.md immediately |

Budget: ~{{CONTEXT_BUDGET}} tokens | Target: {{TARGET_TOKENS}} tokens (65%)

---

## Architecture & Design (from 00-META)

{{META_CONTENT}}

---

{{#if PRIOR_HANDOFF}}
## Prior Chunk Handoff

**From:** {{PRIOR_CHUNK_ID}} | **To:** {{CURRENT_CHUNK_ID}}

### What Was Completed

{{PRIOR_COMPLETED_ITEMS}}

### Files Created

{{PRIOR_FILES_CREATED}}

### Files Modified

{{PRIOR_FILES_MODIFIED}}

### Key Decisions

{{PRIOR_DECISIONS}}

### Code Patterns to Follow

{{PRIOR_PATTERNS}}

### Context for You

{{PRIOR_CONTEXT}}

### Integration Notes

{{PRIOR_INTEGRATION}}

{{#if PRIOR_REMAINING}}
### Remaining Work (Your Responsibility)

{{PRIOR_REMAINING}}
{{/if}}

---
{{/if}}

## Execution Checklist

Before starting:
- [ ] Read this entire CONTEXT.md
- [ ] Read CHUNK_PLAN.md completely
- [ ] Create task list from plan
- [ ] Review referenced files from prior handoff

While working:
- [ ] Follow existing code patterns
- [ ] Test after each change
- [ ] Commit frequently with clear messages
- [ ] Update PROGRESS.md incrementally

Before finishing:
- [ ] All tests pass
- [ ] Code compiles cleanly
- [ ] All acceptance criteria met
- [ ] HANDOFF.md created with full detail

---

## Required Output

You MUST create **HANDOFF.md** before finishing. Include:

1. What you completed (checklist)
2. Files created/modified (with paths)
3. Key decisions and rationale
4. Code patterns established
5. Context for next chunk (500+ words)
6. Integration examples with code
7. Test status
8. Any blockers or incomplete work

**The next worker only knows what you tell them. Be thorough.**
