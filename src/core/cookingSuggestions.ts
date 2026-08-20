/**
 * Rule-based cooking suggestions and AI-ready data shapes.
 *
 * Advisory only: callers must confirm before saving recipes or scheduling cooks.
 * LLM ranking can wrap these DTOs later (see docs/cooking/13-future-ai.md).
 */

import {
  listCompletedCookingSessions,
  listCompletedCookingSessionsInRange,
  listFirstCookSessionsInRange,
  listPlannedCookingSessions,
} from "./cooking";
import type { IngredientCatalog, IndexedIngredientCatalog } from "./ingredientCatalog";
import {
  computeRecipeAvailability,
  ingredientLineLabel,
  listMissingIngredientLines,
  matchIngredient,
  pantryIsInUse,
  resolvedIngredientIdForLine,
} from "./ingredients";
import {
  addPer100g,
  emptyPer100g,
  roundNutrition,
  scaleNutrients,
} from "./nutrition";
import type {
  CookingSession,
  PantryItem,
  Per100g,
  Recipe,
  RecipeAvailability,
  RecipeCategory,
  RecipeIngredientLine,
  RecipeNutrition,
} from "./model";
import { iterateDateRange } from "./timeline";

export const COOKING_SUGGESTION_LIMIT = 5;
export const MEAL_PLAN_MAX_MISSING = 2;
export const NUTRITION_PROTEIN_NUDGE_PER_COOK_G = 20;
export const NUTRITION_HOME_COOK_DAYS_WIN = 5;

export type SubstitutionCandidate = {
  pantryItemId: string;
  pantryLabel: string;
  ingredientId?: string;
  reason: string;
};

export type SubstitutionSuggestion = {
  recipeId: string;
  missingLineId: string;
  missingLabel: string;
  candidates: SubstitutionCandidate[];
};

export type PantryRecipeSuggestion = {
  recipeId: string;
  recipeTitle: string;
  category: RecipeCategory;
  availability: RecipeAvailability;
  missingIngredientLabels: string[];
  substitutionHints: SubstitutionSuggestion[];
  estimatedMinutes?: number;
  reason: string;
};

export type MealPlanSlot = {
  dateKey: string;
  recipeId: string;
  recipeTitle: string;
  category: RecipeCategory;
  availability: RecipeAvailability;
  missingIngredientLabels: string[];
  estimatedMinutes?: number;
};

export type MealPlanDraft = {
  weekStartKey: string;
  weekEndKey: string;
  slots: MealPlanSlot[];
  skippedDateKeys: string[];
  notes: string[];
};

export type NutritionCoachingInsight = {
  kind: "home_cook_days" | "protein" | "variety" | "kcal";
  tone: "win" | "nudge";
  message: string;
};

export type WeeklyCookedNutrition = {
  cooksWithNutrition: number;
  total: Per100g;
  perCook: Per100g;
  confidenceMean: number;
};

export type SuggestRecipesFromPantryInput = {
  recipes: readonly Recipe[];
  pantry: readonly PantryItem[];
  catalog?: IngredientCatalog | IndexedIngredientCatalog;
  limit?: number;
  includeMissing?: boolean;
};

export type DraftWeeklyMealPlanInput = {
  recipes: readonly Recipe[];
  cookingSessions: readonly CookingSession[];
  pantry: readonly PantryItem[];
  weekStartKey: string;
  weekEndKey: string;
  catalog?: IngredientCatalog | IndexedIngredientCatalog;
};

function catalogIngredient(
  ingredientId: string | undefined,
  catalog?: IngredientCatalog | IndexedIngredientCatalog
) {
  if (!ingredientId || !catalog) return undefined;
  const ingredients = "byId" in catalog ? [...catalog.byId.values()] : catalog.ingredients;
  return ingredients.find((item) => item.id === ingredientId);
}

function missingLabels(
  recipe: Recipe,
  pantry: readonly PantryItem[],
  catalog?: IngredientCatalog | IndexedIngredientCatalog
): string[] {
  return listMissingIngredientLines(recipe, pantry, catalog).map(ingredientLineLabel);
}

function recipeIngredientIds(recipe: Recipe): Set<string> {
  const ids = new Set<string>();
  for (const line of recipe.ingredients) {
    if (line.ingredientId) ids.add(line.ingredientId);
  }
  return ids;
}

