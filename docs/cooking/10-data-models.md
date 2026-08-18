# Cooking Data Models

Proposed TypeScript domain types for [`src/core/model.ts`](../../src/core/model.ts), following the camelCase + ISO-timestamp conventions already used by `Skill`, `Session`, `WorkoutPlan`, `WorkoutSession`, `LifeEvent`. These are mapped to/from snake_case Supabase rows in `dbMappers.ts` (see [`04-supabase-schema.md`](04-supabase-schema.md)).

> Phase annotations indicate when each type/field is introduced. Add fields incrementally to avoid premature complexity, but the shapes here are the target.

## 1. Enumerations / unions

```ts
export type RecipeCategory =
  | "breakfast"
  | "lunch"
  | "dinner"
  | "dessert"
  | "snack"
  | "beverage"
  | "meal_prep";

export type RecipeDifficulty = "easy" | "medium" | "hard";

export type RecipeExperienceLevel = "beginner" | "intermediate" | "advanced";

export type RecipeSource = "manual" | "import" | "catalog";

export type CookingMethod =
  | "boil" | "bake" | "fry" | "saute" | "steam" | "grill" | "raw" | "other";
```

## 2. Recipe (Phase 1; image fields Phase 3)

```ts
export type SanityImageRef = {
  assetRef: string;      // Sanity asset _ref
  url: string;           // CDN url fallback
  lqip?: string;
  width?: number;
  height?: number;
  alt?: string;
};

export type RecipeIngredientLine = {
  id: string;
  rawText: string;            // verbatim line (always present)
  quantity?: number;          // parsed (Phase 7)
  unit?: string;              // parsed (Phase 7)
  ingredientId?: string;      // resolved canonical ingredient (Phase 7)
  customIngredientId?: string;// resolved custom ingredient (Phase 8)
  matchConfidence?: number;   // 0..1 (Phase 7)
  optional?: boolean;
};

export type RecipeStepKind = "blocking" | "parallel" | "wait" | "timer";

export type RecipeStep = {
  id: string;
  order: number;
  text: string;
  kind: RecipeStepKind;            // Phase 6 (defaults to "blocking" pre-Phase-6)
  blocksProgress: boolean;         // Phase 6
  timerSeconds?: number;           // Phase 6
  timerLabel?: string;             // Phase 6
  canRunInBackground?: boolean;    // Phase 6
};

export type Recipe = {
  id: string;
  title: string;
  category: RecipeCategory;
  difficulty: RecipeDifficulty;
  experienceLevel: RecipeExperienceLevel;
  estimatedMinutes?: number;
  servings?: number;
  notes?: string;
  ingredients: RecipeIngredientLine[];
  steps: RecipeStep[];
  equipment: string[];
  cookingMethod?: CookingMethod;   // Phase 8 (nutrition retention)
  heroImage?: SanityImageRef;      // Phase 3
  gallery: SanityImageRef[];       // Phase 3
  source: RecipeSource;
  catalogRecipeId?: string;        // Phase 10 (if cloned)
  createdAtIso: string;
  updatedAtIso: string;
};
```

## 3. Cooking session + timers (Phase 2; guided fields Phase 6)

```ts
export type CookingSessionStatus = "planned" | "in_progress" | "completed" | "abandoned";

export type CookingTimerStatus = "idle" | "running" | "paused" | "done";

export type CookingTimer = {
  id: string;
  stepId?: string;
  label: string;
  durationSeconds: number;
  status: CookingTimerStatus;
  endsAtIso?: string;                 // running: remaining = endsAt - now
  remainingSecondsAtPause?: number;   // paused
  startedAtIso?: string;
};

export type CookingSession = {
  id: string;
  recipeId: string | null;     // null preserves history if recipe deleted
  recipeTitle: string;         // snapshot at cook time
  status: CookingSessionStatus;
  cookDate: string;            // local YYYY-MM-DD
  startedAtIso?: string;
  finishedAtIso?: string;
  durationMinutes?: number;
  servingsMade?: number;
  notes?: string;
  // Guided mode (Phase 6); absent for quick-logged cooks:
  currentStepIndex?: number;
  timers: CookingTimer[];
  createdAtIso: string;
  updatedAtIso: string;
};
```

## 4. Mastery (derived; Phase 2)

Mastery is computed, not stored. These are view types produced by `src/core/cooking.ts`.

```ts
export type RecipeMasteryTier = 1 | 2 | 3 | 4 | 5 | 6; // Novice..Master

export type RecipeMasteryView = {
  recipeId: string;
  completionCount: number;       // completed sessions
  tier: RecipeMasteryTier | null;// null when never cooked
  tierName: string;              // "Novice" ... "Master"
  recentWeekStreak: number;      // consecutive ISO weeks with >=1 completion
  lifetimeXp: number;            // recipe:{id} track total
  level: number;                 // from levelFromTotalXp
};
```

