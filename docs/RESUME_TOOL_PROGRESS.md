# Resume Tool Progress

This file is the **authoritative implementation-status record** across Cursor chats. A new chat has no conversational memory of prior phases. Do not guess the current phase from chat history, git blame folklore, or partial diffs alone: read this file, the two planning docs, project rules, and the actual repository, then implement **exactly one** incomplete phase.

Canonical plan: [`RESUME_TOOL_IMPLEMENTATION_PLAN.md`](./RESUME_TOOL_IMPLEMENTATION_PLAN.md).  
Canonical architecture: [`RESUME_TOOL_ARCHITECTURE.md`](./RESUME_TOOL_ARCHITECTURE.md).

**Operating rule:** one Cursor chat = exactly one implementation phase. Complete or park that phase, update this file, then stop.

---

## Current checkpoint

| Field | Value |
| --- | --- |
| Implementation approved by Edwin | **Yes** |
| Last phase number | 2D |
| Last phase name | Duplicate resume |
| Status | `COMPLETE` |
| What was completed | Duplicate-resume capability wired end to end (architecture §35: "Save as new resume copies lineage with a new `resume_id` and new original = current working bytes"). New pure helper `duplicateResumeName` (+ `RESUME_COPY_SUFFIX = " (copy)"`) in `src/core/resume/resumeLibrary.ts`: normalizes the source name and appends " (copy)", truncating the base so the result always stays ≤200 chars and passes `validateResumeName`. In `resumeRemote.ts`, extracted the shared create path into private `createResumeLineage({ userId, name, sourceFilename, sourceKind, bytes })` (uploads identical original + working bytes, inserts resume + version 1, sets `active_version_id`, full storage+row rollback on error). `insertResumeWithOriginal` now delegates to it with `source_kind = "upload"` (behavior unchanged, incl. `isDefault`). New `duplicateResume(userId, resumeId)`: owner-scoped fetch + `parseResumeRow` of the source, resolves the source's **active version** working path via `buildResumeWorkingStoragePath`, downloads those working bytes from the private `resume-docs` bucket, then calls `createResumeLineage` with `source_kind = "duplicate"`, the copied name, and the source's `sourceFilename`. The copy gets a brand-new `resume_id`/`version_id`, is never default, and shares **no** storage objects with the source (so later edits to either cannot affect the other — full isolation is re-tested in 4F). `useResumes` exposes `duplicateResume(resumeId)` (sets `mutatingId` on the source row, refreshes the list on success since the copy is a new row, generic error + refresh on failure). `ResumeSection` renders a per-row **Duplicate** button; `CareerPage` drops the `resumeDuplicateStub` no-op and passes the real callback. No DOCX bytes in `AppPayload`/`localStorage`; no `replaceRemotePayload`; RLS + owner-scoped `.eq("user_id", …)` gate every read/write and the storage download path is owner-validated. |
| Automated verification | `npm test` pass (1318 passed, 1 skipped; +4 new `duplicateResumeName` tests → `resumeLibrary` now 16). `npx tsc -b` pass. `npm run build` pass (pre-existing >500 kB chunk warning; lazy-load is 10F). `npx eslint` on changed files: only the pre-existing `react-hooks/set-state-in-effect` on `CareerPage.tsx` (now line 158, same `careerFocus` school effect; shifted up 4 lines only because this phase removed the 5-line duplicate stub). No resumeRemote unit test — like 1D/2B/2C the Supabase-facing remote layer is Edwin-verified; the pure logic (`duplicateResumeName`) is unit-tested. |
| Manual verification | Edwin reported pass **2026-09-15**: Duplicate creates a "(copy)" row (not default) that persists after reload; copy has its own `resumes`/`resume_versions` rows (`source_kind='duplicate'`) and distinct storage objects; rename/default/delete act on the copy independently of the source. |
| Important files changed | `src/core/resume/resumeLibrary.ts`, `src/core/resume/resumeLibrary.test.ts`, `src/lib/resumeRemote.ts`, `src/components/resume/useResumes.ts`, `src/components/resume/ResumeSection.tsx`, `src/pages/CareerPage.tsx`, `docs/RESUME_TOOL_PROGRESS.md` |
| Blockers / notes | Do not start 3A in this chat. Open a new Cursor chat for 3A. Deep source-vs-copy edit isolation is fully re-tested in Phase 4F (editor autosave). |
| **Next eligible phase** | **3A — Full OOXML block parse** |