export function suggestSubstitutionsForLine(
  recipe: Recipe,
  line: RecipeIngredientLine,
  pantry: readonly PantryItem[],
  catalog?: IngredientCatalog | IndexedIngredientCatalog
): SubstitutionSuggestion {
  const missingLabel = ingredientLineLabel(line);
  const missingId = resolvedIngredientIdForLine(line, catalog);
  const missingIngredient = catalogIngredient(missingId, catalog);
  const usedIds = recipeIngredientIds(recipe);
  const candidates: SubstitutionCandidate[] = [];

  if (!missingIngredient?.category || !catalog) {
    return {
      recipeId: recipe.id,
      missingLineId: line.id,
      missingLabel,
      candidates,
    };
  }

  for (const item of pantry) {
    if (!item.available) continue;
    const pantryId =
      item.ingredientId ?? matchIngredient(item.label, catalog)?.ingredientId;
    if (!pantryId || pantryId === missingId || usedIds.has(pantryId)) continue;
    const pantryIngredient = catalogIngredient(pantryId, catalog);
    if (!pantryIngredient?.category) continue;
    if (pantryIngredient.category !== missingIngredient.category) continue;
    candidates.push({
      pantryItemId: item.id,
      pantryLabel: item.label,
      ingredientId: pantryId,
      reason: `Same category (${pantryIngredient.category}) as ${missingLabel}`,
    });
  }

  return {
    recipeId: recipe.id,
    missingLineId: line.id,
    missingLabel,
    candidates,
  };
}

export function suggestSubstitutionsForRecipe(
  recipe: Recipe,
  pantry: readonly PantryItem[],
  catalog?: IngredientCatalog | IndexedIngredientCatalog
): SubstitutionSuggestion[] {
  return listMissingIngredientLines(recipe, pantry, catalog)
    .map((line) => suggestSubstitutionsForLine(recipe, line, pantry, catalog))
    .filter((item) => item.candidates.length > 0);
}

function suggestionReason(
  availability: RecipeAvailability,
  missing: string[],
  substitutions: SubstitutionSuggestion[]
): string {
  if (availability === "can_make") return "Everything is in the pantry.";
  if (missing.length === 0) return "Mostly in the pantry.";
  const missingClause =
    missing.length === 1 ? `Missing ${missing[0]}` : `Missing ${missing.length} ingredients`;
  const swap = substitutions[0]?.candidates[0];
  if (swap) return `${missingClause}; try ${swap.pantryLabel}.`;
  return `${missingClause}.`;
}

export function suggestRecipesFromPantry(
  input: SuggestRecipesFromPantryInput
): PantryRecipeSuggestion[] {
  const { recipes, pantry, catalog, includeMissing = false } = input;
  const limit = Math.max(0, input.limit ?? COOKING_SUGGESTION_LIMIT);
  if (limit === 0 || recipes.length === 0 || !pantryIsInUse(pantry)) return [];

  const ranked: PantryRecipeSuggestion[] = [];
  for (const recipe of recipes) {
    const availability = computeRecipeAvailability(recipe, pantry, catalog);
    if (availability === "missing" && !includeMissing) continue;
    const missingIngredientLabels = missingLabels(recipe, pantry, catalog);
    const substitutionHints = suggestSubstitutionsForRecipe(recipe, pantry, catalog);
    ranked.push({
      recipeId: recipe.id,
      recipeTitle: recipe.title,
      category: recipe.category,
      availability,
      missingIngredientLabels,
      substitutionHints,
      estimatedMinutes: recipe.estimatedMinutes,
      reason: suggestionReason(availability, missingIngredientLabels, substitutionHints),
    });
  }

  const availabilityRank: Record<RecipeAvailability, number> = {
    can_make: 0,
    partial: 1,
    missing: 2,
  };

  ranked.sort((a, b) => {
    const byAvailability = availabilityRank[a.availability] - availabilityRank[b.availability];
    if (byAvailability !== 0) return byAvailability;
    const byMissing = a.missingIngredientLabels.length - b.missingIngredientLabels.length;
    if (byMissing !== 0) return byMissing;
    const byTime = (a.estimatedMinutes ?? 999) - (b.estimatedMinutes ?? 999);
    if (byTime !== 0) return byTime;
    return a.recipeTitle.localeCompare(b.recipeTitle);
  });

  return ranked.slice(0, limit);
}

