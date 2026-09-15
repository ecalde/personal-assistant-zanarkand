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
| Last phase number | 4B |
| Last phase name | Font preflight |
| Status | `AWAITING MANUAL VERIFICATION` |
| What was completed | Font preflight for the read-only preview (architecture §40, RES-DOC-005, RES-FID-002). New pure module **`src/core/resume/resumeFonts.ts`**: `documentFontFamilies` collects named run fonts from the persisted graph and treats inherited/`null` runs as **Calibri**; `evaluateFontPreflight` uses an injected checker (browser: `document.fonts.check('10pt "Family"')` per §40) and, if any document font is missing, sets `substitutionActive` plus an honest warning that wrapping may differ from Word and that **export keeps original font names**. Bundled **Carlito** SIL OFL files under **`public/fonts/`** (Regular/Bold/Italic/BoldItalic + `OFL.txt` from googlefonts/carlito). **`resumeEditor.css`** registers `@font-face` for those four cuts (`font-display: swap`; URLs `/fonts/Carlito-*.ttf`). Hook **`useResumeFontPreflight`** loads Carlito then evaluates; **`ResumeDocumentPane`** shows the warning as an Aether `statusWarning` banner (`role="status"`). **`ResumePageSurface`** now imports the CSS and the shared `PREVIEW_FONT_STACK` (`"Calibri", "Carlito", …`). **Did not** rewrite OOXML font names, add `@fontsource`, ship Calibri binaries, add `contentEditable` (4C), or persist a new jsonb key. No migration, no new npm dependency. |
| Automated verification | `npm test` pass (**1438 passed, 7 skipped**; +17 tests in new `resumeFonts.test.ts`). `npx tsc -b` pass. `npx eslint` clean on the five TS files this phase touched. `npm run build` pass (pre-existing >500 kB chunk warning; lazy-load is 10F); `dist/fonts/` contains the four Carlito TTFs + OFL, and the built CSS includes the Carlito `@font-face` rules. Cases covered — families: inherited/null → Calibri, unique named fonts sorted, generics/`+theme` skipped, empty graph → no families; preflight: all available → no warning, missing Calibri → substitution + copy that names Carlito/Word/wrapping/original names and does **not** claim pixel-perfect or an ATS score; checker throw → missing; `checkBrowserFont` is false in node; bundled files are real TTF (`00 01 00 00`) and no Calibri filename is present. |
| Manual verification | **Still waiting:** Edwin UI walkthrough on a machine/browser without Calibri (banner must show). See the 4B section below. Export font names remaining Calibri in XML is **9A**, not this phase — this phase does not rewrite OOXML. |
| Important files changed | `src/core/resume/resumeFonts.ts` (new), `src/core/resume/resumeFonts.test.ts` (new), `src/components/resume/resumeEditor.css` (new), `src/components/resume/useResumeFontPreflight.ts` (new), `src/components/resume/ResumeDocumentPane.tsx` (banner), `src/components/resume/ResumePageSurface.tsx` (shared stack + `@font-face` import), `public/fonts/Carlito-Regular.ttf`, `public/fonts/Carlito-Bold.ttf`, `public/fonts/Carlito-Italic.ttf`, `public/fonts/Carlito-BoldItalic.ttf`, `public/fonts/OFL.txt`, `docs/RESUME_TOOL_PROGRESS.md`. **No migration, no new dependency.** |
| Blockers / notes | Do not start 4C in this chat. Do not mark 4B `COMPLETE` until Edwin reports the walkthrough below as passed. Carry-forward for **9A**: confirm exported OOXML still names Calibri (this phase never rewrites `w:rFonts`). Carry-forward for later layout waves: US Letter + 1-inch-margin preview default (`sectPr` not in `extracted_structure`); 8A canvas `measureText`; 8C page-count warning. Earlier carry-forwards still stand: (a) `sha256` is the **original** bytes' digest, not the working copy's; (b) duplicate reuses the source's block ids by design; (c) the persisted graph keeps document text un-folded (text≡runs byte-for-byte); (d) `page_count_estimated` is still `null`; (e) `classifyMentionsAgainstLedger` is not called at import; (f) `extracted_structure` is refreshed only at lineage creation. |
| **Next eligible phase** | **4B — Font preflight** (parked on Edwin's UI check) |

### 4B manual verification (Edwin)

Goal: confirm the preview warns when Calibri (or another document font) is missing, substitutes **Carlito**, and does **not** rewrite Word font names. Agent cannot run a browser, so this UI walkthrough is required before 4B is `COMPLETE`.

1. Open Career → **Resume**. If the library is empty, upload `fixtures/resume/public/geometry-canary.docx` (Calibri body).
2. Click **Open**. Confirm the existing paper preview still renders.
3. In DevTools console on that page, run:
   - `document.fonts.check('10pt "Calibri"')`
   - `document.fonts.check('10pt "Carlito"')`
   Record true/false for each. Carlito should be **true** after the preview is open (bundled `@font-face`).
4. **If Calibri is `false`** (typical macOS without Microsoft Office): a warning banner must appear above the pages. It must name **Calibri**, say the preview uses **Carlito**, say **wrapping / page breaks may differ from Microsoft Word**, and say **exported Word files keep the original font names**. It must **not** claim the preview is identical to Word or mention an ATS score.
5. **If Calibri is `true`** (Office installed): the banner must **not** appear (honest — substitution is not active). Still do steps 6–8. To complete the required “machine without Calibri” check, repeat steps 2–4 in a browser/profile that does not have Calibri, or report that Calibri is installed so we know the missing-font path is still unverified.
6. DevTools **Network**: opening the preview should request `/fonts/Carlito-Regular.ttf` (and usually the other cuts) with HTTP 200. There must be **no** Calibri `.ttf` request from this app.
7. Toggle **dark mode**. The warning banner (if shown) stays readable via Aether warning tokens; the paper stays **light**.
8. Close / switch resume still works as in 4A. There is no export control in this phase — do **not** expect a download. OOXML font names are unchanged by 4B (verified later in **9A**).
9. Report pass/fail here so a new chat can mark 4B `COMPLETE` and advance to **4C — Per-block editing (local state)**. If the banner is missing when Calibri is unavailable, claims pixel-perfect Word, or the preview is unreadable, report it as a **fail** → 4B becomes `BLOCKED`.

### 4A manual verification (Edwin)

Goal: confirm the read-only paginated preview renders a real resume as light "paper" pages, that mixed-run formatting shows, and that dark mode keeps the paper readable. Agent cannot run a browser, so this UI walkthrough is required before 4A is `COMPLETE`.

1. Open Career → **Resume**. If the library is empty, upload `fixtures/resume/public/geometry-canary.docx` (or use any existing resume).
2. Click **Open** on a resume. A preview pane appears **below** the library titled with the resume name, and the row is highlighted; the button reads **Previewing**.
3. Confirm the preview shows a white **page surface** (US Letter proportions) with the resume text laid out top-down: name, headings, and bullets in reading order. The disclaimer "Approximate on-screen preview. Microsoft Word is the source of truth…" is visible.
4. Upload / open **`mixed-runs-canary.docx`** and confirm the mixed paragraph shows its **bold**, *italic*, and hyperlink-styled runs distinctly (not flattened to one style).
5. Open a **2-page** resume (Edwin's private `current-resume.docx`, 44 blocks) and confirm the preview renders **about two** page surfaces stacked with a small gap (an approximation — exact Word page count is not guaranteed here).
6. Toggle **dark mode** (Appearance/Settings). The paper stays **light and readable** (dark ink on white); the surrounding pane chrome uses the Aether theme.
7. Click **Close preview** (or click **Previewing** again) → the pane closes. Open a different resume → the preview switches. Deleting the open resume closes the preview.
8. Report pass/fail here so a new chat can mark 4A `COMPLETE` and advance to **4B — Font preflight**. If the preview fails to render, shows raw HTML/markup, or the paper is unreadable in dark mode, report it as a **fail** → 4A becomes `BLOCKED`.

**Signed off 2026-09-15:** Edwin reported all 4A checks pass (open preview; mixed-run formatting; ~2 pages on the private resume; dark-mode paper stays light; Close/switch/delete).

### 3F manual verification (Edwin)

Goal: confirm the version row now carries real structure jsonb, and that the stored working copy is the bookmarked one while the original is untouched.

1. Open Career → Resume and **upload** `fixtures/resume/public/geometry-canary.docx` (a fresh upload, not an existing row — 3F only runs at lineage creation).
2. In the Supabase dashboard → Table editor → `resume_versions`, open the new row and inspect `extracted_structure`. Expected **exactly four** top-level keys: `mentionIndex`, `graph`, `blockMap`, `atsWarnings`.
   - `graph.blocks` has one entry per paragraph, each with `order`, `text`, `blockId`, `bookmarkName` (`pa_` + the block id), and a `runs` array.
   - `blockMap` has the same length as `graph.blocks`, with `order` running 0,1,2,….
   - `atsWarnings` is an array (empty is fine for the canary).
   - **There must be no base64 blob, no `docx` key, and no “score”** anywhere in the jsonb.
3. Same row: `page_count_estimated` is `null` (Wave 4 owns page estimation) and `sha256` matches the `original/<sha256>.docx` object name.
4. `resumes` table: the new row's `import_fact_ledger.facts` is **non-empty**, and every fact has `provenance: "imported_source"` with `firstSeenVersionId` equal to the new version's id.
5. Storage → `resume-docs` → `{uid}/{resumeId}/`: the `versions/{versionId}.docx` object is **slightly larger** than the `original/{sha256}.docx` object (the bookmarks). Download both; the original must still open in Word unchanged, and the working copy must open without a repair dialog.
6. (Sanity) **Duplicate** that resume: the copy gets its own version row whose `extracted_structure` is populated the same way, and its own `import_fact_ledger`.
7. Report pass/fail here so a new chat can mark 3F `COMPLETE` and advance to **4A — Paginated CSS preview (read-only)**. If the jsonb is empty/short, contains bytes, or the upload now fails with “Could not read this resume's structure.”, report it as a **fail** → 3F becomes `BLOCKED`.

**Signed off 2026-09-15:** Edwin reported all 3F checks pass (upload canary; version jsonb keys; import ledger; Storage original vs bookmarked working; duplicate).

### 3B manual verification (Edwin)

The bookmark writer only runs on the **working** copy; the immutable original is never bookmarked. Two bookmarked working copies were generated for this check (both gitignored, not committed):

- Public: `fixtures/resume/public/out/geometry-canary.bookmarked.docx`
- Private: `fixtures/resume/private/current-resume.bookmarked.docx`

(To regenerate: `npx vitest run src/core/resume/resumeOoxmlWrite.test.ts` for the public copy, and `RESUME_PRIVATE_FIXTURE=1 npx vitest run src/core/resume/resumeOoxmlWrite.test.ts` for the private copy.)

1. Open **both** bookmarked files in **Microsoft Word**. Confirm **no** "Word found unreadable content" repair dialog.
2. Compare each against its source (`geometry-canary.docx` / `current-resume.docx`): page count, margins, fonts, bullet indentation, and hyperlinks are unchanged. Bookmarks must be **invisible** — no visible boxes, brackets, or text shifts.
3. (Optional) Turn on Word's bookmark display (File → Options → Advanced → "Show bookmarks") or Insert → Bookmark. You should see one `pa_…` bookmark per paragraph (44 for the private resume) and nothing else disturbed.
4. Report pass/fail here so a new chat can mark 3B `COMPLETE` and advance to **3C — Fact ledger**. If Word repairs the file or layout shifts, report it as a **fail** → 3B becomes `BLOCKED` and we switch to the custom-XML-part mapping (secondary map) the architecture allows.

**Signed off 2026-09-15:** Edwin reported all Word checks pass (geometry + private bookmarked copies; no repair; layout OK; bookmarks invisible).

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
| 4B | Font preflight | `AWAITING MANUAL VERIFICATION` | 2026-09-15 | Carlito OFL bundled under `public/fonts/` + `@font-face`; `resumeFonts.ts` preflight (`document.fonts.check`) + warning banner in `ResumeDocumentPane`. No OOXML rewrite, no Calibri binaries, no 4C editing. Tests 1438 pass / 7 skip; tsc/eslint/build green. Waiting on Edwin: missing-Calibri banner + Carlito network load. |
| 4A | Paginated CSS preview (read-only) | `COMPLETE` | 2026-09-15 | Edwin UI walkthrough pass (open preview; mixed-run formatting; ~2 pages; dark-mode paper; Close/switch/delete). New `resumePreviewGeometry.ts` (twip/pt→px, US Letter 816×1056, soft-estimate pagination) + `ResumePageSurface`/`ResumeDocumentPane` (escaped text, light paper in dark mode, no `dangerouslySetInnerHTML`) + `getResumeVersionById`/`useResumeVersion` + Open toggle in `ResumeSection`/`CareerPage`. Carlito binary + font preflight deferred to 4B; US Letter default (no persisted `sectPr`). Tests 1421 pass / 7 skip; tsc/eslint/build green. |
| 3F | Persist `extracted_structure` on version | `COMPLETE` | 2026-09-15 | Edwin dashboard + Storage + duplicate pass. New `resumeIngest.ts` runs the §23 pipeline once at lineage creation; `createResumeLineage` stores bookmarked working bytes + `extracted_structure = { mentionIndex, graph, blockMap, atsWarnings }` + frozen import ledger. Strict mapper rejects DOCX base64 / ATS scores. Wave 3 closed. |
| 3E | Unicode + plaintext extraction policy | `COMPLETE` | 2026-09-15 | New `resumeUnicode.ts`: asymmetric policy — `sanitizeGeneratedText` (NFC, strip all `Cf` invisibles, fold NBSP/exotic spaces/tabs/line breaks, collapse, trim) for text **we** author; faithful reading-order extraction (`documentPlaintextFromParagraphs` / `readResumeDocumentPlaintext`, NFC only) that keeps the document's NBSP, tabs and ordinary hyphens; `normalizeDocumentTextForComparison` folds for matching only. Em dash preserved on purpose (style is 6E). No manual verification required. Private: 44 lines, 0 NBSP/tab/invisible, nothing emptied by sanitation. Tests 1395 pass / 6 skip; tsc/eslint/build green. |
| 3D | ATS structural checks | `COMPLETE` | 2026-09-15 | New `resumeAtsChecks.ts`: ten parseability warning codes (tables, text boxes, columns/sections, header-only contact, alt-text, decorative bullet glyphs, floating reading order, broken links, no selectable text). Warnings only — result is `{ warnings }`, no score, no vendor claims (ADR-014 / RES-ATS-001). Bullet check resolves **used** numbering levels and ignores Word's default bullets (first draft false-fired 57× on the private resume). No manual verification required. Private resume: zero warnings, verified truthful against the package. Tests 1378 pass / 5 skip; tsc/eslint/build green. |
| 3C | Fact ledger (deterministic, frozen import) | `COMPLETE` | 2026-09-15 | New `resumeSkillLexicon.ts` (alias data, no JD input) + `resumeFacts.ts` (frozen `imported_source` ledger from the original, mention index from the working copy, provenance reconcile, `allowedEvidenceForBlock`). REST APIs → imported technology; Kubernetes absent though the lexicon knows it; typed Kubernetes stays `user_added_unverified` and cannot ground another block until verified; deleted terms keep their imported facts. No manual verification required. Private: 44 blocks → 65 facts. Tests 1358 pass / 4 skip; tsc/eslint/build green. |
| 3B | Bookmark stable IDs | `COMPLETE` | 2026-09-15 | Edwin Word pass on geometry + private bookmarked copies (no repair; layout OK; bookmarks invisible). New `resumeOoxmlWrite.ts`: reuse-first `pa_<uuid>` per `w:p`, working-copy only. Private: 44 paras → 44 bookmarks. Tests 1329 pass / 3 skip. |
| 3A | Full OOXML block parse | `COMPLETE` | 2026-09-15 | New `resumeBlocks.ts` block graph (paragraph → distinct runs, bold/italic/underline/font/size + hyperlink rel id, no flatten). Public fixtures + private (44 blocks, max 17 runs). No bookmarks/ids yet (3B). Tests 1321 pass / 2 skip; tsc/eslint/build green. |
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
