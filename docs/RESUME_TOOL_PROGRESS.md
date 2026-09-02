# Resume Tool Progress

This file is the **authoritative implementation-status record** across Cursor chats. A new chat has no conversational memory of prior phases. Do not guess the current phase from chat history, git blame folklore, or partial diffs alone: read this file, the two planning docs, project rules, and the actual repository, then implement **exactly one** incomplete phase.

Canonical plan: [`RESUME_TOOL_IMPLEMENTATION_PLAN.md`](./RESUME_TOOL_IMPLEMENTATION_PLAN.md).  
Canonical architecture: [`RESUME_TOOL_ARCHITECTURE.md`](./RESUME_TOOL_ARCHITECTURE.md).

**Operating rule:** one Cursor chat = exactly one implementation phase. Complete or park that phase, update this file, then stop.

---

## Current checkpoint

| Field | Value |
| --- | --- |
| Implementation approved by Edwin | **No** — planning only; do not start Phase 0A until Edwin explicitly approves implementation |
| Last phase number | — |
| Last phase name | — |
| Status | `NOT STARTED` |
| What was completed | Planning documents only. No Resume Tool application code. |
| Automated verification | Not applicable |
| Manual verification | Not applicable |
| Important files changed (planning) | `docs/RESUME_TOOL_ARCHITECTURE.md`, `docs/RESUME_TOOL_IMPLEMENTATION_PLAN.md`, `docs/RESUME_TOOL_PROGRESS.md`, `.cursor/rules/60-resume-tool.mdc` |
| Blockers / notes | Wait for implementation approval. Then the first implementation chat is **Phase 0A** only. |
| **Next eligible phase** | **0A — Environment verification** (eligible only after explicit implementation approval) |

Allowed `Status` values for a phase row:

- `COMPLETE` — phase work done **and** any required Edwin manual verification has been reported as passed
- `AWAITING MANUAL VERIFICATION` — agent finished its work; Edwin has not yet reported that the phase’s required manual checks passed
- `BLOCKED` — cannot proceed; see notes (failed gate, missing approval, fallback decision, etc.)
- `NOT STARTED` — no implementation phase has been executed yet (this file’s initial state)

Do **not** invent other status labels.

---

## How a new chat determines the next phase

1. Read this file’s **Current checkpoint**.
2. Read [`RESUME_TOOL_IMPLEMENTATION_PLAN.md`](./RESUME_TOOL_IMPLEMENTATION_PLAN.md) and [`RESUME_TOOL_ARCHITECTURE.md`](./RESUME_TOOL_ARCHITECTURE.md).
3. Read applicable Cursor/project rules (especially `.cursor/rules/60-resume-tool.mdc` and `.cursor/rules/00-core-project-rules.mdc` through `50-workflow-rules.mdc`).
4. Inspect the repository (git status, relevant files) for drift vs this file.
5. If this file and the repo disagree, **stop and ask Edwin**. Do not skip ahead.
6. If `Implementation approved by Edwin` is **No**, stop **unless** Edwin’s **current** message explicitly approves implementation (for example “approved, implement 0A”). Then set that field to **Yes**, execute **0A only**, and stop.
7. If Status is `AWAITING MANUAL VERIFICATION`, the current phase is **not** complete. Do not start the next phase. Either wait, or (if Edwin is reporting results in this chat) record pass/fail here, then stop unless Edwin explicitly asked to start the next phase in a **new** chat.
8. If Status is `BLOCKED`, do not start the next eligible phase until Edwin resolves the blocker.
9. Otherwise implement **only** `Next eligible phase`.

---

## When to set each status

Mark `COMPLETE` only when:

1. The phase’s implementation sequence is done, and
2. Automated tests required by that phase passed (or the phase has none), and
3. If the phase requires **Edwin** manual verification, Edwin has **reported** that those checks passed.

A phase requires Edwin sign-off when its **Manual verification** section involves Microsoft Word, a production/deployed HTTPS origin, a browser UI walkthrough, Settings/Ollama onboarding, or an explicit human checkpoint / “Edwin confirms.” Agent-runnable commands alone (`npm test`, Vitest, `git check-ignore`) do **not** by themselves require waiting; record them under Automated verification and you may set `COMPLETE` if no Edwin checks apply.

If Edwin checks apply and the agent has finished coding/tests, set `AWAITING MANUAL VERIFICATION`, list exactly what Edwin must do, set **Next eligible phase** to the same phase (not the successor), and stop.

---

## Update template (replace Current checkpoint every phase)

Copy this shape; keep a short history row below.

```md
| Field | Value |
| --- | --- |
| Implementation approved by Edwin | Yes |
| Last phase number | 0A |
| Last phase name | Environment verification |
| Status | COMPLETE |
| What was completed | … |
| Automated verification | `npm test` / `npm run lint` / `npm run build` (record pass/fail) |
| Manual verification | None required / Edwin reported pass on … / still waiting: … |
| Important files changed | paths |
| Blockers / notes | … |
| **Next eligible phase** | 0B — Fixture protocol |
```

Every phase, including **0A** (no application-code changes), must rewrite **Current checkpoint** before the agent stops.

---

## Phase history

Newest first after work begins. Until then this table stays empty.

| Phase | Name | Status | Chat/date | Notes |
| --- | --- | --- | --- | --- |
| — | — | `NOT STARTED` | — | Implementation not approved |

---

## Phase order (reference)

`0A → 0B → 0C → 0D → 0E → 0F → 1A → 1B → 1C → 1D → 1E → 2A → 2B → 2C → 2D → 3A → 3B → 3C → 3D → 3E → 3F → 4A → 4B → 4C → 4D → 4E → 4F → 4G → 5A → 5B → 5C → 5D → 5E → 5F → 6A → 6B → 6C → 6D → 6E → 6F → 6G → 7A → 7B → 7C → 7D → 7E → 8A → 8B → 8C → 8D → 9A → 9B → 9C → 9D → 9E → 10A → 10B → 10C → 10D → 10E → 10F`

Hard gates (do not mark the successor eligible if these failed):

- **0D** must be `COMPLETE` (Word text-patch + mixed-run) before **1A**
- **4G** must be `COMPLETE` before **5A**
- **6G** cases A–G must be `COMPLETE` before **7A**