function lastCookedDateByRecipeId(sessions: readonly CookingSession[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const session of listCompletedCookingSessions([...sessions])) {
    if (!session.recipeId) continue;
    map.set(session.recipeId, session.cookDate);
  }
  return map;
}

function occupiedCookDates(
  sessions: readonly CookingSession[],
  startKey: string,
  endKey: string
): Set<string> {
  const occupied = new Set<string>();
  for (const session of sessions) {
    if (session.status === "abandoned") continue;
    if (session.cookDate < startKey || session.cookDate > endKey) continue;
    occupied.add(session.cookDate);
  }
  return occupied;
}

function mealPlanScore(
  suggestion: PantryRecipeSuggestion,
  lastCooked: string | undefined,
  usedRecipeIds: Set<string>
): number {
  let score = 0;
  if (suggestion.availability === "can_make") score += 100;
  else if (suggestion.availability === "partial") {
    score += 50 - suggestion.missingIngredientLabels.length * 8;
  }
  if (suggestion.category === "dinner") score += 8;
  if (suggestion.category === "meal_prep") score += 4;
  if (!usedRecipeIds.has(suggestion.recipeId)) score += 12;
  if (!lastCooked) score += 6;
  if (suggestion.estimatedMinutes !== undefined && suggestion.estimatedMinutes <= 30) score += 3;
  return score;
}

export function draftWeeklyMealPlan(input: DraftWeeklyMealPlanInput): MealPlanDraft {
  const { recipes, cookingSessions, pantry, weekStartKey, weekEndKey, catalog } = input;
  const notes: string[] = [];
  const occupied = occupiedCookDates(cookingSessions, weekStartKey, weekEndKey);
  const lastCooked = lastCookedDateByRecipeId(cookingSessions);
  const candidates = suggestRecipesFromPantry({
    recipes,
    pantry,
    catalog,
    limit: recipes.length,
    includeMissing: false,
  }).filter((item) => item.missingIngredientLabels.length <= MEAL_PLAN_MAX_MISSING);

  const dateKeys = iterateDateRange(weekStartKey, weekEndKey);
  const skippedDateKeys = dateKeys.filter((dateKey) => occupied.has(dateKey));
  const openDateKeys = dateKeys.filter((dateKey) => !occupied.has(dateKey));
  const usedRecipeIds = new Set<string>();
  const slots: MealPlanSlot[] = [];

  if (candidates.length === 0) {
    notes.push("No pantry-friendly recipes to schedule — add pantry items or resolve ingredients.");
    return { weekStartKey, weekEndKey, slots, skippedDateKeys, notes };
  }

  for (const dateKey of openDateKeys) {
    const next = [...candidates].sort((a, b) => {
      const scoreDiff =
        mealPlanScore(b, lastCooked.get(b.recipeId), usedRecipeIds) -
        mealPlanScore(a, lastCooked.get(a.recipeId), usedRecipeIds);
      if (scoreDiff !== 0) return scoreDiff;
      return a.recipeTitle.localeCompare(b.recipeTitle);
    })[0];
    if (!next) break;
    usedRecipeIds.add(next.recipeId);
    slots.push({
      dateKey,
      recipeId: next.recipeId,
      recipeTitle: next.recipeTitle,
      category: next.category,
      availability: next.availability,
      missingIngredientLabels: next.missingIngredientLabels,
      estimatedMinutes: next.estimatedMinutes,
    });
  }

  if (skippedDateKeys.length > 0) {
    notes.push(
      `${skippedDateKeys.length} day${skippedDateKeys.length === 1 ? "" : "s"} already have a cook planned or logged.`
    );
  }
  notes.push("Advisory draft — schedule each cook yourself; nothing is saved automatically.");

  return { weekStartKey, weekEndKey, slots, skippedDateKeys, notes };
}

