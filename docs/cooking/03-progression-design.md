# Cooking Progression Design

How Cooking earns XP, where that XP goes, and how recipe mastery works. This builds on the existing grant-based progression engine.

## 1. Existing engine (recap)

- Five RPG axes in [`src/core/progressionModel.ts`](../../src/core/progressionModel.ts): `mind | body | career | social | creative`.
- XP is emitted as `XpGrant` records by [`src/core/rewardCalculation.ts`](../../src/core/rewardCalculation.ts), aggregated into per-track totals by [`src/core/progressionEngine.ts`](../../src/core/progressionEngine.ts), and never persisted (recomputed each render).
- Tracks: `global`, `axis:{axis}`, `skill:{id}`. Linear level bands of 60 XP (`XP_PER_LEVEL_BAND_GLOBAL`).
- Bonus amounts centralized in [`src/core/milestoneTables.ts`](../../src/core/milestoneTables.ts) (`BONUS_XP`, `MAX_BONUS_XP_PER_DAY = 200`).
- The `creative` axis is defined but **no grant source targets it today** — it sits at level 1 / 0 XP.

## 2. Axis decision: B+ (creative primary, body secondary) — NOT a 6th axis

### The question

Should Cooking be (A) a new standalone axis, or (B) contribute partially to Body + Creative?

### Recommendation: B+

Route Cooking XP **primarily to `creative`** with a **smaller secondary grant to `body`**. Do not add a 6th axis.

### Rationale

- **Low blast radius.** `ProgressionAxis` is consumed across ~10 files plus a 5-axis dashboard grid (`ProgressionAxisRow`), achievement `axis` tags, and quest metadata. A 6th axis touches all of them and breaks layout assumptions. The 5-axis RPG model is a clean canonical set.
- **`creative` is empty and waiting.** It currently has zero XP sources. Cooking is the natural flagship contributor — recipe creation, technique, plating, and improvisation are genuinely creative.
- **`body` reflects the health behavior.** Cooking at home (vs eating out) is a nutrition/lifestyle behavior. A secondary `body` grant rewards exactly the behavior the vision wants to encourage.
- **Semantically honest.** Cooking is both a creative craft and a health habit; the split mirrors reality better than a single new axis.

### Routing

- **Primary**: `axis:creative` receives the bulk of cooking XP.
- **Secondary**: `axis:body` receives a flat "home-cooked meal" bonus per completed session (smaller, fixed) to reward cooking frequency at home.
- **Per-recipe**: a new `recipe:{id}` track (see below) accumulates that recipe's lifetime cooking XP for recipe-level levels.

> Note: in the current engine, an `axis:{x}` grant rolls into that axis + global; a `skill:{id}` grant rolls into skill + routed axis + global. The new `recipe:{id}` track will roll into `creative` (its routed axis) + global, plus the separate flat `body` grant. Implementation detail captured in [`11-integration-points.md`](11-integration-points.md).

## 3. New progression track: `recipe:{id}`

Add a new `ProgressionTrackKind` value `recipe` and track id pattern `recipe:{recipeId}`, parallel to `skill:{id}`.

- Each recipe accumulates lifetime cooking XP on its own track → an independent recipe **level** (same linear band math via `levelFromTotalXp`).
- The recipe track is routed to the `creative` axis for axis roll-up.
- This is distinct from the **mastery tier** (count-based, below). The XP level and the mastery tier are two complementary signals; mastery tier is the headline badge, the XP level is the underlying progression bar.

## 4. XP rules (hard constraints)

1. **Creating/adding a recipe = 0 XP.** Never grant XP for library growth. Only `cooking_sessions` produce grants.
2. **A completed cooking session grants XP.** Sessions with `status: completed` (and a valid completion) emit grants. In-progress sessions grant nothing.
3. **First-time mastery > repetition.** The first-ever completion of a recipe grants a large `first_cook` bonus.
4. **Repeats diminish but never hit zero.** Each subsequent completion grants diminishing XP, floored at a minimum.
5. **Tier-up bonus.** Crossing a mastery tier grants a one-time bonus.
6. **Daily bonus cap applies.** All cooking bonus grants carry a `dayKey` and respect the existing `MAX_BONUS_XP_PER_DAY` (200) cap, except — consistent with skills — we may exempt a small base amount; default is to keep cooking fully within the cap to prevent farming.

## 5. XP curve (concrete proposal)

Add to `milestoneTables.ts` (`BONUS_XP` extension):

```ts
// Cooking XP constants (proposal)
export const COOKING_XP = {
  firstCook: 50,          // first-ever completion of a recipe (to recipe track + creative)
  homeCookedMeal: 10,     // flat body-axis grant per completed session
  repeatBase: 30,         // base for diminishing repeat curve
  repeatMin: 5,           // floor for repeats (never zero)
  masteryTierUp: 40,      // one-time bonus when crossing a mastery tier
} as const;
```

