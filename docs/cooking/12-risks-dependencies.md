# Cooking Risks, Dependencies & Recommended Order

## 1. Recommended implementation order (summary)

Critical path to value, then layered intelligence:

```
P1 recipes → P2 sessions+XP+mastery → P3 images → P4 calendar → P6 guided+timers → P5 gallery polish
                                                   ↘ P7 ingredients/pantry → P8 nutrition
                                                                            ↘ P9 assisted import
P10 curated catalog (after P3) · P11 notifications (after P6) · P12 analytics+AI (after P2/P7/P8)
```

Rationale:

- Ship a usable, rewarding core (P1-P2) before any new infrastructure.
- Defer Edge Functions (P3 Sanity upload, P8 USDA, P9 OpenAI) so failures are isolated and the core remains stable.
- P7 (ingredient normalization) is a prerequisite for both nutrition (P8) and high-quality import matching (P9) — do it first.

## 2. Dependencies

### External / new infrastructure

- **Supabase Edge Functions** (new runtime in this repo): `sanity-upload` (P3), `nutrition-fetch` (P8), `ocr-extract` (P9). Requires deploy pipeline + secret management.
- **Sanity** project + dataset + write token (P3). Greenfield — not currently wired (only in [`docs/decisions.md`](../decisions.md)).
- **OpenAI API** key for vision extraction (P9).
- **USDA FoodData Central** API key (P8); **Open Food Facts** (P8, optional, open data).
- **`pg_trgm`** Postgres extension (P7).
- npm deps: `@sanity/client`, `@sanity/image-url` (P3).

### Internal

- P2 depends on P1; P4/P6 depend on P2; P8 depends on P7; P9 depends on P1/P3/P7; P10 depends on P1/P3; P11 depends on P6; P12 depends on P2/P7/P8.

## 3. Risks & mitigations

### R1 — Progression blast radius (axis change)

- Risk: adding a 6th RPG axis would touch the `ProgressionAxis` union, axis maps, the 5-axis dashboard grid, achievements, and quests.
- Mitigation: locked decision to reuse `creative` + `body` (no new axis). The only new track kind is `recipe:{id}`, which parallels the existing `skill:{id}` plumbing. See [`03-progression-design.md`](03-progression-design.md).

### R2 — Backend secrets / Edge Functions are new failure modes

- Risk: this repo has no backend today; introducing Edge Functions adds deploy complexity, cold starts, and secret-leak risk.
- Mitigation: isolate to P3/P8/P9; keep functions stateless; verify Supabase JWT; never put secrets in `VITE_*`; the core domain (P1-P2, P4-P6) works without any function.

### R3 — Sanity is greenfield

- Risk: new CMS infra, env wiring, and a write-token upload path; cost/bandwidth unknowns.
- Mitigation: images-only scope; graceful degradation when Sanity env is absent (P1-P2 fully usable without images); use transforms for small thumbnails to limit bandwidth.

### R4 — LLM extraction accuracy & cost (import)

- Risk: wrong or hallucinated recipe data; per-call cost/latency.
- Mitigation: structured outputs + server-side schema validation + single retry; mandatory user review (import only drafts); per-field + per-ingredient confidence flags; per-user rate limiting; manual-entry fallback.

### R5 — Ingredient matching quality

- Risk: poor matches degrade pantry "can make now" and nutrition accuracy.
- Mitigation: curated canonical ingredients + alias table seeded for common items; trigram fuzzy with a tuned threshold; confidence surfaced + user-correctable; descriptors stripped before matching.

### R6 — Nutrition correctness & licensing

- Risk: inaccurate macros erode trust; dataset licensing/rate limits.
- Mitigation: USDA authoritative + `fdc_id`; cache-on-demand only (no bulk import); per-serving + confidence indicator; retention factors; never redistribute datasets; respect API limits.

### R7 — Cross-device timer correctness (guided mode)

- Risk: timers drift or reset across refresh/devices.
- Mitigation: absolute `endsAtIso` timestamps (not counters); Supabase as authoritative `in_progress` session; localStorage mirror; `tick(now)` settles overdue timers on rehydrate; at most one active session per user. See [`09-guided-cooking-architecture.md`](09-guided-cooking-architecture.md).

### R8 — XP farming / abuse

- Risk: users grind XP by repeatedly logging the same recipe.
- Mitigation: diminishing repeat curve + floor; daily bonus cap (existing `MAX_BONUS_XP_PER_DAY`); XP only from `completed` sessions requiring start/finish times; optional future per-recipe daily cap.

### R9 — Data model churn across phases

- Risk: adding fields phase-by-phase causes repeated migrations/mapper edits.
- Mitigation: define target shapes now ([`10-data-models.md`](10-data-models.md)); add nullable image/guided columns in early migrations even if unused; keep migrations additive (repo convention).

### R10 — Scope creep / giant phases

- Risk: bundling features delays shipping and increases regression risk.
- Mitigation: 12 small phases, each independently shippable with tests + acceptance criteria; enforce "ship one phase fully before the next".

### R11 — Sync model (full-payload replace) growth

- Risk: `replaceRemotePayload` upserts/deletes the whole payload; many recipes/sessions could grow sync cost.
- Mitigation: acceptable at personal-app scale; if it becomes an issue, move cooking to incremental writes (out of scope; note for the future). Keep global reference data out of the per-user payload entirely.

### R12 — Offline / no-network behavior

- Risk: timers and sessions must keep working offline.
- Mitigation: localStorage-first with debounced Supabase sync (existing pattern); absolute timers need only local `now`; reference data cached.

## 4. Open items to revisit (not blockers)

- Whether "bell pepper" color variants are distinct canonical ingredients or aliases (curatorial; affects nutrition granularity).
- Whether planned cooks reuse `cooking_sessions` (Option A) or a dedicated `planned_cooks` table (Option B) — recommend A.
- Micronutrient retention coverage (v1 can ship macro-only).
- Promoting curated catalog content into Sanity documents later (would relax "images only" for curated content; new decision record).

## 5. Definition of done (domain)

The domain is vision-complete when the success criteria in [`00-vision.md`](00-vision.md) section 6 are met and Phases 1-9 have shipped with green tests. Phases 10-12 are enhancements.
