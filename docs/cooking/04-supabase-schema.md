# Cooking Supabase Schema Proposal

Full table proposal following the conventions already used in `supabase/migrations/` (verified against `20260430190000_core_schema_rls.sql`, `20260527400000_fitness.sql`, `20260527200000_people.sql`).

## Conventions to follow (existing)

- snake_case, plural table names; uuid PK via `extensions.gen_random_uuid()`.
- Per-user tables: `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`.
- RLS enabled with **four policies** per table: `{table}_select_own`, `_insert_own`, `_update_own`, `_delete_own`, all `TO authenticated`, `USING (user_id = auth.uid())` and `WITH CHECK (user_id = auth.uid())` on writes.
- Constrained value sets use `CHECK (col IN (...))` on `text` columns (no Postgres ENUM types).
- Nested data as `jsonb` with `jsonb_typeof` shape checks; deep validation in TS mappers.
- `created_at`/`updated_at timestamptz`; `updated_at` maintained by a `BEFORE UPDATE` trigger (`set_{table}_updated_at`).
- `REVOKE ALL FROM PUBLIC, anon`; `GRANT SELECT, INSERT, UPDATE, DELETE TO authenticated`.
- Soft references (e.g. ids inside jsonb) validated in TS, not always FK-constrained.

## Migration plan (one migration per phase that needs schema)

| Migration (suggested name) | Phase | Adds |
| --- | --- | --- |
| `2026XXXX_cooking_recipes.sql` | 1 | `recipes` |
| `2026XXXX_cooking_sessions.sql` | 2 | `cooking_sessions` |
| `2026XXXX_cooking_calendar.sql` | 4 | `planned_cooks` (or reuse sessions) |
| `2026XXXX_cooking_ingredients.sql` | 7 | `ingredients`, `ingredient_aliases`, `user_pantry`, `pg_trgm` |
| `2026XXXX_cooking_nutrition.sql` | 8 | `ingredient_nutrients`, `retention_factors`, `custom_ingredients`, `fdc_id` cols |
| `2026XXXX_cooking_catalog.sql` | 10 | `recipe_catalog` |
| `2026XXXX_cooking_preferences.sql` | 2 or 6 | `cooking_preferences` (singleton) |

---

## Phase 1 — `recipes` (per-user)

```sql
CREATE TABLE public.recipes (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'dinner',
  difficulty text NOT NULL DEFAULT 'medium',
  experience_level text NOT NULL DEFAULT 'beginner',
  estimated_minutes integer NULL,         -- total cook time estimate
  servings integer NULL,
  notes text NULL,
  -- Structured content as jsonb (deep-validated in dbMappers.ts):
  ingredients jsonb NOT NULL DEFAULT '[]'::jsonb,  -- RecipeIngredientLine[]
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,         -- RecipeStep[]
  equipment jsonb NOT NULL DEFAULT '[]'::jsonb,     -- string[] or {name}[]
  -- Sanity image references (Phase 3; nullable until then):
  hero_image jsonb NULL,                            -- { assetRef, url, lqip? }
  gallery jsonb NOT NULL DEFAULT '[]'::jsonb,        -- image ref[]
  -- Provenance (Phase 9 / 10):
  source text NOT NULL DEFAULT 'manual',            -- manual | import | catalog
  catalog_recipe_id uuid NULL,                      -- if cloned from recipe_catalog (soft ref)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recipes_title_nonempty_chk CHECK (char_length(title) > 0),
  CONSTRAINT recipes_category_chk CHECK (category IN (
    'breakfast','lunch','dinner','dessert','snack','beverage','meal_prep'
  )),
  CONSTRAINT recipes_difficulty_chk CHECK (difficulty IN ('easy','medium','hard')),
  CONSTRAINT recipes_experience_chk CHECK (experience_level IN (
    'beginner','intermediate','advanced'
  )),
  CONSTRAINT recipes_servings_chk CHECK (servings IS NULL OR servings > 0),
  CONSTRAINT recipes_minutes_chk CHECK (estimated_minutes IS NULL OR estimated_minutes > 0),
  CONSTRAINT recipes_source_chk CHECK (source IN ('manual','import','catalog')),
  CONSTRAINT recipes_ingredients_array_chk CHECK (jsonb_typeof(ingredients) = 'array'),
  CONSTRAINT recipes_steps_array_chk CHECK (jsonb_typeof(steps) = 'array'),
  CONSTRAINT recipes_equipment_array_chk CHECK (jsonb_typeof(equipment) = 'array'),
  CONSTRAINT recipes_gallery_array_chk CHECK (jsonb_typeof(gallery) = 'array')
);

CREATE INDEX recipes_user_id_idx ON public.recipes (user_id);
CREATE INDEX recipes_user_id_category_idx ON public.recipes (user_id, category);
CREATE INDEX recipes_user_id_updated_at_idx ON public.recipes (user_id, updated_at DESC);
```