### 2D manual verification (Edwin)

1. Open Career → Resume. Upload `geometry-canary.docx` if the library is empty.
2. Click **Duplicate** on a resume. A new row appears named "<name> (copy)"; it is **not** the default.
3. Reload the browser: the copy persists.
4. In the Supabase dashboard, confirm the copy has its **own** `resumes` row (new id), a `resume_versions` row with `source_kind = 'duplicate'`, and **new** storage objects under `resume-docs/{uid}/{newResumeId}/original/…` and `…/versions/…` (distinct paths from the source).
5. Rename / set-default / delete work on the copy independently of the source; deleting the copy does not touch the source's files.
6. (Sanity) Duplicating twice yields two independent copies.
7. Report pass/fail here so a new chat can mark 2D `COMPLETE` and advance to 3A.

### 0F HTTPS→loopback matrix (Edwin)

Signed off **2026-09-15**: Edwin reported all matrix checks pass (availability, `OLLAMA_ORIGINS`, Vite CORS, production HTTPS + LNA Allow/Block, deny distinct from down, Chrome/Safari/Firefox). No resume or JD text recorded.

**Agent-recorded during implementation (2026-09-14), superseded by Edwin’s pass:**

| Check | Result |
| --- | --- |
| Ollama process on this machine (`curl http://127.0.0.1:11434/api/tags`) | Was down at implement time; Edwin later verified up as part of the pass. |

**Checks Edwin ran:**

1. **Ollama availability (your laptop):** `curl http://127.0.0.1:11434/api/tags` — note up vs connection refused. If down, start Ollama and repeat. Leave it **up** for steps 3–6.
2. **Origins:** with `OLLAMA_ORIGINS` **unset**, then set to the Vite origin `http://localhost:5173`, then set to the **production HTTPS origin**. Restart Ollama after each change. Record which values allow `/api/tags`.
3. **Vite origin:** `npm run dev`, open `http://localhost:5173`, DevTools console: `fetch('http://127.0.0.1:11434/api/tags')`. Record CORS success/fail. This is **not** the production gate.
4. **Production HTTPS origin (required):** open the **deployed** SPA. DevTools: `fetch('http://127.0.0.1:11434/api/tags', { targetAddressSpace: 'loopback' })`. If the browser throws on the unknown property, omit `targetAddressSpace`. Record: Ollama up, CORS, **permission prompt**, Allow vs Block.
5. **Permission denied:** Block local/loopback access (prompt Block, or Chrome `chrome://settings/content/localNetworkAccess`). Confirm the fetch fails **and** that this is distinguishable from “Ollama not installed” (`OllamaLocalNetworkDenied` vs `OllamaUnavailable`). Then Allow again if you want rewriting later.
6. **Browsers:** repeat step 4 on **Chrome** (primary), **Safari**, and **Firefox** if available. Note mixed-content or missing LNA.
7. Confirm product plan: on any failure, coverage later stays deterministic-only; **do not** proxy Ollama through Supabase or Vercel.

| Origin / browser | Ollama up | CORS | LNA prompt | Allow | Block / deny distinct from down | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Vite `http://localhost:5173` | pass | pass | pass | pass | pass | Edwin 2026-09-15: all pass |
| Production HTTPS + Chrome | pass | pass | pass | pass | pass | Edwin 2026-09-15: all pass |
| Production HTTPS + Safari | pass | pass | pass | pass | pass | Edwin 2026-09-15: all pass |
| Production HTTPS + Firefox | pass | pass | pass | pass | pass | Edwin 2026-09-15: all pass |

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

