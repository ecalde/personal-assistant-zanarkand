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
| Last phase number | 10F |
| Last phase name | Lazy load + Career copy polish |
| Status | `AWAITING MANUAL VERIFICATION` |
| What was completed | `React.lazy` [`ResumeWorkspace`](../src/components/resume/ResumeWorkspace.tsx) from CareerPage so JSZip/OOXML stay off the Career applications / School path. Empty library copy + Resume pane subtitle. Optional **Open Skills tracker** on coverage (does **not** auto-add skills). Updated [`docs/architecture.md`](./architecture.md) and [`docs/plans/roadmap.md`](./plans/roadmap.md). **No successor Resume Tool phase.** |
| Automated verification | `npm test` pass (**1813 passed, 8 skipped**). `npx tsc -b` pass. eslint clean on new 10F files. `careerPageLazyLoad.test.ts` **1 passed**. `npm run build` emits `dist/assets/ResumeWorkspace-*.js` (~192 kB) plus matching CSS. |
| Manual verification | Still waiting: Career applications / School still work; Resume pane loads after the lazy fallback; Skills link does not add tracker skills. |
| Important files changed | `src/components/resume/ResumeWorkspace.tsx`, `src/pages/CareerPage.tsx`, `src/pages/careerPageLazyLoad.test.ts`, `src/components/resume/ResumeSection.tsx`, `src/components/resume/ResumeCoveragePanel.tsx`, `src/components/resume/ResumeAnalysisPanel.tsx`, `src/App.tsx`, `docs/architecture.md`, `docs/plans/roadmap.md`, `docs/RESUME_TOOL_PROGRESS.md`. |
| Blockers / notes | Until you report the 10F UI walkthrough, **next eligible stays 10F**. After pass: **no successor phase** (MVP complete). Carry-forwards unchanged: apply `20260917190000_resume_storage_path_hardening.sql` when convenient; US Letter preview default; working vs original sha256; duplicate block ids; NBSP draft vs flushed graph; `page_count_estimated` null; autosave still overwrites the **current** version working object (no extra snapshot row unless Save as new). In-browser CSS page surfaces remain an approximation; Word remains pagination authority. |
| **Next eligible phase** | **10F — Lazy load + Career copy polish** |

### 10F manual verification (Edwin)

Goal: confirm the **resume workspace is a separate JS chunk**, Career **applications still work**, School is unchanged, and **Open Skills tracker** does not add skills. There is **no** next implementation phase. Agent ran `npm run build` and saw `ResumeWorkspace-*.js`; it cannot click Career in a browser, so this walkthrough is required before 10F is `COMPLETE`. Until you report pass/fail, **next eligible stays 10F**.

1. Open **Career** (applications pane, not Resume). Confirm applications list, Add application, and School radio still work. There must be **no** “Loading resume workspace…” stuck on this pane.
2. Click **Resume**. You may briefly see **Loading resume workspace…**. Then the library (or empty copy: **No resumes yet** plus upload help) must appear. Empty copy must **not** say only “No resumes yet.” without the extra sentence.
3. Optional: **Open** `fixtures/resume/public/geometry-canary.docx`. Editor + analysis should still work as in 10D/10E. Analyze a **synthetic** JD. Coverage **Open Skills tracker** must go to the Skills page and **must not** create a new Skill. Missing terms stay a coverage list only.
4. Return to Career applications. Confirm they still load (no Resume-only error). Optional: dark mode — radios and empty copy stay readable.
5. Report pass/fail here so a new chat can mark 10F `COMPLETE` (feature complete for MVP; **no successor phase**). If Career applications break, Resume never loads, or Skills auto-adds a requirement, report it as a **fail** → 10F becomes `BLOCKED`.

### 10D manual verification (Edwin)

Goal: confirm **narrow viewports** keep library + JD + suggestion **review**, show the computer-fidelity **banner**, **hide US Letter paper pages**, and still allow reading suggestions. Observability / PII-safe error codes are **10E**. Agent cannot run DevTools, so this walkthrough is required before 10D is `COMPLETE`. Until you report pass/fail, **next eligible stays 10D**.

Use a **synthetic** JD (not a real employer posting). Do not paste resume or JD text into chat when reporting.

1. Open Career → **Resume** on a **wide** desktop window (≥1024px). Open `fixtures/resume/public/geometry-canary.docx`. Confirm side-by-side editor + analysis and **paginated paper pages** (page 1 of N labels). There must be **no** mobile banner.
2. Open DevTools **responsive** / narrow the window **below 1024px**. Confirm a **text** banner: **High-fidelity editing is best on a computer.** Layout must **stack** (not a squeezed two-column). US Letter paper pages must **not** appear (no “Resume page 1 of N” letter chrome). Paragraphs should still be readable/editable in a compact list.
3. Confirm **Job description and suggestions** is a **collapsible** section (summary control). It should start **open** so you can read the JD and cards without hunting. Collapse it, then expand it again. Suggestions (if generated) must remain readable as **text** (Original/Suggested labels, not color-only).
4. Optional: paste a synthetic JD, Analyze, Generate if a model is connected. Confirm you can still **read** cards and Accept/Reject **buttons** (keyboard extras from 10C may still work). Card click should still focus a paragraph in the compact list.
5. Widen back to ≥1024px. Banner must **disappear**; paginated paper and side-by-side layout must **return**. Career applications / School panes must still work.
6. Optional: dark mode on a narrow viewport — banner and analysis stay readable; compact review surface stays light paper.
7. Report pass/fail here so a new chat can mark 10D `COMPLETE` and advance to **10E — Observability without PII**. If there is no banner, paper pages still dominate a phone-width window, suggestions are unreadable, or desktop layout is permanently stacked, report it as a **fail** → 10D becomes `BLOCKED`.

**Signed off 2026-09-18:** Edwin reported all 10D checks pass (narrow banner; stacked layout; paper hidden; collapsible analysis; desktop restore).

### 10C manual verification (Edwin)

Goal: confirm **keyboard-only review of 3 suggestion cards**: Accept/Reject still work from the buttons, Alt+Enter / Alt+Backspace work as extras, focus moves to the next card after Accept, toolbar controls have names, and Original/Suggested are not color-only. Mobile stacked layout is **10D**. Agent cannot run a browser, so this walkthrough is required before 10C is `COMPLETE`. Until you report pass/fail, **next eligible stays 10C**.

Use a **synthetic** JD (not a real employer posting). Do not paste resume or JD text into chat when reporting.

1. Open Career → **Resume**. Confirm Career \| School \| Resume is a radiogroup. With **Career** focused, press **Arrow Right** until **Resume** is selected (and the Resume pane shows). Tab / Shift+Tab must still reach the radios. Optional: dark mode — radios stay readable.
2. Upload / **Open** `fixtures/resume/public/geometry-canary.docx`. Confirm the left toolbar: **Undo**, **Redo**, **Download Word**, **Print preview (approximate)**, **Save as new resume**, **Close preview** are named (not icon-only). Tab to a body paragraph; **Tab** should move to another paragraph. Cmd/Ctrl+Z still undoes an in-tab edit if you type one (you can undo it afterward).
3. Paste a synthetic JD, for example: `Must have Python. Must have RESTful services. Nice to have Terraform.` Click **Analyze**. Wait until **Saved.**
4. **If Settings → Resume AI has a model:** click **Generate suggestions**. Wait until **at least three** cards appear. Each card heading must read **Suggestion N of M** (not color-only). Original and Suggested labels must be visible; strikethrough/underline may also appear. Layout warnings, if any, must be text.
5. **Keyboard extras:** Tab to the first card (or click its heading so the card outline is focused). Press **Arrow Down** / **Arrow Up** to move among the three cards. Type in **Edit suggested wording** and confirm Arrow keys still move the caret there (they must not jump cards while typing).
6. On card 1, press **Alt+Enter** to Accept (or Tab to **Accept** and press Enter — buttons remain valid). The left preview should update (7C). Focus must land on the **next remaining card**. Screen reader / heading should still make sense (Suggestion indexes may renumber).
7. On the newly focused card, Tab to **Reject** (or **Alt+Backspace**). That card hides. Focus moves to the remaining card (or to the **Suggestions** heading if none remain).
8. Confirm a **stale** or **Kubernetes** Accept still fail-closes (no document rewrite) if you try it; keyboard Accept must not bypass grounding.
9. Optional: dark mode — focused card outline visible; paper stays light; Accept/Reject stay readable.
10. Report pass/fail here so a new chat can mark 10C `COMPLETE` and advance to **10D — Mobile degraded UX**. If shortcuts are the only way to Accept, focus is lost after Accept, cards are color-only with no Original/Suggested or “Suggestion N of M”, or toolbar buttons are unlabeled icons, report it as a **fail** → 10C becomes `BLOCKED`.

**Signed off 2026-09-18:** Edwin reported all 10C checks pass (keyboard-only review of 3 cards; named toolbar; focus after Accept/Reject).

### 9E manual verification (Edwin)

Goal: confirm **Print preview (approximate)** opens the **browser print dialog** for the **on-screen CSS pages**, that copy says this is **not** a Microsoft Word PDF, and that **Download Word still works**. Security review (10A) is **not** this phase. Agent cannot run a browser print dialog, so this walkthrough is required before 9E is `COMPLETE`. Until you report pass/fail, **next eligible stays 9E**.

1. Open Career → **Resume**. Upload / **Open** `fixtures/resume/public/geometry-canary.docx`. Confirm **Print preview (approximate)** is on the left-pane toolbar next to **Download Word**. The label must include **approximate** (not color-only). There must be **no** “ATS Score” and **no** silent PDF file download.
2. Click **Print preview (approximate)**. The **browser print** dialog (or print preview) must appear. Confirm the printed content is the **light paper pages**, not the whole Career chrome (nav / JD pane should be hidden or not the main printed surface). A disclaimer that this is an **approximation / not a Word PDF** should appear in the print output or on the control (`title` / pane copy).
3. Cancel the print dialog. The editor must still work. **Download Word** must still be enabled after the working copy loads.
4. Optional: use the dialog’s **Save as PDF** if your OS offers it. That file may **disagree** with Microsoft Word page breaks — that is expected. It must **not** be presented as an authoritative Word export.
5. Optional: dark mode — paper stays light in the print preview; the Print control stays readable.
6. Report pass/fail here so a new chat can mark 9E `COMPLETE` and advance to **10A — Security review of paths and RLS**. If the button generates a fake Word PDF via html2pdf, claims employer ATS, or Download Word disappeared, report it as a **fail** → 9E becomes `BLOCKED`.

