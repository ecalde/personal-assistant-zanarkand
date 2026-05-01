---
name: Phase 1 Supabase RLS
overview: Add a single versioned SQL migration under `supabase/migrations/` that creates Option B tables (`skills`, `sessions`, `overrides`) with UUID PKs, FKs to `auth.users`, constraints, indexes, `updated_at` handling for `skills`, and deny-by-default RLS with four policy types per table—including INSERT/UPDATE checks that bind `sessions.skill_id` to a skill owned by `auth.uid()`.
todos:
  - id: migration-file
    content: Add supabase/migrations/<timestamp>_core_schema_rls.sql with CREATE TABLE skills, sessions, overrides (constraints, FKs)
    status: pending
  - id: indexes-trigger
    content: Add indexes (user_id, sessions user_id+started_at) and skills updated_at trigger function
    status: pending
  - id: rls-policies
    content: Enable RLS; create SELECT/INSERT/UPDATE/DELETE policies; sessions INSERT/UPDATE WITH CHECK skill ownership
    status: pending
  - id: grants
    content: Grant minimal privileges to authenticated on the three tables
    status: pending
  - id: verify-two-users
    content: Run manual two-user RLS checks in Supabase SQL editor or CLI
    status: pending
isProject: false
---

# Phase 1: Supabase schema and RLS (SQL migration plan)

## Goals and constraints

- Align with [docs/plans/vercel-supabase-auth-storage.md](docs/plans/vercel-supabase-auth-storage.md) Option B: `**skills**`, `**sessions**`, `**overrides**`; weekly template in `**skills.schedule` jsonb** (no `schedule_blocks` table).
- Follow [PROJECT_RULES.md](PROJECT_RULES.md) (small, reviewable change: one migration file + optional short doc pointer) and [SECURITY_RULES.md](SECURITY_RULES.md) (no secrets in SQL; RLS is the authorization boundary for the future anon client).
- **No application code** in this phase—only migration SQL (and optionally documenting how to apply it in [docs/setup.md](docs/setup.md) in a later tiny follow-up if you want).

## Deliverable layout

- Add directory [supabase/migrations/](supabase/migrations/) if missing.
- One file: `supabase/migrations/YYYYMMDDHHMMSS_core_schema_rls.sql` (timestamp prefix per Supabase CLI convention).

Optional: if you use Supabase Dashboard “SQL editor” only, the same SQL can be pasted once; keeping it in-repo is still recommended for review and CI.

## Naming and types (Postgres)

Use `**public`** schema and **snake_case** columns (map to [src/core/model.ts](src/core/model.ts) camelCase in a later app phase):


| Domain (TS)         | DB column                                 |
| ------------------- | ----------------------------------------- |
| `dailyGoalMinutes`  | `daily_goal_minutes` (integer, nullable)  |
| `weeklyGoalMinutes` | `weekly_goal_minutes` (integer, nullable) |
| `startedAtIso`      | `started_at` (timestamptz)                |
| `createdAtIso`      | `created_at` (timestamptz)                |


---

## 1. Table: `public.skills`

**Columns**

- `id` **uuid** PRIMARY KEY (client-generated UUIDs supported; no default required, or `gen_random_uuid()` as optional default).
- `user_id` **uuid** NOT NULL REFERENCES `auth.users(id)` **ON DELETE CASCADE**.
- `name` **text** NOT NULL.
- `priority` **smallint** NULL, constraint: `(priority IS NULL) OR (priority BETWEEN 1 AND 4)`.
- `daily_goal_minutes` **integer** NULL.
- `weekly_goal_minutes` **integer** NULL.
- `schedule` **jsonb** NOT NULL DEFAULT `'{}'::jsonb` (shape per [WeeklySchedule](src/core/model.ts); optional `CHECK (jsonb_typeof(schedule) = 'object')` for minimal sanity).
- `created_at` **timestamptz** NOT NULL DEFAULT `now()`.
- `updated_at` **timestamptz** NOT NULL DEFAULT `now()`.

**Trigger (production-safe touch)**

- Reuse the common pattern: `BEFORE UPDATE` trigger sets `updated_at = now()` (and optionally keep `created_at` immutable in app policy only, or add `NO ACTION`—Postgres does not auto-freeze `created_at`).

---

## 2. Table: `public.sessions`

**Columns**

- `id` **uuid** PRIMARY KEY.
- `user_id` **uuid** NOT NULL REFERENCES `auth.users(id)` **ON DELETE CASCADE**.
- `skill_id` **uuid** NOT NULL REFERENCES `public.skills(id)` **ON DELETE CASCADE**.
- `minutes` **integer** NOT NULL **CHECK (minutes > 0)**.
- `started_at` **timestamptz** NOT NULL (maps to `startedAtIso`).
- `created_at` **timestamptz** NOT NULL DEFAULT `now()`.

**Why no `updated_at`**

- Current domain model has no skill-session update lifecycle; add later if you introduce edits. Satisfies “timestamps where applicable.”

**Cross-user integrity (critical for RLS)**

