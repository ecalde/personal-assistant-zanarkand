# Resume Tool Implementation Plan

Status: **Planning only** until Edwin explicitly approves implementation. No Resume Tool application code has been written. Execute this file **in order**. Do not skip gates. Do not invent a different editor, inference vendor, or canonical document model.

Canonical architecture: [`RESUME_TOOL_ARCHITECTURE.md`](./RESUME_TOOL_ARCHITECTURE.md).  
Cross-chat status: [`RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md) (authoritative; a new Cursor chat has **no** memory of prior phases).

If this plan and the architecture doc disagree, **stop and ask Edwin**. Do not improvise a third design.

---

## How to use this plan

### One chat = one phase

Edwin will open a **new Cursor chat for every implementation phase**. That chat has no conversational context from the previous phase.

**Operating rule:** one Cursor chat = exactly one implementation phase. Complete or park that phase, update [`RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**. Do not implement a second phase in the same chat.

A **STOP / CONTINUE GATE** names the **successor after this phase is `COMPLETE`**. It is **not** permission to begin that successor in this chat. While status is `AWAITING MANUAL VERIFICATION` or `BLOCKED`, **next eligible phase** in the progress file is the **current** phase (or the blocked phase), not the successor.

### New session bootstrap (every implementation chat)

Before writing Resume Tool code, the agent must read:

1. [`RESUME_TOOL_ARCHITECTURE.md`](./RESUME_TOOL_ARCHITECTURE.md)
2. This file
3. [`RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md)
4. Applicable repository/Cursor project rules (`.cursor/rules/00-core-project-rules.mdc` through `50-workflow-rules.mdc`, plus `60-resume-tool.mdc`)

Then inspect the **actual repository** (git status, relevant files). Use progress + repo to choose the **earliest incomplete** phase. If those sources disagree, stop and ask Edwin.

If progress says implementation is not approved, or status is `AWAITING MANUAL VERIFICATION` / `BLOCKED`, do not start a successor phase. Exception: if progress still says not approved but Edwin’s **current** message explicitly approves implementation, that chat is **0A only** — set the approval field to Yes in the progress file as part of 0A.

### Progress file (required every phase)

[`RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md) is the persistent checkpoint across chats.

Every phase **must** update it **before the agent stops**, including **0A** (no application-code changes). Record at least:

- current/last phase number and name
- status: `COMPLETE` / `AWAITING MANUAL VERIFICATION` / `BLOCKED`
- what was completed
- automated verification performed
- manual verification result when required
- important files changed
- blockers or relevant notes
- next eligible phase

Do **not** mark a phase `COMPLETE` until Edwin has reported that any **required** manual verification passed. Required Edwin checks are those listed under **Manual verification** that need Word, a production HTTPS origin, a UI walkthrough, or an explicit human checkpoint. Agent-only commands (`npm test`, Vitest) may be recorded by the agent; those alone do not keep the phase in `AWAITING MANUAL VERIFICATION`.

If Edwin verification is still outstanding: set `AWAITING MANUAL VERIFICATION`, keep **next eligible phase** equal to the **current** phase, and stop.

### Order and gates (eligibility, not same-chat work)

1. **Approved implementation starts at Phase 0A**, not Phase 1. The first implementation chat does **only** 0A.
2. Do **not** treat Wave 1 as eligible until Phase **0D** is `COMPLETE` in the progress file (or Edwin explicitly chooses a fallback architecture).
3. Do not treat Wave 5 as eligible until Phase **4G** is `COMPLETE`.
4. Do not add paid AI, ONLYOFFICE, TipTap, Python, or embeddings unless a later ADR in the architecture doc is updated.
5. Commit only if Edwin asked for a commit.

**Repo conventions to obey**

- Pages presentational; mutations via `App.tsx` callbacks (or a dedicated `resumeRemote` module called from those callbacks — **not** from random components talking to Supabase except the established `src/lib` pattern).
- Pure logic in `src/core/**` with co-located `*.test.ts`.
- RLS four-policy tables; validate in `dbMappers`-style parsers.
- Aether tokens; no new hardcoded palette.
- Vitest node (`npm test`). No Playwright unless Edwin later approves it.
- npm only.

**Private resume fixture**

Edwin’s real `.docx` is the acceptance canary. It must **not** be committed.

- Gitignore `fixtures/resume/private/`
- Place the real file at `fixtures/resume/private/current-resume.docx` locally
- Public sanitized twin: `fixtures/resume/public/geometry-canary.docx` (fake name, similar fonts/margins/tight page-2) created in Phase 0B
- Mixed-run twin: `fixtures/resume/public/mixed-runs-canary.docx` created in Phase 0B

---

## Traceability matrix

IDs match [`RESUME_TOOL_ARCHITECTURE.md`](./RESUME_TOOL_ARCHITECTURE.md) §54. Implementing agents must not close a requirement without the listed phase **and** test.

| ID | Requirement | Architecture component | Phase | Validation |
| --- | --- | --- | --- | --- |
| RES-PROD-001 | Tailor existing DOCX resume | Resume workspace | 2B–7C | Upload → suggest → export |
| RES-AI-001 | No paid AI | `ollamaClient.ts` | 0F, 6A | Grep: no OpenAI; Settings loopback |
| RES-AI-002 | No fabricated facts | `resumeGrounding.ts` | 6D, 6G | Kubernetes absent; metric rejected |
| RES-AI-005 | Fact provenance | `resumeFacts.ts` | 3C, 6G | Case G unverified Kubernetes |
| RES-AI-006 | Unverified ≠ allowed evidence | Grounding allow-list | 6G | Other-block rewrite must not gain Kubernetes |
| RES-AI-003 | User controls each change | Suggestion cards | 7B–7C | Accept/reject persistence |
| RES-AI-004 | No whole-resume silent rewrite | `resumeSuggestions.ts` | 6F | Per-block generator |
| RES-FID-001 | Preserve formatting | OOXML zipper/patcher | **0C, 0D**, 4G | Identity zip + one-bullet Word |
| RES-FID-003 | Mixed-run fail-closed | `resumeOoxmlPatch.ts` | 0D, 4D | `mixed-runs-canary.docx`; no flatten |
| RES-FID-002 | Honest fidelity claims | Font banner | 4B | Missing-Calibri warning |
| RES-LAY-001 | Layout-aware warnings | `resumeLayout.ts` | 8A–8C | Wrap/page tests |
| RES-LAY-002 | Char count secondary | Preferences | 8A | Soft cap does not override wrap |
| RES-ATS-001 | No fake ATS score | Coverage UI | 5E | Disclosure copy |
| RES-ATS-002 | No hidden tricks | Lint + prompt | 6C, 6E | Vanish/white-text rejected |
| RES-ATS-003 | Parseability warnings | `resumeAtsChecks.ts` | 3D | Table/header fixtures |
| RES-STY-001 | Natural writing rules | `resumeStyleLint.ts` | 6E | Em dash / leveraged |
| RES-UNI-001 | Unicode hygiene | `resumeUnicode.ts` | 3E, 6E | ZWSP stripped on generated text |
| RES-DOC-001 | Stable block IDs | Bookmarks | 3B, 7A | IDs survive text edit |
| RES-DOC-002 | DOCX import | Validation + parse | 2B, 3A | Macro/zip-slip rejected |
| RES-DOC-003 | DOCX export | Working bytes | 0D, 4G, 9A | Word opens; no repair |
| RES-DOC-004 | PDF export | Deferred | 9E | Labeled print or skip |
| RES-DOC-005 | Font strategy | Preflight | 4B | Substitution warning |
| RES-PER-001 | Multiple resumes/versions | Tables + UI | 1C, 2C, 2D, 9B | Duplicate/save-as |
| RES-PER-002 | JD survives navigation | `resume_job_sessions` | 5B | Reload restores JD |
| RES-PER-003 | Autosave | Debounced storage | 4F | Reload keeps bullet edit |
| RES-PER-004 | Base resume protected | Immutable original | 1C, 2B, 4F | Original hash unchanged |
| RES-SEC-001 | Cross-user isolation | RLS + storage | 1B, 10A | Policy review |
| RES-SEC-002 | Prompt injection | Prompts + tests | 6C, 10B | Case F |
| RES-SEC-003 | No PII logs | `resumeErrors.ts` | 10E | Grep + review |
| RES-HOST-001 | No Vercel LLM | No resume Edge Function | 6A | Architecture check |
| RES-HOST-002 | HTTPS→loopback LNA | `ollamaClient.ts` | 0F, 6A | Production origin allow/deny |
| RES-MOB-001 | Desktop-primary | Responsive pane | 10D | Phone banner |
| RES-A11Y-001 | Accessible review | Cards/toolbar | 10C | Keyboard accept/reject |
| RES-JOB-001 | Structured JD extract | `resumeJobParse.ts` | 5C | Fixture JD |
| RES-JOB-002 | Required ≠ preferred | Parser | 5C | Must vs nice-to-have |
| RES-MATCH-001 | Synonym REST | Alias table | 5D | REST APIs vs RESTful |
| RES-MATCH-002 | Absent stays absent | Matcher | 5D, 6G | Kubernetes |
| RES-MATCH-003 | Coverage ≠ grounding | Match statuses | 5E | `on_page_unverified` labeled |
| RES-SUG-001 | Per-block cards | UI | 7A | Maps to bookmark |
| RES-SUG-002 | Stale if edited | Hash check | 7D | Edit then accept no-ops |
| RES-SUG-003 | Regenerable constraints | Generator | 7B | Shorter / closer to original |
| RES-VER-001 | Model/pipeline recorded | `generation` | 6F | Row contains model tag |

### Wave mapping (execution order)

| Wave | Phases | Primary IDs |
| --- | --- | --- |
| 0 Proof | 0A–0F | RES-FID-001/003, RES-HOST-002, RES-AI-001 |
| 1 Persistence | 1A–1E | RES-PER-001, RES-PER-004, RES-SEC-001 |
| 2 Library UX | 2A–2D | RES-DOC-002, RES-PER-001 |
| 3 Document model | 3A–3F | RES-DOC-001, RES-ATS-003, RES-UNI-001, RES-AI-005 |
| 4 Editor + product regression | 4A–4G | RES-DOC-005, RES-PER-003, 4G regression of 0D |
| 5 JD + match | 5A–5F | RES-JOB-*, RES-MATCH-*, RES-ATS-001, RES-PER-002 |
| 6 Local AI | 6A–6G | RES-AI-001/002/004/005/006, RES-SEC-002, RES-VER-001 |
| 7 Suggestions UX | 7A–7E | RES-SUG-*, RES-AI-003 |
| 8 Layout | 8A–8D | RES-LAY-* |
| 9 Export / versions | 9A–9E | RES-DOC-003/004, RES-PER-001 |
| 10 Hardening | 10A–10F | RES-SEC-*, RES-A11Y-001, RES-MOB-001 |

---

## Wave 0 — Proof gates (no product feature yet)

Do **not** wire Career UI, migrations, Resume library, or JD analysis until **0D** is `COMPLETE` in [`RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md). Identity zip (0C) is necessary but **not sufficient**. Each Wave 0 phase is still **one chat**.

---

### Phase 0A — Environment verification

**Purpose.** Record the actual runtime: Node, npm, `npm test`, `npm run build`, Supabase env present, no document server running.

**User-visible outcome.** None.

**Prerequisites.** Repo builds today.

**Architecture dependencies.** Hosting facts in architecture §4.

**Files likely involved.** [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md) only (required). None of the application. Optional notes only if Edwin asks; **do not** edit `docs/architecture.md` in this phase.

**Database/storage changes.** None.

**Backend / frontend / local AI / document-processing changes.** None.

**Security considerations.** Do not print secrets from `.env.local`.

**Exact implementation sequence.**

1. Run `npm test`, `npm run lint`, `npm run build`.
2. Confirm `package.json` still has no docx/editor/LLM libraries.
3. Confirm `src/pages/types.ts` Page union and Career switcher exist as documented.
4. Confirm `.env.example` lists `OPENAI_API_KEY` for cooking only — **do not use it**.
5. Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md) (status, verification, next eligible **0B**). Do not start 0B.

**Automated tests.** Existing suite must already pass (baseline).

**Manual verification.**

1. `npm test` exits 0.
2. `npm run build` exits 0.

**Failure conditions.** Baseline broken before Resume work — fix or stop; do not layer Resume on a red build.

**Troubleshooting.** Vite/Supabase env missing is unrelated; still do not add Resume code.

**Completion criteria.** Baseline green; plan still valid.

**Git checkpoint.** None required.

**STOP / CONTINUE GATE.** Next eligible phase: **0B — Fixture protocol**. Do **not** start it in this chat.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

### Phase 0B — Fixture protocol

**Purpose.** Establish public + private resume fixtures and gitignore.

**User-visible outcome.** None.

**Prerequisites.** 0A.

**Files likely involved.**

- `.gitignore` (add `fixtures/resume/private/`)
- `fixtures/resume/public/README.md` (what the canary represents — **no PII**)
- Later phases add `geometry-canary.docx` as a **real small docx** created with Word or by a checked-in zip of harmless OOXML. Creating that binary **is allowed** — it is a test fixture, not application source. Keep it tiny and fictional.

**Database/storage / backend / frontend / local AI.** None.

**Document-processing.** Create or export:

1. `fixtures/resume/public/geometry-canary.docx` — 1–2 page fictional canary: Calibri (or Carlito) 10 pt, ~0.5" margins, a bullet that is visually one line, a final line that sits near a page break if possible.
2. `fixtures/resume/public/mixed-runs-canary.docx` — **required.** One body paragraph that contains, in order, unformatted text, a **bold** run, an *italic* run, and a **hyperlink** run (plus a tab or break if practical). Neighboring paragraphs must exist so we can prove they stay byte-equal after a patch. No PII.

**Exact implementation sequence.**

1. Gitignore private folder.
2. Add public README describing geometry goals (US Letter, tight last line) **and** mixed-run goals (bold/italic/hyperlink in one `w:p`).
3. Add `geometry-canary.docx` and `mixed-runs-canary.docx`.
4. Document in the README that Edwin should copy his real resume into `fixtures/resume/private/current-resume.docx` locally.

**Automated tests.** None yet.

**Manual verification.**

1. Open both public fixtures in Word. Note page count, the target geometry bullet’s line count, and that mixed-run formatting is visible.
2. Confirm private path is ignored (`git check-ignore -v fixtures/resume/private/current-resume.docx` after creating a dummy).

**Failure conditions.** Public fixtures contain real PII; mixed-run file is actually a single flattened run.

**Troubleshooting.** If Word isn’t available to *author* the fixture, another OOXML editor is OK for creation. **Acceptance of 0C and 0D still requires Microsoft Word.**

**Completion criteria.** Public fixtures committed; private ignored.

**Git checkpoint.** Optional: `chore: add resume test fixtures and gitignore`.

**STOP / CONTINUE GATE.** Next eligible phase: **0C — Identity round-trip spike (library in tests, not UI)**. Do **not** start it in this chat.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

### Phase 0C — Identity round-trip spike (library in tests, not UI)

**Purpose.** Prove JSZip can load and re-save a DOCX so Word does not repair it.

**User-visible outcome.** None.

**Prerequisites.** 0B.

**Architecture dependencies.** ADR-003.

**Files likely involved.**

- `package.json` / `package-lock.json` — add `jszip` (MIT) **only**
- `src/core/resume/resumeZip.ts` — `loadDocxBuffer`, `writeDocxBuffer` (no XML rewrite yet)
- `src/core/resume/resumeZip.test.ts`

**Database / UI / AI.** None.

**Document-processing.** Unzip → rezip storing files with **deterministic** compression where possible; preserve `[Content_Types].xml` and all parts.

**Security.** Zip-slip rejection even in this spike (`..` paths).

**Exact implementation sequence.**

1. Add `jszip` dependency.
2. Implement load/save that round-trips bytes **or** structurally equivalent zips.
3. Test: public fixture SHA may change (zip metadata); **Word repair is the oracle**, plus: every zip entry name from input exists in output; `word/document.xml` byte-identical after identity rezip.

**Automated tests.**

- Rejects path traversal entries.
- `document.xml` identical after identity rezip of public fixture.
- Rejects non-zip buffers.

**Manual verification.**

1. Run the test helper or a tiny node script (keep it as a test, not a new npm app) to write `geometry-canary.roundtrip.docx`.
2. Open in **Microsoft Word**.
3. Confirm no “Word found unreadable content” repair dialog.
4. Confirm page count equals the original fixture.

**Failure conditions.** Word repair dialog; missing parts; `document.xml` changed.

**Troubleshooting.** JSZip `compression: DEFLATE` vs STORE; extra `word/document.xml` namespace rewrite — **do not pretty-print XML**.

**Completion criteria.** Identity rezip passes Word on public fixture.

**Git checkpoint.** `chore: add DOCX zip identity round-trip helper`

**STOP / CONTINUE GATE.** If identity zip **passed** Word: next eligible phase: **0D — Run-aware text-patch fidelity gate (architecture kill-switch)**. Do **not** start it in this chat.

If Word repair: status `BLOCKED`; next eligible stays **0C** (retry) or stop. Do not start 0D. Do not add XML patching on a broken zipper.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

### Phase 0D — Run-aware text-patch fidelity gate (architecture kill-switch)

**Purpose.** Prove the highest-risk operation **before** persistence or UI: change exactly one bullet’s wording in OOXML, preserve all unrelated document content and mixed-run formatting, export, open in Microsoft Word.

**User-visible outcome.** None (no Career UI). Output files under a gitignored or `fixtures/resume/public/out/` path that is **not** committed if they contain private data. Public patched outputs may be gitignored too (`fixtures/resume/public/out/`).

**Prerequisites.** 0B, 0C.

**Architecture dependencies.** ADR-003, ADR-015, architecture §18.4 and §58.2.

**Files likely involved.**

- `package.json` — add `fast-xml-parser` here if not already added (needed to locate `w:t`; 0E will reuse it)
- `src/core/resume/resumeOoxmlPatch.ts` — `patchParagraphPlaintext` **fail-closed**
- `src/core/resume/resumeOoxmlPatch.test.ts`
- Optional tiny test helper that writes patched buffers; **no** React, **no** Supabase, **no** migrations

**Database / UI / AI / product persistence.** None. **Forbidden in this phase:** Resume library, `App.tsx` Career wiring, JD parser.

**Security.** Do not commit the private resume or patched copies of it.

**Exact implementation sequence.**

1. Implement `patchParagraphPlaintext(docxBytes, locator, newPlaintext)` per architecture §18.4 (minimum `w:t` edits; preserve `rPr`, hyperlinks, tabs, breaks, bookmarks, fields; **no mixed-run flatten**).
2. Locator for Wave 0: exact original paragraph plaintext (product later uses bookmarks).
3. Automated tests on `mixed-runs-canary.docx`:
   - Change an **unformatted** word in the mixed paragraph (e.g. a leading verb) → bold/italic/hyperlink runs’ `w:rPr` and hyperlink `r:id` unchanged; neighboring `w:p` XML identical.
   - Change text **inside** the bold run only (same `rPr`) → still bold.
   - Construct a patch that would require merging two different `rPr` regions → `PatchError`, original bytes unchanged.
4. Patch `geometry-canary.docx`: exactly one representative bullet, minimal wording change.
5. If `fixtures/resume/private/current-resume.docx` exists on disk, patch exactly one real work-experience bullet the same way. That private Word check is **required** to close 0D on a machine that has the file. Automated tests may gate private-file reads on `RESUME_PRIVATE_FIXTURE=1` so CI without the secret fixture still runs public tests.
6. Write patched files; open each in **Microsoft Word**.

**Automated tests.**

- Mixed-run preservation (rPr / hyperlink).
- Neighbor paragraph XML equality.
- Fail-closed `PatchError` does not mutate input.
- Geometry canary plaintext of the target para changes; other paras’ concatenated text unchanged.

**Manual verification (required).**

For **each** of: geometry canary, mixed-run canary, and private resume when present:

1. Open original in Word. Note page count, margins, fonts, bullet indent, hyperlinks, the target bullet’s formatting, and neighbors.
2. Open patched DOCX in Word. **No repair warning.**
3. Confirm page count, margins, fonts, bullet indentation, neighboring paragraphs, hyperlinks, and unchanged formatting.
4. Confirm **only** the intended wording changed.

**Failure conditions.** Word repair; lost bold/italic/hyperlink; neighbor restyle; extra page from a tiny wording change; flattened mixed paragraph; any Career/UI/migration code added in this phase. If the private fixture exists locally and was not opened in Word, 0D is not complete.

**Troubleshooting.** Pretty-print XML, rewriting whole `w:p`, cloning first-run `rPr` over the paragraph, dropping `w:hyperlink`. Fix the patcher; do not “warn and flatten.”

**Completion criteria.** Edwin reports that the 0D Word checks passed. Until then, progress status is `AWAITING MANUAL VERIFICATION` (next eligible stays **0D**). Architecture D remains selected only on pass.

**Git checkpoint.** `chore: prove fail-closed OOXML text patch`

**STOP / CONTINUE GATE.** Next eligible phase: **0E — Parse Edwin geometry (read-only)**. Do **not** start it in this chat.

Do not treat Wave 1 as eligible until this text-patch fidelity test is `COMPLETE`. Until Edwin reports Word sign-off, **next eligible stays 0D**. If **fail**: status `BLOCKED`; evaluate Fallback 1 or 2; do not convert to HTML or flatten mixed runs. If **pass** (after Edwin Word sign-off): next eligible is **0E**. Persistence and Resume UI remain ineligible until 0D is `COMPLETE`.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

### Phase 0E — Parse Edwin geometry (read-only)

**Purpose.** Extract fonts, `sectPr` page/margins, paragraph count, and plaintext from public + private (if present) files. Reuse XML parsing from 0D; this phase is read-only inventory, not a second patcher.

**User-visible outcome.** None.

**Prerequisites.** 0D (patcher exists; parse helpers may already be in `resumeOoxmlPatch.ts` — extract shared read module if needed).

**Files likely involved.**

- `src/core/resume/resumeOoxmlRead.ts` (split from patcher if not already)
- `src/core/resume/resumeOoxmlRead.test.ts`

**Exact implementation sequence.**

1. Parse `word/document.xml` + `word/styles.xml` + section `sectPr`.
2. List unique font names.
3. Dump plaintext reading order.
4. Tests on public fixture: font list nonempty; assert the **actual** page size you put in the canary.

**Automated tests.** Public fixture page size / font list as authored.

**Manual verification.**

1. If private resume exists, run parse skipped unless `RESUME_PRIVATE_FIXTURE=1`.
2. Record fonts/margins/page count in a **local** note, not in git if they encode PII.

**Failure conditions.** Parser throws on public fixture; empty plaintext.

**Troubleshooting.** Namespaces `w:`; default vs prefixed.

**Completion criteria.** Read API stable enough for Phase 3 to build on.

**Git checkpoint.** `chore: add read-only OOXML resume parser`

**STOP / CONTINUE GATE.** Next eligible phase: **0F — Ollama connectivity gate (CORS + Local Network Access)**. Do **not** start it in this chat.

Human not required unless the parser cannot read the private resume when present (then status `BLOCKED` and report).

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

### Phase 0F — Ollama connectivity gate (CORS + Local Network Access)

**Purpose.** Prove or document failure of **deployed HTTPS** app → `http://127.0.0.1:11434`, including Ollama up, `OLLAMA_ORIGINS`, browser CORS, **Local Network / loopback permission**, permission denied, and browser-specific limits. Vite-only CORS is **not** sufficient.

**User-visible outcome.** None (no Settings UI yet). A mocked client module is allowed.

**Prerequisites.** 0A. Ollama may be missing — that’s a valid documented result.

**Architecture dependencies.** ADR-005, architecture §29.

**Files likely involved.**

- `src/lib/ollamaClient.ts` — `listModels()`, default base `http://127.0.0.1:11434`; `targetAddressSpace: "loopback"` when supported; distinct errors: `OllamaUnavailable`, `OllamaCors`, `OllamaLocalNetworkDenied`
- `src/lib/ollamaClient.test.ts` — mocked `fetch` only (CI must not require Ollama)

**Exact implementation sequence.**

1. Implement client with timeout, no secrets, JSON error mapping, loopback `targetAddressSpace` feature-detect.
2. Mocked tests for unavailable / CORS-shaped failures / `NotAllowedError` → `OllamaLocalNetworkDenied`.
3. Manual matrix below. Record results for Edwin (no PII).

**Automated tests.** Mocked fetch only.

**Manual verification.**

1. **Ollama availability:** `curl http://127.0.0.1:11434/api/tags` (process up or not).
2. **Origins:** with `OLLAMA_ORIGINS` unset vs set to Vite origin vs set to **production HTTPS origin**.
3. **Vite origin:** DevTools `fetch('http://127.0.0.1:11434/api/tags')` on `http://localhost:5173` — CORS result.
4. **Production HTTPS origin (required):** open the **deployed** SPA (or a production-preview URL). In DevTools, `fetch('http://127.0.0.1:11434/api/tags', { targetAddressSpace: 'loopback' })` (omit the option if the browser throws on unknown property). Record: Ollama up, CORS, **permission prompt**, Allow vs Block.
5. **Permission denied:** Block the local/loopback permission (or `chrome://settings/content/localNetworkAccess`). Confirm fetch fails **and** that the future Settings UX can distinguish this from “Ollama not installed.”
6. **Browsers:** repeat step 4 on Chrome (primary), Safari, and Firefox if available. Note mixed-content or missing LNA.
7. Confirm the product plan: on any failure, **deterministic-only** fallback; no Supabase proxy.

**Failure conditions.** Treating Vite CORS success as proof that production HTTPS works; proxying Ollama through Vercel; collapsing LNA deny into a generic “CORS” message with no onboarding.

**Troubleshooting.** Architecture §29 onboarding list (`OLLAMA_ORIGINS`, Allow on the prompt, 127.0.0.1 not LAN IP).

**Completion criteria.** Client module exists; **written matrix** of production HTTPS results (pass, CORS, LNA deny, Ollama down, browser N/A). Until Edwin reviews that matrix, status is `AWAITING MANUAL VERIFICATION`. Wave 1 may become **eligible** in a later chat without a green Ollama path. Wave 6 rewriting must not pretend the gate passed.

**Git checkpoint.** `chore: add mocked Ollama client with LNA error types`

**STOP / CONTINUE GATE.** Next eligible phase: **1A — Domain types**. Do **not** start it in this chat.

Human checkpoint: Edwin reviews the HTTPS→loopback matrix before marking 0F `COMPLETE`. Until then, **next eligible stays 0F**. After 0F is `COMPLETE`, Wave 1 (**1A**) may become eligible without a green Ollama path. Do not start Wave 6 rewriting UI that assumes fetch always works.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

## Wave 1 — Persistence (no editor)

---

### Phase 1A — Domain types

**Purpose.** Add TypeScript types only; `AppPayload` **unchanged**.

**User-visible outcome.** None.

**Prerequisites.** Phase **0D** text-patch gate passed (Wave 0 zipper + fail-closed patcher). Do not start 1A if 0D failed.

**Files likely involved.**

- `src/core/resume/resumeModel.ts` (new)
- `src/core/resume/resumeModel.test.ts` — type-guard tests if you export `isResumeSourceKind` etc.

**Database.** None.

**Exact implementation sequence.**

1. Define `Resume`, `ResumeVersion`, `ResumeJobSession`, `ResumeSuggestion`, `FactProvenance`, `ResumeFact` as in architecture §16.2, §20, §26, and §33.
2. Do not import these from `model.ts` yet except if a later phase needs `JobApplication.id` as `string`.

**Automated tests.** Allowlist guards for unions (`upload` \| `edit` \| …).

**Manual verification.** None.

**Failure conditions.** Types added onto `AppPayload`.

**Completion criteria.** Compiles; payload untouched.

**Git checkpoint.** `feat: add resume domain types`

**STOP / CONTINUE GATE.** Next eligible phase: **1B — Storage bucket + policies**. Do **not** start it in this chat.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

### Phase 1B — Storage bucket + policies

**Purpose.** Private `resume-docs` bucket.

**User-visible outcome.** None.

**Prerequisites.** 1A.

**Files likely involved.**

- `supabase/migrations/YYYYMMDDHHMMSS_resume_storage.sql`

**Exact implementation sequence.**

1. Create bucket `resume-docs` **not public**.
2. Policies: authenticated users can insert/select/update/delete objects where `bucket_id = 'resume-docs'` and `(storage.foldername(name))[1] = auth.uid()::text`.
3. No `anon` grants.

**Automated tests.** None in Vitest. Review SQL.

**Manual verification.** (Can wait until 2B.) Confirm migration applies on a branch/preview project when Edwin can.

**Failure conditions.** Public bucket; missing RLS.

**Completion criteria.** Migration committed.

**Git checkpoint.** `feat: add private resume-docs storage bucket`

**STOP / CONTINUE GATE.** Next eligible phase: **1C — Postgres tables**. Do **not** start it in this chat.

Wave 1 continues in later chats; this chat still stops after 1B.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

### Phase 1C — Postgres tables

**Purpose.** `resumes`, `resume_versions` with RLS. Sessions/suggestions tables can wait until Wave 5/7 **or** be created empty now. **Prefer now** for fewer migrations: also create `resume_job_sessions`, `resume_suggestions`, `resume_analysis_runs` with CHECKs.

**User-visible outcome.** None.

**Prerequisites.** 1B.

**Files likely involved.**

- `supabase/migrations/YYYYMMDDHHMMSS_resume_tables.sql`

**Exact implementation sequence.**

1. Follow [`docs/cooking/04-supabase-schema.md`](./cooking/04-supabase-schema.md) conventions (four policies, triggers, grants).
2. `resumes.is_default`: unique index `on resumes (user_id) where is_default`.
3. `resumes.import_fact_ledger jsonb` — frozen provenance ledger (architecture §33). Never treat working-copy mentions as this column.
4. FKs: versions.user_id = resumes.user_id (enforce in TS + optional composite).
4. `active_version_id` nullable on insert then updated — avoid circular FK pain: nullable FK, set after version insert.

**Automated tests.** None.

**Manual verification.** Migration up.

**Failure conditions.** Tables without RLS; enums instead of TEXT+CHECK (repo uses CHECK).

**Completion criteria.** SQL matches architecture §33.

**Git checkpoint.** `feat: add resume RLS tables`

**STOP / CONTINUE GATE.** Next eligible phase: **1D — Mappers + isolated remote API**. Do **not** start it in this chat.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

### Phase 1D — Mappers + isolated remote API

**Purpose.** Parse/serialize rows; CRUD that **does not** go through `replaceRemotePayload`.

**User-visible outcome.** None.

**Prerequisites.** 1C.

**Files likely involved.**

- `src/core/resume/resumeDbMappers.ts`
- `src/core/resume/resumeDbMappers.test.ts`
- `src/lib/resumeRemote.ts` — uses `supabase` from `src/lib/supabaseClient.ts`
- Do **not** add resume tables to `AppTable` in `remoteStorage.ts`

**Security.** `parseResumeRow` reject unknown keys / invalid uuid; paths must start with `{userId}/`.

**Exact implementation sequence.**

1. Strict parsers (copy style of `parseCalendarColorPreferences`).
2. `listResumes`, `insertResumeWithOriginal`, `setDefaultResume`, `deleteResume`.
3. Storage upload helper with content-type `application/vnd.openxmlformats-officedocument.wordprocessingml.document`.

**Automated tests.** Mapper accept/reject; path builder never emits `../`.

**Manual verification.** None.

**Failure conditions.** Wiring into `payloadFromRows`.

**Completion criteria.** Functions exist; unused by UI is OK.

**Git checkpoint.** `feat: add resume remote storage mappers`

**STOP / CONTINUE GATE.** Next eligible phase: **1E — Persistence tests + mapper battery**. Do **not** start it in this chat.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

### Phase 1E — Persistence tests + mapper battery

**Purpose.** Close Wave 1.

**Files likely involved.** `resumeDbMappers.test.ts` expansion.

**Exact implementation sequence.** Round-trip fixtures for jsonb extracted_structure (minimal object).

**Automated tests.** Invalid `source_kind` throws `MapperError`.

**Manual verification.** None.

**Failure conditions.** Untested parsers.

**Completion criteria.** `npm test` green.

**Git checkpoint.** Included in 1D or `test: resume mapper cases`

**STOP / CONTINUE GATE.** Next eligible phase: **2A — Career | Resume pane shell**. Do **not** start it in this chat.

CHECKPOINT — Wave 1 work in this chat is done. Human may apply migrations before Wave 2 uploads. A later chat may start **2A** against local Supabase once 1E is `COMPLETE`.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

## Wave 2 — Resume library UI

---

### Phase 2A — Career | Resume pane shell

**Purpose.** Navigation only: empty Resume section.

**User-visible outcome.** Career switcher shows Resume; empty state “No resumes yet.”

**Prerequisites.** 1D types exist (can mock empty list).

**Files likely involved.**

- `src/components/career/CareerSectionSwitcher.tsx` — add `resume`
- `src/core/careerSectionPreferences.ts` — persist `"resume"`
- `src/core/school.ts` — extend `CareerFocus` with `{ kind: "resume" }` **or** keep school/career union and store resume section only in the switcher (prefer extend `PersistedCareerSection` only first)
- `src/pages/CareerPage.tsx`
- `src/components/resume/ResumeSection.tsx` (new, empty)
- `src/ui/appStyles.ts` only if needed for a workspace layout token

**Exact implementation sequence.**

1. Third radio: Resume.
2. Render `ResumeSection` with `resumes={[]}` callbacks stubs.
3. Persist section key.

**Automated tests.** `careerSectionPreferences` tests for `"resume"`.

**Manual verification.**

1. Open Career.
2. Click Resume.
3. Reload: Resume still selected.
4. School and Career panes unchanged.

**Failure conditions.** New top-level nav item; broken School.

**Completion criteria.** Empty pane ships.

**Git checkpoint.** `feat: add Career Resume pane shell`

**STOP / CONTINUE GATE.** Next eligible phase: **2B — Upload + validate**. Do **not** start it in this chat.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

### Phase 2B — Upload + validate

**Purpose.** User can add a `.docx`.

**User-visible outcome.** File picker; resume appears in list.

**Prerequisites.** 1B–1D, 2A, 0C validation ideas.

**Files likely involved.**

- `src/core/resume/resumeFileValidation.ts` + tests
- `src/components/resume/ResumeSection.tsx`
- `src/App.tsx` **or** CareerPage fetching via `resumeRemote` in an effect (prefer **page-level hook** `useResumes(userId)` in `src/components/resume/useResumes.ts` to avoid bloating `App.tsx` further — architecture allows isolated fetch)
- `src/core/resume/resumeZip.ts` — used to validate zip

**Limits.** 8 MB compressed default; extension `.docx`; MIME allowlist + ZIP magic.

**Security.** Reject `.docm`, `vbaProject.bin`, zip-slip.

**Exact implementation sequence.**

1. Validate in TS before upload.
2. Hash SHA-256 (`crypto.subtle`).
3. Upload original + working (same bytes).
4. Insert resume + version 1.
5. List refresh.

**Automated tests.** File validation matrix (too big, wrong type, zip-slip name).

**Manual verification.**

1. Upload `geometry-canary.docx`.
2. Reload browser.
3. Resume still listed.
4. Confirm Storage object exists in Supabase dashboard (Edwin).

**Failure conditions.** Bytes in `localStorage` AppPayload; accepted `.docm`.

**Completion criteria.** Round-trip list after reload.

**Git checkpoint.** `feat: upload and persist resume DOCX`

**STOP / CONTINUE GATE.** Next eligible phase: **2C — Rename, default, delete**. Do **not** start it in this chat.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

### Phase 2C — Rename, default, delete

**Purpose.** Library management.

**Files likely involved.** `ResumeSection.tsx`, `resumeRemote.ts`, maybe `ResumeList.tsx`.

**Exact implementation sequence.** Confirm delete; default unique handled by SQL + mapper (unset others).

**Automated tests.** Mapper for `is_default` uniqueness is SQL; TS `normalizeDefault` if you unset others in the same transaction.

**Manual verification.**

1. Rename.
2. Set default.
3. Delete with confirm; original gone from list.
4. Cannot access another user’s id (sanity: paste UUID — should 404/empty).

**Failure conditions.** Delete without confirm; default not unique.

**Git checkpoint.** `feat: rename default and delete resumes`

**STOP / CONTINUE GATE.** Next eligible phase: **2D — Duplicate resume**. Do **not** start it in this chat.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

### Phase 2D — Duplicate resume

**Purpose.** Copy to a new resume (new original = current working bytes).

**Manual verification.** Duplicate appears; editing later must not change the source (tested fully in 4F).

**Git checkpoint.** `feat: duplicate resume`

**STOP / CONTINUE GATE.** Next eligible phase: **3A — Full OOXML block parse**. Do **not** start it in this chat.

CHECKPOINT — library usable. A later chat may start Wave 3 (**3A**) once 2D is `COMPLETE`.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

## Wave 3 — Document model

---

### Phase 3A — Full OOXML block parse

**Purpose.** Graph of paragraphs/runs from working DOCX.

**Files likely involved.** `resumeOoxmlRead.ts` expansion, `resumeBlocks.ts`, tests with public fixture.

**Exact implementation sequence.** Map each `w:p` to `{ order, text, runs: [{ text, bold, italic, underline, font, size }] }`. Preserve hyperlink rel ids on runs.

**Automated tests.** Public fixture: known bold phrase stays a distinct run; plaintext concat equals expected.

**Manual verification.** Log block count for private resume locally.

**Failure conditions.** Flattening all runs into one (research `paragraph.text` trap analog).

**STOP / CONTINUE GATE.** Next eligible phase: **3B — Bookmark stable IDs**. Do **not** start it in this chat.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

### Phase 3B — Bookmark stable IDs

**Purpose.** Write `pa_<uuid>` bookmarks into **working** copy only.

**Files likely involved.** `resumeOoxmlWrite.ts` (new), `resumeBlocks.ts`.

**Exact implementation sequence.**

1. If bookmarks already present with `pa_` prefix, reuse.
2. Else insert start/end around each `w:p`.
3. Save zip via 0C writer.
4. Re-read; IDs stable.

**Automated tests.** Second parse yields same IDs; original stored bytes **not** passed through the writer (test that original path isn’t used).

**Manual verification.** Open working copy in Word: bookmarks exist; **visual layout still OK** (bookmarks should be invisible).

**Failure conditions.** Original immutable object rewritten; Word repair.

**Git checkpoint.** `feat: inject stable resume bookmarks`

**STOP / CONTINUE GATE.** Next eligible phase: **3C — Fact ledger (deterministic, frozen import)**. Do **not** start it in this chat.

If Word layout shifts from bookmarks: status `BLOCKED` on 3B; switch to custom XML part mapping (architecture allows secondary map). Do not start 3C until 3B is resolved.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

### Phase 3C — Fact ledger (deterministic, frozen import)

**Purpose.** Extract `imported_source` facts from the **original** upload bytes. Persist on the resume row. Mention index is separate.

**Files likely involved.** `resumeFacts.ts`, `resumeSkillLexicon.ts`, tests.

**Exact implementation sequence.**

1. Lexicon includes Python, REST API aliases, AWS, Docker, etc. **No JD input.**
2. Classify provenance per architecture §16.2 / §20.
3. Tests: REST APIs → imported technology; Kubernetes absent.
4. Tests: after a simulated manual mention of Kubernetes, fact is `user_added_unverified` and **not** in the allowed-evidence set for another block (can be a pure function test; full Case G in 6G).

**Automated tests.** Sample plaintext; Kubernetes absent on import; unverified mention does not join `allowedEvidenceForBlock(otherBlockId)`.

**Manual verification.** None required.

**Failure conditions.** Rebuilding import ledger from working text after edits.

**Git checkpoint.** `feat: extract resume fact ledger with provenance`

**STOP / CONTINUE GATE.** Next eligible phase: **3D — ATS structural checks**. Do **not** start it in this chat.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

### Phase 3D — ATS structural checks

**Purpose.** Warnings only.

**Files likely involved.** `resumeAtsChecks.ts` + tests (synthetic XML with a `w:tbl`).

**Manual verification.** UI not required yet; function returns warnings array stored on version jsonb in next persist hookup (3F).

**Git checkpoint.** `feat: ATS parseability checks`

**STOP / CONTINUE GATE.** Next eligible phase: **3E — Unicode + plaintext extraction policy**. Do **not** start it in this chat.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

### Phase 3E — Unicode + plaintext extraction policy

**Purpose.** Define sanitizer for **generated** text; plaintext extract does not strip legitimate NBSP in the document.

**Files likely involved.** `resumeUnicode.ts` + tests (ZWSP, NFC, em dash).

**Automated tests.** ZWSP removed on `sanitizeGeneratedText`; document extract preserves ordinary hyphens.

**Git checkpoint.** `feat: resume unicode sanitation`

**STOP / CONTINUE GATE.** Next eligible phase: **3F — Persist extracted_structure on version**. Do **not** start it in this chat.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

### Phase 3F — Persist extracted_structure on version

**Purpose.** After upload (and after bookmark injection), save graph JSON.

**Files likely involved.** `resumeRemote.ts`, `ResumeSection` upload path.

**Manual verification.** Upload canary; inspect version row jsonb keys in dashboard (Edwin).

**Failure conditions.** Storing full DOCX base64 in jsonb.

**Git checkpoint.** `feat: persist resume extracted structure`

**STOP / CONTINUE GATE.** Next eligible phase: **4A — Paginated CSS preview (read-only)**. Do **not** start it in this chat.

CHECKPOINT. A later chat may start Wave 4 (**4A**) once 3F is `COMPLETE`.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

## Wave 4 — Editor and product-path regression

The patcher **already exists** (0D). This wave wires it into React. Do **not** implement a second flatten-on-save path.

---

### Phase 4A — Paginated CSS preview (read-only)

**Purpose.** Left pane shows page-like preview from graph.

**Files likely involved.**

- `src/components/resume/ResumeDocumentPane.tsx`
- `src/components/resume/ResumePageSurface.tsx`
- `src/ui/appStyles.ts` — document paper tokens
- Carlito files under `public/fonts/` + `@font-face` in a small `resumeEditor.css` **or** inject in component — architecture allows `public/fonts`. **Do not** add `@fontsource` unless files are awkward; checking in OFL font binaries is OK.

**Exact implementation sequence.** Map pt/twips to CSS px (1 twip = 1/20 pt; 96 CSS px/in). US Letter page. Overflow to a second CSS page.

**Automated tests.** Twip/px helper unit tests.

**Manual verification.**

1. Open uploaded canary.
2. Preview shows multiple pages if fixture is 2 pages.
3. Dark mode: paper stays light enough to read; surrounding chrome uses Aether.

**Failure conditions.** `dangerouslySetInnerHTML` of Word HTML.

**Git checkpoint.** `feat: paginated resume preview`

**STOP / CONTINUE GATE.** Next eligible phase: **4B — Font preflight**. Do **not** start it in this chat.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

### Phase 4B — Font preflight

**Purpose.** Warn if Calibri (or document fonts) missing.

**Files likely involved.** `resumeFonts.ts`, banner in `ResumeDocumentPane`.

**Manual verification.** On a machine without Calibri, warning shows; export names still Calibri in XML (verified in 9A).

**Git checkpoint.** `feat: resume font preflight warning`

**STOP / CONTINUE GATE.** Next eligible phase: **4C — Per-block editing (local state)**. Do **not** start it in this chat.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

### Phase 4C — Per-block editing (local state)

**Purpose.** Click a bullet, type, preview updates. **Not** persisted yet.

**Files likely involved.** `ResumeBlockEditor.tsx` — `contentEditable` per block.

**Accessibility.** `aria-label` from section + truncated text.

**Manual verification.** Type in one bullet; others unchanged.

**Failure conditions.** One giant contenteditable.

**Git checkpoint.** `feat: editable resume blocks`

**STOP / CONTINUE GATE.** Next eligible phase: **4D — Wire fail-closed OOXML patch into the editor**. Do **not** start it in this chat.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

### Phase 4D — Wire fail-closed OOXML patch into the editor

**Purpose.** Flush block text through the **same** `patchParagraphPlaintext` proven in 0D. No new patch algorithm.

**Required strategy:** architecture §18.4. Mixed-run flatten with a warning is **not allowed**.

**Files likely involved.** `ResumeDocumentPane.tsx` calling `src/core/resume/resumeOoxmlPatch.ts` (already in 0D).

**Automated tests.** Reuse 0D mixed-run tests; add an editor-level test only if you extract a flush helper. Must still assert `PatchError` on ambiguous mixed `rPr`.

**Manual verification.** Edit a mixed-run paragraph in the preview if the uploaded fixture is `mixed-runs-canary.docx`; download (or 4G) and confirm formatting. If a flush would flatten, the UI shows the fail-closed error and does not write.

**Failure conditions.** New code path that rebuilds the paragraph from first-run `rPr`; warning copy that treats lost bold as OK.

**Git checkpoint.** `feat: apply fail-closed OOXML patch from resume editor`

**STOP / CONTINUE GATE.** Next eligible phase: **4E — Undo / redo**. Do **not** start it in this chat.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

### Phase 4E — Undo / redo

**Purpose.** Block text undo in editor (in-memory). Suggestion undo comes in Wave 7.

**Files likely involved.** Simple stack in `ResumeDocumentPane`.

**Manual verification.** Type, undo, redo.

**Git checkpoint.** `feat: resume editor undo redo`

**STOP / CONTINUE GATE.** Next eligible phase: **4F — Autosave working copy**. Do **not** start it in this chat.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

### Phase 4F — Autosave working copy

**Purpose.** Debounced upload of patched DOCX + hash.

**Files likely involved.** `useResumeAutosave.ts`, `resumeRemote.updateWorkingVersion`.

**UI.** “Saving…” / “Saved” in the Resume pane (not necessarily AppShell last-saved, which is payload-based).

**Manual verification.**

1. Edit a bullet.
2. Wait 2s.
3. Full browser reload.
4. Edit still there.
5. Original storage object hash **unchanged**.

**Failure conditions.** `commit()` / `replaceRemotePayload` on each keystroke; original overwritten; uploading bytes after `PatchError` (must keep last good working copy).

**Git checkpoint.** `feat: autosave resume working copy`

**STOP / CONTINUE GATE.** Next eligible phase: **4G — Product-path fidelity regression**. Do **not** start it in this chat.

A later chat starts **4G**; do not run 4G in this chat.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

### Phase 4G — Product-path fidelity regression

**Purpose.** Prove the **in-app** upload → edit → download path uses the 0D patcher. This is **not** the first architecture kill-switch (that was 0D). If this fails, fix the UI wiring; do not invent a second patcher. If 0D never passed, this phase must not be reached.

**User-visible outcome.** Download working DOCX control: “Download Word”.

**Files likely involved.** Download button in Resume toolbar.

**Exact implementation sequence.** Flush via `patchParagraphPlaintext` → download.

**Automated tests.** Public fixture: patch one known paragraph → reparse plaintext contains new words; mixed-run rPr still present.

**Manual verification (Edwin’s real resume — required if private fixture exists).**

1. Upload `fixtures/resume/private/current-resume.docx`.
2. Confirm estimated/CSS page count is 2 if the original is 2.
3. Do **not** change anything; download; open in Word; compare margins, fonts, bullets, hyperlinks; **no repair**.
4. Edit **one** work-experience bullet; download; open in Word.
5. Confirm only that wording changed; mixed formatting neighbors intact; page count still 2 **or** record a page-count change as a **regression failure** if no text length change should have caused it.
6. Also upload `mixed-runs-canary.docx` and change one unformatted word; confirm bold/italic/hyperlink survive in Word.

**Failure conditions.** Repair dialog; restyled document; lost bullets; original file mutated; extra page from identity download; a flatten-on-save path. If the private fixture is present locally, the in-app download must be opened in Word before this gate closes.

**Troubleshooting.** Bookmark insertion (3B) must be re-checked: if bookmarks break Word layout, switch to custom XML map as 3B already allows. That is separate from 0D (0D may run without bookmarks).

**Completion criteria.** Edwin confirms the product path matches 0D quality.

**Git checkpoint.** `feat: resume DOCX download for product-path fidelity regression`

**STOP / CONTINUE GATE.** Next eligible phase: **5A — Session schema wiring**. Do **not** start it in this chat.

Do not treat Wave 5 as eligible until 4G is `COMPLETE`. Until Edwin confirms the in-app import/edit/export regression, **next eligible stays 4G**. If **fail**: fix editor/download wiring in a later 4G retry chat. If the **patcher** itself now fails Word, treat as 0D regression → fallback architectures. If **pass**: next eligible is **5A**.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

## Wave 5 — Job description and deterministic matching

---

### Phase 5A — Session schema wiring

**Purpose.** CRUD for `resume_job_sessions` (table from 1C).

**Files likely involved.** `resumeDbMappers.ts`, `resumeRemote.ts`, tests.

**STOP / CONTINUE GATE.** Next eligible phase: **5B — JD paste UI + persistence**. Do **not** start it in this chat.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

### Phase 5B — JD paste UI + persistence

**Purpose.** Right pane: company, title, textarea, Analyze (can be implicit on debounce), Reset, Replace.

**Files likely involved.** `ResumeAnalysisPanel.tsx`, `ResumeSection` layout flex row on desktop.

**Manual verification.**

1. Paste a JD.
2. Navigate to Dashboard and back to Career → Resume.
3. JD still there.
4. Reset clears JD, not the document.

**Failure conditions.** JD only in React state.

**Git checkpoint.** `feat: persist resume job description sessions`

**STOP / CONTINUE GATE.** Next eligible phase: **5C — Deterministic JD parser**. Do **not** start it in this chat.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

### Phase 5C — Deterministic JD parser

**Purpose.** Required vs preferred, skills, years.

**Files likely involved.** `resumeJobParse.ts` + tests with a **synthetic** JD string in the test file (not a real employer’s confidential JD).

**Automated tests.** “Must have Kubernetes” → required Kubernetes; “Nice to have Terraform” → preferred.

**Git checkpoint.** `feat: deterministic job description parser`

**STOP / CONTINUE GATE.** Next eligible phase: **5D — Matcher + lexicon aliases**. Do **not** start it in this chat.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

### Phase 5D — Matcher + lexicon aliases

**Purpose.** `explicit` / `semantic_supported` / `absent`.

**Files likely involved.** `resumeMatch.ts` + tests (REST vs RESTful; Kubernetes absent).

**Git checkpoint.** `feat: resume job requirement matcher`

**STOP / CONTINUE GATE.** Next eligible phase: **5E — Coverage panel (honest copy)**. Do **not** start it in this chat.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

### Phase 5E — Coverage panel (honest copy)

**Purpose.** Show bars + missing list + disclosure sentence from architecture §31.

**Files likely involved.** `ResumeCoveragePanel.tsx`

**Failure conditions.** Label “ATS Score”; showing unverified on-page Kubernetes as if it were imported evidence without the unverified label.

**Manual verification.** Read the disclosure. Missing Kubernetes listed for a JD that requires it against the canary if canary has no Kubernetes. If you type Kubernetes into one bullet, coverage may show **on-page unverified**, not a silent “supported.”

**Git checkpoint.** `feat: job match coverage panel`

**STOP / CONTINUE GATE.** Next eligible phase: **5F — Invalidation**. Do **not** start it in this chat.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

### Phase 5F — Invalidation

**Purpose.** JD replace archives session; document edits don’t rerun JD parse; **import fact ledger is not rebuilt** from working text (architecture §20.3).

**Manual verification.** Replace JD → old coverage gone; resume text unchanged.

**Git checkpoint.** `feat: replace archive job sessions`

**STOP / CONTINUE GATE.** Next eligible phase: **6A — Settings connection test (includes LNA)**. Do **not** start it in this chat.

CHECKPOINT — useful without LLM. A later chat may start Wave 6 (**6A**) once 5F is `COMPLETE`.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

## Wave 6 — Local AI (rewriting)

---

### Phase 6A — Settings connection test (includes LNA)

**Purpose.** Settings → Resume AI: base URL default `http://127.0.0.1:11434`, model select from `/api/tags`, Test button. Surface **distinct** copy for: Ollama down, CORS/`OLLAMA_ORIGINS`, **local/loopback network permission denied**, mixed content / browser unsupported.

**Files likely involved.**

- `src/pages/SettingsPage.tsx` / new `ResumeAiSettingsSection.tsx`
- `src/core/resume/resumeAiPreferences.ts` + `localStorage` `pa.resume.ai.v1`
- `src/lib/ollamaClient.ts` (0F)

Onboarding text must match architecture §29 (install, pull model, `OLLAMA_ORIGINS` for Vite **and production HTTPS origin**, Allow on the browser permission prompt, how to reset a Block in Chrome site settings).

**Do not** add Edge Functions.

**Manual verification.** Repeat the **0F production HTTPS** matrix from Settings → Test connection (not only Vite). Deny permission once and confirm deterministic-only messaging. Editor still works if Test fails.

**Git checkpoint.** `feat: local Ollama connection settings`

**STOP / CONTINUE GATE.** Next eligible phase: **6B — Structured output schema**. Do **not** start it in this chat.

If production HTTPS cannot reach Ollama (CORS **or** LNA deny): later Wave 6 chats still proceed with mocked LLM in tests; rewriting UI stays deterministic-only / disabled Generate. Do not proxy via Supabase. Do not claim “CORS is configured” if the failure was a loopback permission.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

### Phase 6B — Structured output schema

**Purpose.** Zod-less: hand validators like `ocrExtractContract.ts`.

**Files likely involved.** `resumeLlmSchema.ts` + tests (reject extra fields / missing `proposedText`).

**Git checkpoint.** `feat: validate resume LLM JSON schema`

**STOP / CONTINUE GATE.** Next eligible phase: **6C — Injection-safe prompts**. Do **not** start it in this chat.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

### Phase 6C — Injection-safe prompts

**Purpose.** System vs data JSON payload.

**Files likely involved.** `resumeLlmPrompts.ts` + tests that JD is not in system string; system contains ignore-in-data instructions.

**Git checkpoint.** `feat: resume LLM prompt fencing`

**STOP / CONTINUE GATE.** Next eligible phase: **6D — Grounding validator**. Do **not** start it in this chat.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

### Phase 6D — Grounding validator

**Purpose.** Drop ungrounded tech/numbers. Enforce provenance allow-list (§20.2).

**Files likely involved.** `resumeGrounding.ts` + tests Cases B, E, **G**.

**Automated tests.**

- Case B: no Kubernetes in import ledger → reject insert.
- Case E: extra metric → reject.
- Case G: import has no Kubernetes; mention index has Kubernetes on block A as `user_added_unverified`; rewrite of block B proposing Kubernetes → `rejected_ungrounded`. Same-block B must not *add* Kubernetes either. Verifying the fact (`user_verified`) allows reuse.

**Git checkpoint.** `feat: resume suggestion grounding validator`

**STOP / CONTINUE GATE.** Next eligible phase: **6E — Style lint + unicode on outputs**. Do **not** start it in this chat.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

### Phase 6E — Style lint + unicode on outputs

**Purpose.** Em dashes, banned words, ZWSP.

**Files likely involved.** `resumeStyleLint.ts` + `resumeUnicode.ts` pipeline `prepareSuggestionText`.

**Git checkpoint.** `feat: resume suggestion style lint`

**STOP / CONTINUE GATE.** Next eligible phase: **6F — Single-block generator**. Do **not** start it in this chat.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

### Phase 6F — Single-block generator

**Purpose.** `rewriteBlock` through Ollama **or** a `ResumeLLM` fake in tests.

**Files likely involved.** `resumeSuggestions.ts`, `resumeRemote.insertSuggestion`.

**Performance.** One block at a time; progress in UI can wait for 7A.

**Automated tests.** Fake LLM returns Kubernetes → grounding rejects.

**Git checkpoint.** `feat: generate grounded resume suggestions`

**STOP / CONTINUE GATE.** Next eligible phase: **6G — AI QUALITY GATE**. Do **not** start it in this chat.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

### Phase 6G — AI QUALITY GATE

**Purpose.** Cases A–**G** as Vitest tests with a fake model **and** one optional live test skipped in CI (`RESUME_LIVE_OLLAMA=1`).

**Files likely involved.** `resumeSuggestions.quality.test.ts`

**Manual verification.** If Ollama works: run one real rewrite on a Python bullet with a Python JD.

**Failure conditions.** Case B, E, or **G** fails.

**STOP / CONTINUE GATE.** Next eligible phase: **7A — Cards bound to block IDs**. Do **not** start it in this chat.

CHECKPOINT — do not build suggestion chrome until A–G pass against the fake LLM. A later chat may start Wave 7 (**7A**) only after 6G is `COMPLETE`.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

## Wave 7 — Suggestion UX

---

### Phase 7A — Cards bound to block IDs

**Purpose.** Card list; click focuses block.

**Files likely involved.** `SuggestionCard.tsx`, `ResumeAnalysisPanel.tsx`

**Accessibility.** Original / Suggested labels; not color-only.

**Git checkpoint.** `feat: resume suggestion cards`

**STOP / CONTINUE GATE.** Next eligible phase: **7B — Accept / reject / edit / regenerate**. Do **not** start it in this chat.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

### Phase 7B — Accept / reject / edit / regenerate

**Purpose.** State machine.

**Regenerate options (MVP):** shorter; closer to original; emphasize selected requirement id. Always re-ground.

**Files likely involved.** `resumeSuggestionState.ts`

**Manual verification.** Reject hides card; regenerate replaces proposed text; edit proposed then accept.

**Git checkpoint.** `feat: accept reject regenerate resume suggestions`

**STOP / CONTINUE GATE.** Next eligible phase: **7C — Apply accept to OOXML**. Do **not** start it in this chat.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

### Phase 7C — Apply accept to OOXML

**Purpose.** Accept calls **0D** `patchParagraphPlaintext` + autosave + hash update; mark applied. `PatchError` → `blocked_formatting`, document unchanged.

**Manual verification.** Accept → preview updates → reload → still applied; download Word shows new text. Mixed-run accept must not flatten.

**Failure conditions.** Apply by fragile string search across whole document; flatten mixed runs.

**Git checkpoint.** `feat: apply accepted suggestions to DOCX`

**STOP / CONTINUE GATE.** Next eligible phase: **7D — Stale suggestions**. Do **not** start it in this chat.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

### Phase 7D — Stale suggestions

**Purpose.** If `originalTextHash` mismatches, cannot apply; show stale.

**Automated tests.** Hash mismatch → no patch.

**Git checkpoint.** `feat: stale resume suggestion detection`

**STOP / CONTINUE GATE.** Next eligible phase: **7E — Coverage refresh after accept**. Do **not** start it in this chat.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

### Phase 7E — Coverage refresh after accept

**Purpose.** Re-run matcher on current plaintext; no full LLM reanalyze; do **not** promote unverified mentions to allowed evidence.

**Manual verification.** Missing count drops if a term became explicit.

**Git checkpoint.** `feat: refresh coverage after suggestion accept`

**STOP / CONTINUE GATE.** Next eligible phase: **8A — measureText helper**. Do **not** start it in this chat.

CHECKPOINT. Layout wave is next (**8A**) in a later chat (do not swap 8 before 7: users need apply before wrap warnings on real suggestions).

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

## Wave 8 — Layout warnings

---

### Phase 8A — measureText helper

**Purpose.** Canvas width; content width from `sectPr` + indents.

**Files likely involved.** `resumeLayout.ts` + tests with **injected** `measure` function (don’t require canvas in Vitest).

**Git checkpoint.** `feat: resume layout width estimator`

**STOP / CONTINUE GATE.** Next eligible phase: **8B — Line-count warning on cards**. Do **not** start it in this chat.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

### Phase 8B — Line-count warning on cards

**Purpose.** Compare snapshot vs candidate.

**Default.** Warn, don’t block Accept (Q6).

**Manual verification.** Paste a long suggestion; card shows wrap warning.

**Git checkpoint.** `feat: suggestion line wrap warnings`

**STOP / CONTINUE GATE.** Next eligible phase: **8C — Page-count estimate warning**. Do **not** start it in this chat.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

### Phase 8C — Page-count estimate warning

**Purpose.** Greedy pagination vs import snapshot.

**Manual verification.** On private resume, a deliberately huge bullet warns page count.

**Git checkpoint.** `feat: resume page count estimate warning`

**STOP / CONTINUE GATE.** Next eligible phase: **8D — Layout fingerprint invalidation**. Do **not** start it in this chat.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

### Phase 8D — Layout fingerprint invalidation

**Purpose.** If we later add margin edits, stale layout reports. In MVP, fingerprint changes when fonts load (Carlito vs Calibri).

**Git checkpoint.** `feat: resume layout fingerprint`

**STOP / CONTINUE GATE.** Next eligible phase: **9A — Production DOCX download**. Do **not** start it in this chat.

A later chat may start Wave 9 (**9A**) once 8D is `COMPLETE`.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

## Wave 9 — Export, versions, PDF decision

---

### Phase 9A — Production DOCX download

**Purpose.** Named file `Name-role.docx` from resume name; flush first.

**Manual verification.** Same as 4G, plus filename.

**Git checkpoint.** `feat: named resume DOCX export` (if not done in 4G)

**STOP / CONTINUE GATE.** Next eligible phase: **9B — Save as new / version pointer**. Do **not** start it in this chat.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

### Phase 9B — Save as new / version pointer

**Purpose.** “Save as new resume” vs keep editing current.

**Manual verification.** Save as; original library item unchanged.

**Git checkpoint.** `feat: save tailored resume as new copy`

**STOP / CONTINUE GATE.** Next eligible phase: **9C — Block-level diff vs original version**. Do **not** start it in this chat.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

### Phase 9C — Block-level diff vs original version

**Purpose.** Simple list of changed `blockId`s vs version 1.

**Files likely involved.** `resumeDiff.ts`, `ResumeChangesList.tsx`

**Git checkpoint.** `feat: resume block diff against base version`

**STOP / CONTINUE GATE.** Next eligible phase: **9D — Optional application link**. Do **not** start it in this chat.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

### Phase 9D — Optional application link

**Purpose.** Nullable `application_id` picker from existing `jobApplications` if timeboxed; otherwise skip.

**If skipped:** leave column unused.

**STOP / CONTINUE GATE.** Next eligible phase: **9E — PDF**. Do **not** start it in this chat.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

### Phase 9E — PDF

**Purpose.** Implement **nothing** or a button “Print preview (approximate)” that calls `window.print` with a disclaimer.

**Do not** add Playwright/html2pdf.

**STOP / CONTINUE GATE.** Next eligible phase: **10A — Security review of paths and RLS**. Do **not** start it in this chat.

CHECKPOINT. Hardening is next (**10A**) in a later chat.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

## Wave 10 — Hardening and polish

---

### Phase 10A — Security review of paths and RLS

**Purpose.** Dual-check storage policies; reject oversized JD (100k); rate-limit **client-side** suggestion spam (disable button while running).

**Files likely involved.** Validation constants, SQL re-read.

**Automated tests.** JD over cap rejected.

**Git checkpoint.** `fix: resume upload and JD size limits`

**STOP / CONTINUE GATE.** Next eligible phase: **10B — Prompt injection corpus**. Do **not** start it in this chat.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

### Phase 10B — Prompt injection corpus

**Purpose.** Expand Case F variants.

**Git checkpoint.** `test: resume prompt injection cases`

**STOP / CONTINUE GATE.** Next eligible phase: **10C — Accessibility pass**. Do **not** start it in this chat.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

### Phase 10C — Accessibility pass

**Purpose.** Keyboard accept/reject; toolbar labels; focus after accept.

**Manual verification.** Keyboard-only review of 3 cards.

**Git checkpoint.** `fix: resume suggestion accessibility`

**STOP / CONTINUE GATE.** Next eligible phase: **10D — Mobile degraded UX**. Do **not** start it in this chat.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

### Phase 10D — Mobile degraded UX

**Purpose.** Banner + stacked layout; hide paginated paper if width &lt; 1024 if it’s unusable.

**Files likely involved.** `useIsDesktopViewport`, `ResumeSection.tsx`

**Manual verification.** Narrow DevTools: can still read suggestions.

**Git checkpoint.** `feat: resume mobile review layout`

**STOP / CONTINUE GATE.** Next eligible phase: **10E — Observability without PII**. Do **not** start it in this chat.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

### Phase 10E — Observability without PII

**Purpose.** User-facing error codes (`RESUME_ZIP`, `RESUME_OLLAMA`, `RESUME_GROUNDING`) without document text.

**Files likely involved.** `resumeErrors.ts`

**Failure conditions.** `console.log` of JD.

**Git checkpoint.** `feat: resume safe error codes`

**STOP / CONTINUE GATE.** Next eligible phase: **10F — Lazy load + Career copy polish**. Do **not** start it in this chat.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

### Phase 10F — Lazy load + Career copy polish

**Purpose.** `React.lazy` the Resume section to protect the main bundle. Final empty states. Link from coverage “missing skills” to Skills tracker is **optional** and must not auto-add skills.

**Files likely involved.** `CareerPage.tsx`, `vite` already supports lazy.

**Manual verification.** `npm run build` chunk appears; Career applications still work.

**Git checkpoint.** `feat: lazy-load resume workspace`

**STOP / CONTINUE GATE.** No successor phase.

FINAL CHECKPOINT. Feature complete for MVP once 10F is `COMPLETE`. Update `docs/architecture.md` and `docs/plans/roadmap.md` **only in this phase** (docs, not earlier). No further Resume Tool implementation phase.

Update [`docs/RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md), then **stop**.

---

## Proof-of-concept gates (summary)

| Gate | Phase | Kill / continue |
| --- | --- | --- |
| Identity zip Word | 0C | Kill zipper approach; do not patch XML |
| **Text-patch one-bullet + mixed-run** | **0D** | **Fallback 1 or 2; no HTML canonical; no flatten. Blocks Wave 1.** |
| Bookmark layout | 3B | Switch to custom XML map |
| Product-path download regression | 4G | Fix wiring; if patcher itself broke, treat as 0D regression |
| Ollama HTTPS→loopback (CORS **and** LNA) | 0F/6A | Coverage ships; rewriting disabled |
| AI cases A–G | 6G | Do not show Accept on ungrounded output |
| PDF | 9E | Skip rather than ship a lying PDF |

---

## Recommended Git checkpoints (human-requested commits)

Use these messages when Edwin asks to commit:

1. `chore: add DOCX zip identity round-trip helper`
2. `chore: prove fail-closed OOXML text patch`
3. `feat: add resume RLS tables and private storage`
3. `feat: upload and persist resume DOCX`
4. `feat: inject stable resume bookmarks`
5. `feat: paginated resume preview and OOXML editing`
6. `feat: persist job description sessions and coverage`
7. `feat: local Ollama grounded resume suggestions`
8. `feat: apply suggestions with layout warnings`
9. `feat: resume export versioning and hardening`

Do not commit `.env`, private resumes, or model weights.

---

## Rollback / recovery notes (all phases)

- SQL: new migrations only; never edit old cooking/career migrations.
- Storage: deleting a resume row should CASCADE versions; originals go away — duplicate first if unsure.
- UI: feature is isolated to Career Resume pane; revert those files if needed.
- Dependencies: removing `jszip` / `fast-xml-parser` is only possible before Wave 2 if Wave 0 fails.

---

## Phase count

Granular phases in this plan: **0A–0F (6) + 1A–1E (5) + 2A–2D (4) + 3A–3F (6) + 4A–4G (7) + 5A–5F (6) + 6A–6G (7) + 7A–7E (5) + 8A–8D (4) + 9A–9E (5) + 10A–10F (6) = 61**.

Renumbering vs the previous plan: former **0D** (parse) is now **0E**; former **0E** (Ollama) is now **0F**; **0D** is the new text-patch kill-switch. Waves 1–10 letter suffixes are unchanged.

---

## What the implementing agent must never do

- Implement more than one phase in a single Cursor chat, or start the next phase because a gate called it “eligible.”
- Skip updating [`RESUME_TOOL_PROGRESS.md`](./RESUME_TOOL_PROGRESS.md) before stopping (including Phase 0A).
- Mark a phase `COMPLETE` while required Edwin manual verification is still outstanding.
- Start at Phase 1 or Wave 5 without **0D** `COMPLETE` (unless Edwin chose Fallback 2 analysis-only, in which case skip in-app DOCX text editing).
- Start Wave 5 without **4G** `COMPLETE` (same patcher).
- Flatten mixed-run paragraphs or treat lost bold/italic as acceptable MVP.
- Rebuild the import fact ledger from working document text; treat unverified typed skills as evidence for other blocks.
- Call `ocr-extract` or any OpenAI URL.
- Add ONLYOFFICE Docker “just in case.”
- Put DOCX in `AppPayload`.
- Use line numbers as suggestion keys.
- Display ATS Score percentages as employer predictions.
- Log resume or JD text.
- Treat Vite CORS success as proof that production HTTPS → Ollama works (must include LNA/loopback permission).