export function aggregateCookedNutrition(
  sessions: readonly CookingSession[],
  recipes: readonly Recipe[],
  nutritionByRecipeId: ReadonlyMap<string, RecipeNutrition>,
  startKey: string,
  endKey: string
): WeeklyCookedNutrition {
  const recipeById = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const inRange = listCompletedCookingSessionsInRange([...sessions], startKey, endKey);
  let total = emptyPer100g();
  let cooksWithNutrition = 0;
  let confidenceSum = 0;

  for (const session of inRange) {
    if (!session.recipeId) continue;
    const nutrition = nutritionByRecipeId.get(session.recipeId);
    if (!nutrition) continue;
    if (
      nutrition.confidence <= 0 &&
      nutrition.total.kcal === 0 &&
      nutrition.total.proteinG === 0
    ) {
      continue;
    }
    const recipe = recipeById.get(session.recipeId);
    const servings = Math.max(1, session.servingsMade ?? recipe?.servings ?? 1);
    total = addPer100g(total, scaleNutrients(nutrition.perServing, servings));
    cooksWithNutrition += 1;
    confidenceSum += nutrition.confidence;
  }

  const perCook =
    cooksWithNutrition > 0 ? scaleNutrients(total, 1 / cooksWithNutrition) : emptyPer100g();

  return {
    cooksWithNutrition,
    total: roundNutrition(total),
    perCook: roundNutrition(perCook),
    confidenceMean: cooksWithNutrition > 0 ? confidenceSum / cooksWithNutrition : 0,
  };
}

export function buildNutritionCoachingInsights(input: {
  completedCount: number;
  cookDays: number;
  distinctRecipes: number;
  firstCooks: number;
  nutrition?: WeeklyCookedNutrition;
}): NutritionCoachingInsight[] {
  const insights: NutritionCoachingInsight[] = [];

  if (input.cookDays >= NUTRITION_HOME_COOK_DAYS_WIN) {
    insights.push({
      kind: "home_cook_days",
      tone: "win",
      message: `You cooked at home ${input.cookDays} days this week.`,
    });
  }

  if (input.firstCooks > 0) {
    insights.push({
      kind: "variety",
      tone: "win",
      message:
        input.firstCooks === 1
          ? "You tried 1 new recipe this week."
          : `You tried ${input.firstCooks} new recipes this week.`,
    });
  } else if (input.completedCount >= 3 && input.distinctRecipes === 1 && input.firstCooks === 0) {
    insights.push({
      kind: "variety",
      tone: "nudge",
      message: "Same recipe all week — try something new for variety.",
    });
  }

  const nutrition = input.nutrition;
  if (nutrition && nutrition.cooksWithNutrition > 0) {
    if (nutrition.perCook.proteinG < NUTRITION_PROTEIN_NUDGE_PER_COOK_G) {
      insights.push({
        kind: "protein",
        tone: "nudge",
        message: `Home cooks averaged ${nutrition.perCook.proteinG}g protein — add a protein-forward recipe.`,
      });
    }
    if (nutrition.total.kcal > 0) {
      insights.push({
        kind: "kcal",
        tone: "win",
        message: `Logged about ${nutrition.total.kcal} kcal across ${nutrition.cooksWithNutrition} analyzed cook${nutrition.cooksWithNutrition === 1 ? "" : "s"}.`,
      });
    }
  }

  return insights;
}

export function countFirstCooksInRange(
  sessions: readonly CookingSession[],
  startKey: string,
  endKey: string
): number {
  return listFirstCookSessionsInRange([...sessions], startKey, endKey).length;
}

export function cookDaysInRange(
  sessions: readonly CookingSession[],
  startKey: string,
  endKey: string
): number {
  const days = new Set<string>();
  for (const session of listCompletedCookingSessionsInRange([...sessions], startKey, endKey)) {
    days.add(session.cookDate);
  }
  return days.size;
}

export function plannedCooksInRange(
  sessions: readonly CookingSession[],
  startKey: string,
  endKey: string
): CookingSession[] {
  return listPlannedCookingSessions([...sessions]).filter(
    (session) => session.cookDate >= startKey && session.cookDate <= endKey
  );
}

export function missedPlannedCooks(
  sessions: readonly CookingSession[],
  startKey: string,
  todayKey: string
): CookingSession[] {
  if (startKey > todayKey) return [];
  const completedDates = new Set(
    listCompletedCookingSessions([...sessions]).map(
      (session) => `${session.recipeId ?? session.recipeTitle}:${session.cookDate}`
    )
  );
  return plannedCooksInRange(sessions, startKey, todayKey).filter((session) => {
    if (session.cookDate >= todayKey) return false;
    const key = `${session.recipeId ?? session.recipeTitle}:${session.cookDate}`;
    return !completedDates.has(key);
  });
}