RLS (four-policy pattern), trigger, and grants identical to `skills`/`workout_plans`. `hero_image`/`gallery` columns may be added in the Phase 1 migration as nullable and remain unused until Phase 3 to avoid a later `ALTER`.

### jsonb shapes (validated in TS — see [`10-data-models.md`](10-data-models.md))

- `RecipeIngredientLine`: `{ id, rawText, quantity?, unit?, ingredientId?, matchConfidence?, optional? }`
- `RecipeStep`: `{ id, order, text, kind, blocksProgress, timerSeconds?, timerLabel?, canRunInBackground? }`

---

## Phase 2 — `cooking_sessions` (per-user activity log)

```sql
CREATE TABLE public.cooking_sessions (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  recipe_id uuid NULL REFERENCES public.recipes (id) ON DELETE SET NULL,
  -- recipe_id nullable so a deleted recipe keeps history (denormalized title below)
  recipe_title text NOT NULL,             -- snapshot at cook time (survives recipe deletion)
  status text NOT NULL DEFAULT 'completed', -- in_progress | completed | abandoned
  cook_date date NOT NULL,                -- local completion day (for calendar/XP dayKey)
  started_at timestamptz NULL,
  finished_at timestamptz NULL,
  duration_minutes integer NULL,
  servings_made integer NULL,
  notes text NULL,
  -- Guided session state (Phase 6); null for quick-logged cooks:
  current_step_index integer NULL,
  timers jsonb NOT NULL DEFAULT '[]'::jsonb,  -- CookingTimer[]
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cooking_sessions_title_nonempty_chk CHECK (char_length(recipe_title) > 0),
  CONSTRAINT cooking_sessions_status_chk CHECK (status IN ('in_progress','completed','abandoned')),
  CONSTRAINT cooking_sessions_duration_chk CHECK (duration_minutes IS NULL OR duration_minutes > 0),
  CONSTRAINT cooking_sessions_servings_chk CHECK (servings_made IS NULL OR servings_made > 0),
  CONSTRAINT cooking_sessions_timers_array_chk CHECK (jsonb_typeof(timers) = 'array')
);

CREATE INDEX cooking_sessions_user_id_cook_date_idx ON public.cooking_sessions (user_id, cook_date DESC);
CREATE INDEX cooking_sessions_user_id_recipe_id_idx ON public.cooking_sessions (user_id, recipe_id);
CREATE INDEX cooking_sessions_user_id_status_idx ON public.cooking_sessions (user_id, status);
```

RLS: standard four-policy on `user_id`. Optionally tighten INSERT/UPDATE to require `recipe_id` belong to the same user when not null (mirrors the `events → people` cross-table policy):

```sql
CREATE POLICY cooking_sessions_insert_own ON public.cooking_sessions
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      recipe_id IS NULL
      OR EXISTS (SELECT 1 FROM public.recipes r WHERE r.id = recipe_id AND r.user_id = auth.uid())
    )
  );
-- analogous cooking_sessions_update_own
```

XP/mastery are derived from these rows (never stored). At most one `in_progress` session per user is enforced in the app layer (and optionally a partial unique index).

---

## Phase 4 — planned cooks (calendar)

Two options; recommend Option A for simplicity.