**Signed off 2026-09-17:** Edwin reported all 9E checks pass (print dialog; approximate copy; Download Word still works). Wave 9 closed.

### 9D manual verification (Edwin)

Goal: confirm an **optional picker** links the active job session to an existing Career application (`application_id` only), that **unlinking works**, and that the **Word document and Career application row stay unchanged**. Print / PDF is **9E**. Agent cannot run a browser, so this walkthrough is required before 9D is `COMPLETE`. Until you report pass/fail, **next eligible stays 9D**.

1. Open Career. If you have no applications, add one with a **synthetic** company/role (not a confidential employer posting). Note the company and role title.
2. Open Career → **Resume**. Upload / **Open** `fixtures/resume/public/geometry-canary.docx`. Confirm the right pane has **Link to Career application** with **Not linked** as the first option. Options must show **company — role** as text (not color-only). There must be **no** ATS score and **no** Print / PDF control in this phase.
3. Choose that Career application in the picker. Wait until **Saved.** Confirm Job title / Company fields on the JD form did **not** auto-fill from the application (link only). The left Word preview must be **unchanged**.
4. Reload / Dashboard → Career → Resume → **Open** the same resume. The same application must still be selected. Optional Supabase: active `resume_job_sessions.application_id` equals that application’s id. The Career `job_applications` row must be **unchanged** (same company/role/notes).
5. Set the picker back to **Not linked**. Wait until **Saved.** Reload: **Not linked** again; `application_id` is **null**.
6. Optional: Analyze a **synthetic** JD, then change only the application link. Coverage must **stay**; linking must not hide the coverage card. Reset / Replace must clear the link along with the JD.
7. If Career has **no** applications: the picker still exists with **Not linked** only. That is a pass for the empty list.
8. Optional: dark mode — the select stays readable; paper stays light.
9. Report pass/fail here so a new chat can mark 9D `COMPLETE` and advance to **9E — PDF**. If choosing an application copies into Career, rewrites the DOCX, invents an ATS score / PDF button, or the link is gone after reload, report it as a **fail** → 9D becomes `BLOCKED`.

**Signed off 2026-09-17:** Edwin reported all 9D checks pass (optional application link; Saved; no auto-fill; reload; unlink).

### 9C manual verification (Edwin)

Goal: confirm a **simple list of paragraphs that differ from version 1** (this library item’s immutable original), that **Show in resume** focuses the matching block, and that **unchanged paragraphs are not listed**. Optional application link is **9D**. Agent cannot run a browser, so this walkthrough is required before 9C is `COMPLETE`. Until you report pass/fail, **next eligible stays 9C**.

1. Open Career → **Resume**. Upload / **Open** `fixtures/resume/public/geometry-canary.docx` (fresh upload). Confirm the right pane has **Changes vs version 1**. Empty copy should be **No paragraph changes vs version 1.** There must be **no** ATS score and **no** job-application picker in this phase.
2. Edit **one** body bullet in the left preview (small wording change). Wait until **Saved.** The changes list must show **that paragraph only** (Changed), with **Version 1** and **Current** text labels (strikethrough/underline may also appear — they must not be the only cue). Neighboring bullets must **not** appear.
3. Click **Show in resume** on that row. The matching left-pane paragraph must scroll into view and take focus. Neighboring paragraphs must not become the focused editor.
4. **Reload** / Dashboard → Career → Resume → **Open** the same resume. The same changed row should still be listed (original Storage object is the baseline; the working graph may have the new wording).
5. **Save as new resume** (optional): the **new** library item should show **no** changes vs *its* version 1 (the tailored copy is a new original). The **source** item should still list the edit from step 2.
6. Optional: dark mode — the changes card stays readable; paper stays light.
7. Report pass/fail here so a new chat can mark 9C `COMPLETE` and advance to **9D — Optional application link**. If the list is empty after a saved edit, uses the autosaved working graph as “version 1,” focuses the wrong paragraph, or invents an ATS score / application picker, report it as a **fail** → 9C becomes `BLOCKED`.

**Signed off 2026-09-17:** Edwin reported all 9C checks pass (changes vs version 1; one-bullet list; Show in resume; reload).

### 9B manual verification (Edwin)

Goal: confirm **Save as new resume** creates a **new library item** from the **flushed working** copy, that the **source library item and its original Storage object stay unchanged**, and that you **keep editing the open resume**. Block-level diff vs version 1 is **9C**. Agent cannot run a browser or Word, so this walkthrough is required before 9B is `COMPLETE`. Until you report pass/fail, **next eligible stays 9B**.

1. Open Career → **Resume**. Upload / **Open** `fixtures/resume/public/geometry-canary.docx` (or a named copy). Note the library name and that the editor shows **Version 1 · Base** (or Version 1).
2. Optional: set **Job title** on the right (e.g. `Backend Engineer`). You do **not** need a real employer JD.
3. Edit **one** body bullet (small wording change). Wait until **Saved.** or click **Save as new resume** immediately (it flushes first, like Download Word).
4. Click **Save as new resume**. Confirm a status that you **keep editing this copy**. The **left preview must stay on the same resume** (same name, same Version pointer). A **new library row** appears: `{name} (Backend Engineer)` if a title was set, or `{name} (tailored)` if Job title is empty. The new row is **not** Default.
5. Confirm the **source** row is still there with the **same name**, still **Open/Previewing**. Reload / Dashboard → Career → Resume → **Open** the **source**: the edited bullet is still there (autosave). **Open** the **new** copy: it should include that same edit as its **new base**. Editing the copy later must not change the source preview (change one bullet on the copy, Open the source — source wording unchanged).
6. In Supabase: the new resume has its **own** id, `resume_versions.source_kind = tailor`, and **distinct** Storage prefixes `{uid}/{newResumeId}/original/…` and `…/versions/…`. The source `original/<64-hex>.docx` object is **unchanged**. The source `active_version_id` is unchanged.
7. Optional: empty Job title → filename-style name uses `(tailored)`, not a fake role. Dark mode: Save as new stays usable; paper stays light. There must be **no** 9C “changed blocks vs version 1” list in this phase.
8. Report pass/fail here so a new chat can mark 9B `COMPLETE` and advance to **9C — Block-level diff vs original version**. If Save as new overwrites the source original, switches you onto the new resume with no source left, shares Storage objects, or invents a job title, report it as a **fail** → 9B becomes `BLOCKED`.

**Signed off 2026-09-17:** Edwin reported all 9B checks pass (Save as new; keep editing current; source original unchanged; independent copy).

### 9A manual verification (Edwin)

Goal: confirm **Download Word** still uses the 4G/0D fail-closed product path, **and** the saved file is named **`Name-role.docx`** from the library resume name plus the Job title field. Compare in **Microsoft Word** (not Preview.app alone). Agent cannot run a browser or Word, so this walkthrough is required before 9A is `COMPLETE`. Until you report pass/fail, **next eligible stays 9A**. Do not expect **Save as new resume** (that is **9B**).

1. Open Career → **Resume**. Upload `fixtures/resume/private/current-resume.docx` (fresh upload so the working copy has `pa_` bookmarks). Click **Open**. Set **Job title** on the right to a short synthetic role (e.g. `Backend Engineer`). You do **not** need a real employer JD for the filename check.
2. Confirm the CSS preview shows **about two** page surfaces (the private resume is 2 pages). `page_count_estimated` on the version row may still be `null`.
3. Wait until **Download Word** is enabled. **Do not change the document yet.** Click **Download Word**. Confirm the browser filename is **`{library resume name}-Backend Engineer.docx`** (or your Job title), **not** only `{name}.docx` and **not** a Storage object path. Open that file in **Microsoft Word**. Confirm **no** repair dialog. Compare to the original: margins, fonts, bullet indentation, hyperlinks; bookmarks must stay invisible. Page count must still be **2**. An extra page from this identity download is a **fail**.
4. In the preview, edit **one** work-experience bullet (small wording change; do not restyle). Click **Download Word** immediately (it flushes first). Confirm the filename is still **`Name-role.docx`**. Open in Word. Confirm **only** that wording changed; neighboring mixed formatting stays intact; page count still **2**, **or** record a page-count change as a **regression failure** if the new wording was too short to wrap.
5. In Supabase Storage, confirm `original/<64-hex>.docx` is **unchanged**. The download must be the **working** copy (bookmarks + your edit), not a rewrite of the original object.
6. Upload / open **`fixtures/resume/public/mixed-runs-canary.docx`**. Set Job title (e.g. `Engineer`). Change only the leading unformatted word (**Led → Ran**). **Download Word**. Confirm filename `mixed-runs-canary-Engineer.docx` (or that resume’s library name + role). In Word, confirm **bold**, *italic*, and the hyperlink survive. Then try a flatten (e.g. one unformatted **Directed**): the formatting-safe **warning** must appear, the paragraph must **not** flatten, and a subsequent download must still be the last **successful** wording (Ran), not Directed.
7. **Empty role:** clear Job title. Download again. Filename must be **`{library name}.docx`** with **no** trailing hyphen and **no** invented role (for example not `Name-.docx` or `Name-resume.docx` unless the library name itself is that).
8. Optional: toggle **dark mode** — paper stays light; Download Word stays usable. There must be **no** Save as new resume control in this phase.
9. Report pass/fail here so a new chat can mark 9A `COMPLETE` and advance to **9B — Save as new / version pointer**. If Word repairs the file, the rest of the document is restyled, the original Storage object changed, identity download added a page, a flatten-on-save path appeared, or the filename is not `Name-role.docx` when a job title is set, report it as a **fail** → 9A becomes `BLOCKED`.