Newest first after work begins.

| Phase | Name | Status | Chat/date | Notes |
| --- | --- | --- | --- | --- |
| 2D | Duplicate resume | `COMPLETE` | 2026-09-15 | Edwin browser + Supabase pass; copy lineage (new original = source working bytes, `source_kind='duplicate'`, new id + distinct storage objects) persists and is independent of the source. Wave 2 closed. |
| 2C | Rename, default, delete | `COMPLETE` | 2026-09-15 | Edwin UI walkthrough pass; rename / default / confirm-delete + cross-user sanity OK. |
| 2B | Upload + validate | `COMPLETE` | 2026-09-15 | Edwin browser + Supabase Storage pass; validation + upload/list persist after reload. |
| 2A | Career \| Resume pane shell | `COMPLETE` | 2026-09-15 | Edwin UI walkthrough pass; Resume tab + empty state; preference persists `"resume"`. |
| 1E | Persistence tests + mapper battery | `COMPLETE` | 2026-09-15 | `extracted_structure` + ledger round-trips; invalid `source_kind` → `MapperError`. Wave 1 closed. |
| 1D | Mappers + isolated remote API | `COMPLETE` | 2026-09-15 | Strict parsers + path builders + `resumeRemote` CRUD. Not in AppPayload. |
| 1C | Postgres tables | `COMPLETE` | 2026-09-15 | RLS tables + CHECKs. Edwin applied 2026-09-15 (“nothing returned”). |
| 1B | Storage bucket + policies | `COMPLETE` | 2026-09-15 | Private `resume-docs` + uid-prefix policies. First apply failed on `ALTER TABLE storage.objects`; corrected SQL applied 2026-09-15. |
| 1A | Domain types | `COMPLETE` | 2026-09-15 | Types + allowlist guards only; AppPayload untouched. |
| 0F | Ollama connectivity gate (CORS + LNA) | `COMPLETE` | 2026-09-15 | Edwin reported HTTPS→loopback matrix all pass (Vite + production HTTPS, CORS, LNA allow/deny). |
| 0E | Parse Edwin geometry (read-only) | `COMPLETE` | 2026-09-14 | Public canary US Letter + Calibri; private parse succeeded (local note only). |
| 0D | Run-aware text-patch fidelity gate | `COMPLETE` | 2026-09-14 | Word pass on geometry, mixed-runs, and private patched DOCX. Architecture D remains selected. |
| 0C | Identity round-trip spike | `COMPLETE` | 2026-09-14 | Word pass on geometry-canary.roundtrip.docx (no repair, 1 page). |
| 0B | Fixture protocol | `COMPLETE` | 2026-09-14 | Word pass. Geometry is 1 page / not tight; mixed-runs formatting visible. Private resume on disk, gitignored. |
| 0A | Environment verification | `COMPLETE` | 2026-09-01 | Tests + build green. Lint already red on unrelated calendar/school. No Resume app code. |
| — | — | `NOT STARTED` | — | Implementation not approved (superseded) |

---

## Phase order (reference)

`0A → 0B → 0C → 0D → 0E → 0F → 1A → 1B → 1C → 1D → 1E → 2A → 2B → 2C → 2D → 3A → 3B → 3C → 3D → 3E → 3F → 4A → 4B → 4C → 4D → 4E → 4F → 4G → 5A → 5B → 5C → 5D → 5E → 5F → 6A → 6B → 6C → 6D → 6E → 6F → 6G → 7A → 7B → 7C → 7D → 7E → 8A → 8B → 8C → 8D → 9A → 9B → 9C → 9D → 9E → 10A → 10B → 10C → 10D → 10E → 10F`

Hard gates (do not mark the successor eligible if these failed):

- **0D** must be `COMPLETE` (Word text-patch + mixed-run) before **1A**
- **4G** must be `COMPLETE` before **5A**
- **6G** cases A–G must be `COMPLETE` before **7A**