- **Option A (recommended): reuse `cooking_sessions`** with `status: in_progress` + a future `cook_date` as "planned", and `status: completed` as "historical". A `planned`-specific status can be added: extend the CHECK to include `'planned'`.
- **Option B: dedicated `planned_cooks` table** (`recipe_id`, `planned_date`, `planned_minutes`, `notes`). Cleaner separation but more surface area.

If Option A, add to the status CHECK: `'planned'`, and treat `planned` future-dated rows as calendar plan items (see [`06-calendar-integration.md`](06-calendar-integration.md)).

---

## Phase 7 — ingredients, aliases, pantry (global + per-user)

Enable fuzzy matching:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
```

### `ingredients` (global, read-all-authenticated)

```sql
CREATE TABLE public.ingredients (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  canonical_name text NOT NULL UNIQUE,
  category text NULL,                     -- produce | dairy | protein | grain | spice | ...
  default_unit text NULL,                 -- g | ml | piece | cup | tbsp | ...
  density_g_per_ml numeric NULL,          -- for volume->gram conversion
  grams_per_piece numeric NULL,           -- for "1 bell pepper" -> grams
  fdc_id integer NULL,                    -- USDA FoodData Central id (Phase 8)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ingredients_name_nonempty_chk CHECK (char_length(canonical_name) > 0)
);

CREATE INDEX ingredients_name_trgm_idx ON public.ingredients USING gin (canonical_name extensions.gin_trgm_ops);
CREATE INDEX ingredients_fdc_id_idx ON public.ingredients (fdc_id);
```

### `ingredient_aliases` (global, read-all-authenticated)

```sql
CREATE TABLE public.ingredient_aliases (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  ingredient_id uuid NOT NULL REFERENCES public.ingredients (id) ON DELETE CASCADE,
  alias text NOT NULL,                    -- "flour tortilla", "green bell pepper", common misspellings
  alias_normalized text NOT NULL,        -- lowercased, singularized, stripped
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ingredient_aliases_alias_nonempty_chk CHECK (char_length(alias) > 0)
);

CREATE UNIQUE INDEX ingredient_aliases_normalized_uq ON public.ingredient_aliases (alias_normalized);
CREATE INDEX ingredient_aliases_norm_trgm_idx ON public.ingredient_aliases USING gin (alias_normalized extensions.gin_trgm_ops);
CREATE INDEX ingredient_aliases_ingredient_id_idx ON public.ingredient_aliases (ingredient_id);
```

### `user_pantry` (per-user)

```sql
CREATE TABLE public.user_pantry (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  ingredient_id uuid NULL REFERENCES public.ingredients (id) ON DELETE SET NULL,
  custom_ingredient_id uuid NULL,         -- soft ref to custom_ingredients (Phase 8)
  label text NOT NULL,                    -- display label / raw entry
  available boolean NOT NULL DEFAULT true,
  quantity numeric NULL,
  unit text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_pantry_label_nonempty_chk CHECK (char_length(label) > 0)
);

CREATE INDEX user_pantry_user_id_idx ON public.user_pantry (user_id);
CREATE INDEX user_pantry_user_id_ingredient_id_idx ON public.user_pantry (user_id, ingredient_id);
```

### Global table RLS (read-all-authenticated, no client writes)

```sql
ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;
CREATE POLICY ingredients_select_all ON public.ingredients
  FOR SELECT TO authenticated USING (true);