**Signed off 2026-09-17:** Edwin reported all 9A checks pass (named `Name-role.docx`; Word identity + one-bullet; mixed-runs; original unchanged; flatten does not rewrite; empty title omits role).

### 8C manual verification (Edwin)

Goal: confirm a **deliberately huge suggested wording shows a page-count warning** on the card, that **Accept is not disabled** by that warning, and that a wrap-only draft does **not** pretend to be a page-count change. Layout fingerprint stale-reports are **8D**. Agent cannot run a browser, so this walkthrough is required before 8C is `COMPLETE`. Until you report pass/fail, **next eligible stays 8C**.

Use a **synthetic** JD (not a real employer posting). Do not paste resume or JD text into chat when reporting.

1. Open Career → **Resume**. Upload / **Open** `fixtures/resume/public/geometry-canary.docx`. Confirm the document is on the left and Job description + **Suggestions** are on the right.
2. Paste a synthetic JD, for example: `Must have Python. Must have RESTful services. Nice to have Terraform.` Click **Analyze**. Wait until status reads **Saved.**
3. **If Settings → Resume AI has a model:** click **Generate suggestions**. Wait until at least **one** card appears.
4. **Huge bullet → page warning:** in **Edit suggested wording**, replace the draft with a **very long** truthful paragraph (repeat existing skills/words from that bullet many times — do **not** add Kubernetes or a new metric). The card must show a **warning** that the wording is likely to **increase the estimated page count**. The warning must be **text**, not color-only. It must say you can **still Accept**. A wrap/line-count sentence may also appear; that is expected. There must be **no** fake ATS score.
5. Confirm **Accept is still enabled** (unless the card is stale). Do **not** need to complete a full 7C Word download for this phase. Optional: Accept once to confirm page-count did not block apply.
6. **Wrap without a new page (optional):** undo / regenerate, then paste a **slightly longer** truthful line that wraps extra lines but would not add a page on this short canary. The card may warn about wrap / line count. It must **not** claim a page-count increase for that short case. Accept still enabled.
7. **Private resume (required if `fixtures/resume/private/current-resume.docx` is on disk):** Upload / **Open** that file (it is the 2-page Skills-overflow canary). Generate or paste a **deliberately huge** suggested bullet the same way as step 4. The card must warn that estimated **page count** would increase. Accept stays enabled. This is the architecture §30 regression canary (extra body must not silently move onto a new page).
8. **Calibri missing:** if the document-font banner is showing (Carlito substitution), page-count copy may say the estimate is **approximate** vs Word. That is expected. Accept must still be enabled.
9. Optional: dark mode — warning chip stays readable; paper stays light.
10. Report pass/fail here so a new chat can mark 8C `COMPLETE` and advance to **8D — Layout fingerprint invalidation**. If there is no page-count warning on a clearly multi-page paste, Accept is disabled because of page count, or the UI invents an employer ATS score, report it as a **fail** → 8C becomes `BLOCKED`.

**Signed off 2026-09-17:** Edwin reported all 8C checks pass (huge-bullet page-count warning; Accept still enabled).

### 8B manual verification (Edwin)

Goal: confirm a **long suggested wording shows a wrap / line-count warning** on the card, that **Accept is not disabled** by that warning, and that the 125-character hint does **not** pretend to be wrap. Page-count warnings are **8C**. Agent cannot run a browser, so this walkthrough is required before 8B is `COMPLETE`. Until you report pass/fail, **next eligible stays 8B**.

Use a **synthetic** JD (not a real employer posting). Do not paste resume or JD text into chat when reporting.

1. Open Career → **Resume**. Upload / **Open** `fixtures/resume/public/geometry-canary.docx`. Confirm the document is on the left and Job description + **Suggestions** are on the right.
2. Paste a synthetic JD, for example: `Must have Python. Must have RESTful services. Nice to have Terraform.` Click **Analyze**. Wait until status reads **Saved.**
3. **If Settings → Resume AI has a model:** click **Generate suggestions**. Wait until at least **one** card appears.
4. **Paste a long suggestion:** in **Edit suggested wording**, replace the draft with a **much longer** truthful paragraph (repeat existing skills/words from that bullet — do **not** add Kubernetes or a new metric). The card must show a **warning** that the wording is likely to wrap onto extra lines (or that estimated line count changed). The warning must be **text**, not color-only. It must say you can **still Accept**.
5. Confirm **Accept is still enabled** (unless the card is stale). Do **not** need to complete a full 7C Word download for this phase. Optional: Accept once to confirm wrap did not block apply.
6. **Soft cap:** if the pasted text is over **125 characters** but you keep it to **one short line of wording** that would not wrap (hard on a real resume — skip if you cannot construct it), the 125-character hint must **not** replace a wrap warning and must not disable Accept. If you cannot construct a one-line 125+ character case, the long-wrap case in step 4 is enough.
7. **Calibri missing:** if the document-font banner is showing (Carlito substitution), wrap copy may say the estimate is **approximate** vs Word. That is expected. Accept must still be enabled.
8. Optional: dark mode — warning chip stays readable; paper stays light.
9. Report pass/fail here so a new chat can mark 8B `COMPLETE` and advance to **8C — Page-count estimate warning**. If there is no wrap warning on a clearly multi-line paste, Accept is disabled because of wrap, or the UI shows a page-count warning, report it as a **fail** → 8B becomes `BLOCKED`.

**Signed off 2026-09-17:** Edwin reported all 8B checks pass (long-paste wrap/line-count warning; Accept still enabled).

### 7E manual verification (Edwin)

Goal: confirm **Accept rematches job-match coverage** on the new wording, that **missing required can drop** when a term becomes explicit (or at least no longer absent) from **allowed / imported** wording, and that **unverified on-page terms are not promoted** to imported evidence. Do **not** expect a new Analyze/LLM pass. Agent cannot run a browser, so this walkthrough is required before 7E is `COMPLETE`. Until you report pass/fail, **next eligible stays 7E**.

Use a **synthetic** JD (not a real employer posting). Do not paste resume or JD text into chat when reporting.

1. Open Career → **Resume**. Upload / **Open** `fixtures/resume/public/geometry-canary.docx`. Confirm Job match coverage is available on the right after Analyze.
2. Paste a synthetic JD that has at least one **required** term the canary **already supports** (e.g. Python / REST) and one **required** term it does **not** (e.g. Kubernetes). Example: `Must have Python. Must have RESTful services. Must have Kubernetes.` Click **Analyze**. Wait until status reads **Saved.** Note **Missing required** (Kubernetes should be listed) and required-term explicit coverage.
3. **If Settings → Resume AI has a model:** click **Generate suggestions**. Wait until at least **one** card appears for a paragraph that can make an existing skill more explicit (Python / REST wording), **not** Kubernetes.
4. **Accept rematch:** Click **Accept** on that card (optional small truthful edit in suggested wording; do **not** add Kubernetes). Left preview updates (7C). The **Job match coverage** card must **update without clicking Analyze again**. If the accepted wording made a previously missing **imported** term explicit, **Missing required** should shrink. Kubernetes must **stay missing** (or stay unverified if you typed it separately — see step 6). There must be **no** ATS score.
5. **Reload:** Dashboard → Career → Resume → **Open** the same resume. Coverage should still match the rematch (stored `match_result`), not the pre-Accept Analyze snapshot. Accepted wording still in the preview. Optional Supabase: `resume_job_sessions.match_result` changed; `parsed_job` requirement ids unchanged; `resumes.import_fact_ledger` still has **no** Kubernetes `imported_source` fact.
6. **Unverified must not become evidence:** Type **Kubernetes** into a **different** bullet than the accepted one (or the same, after Accept). Wait for left pane **Saved.** Coverage may still be the Accept rematch until you Analyze or Accept again. Click **Analyze** (or Accept another card if you have one). Kubernetes must appear as **On this document (unverified)**, **not** as imported/verified explicit coverage. Required explicit coverage for Kubernetes stays **0**. `import_fact_ledger` still has no Kubernetes imported fact.
7. **Stale / fail-closed do not rematch:** Edit a targeted paragraph so a card is **stale**, then confirm Accept is disabled / no-op (7D) and coverage does **not** jump to that card’s suggested wording. Mixed-run flatten Accept still shows the formatting-safe warning and must **not** rewrite coverage as if the flatten succeeded.
8. **Reject** a pending card: coverage must **not** change from that reject alone.
9. Optional: dark mode — coverage card stays readable after rematch; paper stays light.
10. Report pass/fail here so a new chat can mark 7E `COMPLETE` and advance to **8A — measureText helper**. If coverage never updates after Accept, Analyze is silently re-run as a full JD parse that changes requirement ids, Kubernetes becomes imported evidence, or a stale/flatten Accept rewrites coverage, report it as a **fail** → 7E becomes `BLOCKED`.

**Signed off 2026-09-17:** Edwin reported all 7E checks pass (Accept rematches coverage without Analyze; unverified Kubernetes is not imported evidence; stale/flatten/reject do not fake a rematch).

### 7C manual verification (Edwin)

Goal: confirm **Accept writes suggested wording into the Word document** through the 0D fail-closed patcher, that reload keeps it, and that a mixed-run flatten attempt does **not** rewrite. Stale-hash (edit then Accept no-op) is **7D**. Coverage refresh after Accept is **7E**. Agent cannot run a browser or Microsoft Word, so this walkthrough is required before 7C is `COMPLETE`. Until you report pass/fail, **next eligible stays 7C**.

Use a **synthetic** JD (not a real employer posting). Do not paste resume or JD text into chat when reporting.