- A malicious client could try `user_id = auth.uid()` with another user’s `skill_id`. **FK alone does not tie `sessions.user_id` to `skills.user_id`.** Address in **RLS INSERT/UPDATE policies** with `EXISTS (SELECT 1 FROM public.skills s WHERE s.id = sessions.skill_id AND s.user_id = auth.uid())` combined with `user_id = auth.uid()` (and same `WITH CHECK` on update if `skill_id` or `user_id` can change).

---

## 3. Table: `public.overrides`

**Columns** (placeholder per approved plan)

- `id` **uuid** PRIMARY KEY.
- `user_id` **uuid** NOT NULL REFERENCES `auth.users(id)` **ON DELETE CASCADE**.
- `kind` **text** NULL.
- `payload` **jsonb** NOT NULL DEFAULT `'{}'::jsonb`.
- `created_at` **timestamptz** NOT NULL DEFAULT `now()`.

**No `updated_at`**

- Not in approved schema; add in a future migration when override semantics are defined.

---

## 4. Indexes

Keep minimal and aligned with [docs/plans/vercel-supabase-auth-storage.md](docs/plans/vercel-supabase-auth-storage.md):

- `CREATE INDEX ... ON public.skills (user_id);`
- `CREATE INDEX ... ON public.sessions (user_id);`
- `CREATE INDEX ... ON public.sessions (user_id, started_at DESC);` (dashboard / timeline queries).
- `CREATE INDEX ... ON public.overrides (user_id);`
- Optional: `CREATE INDEX ... ON public.sessions (skill_id);` (cheap; helps joins by skill).

Use explicit index names, e.g. `skills_user_id_idx`, to avoid collisions.

---

## 5. Row Level Security (RLS)

**Enable RLS**

- `ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;` (and same for `sessions`, `overrides`).

**Policies (per table, four operations)**

Use one policy per command for clarity (Supabase UI-friendly), or consolidated policies—either is fine; **recommended**: separate policies named `skills_select_own`, `skills_insert_own`, etc.

**Pattern for `skills` and `overrides`**

- **SELECT**: `USING (user_id = auth.uid())`
- **INSERT**: `WITH CHECK (user_id = auth.uid())`
- **UPDATE**: `USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())`
- **DELETE**: `USING (user_id = auth.uid())`

**Pattern for `sessions`**

- **SELECT / DELETE**: `USING (user_id = auth.uid())`
- **INSERT**: `WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.skills s WHERE s.id = skill_id AND s.user_id = auth.uid()))`
- **UPDATE**: `USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.skills s WHERE s.id = skill_id AND s.user_id = auth.uid()))`

**Roles**

- Supabase: grant usage on `public` and table privileges to `**authenticated`** (and `service_role` inherits bypass—do not use service role in the browser). Do **not** grant broad write to `anon` for these tables if the app requires login for data (matches “only authenticated users” in the parent plan). If you need anonymous health checks, keep them off these tables.

**Note**: `anon` read policy is **not** added here; Phase 3+ auth will use JWT as `authenticated`.

---

## 6. Migration ordering inside the single file

1. `CREATE TABLE` **skills** first (referenced by sessions).
2. `CREATE TABLE` **sessions**.
3. `CREATE TABLE` **overrides**.
4. Indexes.
5. `CREATE OR REPLACE FUNCTION` + trigger for `skills.updated_at`.
6. `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`.
7. `CREATE POLICY` statements (skills, overrides, then sessions).
8. `GRANT` statements for `authenticated` (minimal: `SELECT, INSERT, UPDATE, DELETE` on these three tables only).

Use `IF NOT EXISTS` only where safe (indexes, extensions). Prefer **no** `IF NOT EXISTS` on tables/policies for first migration so mistakes fail loudly; second migrations can use defensive patterns.

---

## 7. Verification checklist (manual, after apply)

- Two Supabase test users A and B: as A, insert skill; as B, `SELECT` must not return A’s rows.
- As B, attempt `INSERT` into `sessions` with A’s `skill_id` and `user_id = B` must **fail** policy (even if FK exists).
- `priority` null allowed; values outside 1–4 rejected on `skills`.
- `minutes <= 0` rejected on `sessions`.
- Updating a skill bumps `updated_at` via trigger.

---

## 8. Risks / edge cases

- **Migrations on existing project**: if tables already exist from experiments, use a fresh migration name or `DROP` only in dev—never destructive SQL without confirmation.
- **Realtime / replication**: not in scope; RLS applies to PostgREST same as SQL editor with JWT.
- **jsonb schedule size**: large blobs are acceptable for v1; monitor later.

---

## 9. Rollback strategy

- Forward-only: add a new migration `..._rollback_core.sql` only if you must drop tables in non-prod; production rollback is redeploy + restore from backup (document in ops, not in this SQL).

---

## 10. Out of scope (later phases)

- `@supabase/supabase-js`, Vite env, sync layer, auth UI ([docs/plans/vercel-supabase-auth-storage.md](docs/plans/vercel-supabase-auth-storage.md) Phases 2+).

