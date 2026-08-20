import { describe, expect, it } from "vitest";
import { SEED_INGREDIENT_CATALOG, seedIngredientIdFor } from "./ingredientCatalog";
import {
  aggregateCookedNutrition,
  buildNutritionCoachingInsights,
  draftWeeklyMealPlan,
  missedPlannedCooks,
  suggestRecipesFromPantry,
  suggestSubstitutionsForRecipe,
} from "./cookingSuggestions";
import {
  buildNutritionIndexes,
  buildRecipeNutritionMap,
  computeRecipeNutrition,
} from "./nutrition";
import { SEED_INGREDIENT_NUTRIENTS, SEED_RETENTION_FACTORS } from "./nutritionSeed";
import type { CookingSession, PantryItem, Recipe, RecipeIngredientLine } from "./model";

const NOW = "2026-08-19T12:00:00.000Z";
const RECIPE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const RECIPE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LINE_A = "11111111-1111-4111-8111-111111111111";
const LINE_B = "22222222-2222-4222-8222-222222222222";
const PANTRY_A = "33333333-3333-4333-8333-333333333333";
const PANTRY_B = "44444444-4444-4444-8444-444444444444";
const SESSION_A = "55555555-5555-4555-8555-555555555555";

const EGG_ID = seedIngredientIdFor(9);
const GARLIC_ID = seedIngredientIdFor(13);
const CHICKEN_ID = seedIngredientIdFor(15);
const BEEF_ID = seedIngredientIdFor(16);

const catalog = SEED_INGREDIENT_CATALOG;

function pantryItem(overrides: Partial<PantryItem> = {}): PantryItem {
  return {
    id: PANTRY_A,
    label: "Eggs",
    available: true,
    createdAtIso: NOW,
    updatedAtIso: NOW,
    ...overrides,
  };
}

function line(
  overrides: Partial<RecipeIngredientLine> & Pick<RecipeIngredientLine, "rawText">
): RecipeIngredientLine {
  return {
    id: LINE_A,
    ...overrides,
  };
}

function recipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: RECIPE_A,
    title: "Garlic eggs",
    category: "dinner",
    difficulty: "easy",
    experienceLevel: "beginner",
    estimatedMinutes: 15,
    servings: 2,
    ingredients: [
      line({ ingredientId: EGG_ID, rawText: "2 eggs" }),
      line({ id: LINE_B, ingredientId: GARLIC_ID, rawText: "2 cloves garlic" }),
    ],
    steps: [
      {
        id: "99999999-9999-4999-8999-999999999999",
        order: 0,
        text: "Cook.",
        kind: "blocking",
        blocksProgress: true,
      },
    ],
    equipment: [],
    gallery: [],
    source: "manual",
    createdAtIso: NOW,
    updatedAtIso: NOW,
    ...overrides,
  };
}

function session(overrides: Partial<CookingSession> = {}): CookingSession {
  return {
    id: SESSION_A,
    recipeId: RECIPE_A,
    recipeTitle: "Garlic eggs",
    status: "completed",
    cookDate: "2026-05-26",
    timers: [],
    createdAtIso: NOW,
    updatedAtIso: NOW,
    ...overrides,
  };
}

describe("suggestRecipesFromPantry", () => {
  it("ranks can-make recipes ahead of partial matches", () => {
    const canMake = recipe();
    const partial = recipe({
      id: RECIPE_B,
      title: "Chicken skillet",
      ingredients: [
        line({ ingredientId: CHICKEN_ID, rawText: "200 g chicken" }),
        line({ id: LINE_B, ingredientId: GARLIC_ID, rawText: "garlic" }),
      ],
    });
    const pantry = [
      pantryItem({ ingredientId: EGG_ID, label: "Eggs" }),
      pantryItem({ id: PANTRY_B, ingredientId: GARLIC_ID, label: "Garlic" }),
    ];

    const suggestions = suggestRecipesFromPantry({
      recipes: [partial, canMake],
      pantry,
      catalog,
    });

    expect(suggestions[0]?.recipeId).toBe(RECIPE_A);
    expect(suggestions[0]?.availability).toBe("can_make");
    expect(suggestions[1]?.availability).toBe("partial");
    expect(suggestions[1]?.missingIngredientLabels).toContain("chicken");
  });

  it("returns nothing when the pantry is unused", () => {
    expect(
      suggestRecipesFromPantry({
        recipes: [recipe()],
        pantry: [pantryItem({ available: false, ingredientId: EGG_ID })],
        catalog,
      })
    ).toEqual([]);
  });
});