1. Open Career → **Resume**. Upload / **Open** `fixtures/resume/public/geometry-canary.docx`. Confirm the document is on the left and Job description + **Suggestions** are on the right.
2. Paste a synthetic JD, for example: `Must have Python. Must have RESTful services. Nice to have Terraform.` Click **Analyze**. Wait until status reads **Saved.**
3. **If Settings → Resume AI has a model:** click **Generate suggestions**. Wait until at least **one** card appears. Cards must still show **Original** and **Suggested** labels.
4. **Accept applies:** optionally edit **Edit suggested wording** (small truthful change; do not add Kubernetes or a new metric). Click **Accept**. The **left Word preview for that paragraph must update** to the accepted wording. Neighboring paragraphs must stay the same. The card must **disappear**. Wait until the left pane reads **Saved.**
5. **Reload:** Dashboard → Career → Resume → **Open** the same resume. The accepted wording must still be in the preview. The accepted card must stay gone. Other pending cards (if any) remain.
6. **Download Word:** click **Download Word**. Open the file in **Microsoft Word** (not Preview.app alone). Confirm **no** repair dialog. Confirm **only** the accepted paragraph’s wording changed; fonts, margins, bullets, and neighbors are intact.
7. Optional Storage sanity: `original/<64-hex>.docx` is **unchanged**. The working `versions/<uuid>.docx` has the new wording.
8. **Mixed-run fail-closed:** upload / **Open** `fixtures/resume/public/mixed-runs-canary.docx`. Generate a suggestion for the mixed paragraph if you can, **or** paste a suggestion-like edit: if a card proposes wording that would flatten mixed bold/italic/hyperlink (e.g. one unformatted **Directed** in place of Led/TeamAlpha), click **Accept**. You must see the formatting-safe warning. The mixed paragraph must **not** flatten. Bold / italic / hyperlink stay. The card should remain (status `blocked_formatting`) so you can edit or regenerate. Download Word must still be the last **successful** wording, not the flatten.
9. **Grounding still first:** on a geometry-canary pending card, insert **Kubernetes** into Edit suggested wording and click **Accept**. Accept must **fail** with the allowed-evidence message. The preview must **not** gain Kubernetes.
10. Optional: dark mode — Accept still updates the light paper; warning copy stays readable.
11. Report pass/fail here so a new chat can mark 7C `COMPLETE` and advance to **7D — Stale suggestions**. If Accept does not change the preview, reload loses the wording, Word repairs the file, mixed-run flatten succeeds, or Kubernetes is written into the document, report it as a **fail** → 7C becomes `BLOCKED`.

**Signed off 2026-09-17:** Edwin reported all 7C checks pass (Accept updates preview; reload keeps wording; Download Word in Microsoft Word; mixed-run flatten fail-closed; Kubernetes Accept does not write).

### 7D manual verification (Edwin)

Goal: confirm **editing a paragraph after Generate makes Accept a no-op**, the card is **marked stale**, and **Regenerate** is the recovery path. Coverage refresh after a successful Accept is **7E**, not this phase. Agent cannot run a browser, so this walkthrough is required before 7D is `COMPLETE`. Until you report pass/fail, **next eligible stays 7D**.

Use a **synthetic** JD (not a real employer posting). Do not paste resume or JD text into chat when reporting.

1. Open Career → **Resume**. Upload / **Open** `fixtures/resume/public/geometry-canary.docx`. Confirm the document is on the left and Job description + **Suggestions** are on the right.
2. Paste a synthetic JD, for example: `Must have Python. Must have RESTful services. Nice to have Terraform.` Click **Analyze**. Wait until status reads **Saved.**
3. **If Settings → Resume AI has a model:** click **Generate suggestions**. Wait until at least **one** card appears.
4. **Edit then Accept no-op:** in the **left** editor, change the **same** paragraph the card targets (add or replace a word). Wait until the left pane reads **Saved.** The card should show a **stale** message (paragraph changed; Accept cannot apply; regenerate). **Accept** should be disabled. Clicking Accept if it were enabled must **not** change the Word preview to the suggested wording (the typed edit stays). Neighboring paragraphs stay the same.
5. **Reload:** Dashboard → Career → Resume → **Open** the same resume. The typed edit is still there. The suggestion must **not** have been applied. The card should still be stale (or pending-but-stale from live hash) — not gone as `applied`.
6. **Regenerate:** on that stale card, click **Shorter** or **Closer to original**. Proposed text should update (or you get regenerate-failed and previous proposed wording stays). Original on the card should now match the **current** paragraph. Stale message should clear if the hash now matches. Accept may be used; if you Accept, the preview should update (7C behavior). You do **not** need to complete a full 7C Word download for this phase.
7. **Fresh Accept still works:** Generate again on an **unedited** paragraph (or undo the edit first). Accept on a non-stale card must still write suggested wording (7C regression). Mixed-run flatten must still fail-closed if you try it.
8. **Grounding still first:** Kubernetes in Edit suggested wording + Accept still fails with the allowed-evidence message; preview must not gain Kubernetes.
9. Optional: dark mode — stale copy stays readable; paper stays light.
10. Report pass/fail here so a new chat can mark 7D `COMPLETE` and advance to **7E — Coverage refresh after accept**. If Accept rewrites the document after you edited that paragraph, the card never shows stale, or regenerate still keys off the pre-edit original, report it as a **fail** → 7D becomes `BLOCKED`.

**Signed off 2026-09-17:** Edwin reported all 7D checks pass (edit then Accept no-op; card marked stale; regenerate; fresh Accept still applies).

### 7B manual verification (Edwin)

Goal: confirm **Reject hides the card**, **Regenerate replaces proposed text**, and **edit proposed then Accept** records the decision **without changing the Word document**. Applying wording to OOXML is **7C**, not this phase. Agent cannot run a browser, so this walkthrough is required before 7B is `COMPLETE`. Until you report pass/fail, **next eligible stays 7B**.

Use a **synthetic** JD (not a real employer posting). Do not paste resume or JD text into chat when reporting.

1. Open Career → **Resume**. Upload / **Open** `fixtures/resume/public/geometry-canary.docx` (or any resume). Confirm the document is on the left and Job description + **Suggestions** are on the right.
2. Paste a synthetic JD, for example: `Must have Python. Must have RESTful services. Nice to have Terraform.` Click **Analyze**. Wait until status reads **Saved.**
3. **If Settings → Resume AI has a model:** click **Generate suggestions**. Wait until at least **two** cards appear (or generate until you have two pending cards). Cards must still show **Original** and **Suggested** labels.
4. **Reject:** on one card, click **Reject**. That card must **disappear**. Neighboring cards stay. The **left Word preview wording must not change**. Reload / Dashboard → Career → Resume → **Open** the same resume: the rejected card stays gone; the other pending card(s) remain.
5. **Edit then Accept:** on a remaining card, edit the **Edit suggested wording** box (small truthful change that does not add Kubernetes or a new metric). Click **Accept**. The card must **disappear**. The left preview must **still show the original bullet**, not the accepted wording. Reload / Open: that card stays gone (status is stored; apply is 7C).
6. **Regenerate:** Generate again if you need a pending card. Click **Shorter** or **Closer to original**. Proposed text / Suggested line should **change** (or you get a regenerate-failed message and the previous wording stays). The Word preview must **not** change. Optional: choose a requirement in **Emphasize requirement** and click **Emphasize selected requirement** — same rules.
7. **Grounding:** edit a pending card to insert **Kubernetes** (the canary has none) and click **Accept**. Accept must **fail** with a message about claims that are not allowed evidence. The card stays; the document stays unchanged.
8. **If no model is installed:** Generate stays disabled. You cannot complete regenerate. Report that Accept/Reject chrome is present on any existing cards, or that you could not generate — still note whether the empty state copy no longer says accept is “not in this step.”
9. Optional: dark mode — Accept / Reject / regenerate controls stay readable; paper stays light.
10. Report pass/fail here so a new chat can mark 7B `COMPLETE` and advance to **7C — Apply accept to OOXML**. If Reject/Accept rewrites the Word preview, regenerate skips grounding, or Kubernetes Accept succeeds, report it as a **fail** → 7B becomes `BLOCKED`.

**Signed off 2026-09-17:** Edwin reported all 7B checks pass (Reject hides card; edit then Accept persists without changing the Word preview; regenerate; Kubernetes Accept fail-closed). Generate showed 25/25 with 3 cards — expected, because progress counts eligible paragraphs attempted, not cards that passed grounding/style gates.

### 7A manual verification (Edwin)

Goal: confirm suggestion **cards map to resume block ids** and that **clicking a card focuses that paragraph**. Accept / reject / regenerate / applying wording to Word are **not** in this phase. Agent cannot run a browser, so this walkthrough is required before 7A is `COMPLETE`. Until you report pass/fail, **next eligible stays 7A**.

1. Open Career → **Resume**. Upload / **Open** `fixtures/resume/public/geometry-canary.docx` (or any resume). Confirm the document is on the left and Job description + **Suggestions** are on the right.
2. Confirm a **Suggestions** card list exists. Empty state is **No suggestions yet.** There must be **no** Accept, Reject, or Regenerate controls. Opening a card must **not** change the Word preview wording by itself.
3. Paste a **synthetic** JD (not a real employer posting), for example: `Must have Python. Must have RESTful services. Nice to have Terraform.` Click **Analyze**. Wait until status reads **Saved.** Coverage may still list missing terms; that is Wave 5 behavior.
4. **If Settings → Resume AI has a model** (Test connection succeeded and the dropdown has a tag): click **Generate suggestions**. Progress should read **Generating suggestion N of M**. Cancel must stop further blocks. When finished, cards that appear must show **Original** and **Suggested** as text labels (strikethrough/underline may also appear — they must not be the only cue).
5. Click **Show in resume** on a card. The matching left-pane paragraph must **scroll into view** and take focus (accent outline). The card’s Original text should match that paragraph. Neighboring paragraphs must not become the focused editor.
6. Click a second card for a different block. Focus must move to **that** paragraph, not stay on the first.
7. **If no model is installed:** Generate stays disabled with copy pointing at Settings → Resume AI / Test connection. Coverage still works. Report that the empty Suggestions chrome is present and Generate is disabled — still a pass for the no-model path, but step 5 cannot run until a model exists (`ollama pull gemma4:12b` or `gemma4:e4b`, then Test connection).
8. Optional: dark mode — cards stay readable; paper stays light; focused paragraph outline is visible on the light paper.
9. Confirm the document is unchanged after focusing cards (reload still shows the same bullets unless you typed separately).
10. Report pass/fail here so a new chat can mark 7A `COMPLETE` and advance to **7B — Accept / reject / edit / regenerate**. If click focuses the wrong paragraph, cards are color-only with no Original/Suggested labels, Accept applies text, or Generate writes ungrounded Kubernetes into a card, report it as a **fail** → 7A becomes `BLOCKED`.