Diminishing-repeat formula (deterministic, testable). Let `n` = number of prior completions of this recipe (so the first cook has `n = 0`):

```
xpForCompletion(n):
  if n == 0:            return COOKING_XP.firstCook                    // first cook
  repeatXp = round(COOKING_XP.repeatBase / (1 + ln(1 + n)))           // smooth decay
  return max(COOKING_XP.repeatMin, repeatXp)                           // floored, never zero
```

Worked values (`repeatBase = 30`, `repeatMin = 5`):

- Cook 1 (n=0): 50 (first cook)
- Cook 2 (n=1): round(30 / 1.693) = 18
- Cook 3 (n=2): round(30 / 2.099) = 14
- Cook 5 (n=4): round(30 / 2.609) = 11
- Cook 10 (n=9): round(30 / 3.398) = 9
- Cook 25 (n=24): round(30 / 4.258) = 7
- Cook 50 (n=49): round(30 / 4.913) = 6
- Cook 100+ : floored at 5

Per completed session, grants emitted:

- `cooking_first_cook` or `cooking_repeat` → `recipe:{id}` track (rolls into `creative` + global).
- `cooking_home_meal` (flat `homeCookedMeal`) → `axis:body`.
- `cooking_mastery_tier_up` (when a tier boundary is crossed) → `recipe:{id}` (or `global`).

All carry `dayKey` = the session's completion local day.

## 6. Recipe mastery tiers

Mastery measures **familiarity through repetition**, so it is **count-based** (number of completed cooks of that recipe), independent of the XP curve. This is deterministic and recomputed from `cooking_sessions`, matching the engine's "derive from truth" philosophy.

### Recommended tiers (refines the proposed 5-level scheme)

Six tiers, so the very first cook already feels meaningful:

| Tier | Completions | Badge name |
| --- | --- | --- |
| 1 | 1-2 | Novice |
| 2 | 3-9 | Practiced |
| 3 | 10-24 | Proficient |
| 4 | 25-49 | Skilled |
| 5 | 50-99 | Expert |
| 6 | 100+ | Master |

> The original proposal (L1 0-9, L2 10-24, L3 25-49, L4 50-99, L5 100+) is workable, but splitting the bottom band (1-2 vs 3-9) gives early, frequent positive feedback, which better serves the "encourage cooking" goal. A recipe with 0 completions has no mastery tier (it is "not yet cooked").

### Display (recipe detail + cards)

- **Mastery badge** (tier name + tier number).
- **Completion count** (lifetime).
- **Recent completion streak**: consecutive distinct cook-periods. Recommend weekly granularity for cooking (consecutive ISO weeks with ≥1 completion of that recipe) since daily repeats of the same dish are rare. Display as "cooked 4 weeks running".

## 7. Achievements & quests (cooking)

Add a `cooking` `AchievementCategory` and new `AchievementCondition` kinds, evaluated in `achievementEngine.ts` from metrics exposed in `progressionContext.ts`:

- `recipes_cooked_gte` (total completed sessions)
- `distinct_recipes_cooked_gte` (unique recipes cooked)
- `recipe_mastery_tier_gte` (any recipe reaches tier N)
- `home_cooked_week_streak_gte` (consecutive weeks cooking at home)
- `recipes_with_nutrition_gte` (post-P8)

Example catalog entries:

- "First Cook" (bronze): `recipes_cooked_gte: 1`, axis `creative`, grantXp 0 (the first_cook grant already covers XP).
- "Home Chef" (silver): `distinct_recipes_cooked_gte: 10`.
- "Master of One" (gold): `recipe_mastery_tier_gte: 6`.

Quests (in `questCatalog.ts`): e.g. weekly "Cook 3 home meals" → `axis: creative` reward.

## 8. Anti-abuse considerations

- XP only from `completed` sessions; a completion requires start/finish times (defaulted from estimated duration).
- Repeat decay + daily bonus cap prevent farming by logging the same recipe many times in one day.
- Mastery is count-based but the per-completion XP is decayed, so grinding gives mastery tiers without runaway XP.
- Consider (future) a soft per-recipe daily completion cap if abuse appears; not needed for v1.

## 9. Testing checklist (Phase 2)

- `xpForCompletion(n)` matches the worked table; floor never returns < `repeatMin`; first cook returns `firstCook`.
- Mastery tier boundaries (0→none, 1→Novice, 2→Novice, 3→Practiced, ... 100→Master).
- Tier-up bonus emitted exactly once per boundary crossing across a session history.
- `creative` axis and `recipe:{id}` track totals reflect grants; `body` receives the flat home-meal grant.
- Adding a recipe with no sessions yields 0 cooking XP.
- Daily bonus cap interaction with `cooking_*` grants.