-- No INSERT/UPDATE/DELETE policies for authenticated => writes only via service role / seed migrations.
REVOKE ALL ON TABLE public.ingredients FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.ingredients TO authenticated;
-- Same pattern for ingredient_aliases, ingredient_nutrients, retention_factors, recipe_catalog.
```

`user_pantry` uses the standard four-policy per-user RLS.

---

## Phase 8 — nutrition tables

### `ingredient_nutrients` (global cache, read-all-authenticated)

```sql
CREATE TABLE public.ingredient_nutrients (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  ingredient_id uuid NOT NULL REFERENCES public.ingredients (id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'usda',    -- usda | off | custom
  fdc_id integer NULL,
  per_100g jsonb NOT NULL,                -- { kcal, protein_g, fat_g, carb_g, fiber_g, sugar_g, sodium_mg, ... }
  fetched_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ingredient_nutrients_source_chk CHECK (source IN ('usda','off','custom')),
  CONSTRAINT ingredient_nutrients_per100g_obj_chk CHECK (jsonb_typeof(per_100g) = 'object')
);

CREATE UNIQUE INDEX ingredient_nutrients_ingredient_source_uq
  ON public.ingredient_nutrients (ingredient_id, source);
```

### `retention_factors` (global, read-all-authenticated)

```sql
CREATE TABLE public.retention_factors (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  cooking_method text NOT NULL,           -- boil | bake | fry | saute | steam | grill | raw
  nutrient_key text NOT NULL,             -- vitamin_c | thiamin | ... (macros usually ~1.0)
  factor numeric NOT NULL,                -- 0..1 multiplier
  CONSTRAINT retention_factor_range_chk CHECK (factor >= 0 AND factor <= 1)
);

CREATE UNIQUE INDEX retention_factors_method_nutrient_uq
  ON public.retention_factors (cooking_method, nutrient_key);
```

### `custom_ingredients` (per-user)

```sql
CREATE TABLE public.custom_ingredients (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NULL,
  default_unit text NULL,
  density_g_per_ml numeric NULL,
  grams_per_piece numeric NULL,
  per_100g jsonb NULL,                    -- user-entered nutrition (optional)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT custom_ingredients_name_nonempty_chk CHECK (char_length(name) > 0)
);

CREATE INDEX custom_ingredients_user_id_idx ON public.custom_ingredients (user_id);
```

Standard four-policy RLS on `custom_ingredients`.

---

## Phase 10 — `recipe_catalog` (global curated content)

```sql
CREATE TABLE public.recipe_catalog (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL,
  difficulty text NOT NULL,
  experience_level text NOT NULL,
  estimated_minutes integer NULL,
  servings integer NULL,
  ingredients jsonb NOT NULL DEFAULT '[]'::jsonb,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  equipment jsonb NOT NULL DEFAULT '[]'::jsonb,
  hero_image jsonb NULL,                  -- Sanity asset ref
  gallery jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recipe_catalog_title_nonempty_chk CHECK (char_length(title) > 0),
  CONSTRAINT recipe_catalog_category_chk CHECK (category IN (
    'breakfast','lunch','dinner','dessert','snack','beverage','meal_prep'
  ))
);

CREATE INDEX recipe_catalog_category_idx ON public.recipe_catalog (category) WHERE is_published;
```

RLS: `recipe_catalog_select_published` → `FOR SELECT TO authenticated USING (is_published)`. No client write policies; seeded via migration/admin. Cloning copies a published catalog row into the user's `recipes` (with `source = 'catalog'`, `catalog_recipe_id` set).

---

## Phase 2/6 — `cooking_preferences` (singleton per user)

Mirror `calendar_preferences` / `gamification_state` singletons.

```sql
CREATE TABLE public.cooking_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,  -- dietary flags, default servings, unit system, etc.
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cooking_preferences_obj_chk CHECK (jsonb_typeof(preferences) = 'object')
);
```

Standard four-policy RLS keyed on `user_id`.

---

## `remoteStorage.ts` / `dbMappers.ts` integration

For every per-user table above:

1. Add a `*Row` type + `*ToRow`/`*FromRow` mappers + jsonb parsers in `dbMappers.ts`.
2. Add the table to the `AppTable` union and to `fetchRemotePayload` (parallel select) and `replaceRemotePayload` (upsert + orphan delete) in `remoteStorage.ts`.
3. Extend `AppPayload` and `defaultPayload()`; add `validatePayloadForUpload` rules.

Global/read-only tables (`ingredients`, `ingredient_aliases`, `ingredient_nutrients`, `retention_factors`, `recipe_catalog`) are **not** part of the per-user payload replace cycle — they are fetched separately (cached) and never written by the client.

## Summary of new tables

- Per-user: `recipes`, `cooking_sessions`, `user_pantry`, `custom_ingredients`, `cooking_preferences`.
- Global (read-only to client): `recipe_catalog`, `ingredients`, `ingredient_aliases`, `ingredient_nutrients`, `retention_factors`.
- New extension: `pg_trgm`.