**Signed off 2026-09-16:** Edwin reported all 7A checks pass (cards bound to blocks; Show in resume focuses the matching paragraph; Original/Suggested labels; Generate; no apply).


### 6A manual verification (Edwin)

Goal: prove **Settings → Resume AI → Test connection** on the **same origins** as 0F, including production HTTPS → `http://127.0.0.1:11434`, CORS, and Local Network / loopback permission. Vite-only success is **not** enough. There is still **no** suggestion generator (**6B–6G**). Agent cannot run production HTTPS or the browser permission prompt, so this walkthrough is required before 6A is `COMPLETE`. Until you report pass/fail, **next eligible stays 6A**.

Leave Ollama **up** for the Allow path (step 4). Use a **synthetic** session only — do not paste a real employer JD into chat when reporting.

1. **Ollama availability:** `curl http://127.0.0.1:11434/api/tags` — up vs connection refused. Start Ollama if it is down, then continue.
2. **Settings chrome:** Open the app → **Settings**. A **Resume AI** category must appear (not a new top-level nav item). Open it. Default base URL is `http://127.0.0.1:11434`. Model select is disabled until Test succeeds. Onboarding must mention: install Ollama, `gemma4:12b` / `gemma4:e4b`, `OLLAMA_ORIGINS` for **Vite and production HTTPS**, Allow on the permission prompt, Chrome `chrome://settings/content/localNetworkAccess`, loopback not LAN, **no** Supabase/Vercel proxy. Page origin must be shown so you can copy it into `OLLAMA_ORIGINS`.
3. **Vite origin:** `npm run dev`, open `http://localhost:5173` → Settings → Resume AI → **Test connection**. Record: Ollama up, CORS, permission prompt, Allow vs Block. Success must list models from `/api/tags` and enable the model dropdown (prefer `gemma4:12b` if installed). This is **not** the production gate.
4. **Production HTTPS origin (required):** open the **deployed** SPA. Settings → Resume AI → **Test connection** (same button; do not substitute a raw DevTools `fetch` as the only check). Record: Ollama up, CORS, **permission prompt**, Allow vs Block. If the browser asked for local/loopback access, choose **Allow** for this pass.
5. **Permission denied:** Block local/loopback access (prompt **Block**, or Chrome `chrome://settings/content/localNetworkAccess`). Click **Test connection** again. The message must say the browser **denied local/loopback** access. It must **not** say Ollama is not installed, and it must **not** call this a CORS / `OLLAMA_ORIGINS` miss. Then Allow again if you want rewriting later.
6. **Ollama down (distinct from deny):** quit Ollama (or Test while it is stopped). Message must say Ollama is **not running**. It must **not** say permission denied and **not** say CORS. Start Ollama again.
7. **Browsers:** repeat step 4 on **Chrome** (primary), **Safari**, and **Firefox** if available. Note mixed-content or missing LNA. If a browser blocks mixed content / lacks loopback support, the copy should match **browser blocked the loopback request**, not CORS.
8. **Editor still works:** with Test failing (Block or Ollama down), open Career → **Resume** and **Open** a resume. The document editor and JD coverage must still work. There is still no Generate Suggestions control.
9. Confirm product plan: on any failure, coverage stays deterministic-only; **do not** proxy Ollama through Supabase or Vercel. Reload Settings: base URL / last chosen model should still be there (`pa.resume.ai.v1`).
10. Report pass/fail here so a new chat can mark 6A `COMPLETE` and advance to **6B — Structured output schema**. If Test on production HTTPS is skipped, LNA deny is labeled as CORS or “Ollama not installed,” or the Resume editor breaks when Test fails, report it as a **fail** → 6A becomes `BLOCKED`.

**Signed off 2026-09-16:** Edwin reported all 6A checks pass (Settings Test on Vite + production HTTPS; CORS; LNA Allow/Block distinct from Ollama down; browsers; Resume editor still works if Test fails).

| Origin / browser | Ollama up | CORS | LNA prompt | Allow | Block / deny distinct from down | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Vite `http://localhost:5173` + Settings Test | pass | pass | pass | pass | pass | Edwin 2026-09-16: all pass |
| Production HTTPS + Chrome + Settings Test | pass | pass | pass | pass | pass | Edwin 2026-09-16: all pass |
| Production HTTPS + Safari + Settings Test | pass | pass | pass | pass | pass | Edwin 2026-09-16: all pass |
| Production HTTPS + Firefox + Settings Test | pass | pass | pass | pass | pass | Edwin 2026-09-16: all pass |

### 5F editor regression (Edwin) — large deletion blanks the page

**Signed off 2026-09-16:** Edwin reported all checks pass (one-word delete; whole-sentence delete does not blank the page; Saved + reload keeps the deletion; mixed-run Led→Ran and flatten warning; Resume pane stays usable).

**What failed:** In the left document editor, a small one-word delete worked. Selecting and deleting a large amount of text at once (a whole sentence in one bullet) went **dark/blank** (not a 404). Refresh recovered. After refresh the deletion **was saved**.

**Root cause (verified, not guessed):** `patchParagraphPlaintext`, local `applyBlockPlaintext`, flush, and `extractedStructureAfterWorkingEdit` all succeed for a whole-sentence delete and for emptying a paragraph. The crash is **post-edit React reconcile** of run `<span>` children inside `contentEditable`. A large native deletion removes those DOM nodes; React later calls `removeChild` (same-paragraph re-render, blur restore, or pagination remount when the shorter block pulls onto another page). An uncaught DOMException blanks the tree while the already-scheduled 1s flush + autosave can still write the working copy.

**Not the cause:** mixed-run fail-closed flattening, empty-paragraph PatchError on a paragraph that already had text, stale hashes, or a failed save.

1. Open Career → **Resume** and **Open** a resume (geometry-canary or the private file). Confirm the rest of Career/Resume chrome is visible.
2. In the **left** editor, click one body bullet. Delete **one word**. The page must stay up; wait for **Saved.**
3. Select **an entire sentence** in that bullet (or another long span in the same paragraph) and delete it in one action. The app must **not** go dark/blank. Neighboring paragraphs stay. JD pane (if open) stays usable.
4. Wait until the left pane reads **Saved.** Reload / Dashboard → Career → Resume → **Open**. The large deletion must still be there.
5. Mixed-run canary: **Led → Ran** still saves with bold/italic/hyperlink. A flatten attempt (e.g. Directed) still shows the formatting-safe warning and does **not** rewrite.
6. Report pass/fail. A blank page on step 3 is still a **fail** for 5F sign-off.

### 5F manual verification (Edwin)

Goal: confirm **Replace** archives the job session and **drops coverage** without changing the resume document; confirm **document edits do not re-run JD parse**; confirm the **import fact ledger is not rebuilt** from working text. There is still **no** suggestion generator (**Wave 6**).

1. Open Career → **Resume**. Upload / **Open** `fixtures/resume/public/geometry-canary.docx` (or any resume that does **not** mention Kubernetes).
2. Paste a **synthetic** JD (not a real employer posting), for example: `Must have Kubernetes. Must have Python. Nice to have Terraform.` Click **Analyze**. Wait until status reads **Saved.** Confirm the **Job match coverage** card is visible (Kubernetes missing).
3. Click **Replace**. Fields must clear. The coverage card must **disappear**. The Word preview wording must be **unchanged** (same bullets as before Replace).
4. Reload / Dashboard → Career → Resume → **Open** the same resume. JD fields stay empty; coverage stays gone. Optional Supabase: previous `resume_job_sessions` row has `archived_at` set; the new active row (if present) has empty text and **null** `parsed_job` / `match_result`.
5. Paste the same synthetic JD, **Analyze**, wait for **Saved.** and coverage. Change **one** work-experience bullet in the preview (do **not** click Analyze). Wait until the **left** pane reads **Saved.** Coverage may still reflect the last Analyze (on-page terms are not auto-refreshed in this phase). The JD textarea must be unchanged. Optional: `resumes.import_fact_ledger` still has **no** Kubernetes `imported_source` fact after the typed edit.
6. Edit the JD textarea (change a word). Coverage must **hide immediately** (stale match must not stay on screen). The document preview must stay as in step 5.
7. Click **Analyze** again after restoring a full JD. Coverage returns from a **new** parse — still no ATS score.
8. Report pass/fail here so a new chat can mark 5F `COMPLETE` and advance to **6A — Settings connection test (includes LNA)**. If Replace leaves the old coverage card, changes the Word file, typing in a bullet re-parses the JD, or Kubernetes appears in `import_fact_ledger`, report it as a **fail** → 5F becomes `BLOCKED`.

**Signed off 2026-09-16:** Edwin reported all 5F checks pass (Replace drops coverage and leaves the resume unchanged; document edit does not re-Analyze; JD field change hides stale coverage; large-deletion regression also pass). Wave 5 closed.

### 5E manual verification (Edwin)

Goal: confirm the coverage panel is **honest** (architecture §31): named bars, missing list, disclosure, and that typed Kubernetes is **on-page unverified**, not silent support. There is still **no** suggestion generator (**Wave 6**). Agent cannot run a browser, so this walkthrough is required before 5E is `COMPLETE`. Until you report pass/fail, **next eligible stays 5E**.