## 5. Ingredients & pantry (Phase 7)

```ts
export type Ingredient = {
  id: string;
  canonicalName: string;
  category?: string;
  defaultUnit?: string;
  densityGPerMl?: number;
  gramsPerPiece?: number;
  fdcId?: number;                // Phase 8
};

export type IngredientAlias = {
  id: string;
  ingredientId: string;
  alias: string;
  aliasNormalized: string;
};

export type PantryItem = {
  id: string;
  ingredientId?: string;
  customIngredientId?: string;   // Phase 8
  label: string;
  available: boolean;
  quantity?: number;
  unit?: string;
  createdAtIso: string;
  updatedAtIso: string;
};

export type RecipeAvailability = "can_make" | "partial" | "missing";

export type IngredientMatch = {
  ingredientId: string;
  confidence: number;            // 0..1
  matchedVia: "alias" | "canonical" | "fuzzy";
};
```

## 6. Nutrition (Phase 8)

```ts
export type Per100g = {
  kcal: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  fiberG?: number;
  sugarG?: number;
  sodiumMg?: number;
};

export type IngredientNutrients = {
  id: string;
  ingredientId: string;
  source: "usda" | "off" | "custom";
  fdcId?: number;
  per100g: Per100g;
  fetchedAtIso: string;
};

export type CustomIngredient = {
  id: string;
  name: string;
  category?: string;
  defaultUnit?: string;
  densityGPerMl?: number;
  gramsPerPiece?: number;
  per100g?: Per100g;
  createdAtIso: string;
  updatedAtIso: string;
};

export type RecipeNutrition = {
  recipeId: string;
  total: Per100g;          // summed (name reused; values are absolute totals)
  perServing: Per100g;
  confidence: number;      // 0..1 aggregate
  unresolvedLineIds: string[];
};
```

## 7. Assisted import (Phase 9)

```ts
export type ExtractedRecipe = {
  title: string | null;
  servings: number | null;
  cookTimeMinutes: number | null;
  ingredients: Array<{ rawText: string; quantity: number | null; unit: string | null; name: string | null }>;
  steps: Array<{ order: number; text: string }>;
  equipment: string[];
  notes: string | null;
};

export type RecipeImportDraft = {
  recipe: Partial<Recipe>;          // pre-filled, editable
  fieldConfidence: Record<string, number>; // per-field extraction confidence
  unresolvedIngredientLineIds: string[];
};
```

## 8. Preferences (singleton; Phase 2/6)

```ts
export type CookingPreferences = {
  unitSystem?: "metric" | "imperial";
  defaultServings?: number;
  dietaryFlags?: string[];          // vegetarian, vegan, gluten_free, ...
  // extensible
};
```

## 9. AppPayload extensions

Extend the aggregate in `model.ts` and `defaultPayload()`:

```ts
export type AppPayload = {
  // ...existing fields...
  recipes: Recipe[];                 // Phase 1
  cookingSessions: CookingSession[]; // Phase 2
  pantry: PantryItem[];              // Phase 7
  customIngredients: CustomIngredient[]; // Phase 8
  cookingPreferences?: CookingPreferences; // Phase 2/6
};
```

Global read-only datasets (`ingredients`, `ingredientAliases`, `ingredientNutrients`, `retentionFactors`, `recipeCatalog`) are **not** part of `AppPayload` (not user-owned, not in the replace cycle). They are fetched and cached separately (e.g. a `useCookingReferenceData` hook backed by Supabase + in-memory/localStorage cache).

## 10. Progression model additions (Phase 2)

In [`src/core/progressionModel.ts`](../../src/core/progressionModel.ts):

```ts
export type ProgressionTrackKind = "global" | "axis" | "skill" | "recipe"; // + recipe
export type ProgressionTrackId =
  | "global"
  | `axis:${ProgressionAxis}`
  | `skill:${string}`
  | `recipe:${string}`; // + recipe track

export type AchievementCategory =
  | "consistency" | "milestones" | "fitness" | "learning" | "social" | "career"
  | "cooking"; // + cooking

// new RewardSource values: "cooking_first_cook" | "cooking_repeat" | "cooking_home_meal" | "cooking_mastery_tier_up"
// new AchievementCondition kinds: recipes_cooked_gte, distinct_recipes_cooked_gte, recipe_mastery_tier_gte, home_cooked_week_streak_gte
```

See [`03-progression-design.md`](03-progression-design.md) and [`11-integration-points.md`](11-integration-points.md) for exact wiring.
