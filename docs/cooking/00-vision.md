# Cooking Vision Document

## 1. Vision statement

Cooking becomes a first-class life domain in Personal Assistant — on equal footing with Skills, Fitness, Career, Events, and People. It treats cooking as a **real, practiced skill**: users build a recipe library, cook meals, master recipes through repetition, and are rewarded (with XP and progression) for cooking at home rather than eating out.

Cooking is not a recipe bookmarking tool. It is a **progression system** where the act of cooking — not collecting recipes — is what counts.

## 2. Core philosophy

### Cooking is a skill that is practiced, not collected

- **Adding a recipe grants 0 XP.** A recipe in your library is potential, not achievement.
- **Cooking a recipe grants XP.** Completing a cooking session is the rewarded action.
- **First-time mastery is worth more than repetition.** Cooking a recipe for the first time grants a large bonus. Repeating it grants diminishing XP — but never zero, because consistency and home-cooking are themselves the goal.
- **Repetition builds mastery.** Each recipe has its own mastery progression driven by completion count. Cooking the same dish 50 times makes you a master of it.

### Encourage cooking at home over eating out

The secondary `body`-axis grant (see [`03-progression-design.md`](03-progression-design.md)) exists specifically to reward the health/lifestyle behavior of preparing food at home. The system should make cooking feel rewarding, low-friction, and worth choosing over takeout.

## 3. What Cooking is (in scope)

- A dedicated **Cooking page** with a recipe gallery (thumbnail, title, cook time, category, difficulty, experience level) supporting filter and sort.
- A **recipe detail view**: hero image + optional gallery, cook time, servings, difficulty, ingredients, equipment, nutrition summary, cooking-XP info, mastery level, cooking history, recent attempts, notes, Edit and Start Cooking buttons.
- **Recipe mastery**: per-recipe level/badge, completion count, recent completion streak.
- **Two creation methods**: assisted import (camera OCR / image upload / paste text → drafted recipe for review) and manual entry.
- **Guided cooking mode**: step-by-step execution with multiple persistent timers that survive refresh and device changes.
- **Calendar integration**: planned cooking events and historical cooking records.
- **Ingredient awareness**: normalized ingredients, pantry tracking, and "can I make this now?" matching.
- **Nutrition**: per-recipe and per-serving nutrition from USDA FoodData Central.
- Deep integration with **progression/XP, calendar, notifications, dashboard, achievements, analytics**, and a clear path to **future AI** features.

## 4. What Cooking is NOT (non-goals)

- Not a social/shared recipe network (no following other users, comments, or ratings) in the initial vision.
- Not a grocery delivery or e-commerce integration.
- Not a full meal-planning auto-scheduler in early phases (it is a future AI opportunity — see [`13-future-ai.md`](13-future-ai.md)).
- Not a clone of the entire USDA database into the frontend — only used ingredients are cached.
- Not a replacement for the existing `EventType` system — Cooking is its own calendar category.

## 5. Guiding principles (aligned with the existing codebase)

These mirror the conventions documented in [`docs/architecture.md`](../architecture.md):

1. **Pure core, dumb UI.** All cooking logic (XP, mastery, matching, nutrition, timer math) lives in pure, unit-tested `src/core/*.ts` modules. React components receive DTOs.
2. **Derived gamification.** XP, mastery, and achievements are recomputed from domain truth (cooking sessions), never persisted as denormalized totals — matching how Skills/Fitness XP works today.
3. **Per-user data with RLS.** Every per-user table follows the 4-policy RLS pattern keyed on `auth.uid()`.
4. **Small, shippable phases.** Each phase delivers user value, has tests, and can ship independently.
5. **Secrets never touch the client.** OCR, USDA, and Sanity write operations go through server-side Edge Functions.
6. **Graceful degradation.** Cooking works without images (Sanity optional), without nutrition (USDA optional), and offline-first via localStorage with Supabase sync.

## 6. Success criteria for the domain

The Cooking domain is "done" (vision-complete) when a user can:

1. Build a personal recipe library (manual + assisted import) with images.
2. Browse/filter/sort recipes and see which ones they can make now from their pantry.
3. Start a guided cook with reliable multi-timer support that survives refresh and device changes.
4. Complete a cook and earn XP that flows into the `creative` (and partially `body`) axis and recipe mastery.
5. See cooking on the calendar (planned and historical), on the dashboard, in achievements, and in the weekly review.
6. View per-serving nutrition for recipes with resolved ingredients.

## 7. Relationship to existing domains

| Existing domain | Closest analogy for Cooking |
| --- | --- |
| Fitness (`WorkoutPlan` + `WorkoutSession`) | **Primary template**: `Recipe` (template) + `CookingSession` (log) |
| Skills (`skill:{id}` XP track) | `recipe:{id}` mastery XP track |
| Career (`job_applications` status pipeline + embedded `interviews` jsonb) | Embedded `steps[]`/`ingredients[]` jsonb on recipes |
| Events / Calendar | New `cooking` calendar category (planned + historical) |
| People | Pantry/ingredient reference data style |