1. Open Career → **Resume**. Upload / **Open** `fixtures/resume/public/geometry-canary.docx` (or any resume that does **not** mention Kubernetes). Confirm the document preview is on the left (desktop) and **Job description** is on the right.
2. Paste a **synthetic** JD (not a real employer posting), for example: `Must have Kubernetes. Must have Python. Nice to have Terraform.` Click **Analyze**. Wait until status reads **Saved.**
3. A **Job match coverage** card must appear under the JD form. Read the disclosure: it must say coverage/parseability checks are **from Zanarkand**, that this is **not** an employer’s ATS score, and that it does **not** predict ranking or rejection. There must be **no** “ATS Score”, no Greenhouse/Workday pass claim, and no single fake job-match number.
4. Confirm named bars: required-term explicit coverage, preferred-term explicit coverage, responsibility alignment. Related wording is a **separate** count, not folded into “explicit.”
5. **Missing required** must list Kubernetes (the canary has none). Python may be explicit or related depending on the file; Kubernetes must **not** be listed as supported.
6. Optional: Dashboard → Career → Resume → **Open** the same resume. Coverage should still be there (`parsed_job` / `match_result` on the active `resume_job_sessions` row). `import_fact_ledger` on the resume must still have **no** Kubernetes fact.
7. Type **Kubernetes** into **one** work-experience bullet in the preview. Wait until the **left document pane** status is **Saved.** (not only the right-hand JD card, which may already say Saved from step 2). Then click **Analyze** again. Kubernetes must move to **On this document (unverified)** — not “imported or verified,” not silent required coverage. Required explicit coverage for Kubernetes must stay **0**.
8. **Reset** clears the JD **and** the coverage card; the Word preview is unchanged.
9. Optional: dark mode — coverage card stays readable; paper stays light.
10. Report pass/fail here so a new chat can mark 5E `COMPLETE` and advance to **5F — Invalidation**. If the UI shows “ATS Score”, treats typed Kubernetes as imported evidence, Analyze rewrites the DOCX, or coverage lives only in React (gone after Dashboard), report it as a **fail** → 5E becomes `BLOCKED`.

**Failed 2026-09-15 (Edwin, first walkthrough):** After Saved, Analyze still listed Kubernetes under Missing required / “Not on this document.” Cause: Analyze used the version snapshot from Open, not the live working graph or a post-autosave refetch. First fix: `structureForCoverageAnalyze` + editor `workingGraph` + `getResumeVersionById` on Analyze. Provenance unchanged (unverified ≠ imported).

**Failed 2026-09-15 (Edwin, second walkthrough):** Same provenance check failed again after that first fix (Kubernetes stayed Missing / “Not on this document”; unverified list empty). Cause: Analyze **preferred** a parent `workingGraph` that was still the Open snapshot, which **shadowed** the refetched saved graph that had the typed sentence. Fix: `selectGraphForCoverageAnalyze` (stale Open-equal editor graph must not beat a newer saved snapshot); Analyze **flush + working-copy save** via `coveragePrepareRef` before match; still never write Kubernetes into the import ledger.

**Retry 2026-09-15:** After two Saved-Kubernetes misses, Analyze now (1) reads live `contentEditable` plaintext (`data-resume-block-id`) before flush, (2) indexes **draft** blocks rather than flushed baseline when they differ, (3) merges mention indexes from live editor + saved version row.

**Signed off 2026-09-16:** Edwin reported all 5E checks pass (honest disclosure; named bars; Kubernetes missing then **On this document (unverified)** after left-pane Saved + Analyze; Reset; no ATS score).

### 5B manual verification (Edwin)

Goal: confirm a pasted job description is stored in **`resume_job_sessions`**, survives leaving Career, and that **Reset** clears the JD without changing the resume document. There is still **no** requirement parser (**5C**), matcher (**5D**), or coverage panel (**5E**). **Analyze** only saves (or you can wait ~0.5s for autosave). Use a **synthetic** JD, not a real employer’s confidential posting. Agent cannot run a browser or open the Supabase dashboard, so this walkthrough is required before 5B is `COMPLETE`.

1. Open Career → **Resume**. Upload / **Open** `fixtures/resume/public/geometry-canary.docx` (or any existing resume). Confirm the document preview is still on the left (desktop) and a **Job description** card is on the right. On a narrow window the JD card should stack below the preview.
2. Fill **Company** (e.g. Acme), **Job title** (e.g. Engineer), and paste a short synthetic JD into the textarea (e.g. “Must have Kubernetes. Nice to have Terraform.”). Wait until the pane status reads **Saved.** (about **500 ms** after you stop typing), or click **Analyze** to flush immediately. Status must **not** claim AppShell payload save. The resume preview wording must be **unchanged**.
3. Go to **Dashboard**, then back to Career → **Resume**. Click **Open** on the same resume. Company, title, and the JD textarea must still show what you pasted.
4. Optional: hard-reload the browser, then Open the same resume again — JD still there.
5. In the Supabase dashboard → `resume_job_sessions`: one **active** row (`archived_at` is null) for that `resume_id`, with your company / title / `job_description_text`. `parsed_job` and `match_result` should still be **null**. `retention` is `until_replaced`.
6. Click **Reset**. The company / title / JD fields clear. The **document preview is unchanged** (same bullets as before). Reload / Open again: JD stays **empty**. The previous session row should now have `archived_at` set; there should be **no** new active row until you paste again.
7. Paste a JD again, wait for **Saved.** Click **Replace**. Fields clear; the document is still unchanged. A new **active** session row exists (empty text); the previous one is archived. Paste a second synthetic JD; after **Saved.**, only the new active row has that text.
8. Optional: toggle **dark mode** — the JD card stays readable; paper stays light. Typing a JD must not create a Download / document cloud-save of the Word file by itself.
9. Report pass/fail here so a new chat can mark 5B `COMPLETE` and advance to **5C — Deterministic JD parser**. If the JD is gone after Dashboard navigation, lives only in React state, Reset rewrites the DOCX, or Analyze invents coverage/ATS numbers, report it as a **fail** → 5B becomes `BLOCKED`.

**Signed off 2026-09-15:** Edwin reported all 5B checks pass (paste → Saved.; Dashboard → Resume restores JD; Reset clears JD only; document unchanged; Replace archives and starts empty session).

### 4G manual verification (Edwin)

Goal: confirm the **in-app** upload → edit → **Download Word** path uses the same 0D fail-closed patcher. This is a product-path **regression**, not a new patcher. Compare in **Microsoft Word** (not Preview.app alone). Agent cannot run a browser or Word, so this walkthrough is required before 4G is `COMPLETE`. Until you report pass/fail, **next eligible stays 4G**.

1. Open Career → **Resume**. Upload `fixtures/resume/private/current-resume.docx` (fresh upload so the working copy has `pa_` bookmarks). Click **Open**.
2. Confirm the CSS preview shows **about two** page surfaces (the private resume is 2 pages). `page_count_estimated` on the version row may still be `null` — that stored field is a later layout wave.
3. Wait until **Download Word** is enabled (working DOCX finished loading). **Do not change anything.** Click **Download Word**. Open the downloaded file in **Microsoft Word**. Confirm **no** repair dialog. Compare to the original: margins, fonts, bullet indentation, hyperlinks; bookmarks must stay invisible. Page count must still be **2**. An extra page from this identity download is a **fail**.
4. In the preview, edit **one** work-experience bullet (small wording change; do not restyle). You can click **Download Word** immediately (it flushes first); you do not have to wait for **Saved.** Open that download in Word. Confirm **only** that wording changed; neighboring mixed formatting stays intact; page count still **2**, **or** record a page-count change as a **regression failure** if the new wording was too short to wrap.
5. In Supabase Storage, confirm `original/<64-hex>.docx` is **unchanged**. The download must be the **working** copy (bookmarks + your edit), not a rewrite of the original object.
6. Upload / open **`fixtures/resume/public/mixed-runs-canary.docx`**. Change only the leading unformatted word (**Led → Ran**). **Download Word**. In Word, confirm **bold**, *italic*, and the hyperlink survive. Then try a flatten (e.g. one unformatted **Directed**): the formatting-safe **warning** must appear, the paragraph must **not** flatten, and a subsequent download must still be the last **successful** wording (Ran), not Directed.
7. Optional: toggle **dark mode** — paper stays light; Download Word stays usable. Filename should be the resume library name plus `.docx` (role-based `Name-role.docx` is **9A**, not this phase).
8. Report pass/fail here so a new chat can mark 4G `COMPLETE` and advance to **5A — Session schema wiring**. If Word repairs the file, the rest of the document is restyled, bullets/hyperlinks are lost, the original Storage object changed, identity download added a page, or a flatten-on-save path appeared, report it as a **fail** → 4G becomes `BLOCKED`. If the **patcher** itself is what broke Word, treat as **0D regression** (fallback architectures), not a second in-app patcher.

**Signed off 2026-09-15:** Edwin reported all 4G checks pass (private identity + one-bullet Download Word in Microsoft Word; mixed-runs; original unchanged; flatten does not rewrite).

### 4F manual verification (Edwin)

Goal: confirm a bullet edit is uploaded to the **working** copy after a short pause, survives a full reload, and does **not** change the immutable original. There is still **no** Download button (that is **4G**). Agent cannot run a browser or open the Supabase dashboard, so this walkthrough is required before 4F is `COMPLETE`.

1. Open Career → **Resume**. Upload a **fresh** `fixtures/resume/public/geometry-canary.docx` (so you can compare original vs working in Storage). Click **Open**.
2. In the Supabase dashboard, note this resume's `resume_versions` row: copy `original_storage_path` (ends with `original/<64-hex>.docx`) and `working_storage_path` (`versions/<uuid>.docx`). Note the current `sha256` value (at this point it still matches the original-path digest).
3. Click one body bullet (for example REST APIs). Change the wording (add or replace a word). Neighboring paragraphs must stay unchanged.
4. Wait until the pane status reads **Saved.** (about **2 seconds** after you stop typing: 1 s in-memory patch + 0.8 s upload debounce, then the upload). You should briefly see **Applying edits…** then **Saving to cloud…**. Status must **not** claim AppShell payload save. There is still **no** Download control.
5. **Full browser reload.** Open the same resume. The edited wording must **still be there**.
6. Storage → `resume-docs` → `{uid}/{resumeId}/`:
   - `original/<64-hex>.docx` object name is **unchanged** (same hash as step 2). Download it if you want: it must still be the untouched upload.
   - `versions/<versionId>.docx` was **updated** (newer updated-at than the original).