describe("suggestSubstitutionsForRecipe", () => {
  it("proposes a same-category pantry item for a missing protein", () => {
    const dish = recipe({
      title: "Chicken skillet",
      ingredients: [line({ ingredientId: CHICKEN_ID, rawText: "200 g chicken breast" })],
    });
    const pantry = [pantryItem({ ingredientId: BEEF_ID, label: "Ground beef" })];
    const suggestions = suggestSubstitutionsForRecipe(dish, pantry, catalog);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.missingLabel).toBe("chicken breast");
    expect(suggestions[0]?.candidates[0]?.pantryLabel).toBe("Ground beef");
  });
});

describe("draftWeeklyMealPlan", () => {
  it("fills open days with pantry-friendly recipes and skips occupied days", () => {
    const eggs = recipe();
    const chicken = recipe({
      id: RECIPE_B,
      title: "Chicken skillet",
      ingredients: [
        line({ ingredientId: CHICKEN_ID, rawText: "200 g chicken" }),
        line({ id: LINE_B, ingredientId: GARLIC_ID, rawText: "garlic" }),
      ],
    });
    const pantry = [
      pantryItem({ ingredientId: EGG_ID, label: "Eggs" }),
      pantryItem({ id: PANTRY_B, ingredientId: GARLIC_ID, label: "Garlic" }),
    ];

    const draft = draftWeeklyMealPlan({
      recipes: [eggs, chicken],
      cookingSessions: [session({ cookDate: "2026-05-25", status: "planned" })],
      pantry,
      weekStartKey: "2026-05-25",
      weekEndKey: "2026-05-31",
      catalog,
    });

    expect(draft.skippedDateKeys).toEqual(["2026-05-25"]);
    expect(draft.slots.length).toBeGreaterThan(0);
    expect(draft.slots.every((slot) => slot.dateKey !== "2026-05-25")).toBe(true);
    expect(draft.notes.some((note) => note.includes("Advisory"))).toBe(true);
  });
});

describe("missedPlannedCooks", () => {
  it("flags planned cooks before today that were never completed", () => {
    const missed = missedPlannedCooks(
      [session({ status: "planned", cookDate: "2026-05-25" })],
      "2026-05-25",
      "2026-05-27"
    );
    expect(missed).toHaveLength(1);
  });
});

describe("nutrition coaching", () => {
  it("aggregates cooked nutrition and emits protein / home-cook insights", () => {
    const dish = recipe({
      ingredients: [
        line({
          ingredientId: EGG_ID,
          rawText: "2 eggs",
          quantity: 2,
          unit: "piece",
          matchConfidence: 1,
        }),
      ],
    });
    const indexes = buildNutritionIndexes({
      catalog,
      nutrients: SEED_INGREDIENT_NUTRIENTS,
      customIngredients: [],
      retentionFactors: SEED_RETENTION_FACTORS,
    });
    const nutrition = computeRecipeNutrition(dish, indexes);
    const map = buildRecipeNutritionMap([dish], indexes);
    expect(map.get(dish.id)?.recipeId).toBe(dish.id);

    const weekly = aggregateCookedNutrition(
      [session({ servingsMade: 2 })],
      [dish],
      new Map([[dish.id, nutrition]]),
      "2026-05-25",
      "2026-05-31"
    );
    expect(weekly.cooksWithNutrition).toBe(1);

    const insights = buildNutritionCoachingInsights({
      completedCount: 1,
      cookDays: 5,
      distinctRecipes: 1,
      firstCooks: 1,
      nutrition: weekly,
    });
    expect(insights.some((item) => item.kind === "home_cook_days" && item.tone === "win")).toBe(
      true
    );
    expect(insights.some((item) => item.kind === "variety" && item.tone === "win")).toBe(true);
  });
});