7. Same `resume_versions` row: `original_storage_path` is **unchanged**. `sha256` should now be the **working** file's digest (it may differ from the original-path hash). `extracted_structure.graph` should show the new bullet wording. `import_fact_ledger` on the `resumes` row is unchanged.
8. Mixed-run sanity: upload / open **`mixed-runs-canary.docx`**. Change only **Led → Ran**. Wait for **Saved.** Reload: **Ran** is still there, with bold / italic / hyperlink visible. Then try a flatten (e.g. turn the mixed span into one unformatted **Directed**). Confirm the formatting-safe **warning**, the paragraph does **not** flatten, and after reload the paragraph is still the last **successfully** saved wording (Ran), not Directed.
9. Optional: toggle **dark mode** — paper stays light; Saving/Saved status stays readable. Close preview waits for an in-flight save; a failed save shows **Cloud save failed** + **Retry cloud save** and should **not** close until it succeeds or you leave it.
10. Report pass/fail here so a new chat can mark 4F `COMPLETE` and advance to **4G — Product-path fidelity regression**. If the edit is gone after reload, the original Storage object changed, `replaceRemotePayload` / AppShell "Last saved" is what persisted the DOCX, or a flatten uploaded, report it as a **fail** → 4F becomes `BLOCKED`.

**Signed off 2026-09-15:** Edwin reported all 4F checks pass (edit → Saved.; reload keeps wording; original object hash unchanged; flatten does not upload).

### 4E manual verification (Edwin)

Goal: confirm block-text undo and redo in the in-tab editor. Suggestion undo is **not** in this phase. There is still **no** cloud autosave (**4F**) and **no** Download (**4G**) — reload/close must discard edits. Agent cannot run a browser, so this UI walkthrough is required before 4E is `COMPLETE`.

1. Open Career → **Resume**. Upload `fixtures/resume/public/geometry-canary.docx` if needed, then **Open**.
2. Confirm **Undo** and **Redo** are present and **disabled** before any edit.
3. Click one body bullet (for example REST APIs). Change the wording (type several characters). Confirm **Undo** becomes enabled and **Redo** stays disabled.
4. Click **Undo** (or Cmd/Ctrl+Z). Confirm that paragraph returns to the **pre-edit** wording and neighboring paragraphs are unchanged. **Redo** should now be enabled.
5. Click **Redo** (or Cmd/Ctrl+Shift+Z, or Ctrl+Y). Confirm the edited wording returns.
6. Undo again, then type a **different** change in the same paragraph. Confirm Redo is **cleared** (disabled) and the new text is what you typed.
7. Upload / open **`mixed-runs-canary.docx`**. Change only the leading unformatted word (**Led → Ran**). Undo: **Led** returns and **bold / italic / hyperlink** still show. Redo: **Ran** returns with the same styling.
8. Confirm there is still **no** Download / cloud-save that would persist the edit. **Reload** (or Close and Open): wording and undo stack are **gone**.
9. Report pass/fail here so a new chat can mark 4E `COMPLETE` and advance to **4F — Autosave working copy**. If undo changes other paragraphs, native contentEditable undo desyncs the preview, or edits survive reload, report it as a **fail** → 4E becomes `BLOCKED`.

**Signed off 2026-09-15:** Edwin reported all 4E checks pass (undo/redo buttons and shortcuts; mixed-runs styling; reload/close discards).

### 4D manual verification (Edwin)

Goal: confirm typing flushes through the fail-closed OOXML patcher in memory, and that a flatten attempt shows the safe error and does **not** rewrite the paragraph. There is still **no** Download button (that is **4G**) and **no** cloud autosave (**4F**) — closing/reloading must discard edits. Agent cannot run a browser, so this UI walkthrough is required before 4D is `COMPLETE`.

1. Open Career → **Resume**. Upload `fixtures/resume/public/mixed-runs-canary.docx` (fresh upload so the working copy has `pa_` bookmarks).
2. Click **Open**. Wait until the preview is ready (working DOCX loads in the background).
3. Click the mixed paragraph. Change only the leading unformatted word (**Led → Ran**). Wait about **1 second**. Confirm status becomes something like **Unsaved local edits (patched in this tab only)…** (or briefly “Applying edits to the in-memory Word document…”). Neighboring paragraphs stay unchanged; bold / italic / hyperlink styling should still show on screen.
4. Still on that paragraph (or after blur), replace a mixed span in a way that would flatten (e.g. turn “Led TeamAlpha” / “Ran TeamAlpha” into one unformatted **Directed**). Confirm a **warning/alert** appears (formatting cannot be updated safely) and the paragraph does **not** flatten to a single plain style after you click away.
5. Confirm there is **no** Download / Save-to-cloud control that would persist the edit. Status must **not** claim the file was uploaded.
6. **Reload** the browser (or Close preview and Open again). The Ran / other wording changes must be **gone**.
7. Optional sanity: upload `geometry-canary.docx`, change the REST APIs bullet wording, wait ~1s for the in-memory flush status — still discarded on reload.
8. Report pass/fail here so a new chat can mark 4D `COMPLETE` and advance to **4E — Undo / redo**. If a flatten succeeds on screen, the UI invents a second save path, or edits survive reload without 4F, report it as a **fail** → 4D becomes `BLOCKED`. Word-open confirmation of the patched bytes is deferred to **4G**.

**Signed off 2026-09-15:** Edwin reported all 4D checks pass (in-memory flush status; fail-closed does not flatten; no cloud save; reload/close discards).

### 4C manual verification (Edwin)

Goal: confirm you can click one paragraph, type, see that paragraph update, and that every other paragraph stays the same. Changes must **not** survive a full reload (this phase is local state only). Agent cannot run a browser, so this UI walkthrough is required before 4C is `COMPLETE`.

1. Open Career → **Resume**. If the library is empty, upload `fixtures/resume/public/geometry-canary.docx`.
2. Click **Open**. Confirm the paper preview still renders (4A/4B behavior: light paper, font warning if Calibri is missing).
3. Click a **single** body bullet (for example the geometry canary’s REST APIs bullet). Type a small wording change (add or replace a word). Confirm **that** paragraph updates as you type.
4. Confirm **every other** paragraph is unchanged (name, headings, neighboring bullets). There must not be one giant document-wide text box — only the clicked paragraph should be the editing surface.
5. Confirm a status line appears: **Unsaved local edits. Closing the preview discards them.**
6. **Reload the browser** (or Close preview and Open again). The wording change must be **gone**. There is still no Download / cloud save of the edit (4D–4G).
7. Upload / open **`mixed-runs-canary.docx`**. Confirm the mixed paragraph still shows **bold**, *italic*, and the hyperlink run. Change only the leading unformatted word (e.g. Led → Ran) if you can; bold/italic/hyperlink should remain. If you replace a mixed-format span in a way that would flatten (e.g. turn “Led TeamAlpha” into one unformatted “Directed”), a warning must appear and that paragraph must **not** flatten on screen after you click away.
8. Toggle **dark mode**. Paper stays light; you can still type; focus ring on the active paragraph is visible.
9. Report pass/fail here so a new chat can mark 4C `COMPLETE` and advance to **4D — Wire fail-closed OOXML patch into the editor**. If typing edits every paragraph, a single contentEditable wraps the page, or edits persist after reload, report it as a **fail** → 4C becomes `BLOCKED`.

**Signed off 2026-09-15:** Edwin reported all 4C checks pass (type one bullet; others unchanged; unsaved local status; reload/close discards; mixed-runs; dark mode).

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

**Signed off 2026-09-15:** Edwin reported all 4B checks pass (font preflight / Carlito load / banner behavior; dark mode; Close/switch).

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
| 10F | Lazy load + Career copy polish | `AWAITING MANUAL VERIFICATION` | 2026-09-18 | `React.lazy` ResumeWorkspace; empty-state + Skills link (no auto-add); architecture.md + roadmap updated. Build emits ResumeWorkspace chunk. Waiting Edwin Career UI walkthrough. No successor until COMPLETE. Tests 1813 pass / 8 skip. |
| 10E | Observability without PII | `COMPLETE` | 2026-09-18 | `RESUME_ZIP` / `RESUME_OLLAMA` / `RESUME_GROUNDING`; no JD in UI copy or logs. No 10F. Tests 1812 pass / 8 skip. Next chat: **10F**. |
| 10D | Mobile degraded UX | `COMPLETE` | 2026-09-18 | Edwin DevTools walkthrough pass (banner; stacked; paper hidden; collapsible analysis; desktop restore). No 10E. Tests 1805 pass / 8 skip. Next chat: **10E**. |
| 10C | Accessibility pass | `COMPLETE` | 2026-09-18 | Edwin keyboard walkthrough pass (3 cards; named toolbar; focus after Accept/Reject). Keyboard extras documented, not the only path. No 10D. Tests 1802 pass / 8 skip. Next chat: **10D**. |
| 10B | Prompt injection corpus | `COMPLETE` | 2026-09-18 | Expanded Case F variants (JD / company / title / block + classify/map fences). Obedient fake LLM fail-closed; policy-compliant rewrite still grounded. No 10C. Tests 1791 pass / 8 skip. Next chat: **10C**. |
| 10A | Security review of paths and RLS | `COMPLETE` | 2026-09-18 | Canonical Storage object RLS + version path CHECKs; 100k JD cap at persist/mapper/parser/remote; 8 MB upload dual-check; Generate in-flight guard. No 10B. Tests 1771 pass / 8 skip. Next chat: **10B**. Apply `20260917190000_resume_storage_path_hardening.sql` when convenient. |
| 9E | PDF | `COMPLETE` | 2026-09-17 | Edwin UI walkthrough pass (print dialog; approximate copy; Download Word still works). Labeled `window.print`; no html2pdf. Wave 9 closed. Tests 1764 pass / 8 skip. Next chat: **10A**. |
| 9D | Optional application link | `COMPLETE` | 2026-09-17 | Edwin UI walkthrough pass (picker; Saved; no auto-fill; reload; unlink). Soft FK `application_id` only. No 9E PDF. Tests 1762 pass / 8 skip. Next chat: **9E**. |
| 9C | Block-level diff vs original version | `COMPLETE` | 2026-09-17 | Edwin UI walkthrough pass (changes vs version 1; one-bullet list; Show in resume; reload). Original + frozen blockMap vs live graph. No 9D. Tests 1757 pass / 8 skip. Next chat: **9D**. |
| 9B | Save as new / version pointer | `COMPLETE` | 2026-09-17 | Edwin UI + Storage walkthrough pass (Save as new from flushed working bytes; keep editing current; source original/pointer unchanged; independent copy; `source_kind=tailor`). Version n · label. No 9C diff. Tests 1745 pass / 8 skip. Next chat: **9C**. |
| 9A | Production DOCX download | `COMPLETE` | 2026-09-17 | Edwin Word + filename walkthrough pass (`Name-role.docx`; identity + one-bullet; mixed-runs; original unchanged; flatten fail-closed; empty title omits role). Tests 1740 pass / 8 skip. Next chat: **9B**. |
| 8D | Layout fingerprint invalidation | `COMPLETE` | 2026-09-17 | Fingerprint of page/margins/fonts/sizes/spacing/indents + substitution. Stale stored reports recompute live; Accept still enabled; typing not blocked. No 9A named export. Tests 1739 pass / 8 skip. Next chat: **9A**. |
| 8C | Page-count estimate warning | `COMPLETE` | 2026-09-17 | Edwin UI walkthrough pass (huge-bullet page-count warning; Accept still enabled). Warn-only Q6. No 8D fingerprint. Tests 1732 pass / 8 skip. Next chat: **8D**. |
| 8B | Line-count warning on cards | `COMPLETE` | 2026-09-17 | Edwin UI walkthrough pass (long-paste wrap warning; Accept still enabled). Warn-only Q6. No 8C page-count. Tests 1722 pass / 8 skip. Next chat: **8C**. |
| 8A | measureText helper | `COMPLETE` | 2026-09-17 | Injected `measureText` + `sectPr`/indent content width. Soft char cap does not override wrap. No card UI. Tests 1715 pass / 8 skip. Next chat: **8B**. |
| 7E | Coverage refresh after accept | `COMPLETE` | 2026-09-17 | Edwin UI walkthrough pass (Accept rematch without Analyze; unverified Kubernetes not imported; stale/flatten/reject do not rematch). Wave 7 closed. Tests 1696 pass / 8 skip. Next chat: **8A**. |
| 7D | Stale suggestions | `COMPLETE` | 2026-09-17 | Edwin UI walkthrough pass (edit then Accept no-op; stale card; regenerate; fresh Accept still applies). Hash mismatch → no patch. Tests 1693 pass / 8 skip. Next chat: **7E**. |
| 7C | Apply accept to OOXML | `COMPLETE` | 2026-09-17 | Edwin UI + Word walkthrough pass (Accept applies; reload; Download Word; mixed-run fail-closed; Kubernetes not written). Tests 1689 pass / 8 skip. Next chat: **7D**. |
| 7B | Accept / reject / edit / regenerate | `COMPLETE` | 2026-09-17 | Edwin UI walkthrough pass (reject/accept persist; no Word apply; regenerate; Kubernetes fail-closed). 25 generate attempts → 3 cards is expected. Next chat: **7C**. |
| 7A | Cards bound to block IDs | `COMPLETE` | 2026-09-16 | Edwin UI walkthrough pass (focus matching paragraph; Original/Suggested labels; Generate; no apply). Cards + sequential 6F generate. Tests 1668 pass / 8 skip. Next chat: **7B**. |
| 6G | AI QUALITY GATE | `COMPLETE` | 2026-09-16 | Cases A–G via `resumeSuggestions.quality.test.ts` + fake LLM. B/E/G fail closed; F injection fenced. Live Ollama skipped (process up, zero models). No Wave 7 UI. Tests 1663 pass / 8 skip. Next chat: **7A**. |
| 6F | Single-block generator | `COMPLETE` | 2026-09-16 | `resumeSuggestions.ts` `generateBlockSuggestion` + `insertResumeSuggestion`; Ollama `/api/chat`; fake LLM Kubernetes rejected. No UI / no 6G suite. Tests 1654 pass / 7 skip. Next chat: **6G**. |
| 6E | Style lint + unicode on outputs | `COMPLETE` | 2026-09-16 | `resumeStyleLint.ts` `prepareSuggestionText`: em dash, leveraged, first person, adjective pile-up, hidden ATS; ZWSP stripped on generated text. No generator/UI. Tests 1644 pass / 7 skip. Next chat: **6F**. |
| 6D | Grounding validator | `COMPLETE` | 2026-09-16 | `resumeGrounding.ts`: fail-closed allow-list (verbatim of B, role-scoped import, Skills-line only for Skills, `user_verified` reuse, inherited transformations). Cases B, E, G. No JD input, no style lint/chat/UI. Tests 1626 pass / 7 skip. Next chat: **6E**. |
| 6C | Injection-safe prompts | `COMPLETE` | 2026-09-16 | Frozen system policy vs user JSON data fence (`resumeLlmPrompts.ts`). JD/resume/evidence never enter system; Case F canary stays in user JSON; hidden-ATS tricks banned in rewrite policy. No grounding/chat/UI. Tests 1606 pass / 7 skip. Next chat: **6D**. |
| 6B | Structured output schema | `COMPLETE` | 2026-09-16 | Zod-less `resumeLlmSchema.ts`: rewrite JSON requires `proposedText`, rejects extra fields / missing or empty text; JD classify + evidence-map shapes. No prompts/grounding/generator. Tests 1598 pass / 7 skip. Next chat: **6C**. |
| 6A | Settings connection test (includes LNA) | `COMPLETE` | 2026-09-16 | Edwin Settings HTTPS→loopback matrix pass (Vite + production HTTPS, CORS, LNA allow/deny distinct from down, editor still works). Loopback Test connection + `pa.resume.ai.v1`. No Edge Function / no Generate Suggestions. Tests 1581 pass / 7 skip. Next chat: **6B**. |
| 5F | Invalidation | `COMPLETE` | 2026-09-16 | Edwin walkthrough pass: Replace drops coverage without rewriting the resume; document edit does not re-Analyze; JD change hides stale coverage. Large-deletion regression also pass (imperative contentEditable host paint). Wave 5 closed. Tests 1556 pass / 7 skip. Next chat: **6A**. |
| 5E | Coverage panel (honest copy) | `COMPLETE` | 2026-09-16 | Edwin walkthrough pass after live-plaintext Analyze retry (disclosure; named bars; Kubernetes missing then on-page unverified; Reset; no ATS score). Two earlier 2026-09-15 fails on Saved Kubernetes. Provenance unverified ≠ imported. Wave 5 coverage UI closed. |
| 5D | Matcher + lexicon aliases | `COMPLETE` | 2026-09-15 | `resumeMatch.ts`: explicit / semantic_supported / on_page_unverified / absent (REST vs RESTful; Kubernetes absent vs typed unverified). Coverage math, no ATS score. Strict `match_result` mapper. No LLM/coverage UI/persist. Tests 1522 pass / 7 skip; tsc/eslint/build green. |
| 5C | Deterministic JD parser | `COMPLETE` | 2026-09-15 | `resumeJobParse.ts`: required vs preferred, lexicon skills, years, degrees, salience. No LLM/matcher/coverage/UI persist. Tests 1511 pass / 7 skip; tsc/eslint/build green. |
| 5B | JD paste UI + persistence | `COMPLETE` | 2026-09-15 | Edwin browser + navigation pass (Dashboard restore; Reset; Replace). Right pane + 500 ms `resume_job_sessions` persist. No parser/coverage. Tests 1496 pass / 7 skip; tsc/eslint/build green. |
| 5A | Session schema wiring | `COMPLETE` | 2026-09-15 | Mapper + isolated remote CRUD for `resume_job_sessions`. No JD UI. Tests 1486 pass / 7 skip; tsc/eslint/build green. |
| 4G | Product-path fidelity regression | `COMPLETE` | 2026-09-15 | Edwin Word + Download walkthrough pass (private identity + one-bullet; mixed-runs; original unchanged; flatten does not rewrite). Download Word = flush via 0D `patchParagraphPlaintext` then save working bytes. Wave 4 closed. Tests 1481 pass / 7 skip; tsc/eslint/build green. |
| 4F | Autosave working copy | `COMPLETE` | 2026-09-15 | Edwin browser + Storage walkthrough pass (edit → Saved.; reload keeps wording; original hash unchanged; flatten does not upload). Debounced working-copy upsert + working sha256 + graph/mention persist. Original object never written. No Download. Tests 1472 pass / 7 skip; tsc/eslint/build green. |
| 4E | Undo / redo | `COMPLETE` | 2026-09-15 | Edwin UI walkthrough pass (undo/redo; mixed-runs; reload discards). In-memory block-text stack + coalescing; Undo/Redo buttons; Cmd/Ctrl+Z / Shift+Z / Y; remount contentEditable; 4D flush after restore. No autosave/download/suggestion undo. Tests 1464 pass / 7 skip; tsc/eslint/build green. |
| 4D | Wire fail-closed OOXML patch into the editor | `COMPLETE` | 2026-09-15 | Edwin UI walkthrough pass (in-memory flush; fail-closed; no cloud save; reload discards). Bookmark locator on 0D `patchParagraphPlaintext`; `flushBlockPlaintextByBookmark` + debounced in-memory flush; `downloadResumeWorkingDocx`. No autosave/download/undo. Tests 1459 pass / 7 skip; tsc/eslint/build green. |
| 4C | Per-block editing (local state) | `COMPLETE` | 2026-09-15 | Edwin UI walkthrough pass (type one bullet; others unchanged; unsaved local; reload discards; mixed-runs; dark mode). Per-block contentEditable + local graph draft (`resumeBlockEdit.ts` fail-closed mixed-run apply). No OOXML patch, no autosave, no undo, no TipTap. Tests 1452 pass / 7 skip; tsc/eslint/build green. |
| 4B | Font preflight | `COMPLETE` | 2026-09-15 | Edwin UI walkthrough pass (font checks / Carlito load / banner; dark mode; Close/switch). Carlito OFL under `public/fonts/` + `@font-face`; `resumeFonts.ts` preflight + banner in `ResumeDocumentPane`. No OOXML rewrite, no Calibri binaries. Tests 1438 pass / 7 skip; tsc/eslint/build green. |
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
