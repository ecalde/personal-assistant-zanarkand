import { describe, expect, it } from "vitest";
import { SEED_INGREDIENT_CATALOG, seedIngredientIdFor } from "./ingredientCatalog";
import {
  aggregateNutritionConfidence,
  applyRetention,
  buildNutritionIndexes,
  computeRecipeNutrition,
  indexRetentionFactors,
  nutritionConfidenceLabel,
  scalePer100g,
  toGrams,
} from "./nutrition";
import { SEED_INGREDIENT_NUTRIENTS, SEED_RETENTION_FACTORS } from "./nutritionSeed";
import type {
  CustomIngredient,
  Per100g,
  Recipe,
  RecipeIngredientLine,
  RetentionFactor,
} from "./model";

const NOW = "2026-08-19T12:00:00.000Z";
const RECIPE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LINE_A = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LINE_B = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const STEP_ID = "99999999-9999-4999-8999-999999999999";
const CUSTOM_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const EGG_ID = seedIngredientIdFor(9);
const OIL_ID = seedIngredientIdFor(10);
const SALT_ID = seedIngredientIdFor(11);
const CHICKEN_ID = seedIngredientIdFor(15);

const egg = SEED_INGREDIENT_CATALOG.ingredients.find((item) => item.id === EGG_ID)!;
const oil = SEED_INGREDIENT_CATALOG.ingredients.find((item) => item.id === OIL_ID)!;

function line(overrides: Partial<RecipeIngredientLine> & Pick<RecipeIngredientLine, "id" | "rawText">): RecipeIngredientLine {
  return { ...overrides };
}

function recipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: RECIPE_ID,
    title: "Test dish",
    category: "dinner",
    difficulty: "easy",
    experienceLevel: "beginner",
    servings: 2,
    ingredients: [
      line({ id: LINE_A, rawText: "2 eggs", quantity: 2, unit: "piece", ingredientId: EGG_ID, matchConfidence: 1 }),
    ],
    steps: [
      {
        id: STEP_ID,
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

const indexes = buildNutritionIndexes({
  catalog: SEED_INGREDIENT_CATALOG,
  nutrients: SEED_INGREDIENT_NUTRIENTS,
  retentionFactors: SEED_RETENTION_FACTORS,
});

describe("toGrams", () => {
  it("converts mass units directly", () => {
    expect(toGrams(100, "g", egg)).toBe(100);
    expect(toGrams(1, "kg", egg)).toBe(1000);
    expect(toGrams(1, "oz", egg)).toBeCloseTo(28.3495);
    expect(toGrams(1, "lb", egg)).toBeCloseTo(453.592);
  });

  it("converts volume using density", () => {
    expect(toGrams(1, "tbsp", oil)).toBeCloseTo(14.7868 * 0.91, 3);
    expect(toGrams(1, "cup", { densityGPerMl: 1.03 })).toBeCloseTo(236.588 * 1.03, 3);
    expect(toGrams(1, "ml", { densityGPerMl: 0.91 })).toBeCloseTo(0.91);
  });

  it("converts count units using grams per piece", () => {
    expect(toGrams(2, "piece", egg)).toBe(100);
    expect(toGrams(3, "clove", { gramsPerPiece: 5 })).toBe(15);
    expect(toGrams(2, undefined, egg)).toBe(100);
  });

  it("converts pinch and dash to small gram amounts", () => {
    expect(toGrams(1, "pinch", undefined)).toBe(0.3);
    expect(toGrams(2, "dash", undefined)).toBe(1.2);
  });

  it("returns null for unknown units or missing density/piece weight", () => {
    expect(toGrams(1, "glug", oil)).toBeNull();
    expect(toGrams(1, "cup", egg)).toBeNull();
    expect(toGrams(1, "piece", oil)).toBeNull();
    expect(toGrams(undefined, "g", egg)).toBeNull();
  });
});

describe("scalePer100g and retention", () => {
  const per100: Per100g = { kcal: 200, proteinG: 10, fatG: 8, carbG: 20, fiberG: 4 };

  it("scales per-100g values by grams/100", () => {
    expect(scalePer100g(per100, 50)).toEqual({
      kcal: 100,
      proteinG: 5,
      fatG: 4,
      carbG: 10,
      fiberG: 2,
    });
  });

  it("applies method-specific retention factors", () => {
    const factors: RetentionFactor[] = [
      { id: "1", cookingMethod: "boil", nutrientKey: "protein_g", factor: 0.5 },
      { id: "2", cookingMethod: "boil", nutrientKey: "kcal", factor: 1 },
      { id: "3", cookingMethod: "boil", nutrientKey: "fat_g", factor: 1 },
      { id: "4", cookingMethod: "boil", nutrientKey: "carb_g", factor: 1 },
    ];
    const index = indexRetentionFactors(factors);
    const adjusted = applyRetention(per100, "boil", index);
    expect(adjusted.proteinG).toBe(5);
    expect(adjusted.kcal).toBe(200);
  });

  it("leaves macros unchanged for raw / missing method", () => {
    const index = indexRetentionFactors(SEED_RETENTION_FACTORS);
    expect(applyRetention(per100, "raw", index)).toEqual(per100);
    expect(applyRetention(per100, undefined, index)).toEqual(per100);
  });
});

describe("aggregateNutritionConfidence", () => {
  it("weights by grams and penalizes unresolved lines", () => {
    const full = aggregateNutritionConfidence({
      lineWeights: [
        { grams: 100, matchConfidence: 1, ok: true },
        { grams: 100, matchConfidence: 1, ok: true },
      ],
    });
    expect(full).toBe(1);

    const half = aggregateNutritionConfidence({
      lineWeights: [
        { grams: 100, matchConfidence: 1, ok: true },
        { grams: 100, matchConfidence: 0, ok: false },
      ],
    });
    expect(half).toBe(0.25);
  });
});

describe("computeRecipeNutrition", () => {
  it("scales two eggs and divides by servings", () => {
    const nutrition = computeRecipeNutrition(recipe(), indexes);
    // 2 eggs * 50g = 100g of egg @ 143 kcal / 12.6 protein per 100g
    expect(nutrition.total.kcal).toBe(143);
    expect(nutrition.total.proteinG).toBe(12.6);
    expect(nutrition.perServing.kcal).toBe(72);
    expect(nutrition.perServing.proteinG).toBe(6.3);
    expect(nutrition.confidenceLabel).toBe("high");
    expect(nutrition.unresolvedLineIds).toEqual([]);
  });

  it("adds oil volume via density", () => {
    const nutrition = computeRecipeNutrition(
      recipe({
        servings: 1,
        ingredients: [
          line({
            id: LINE_A,
            rawText: "1 tbsp olive oil",
            quantity: 1,
            unit: "tbsp",
            ingredientId: OIL_ID,
            matchConfidence: 1,
          }),
        ],
      }),
      indexes
    );
    const grams = 14.7868 * 0.91;
    expect(nutrition.total.kcal).toBe(Math.round((884 * grams) / 100));
    expect(nutrition.unresolvedLineIds).toEqual([]);
  });

  it("flags unresolved lines and lowers confidence", () => {
    const nutrition = computeRecipeNutrition(
      recipe({
        ingredients: [
          line({
            id: LINE_A,
            rawText: "2 eggs",
            quantity: 2,
            unit: "piece",
            ingredientId: EGG_ID,
            matchConfidence: 1,
          }),
          line({ id: LINE_B, rawText: "mystery spice" }),
        ],
      }),
      indexes
    );
    expect(nutrition.unresolvedLineIds).toEqual([LINE_B]);
    expect(nutrition.confidence).toBeLessThan(0.8);
    expect(nutritionConfidenceLabel(nutrition.confidence)).not.toBe("high");
  });

  it("includes custom ingredients with user-entered per-100g values", () => {
    const custom: CustomIngredient = {
      id: CUSTOM_ID,
      name: "Guanciale",
      densityGPerMl: undefined,
      gramsPerPiece: 20,
      per100g: { kcal: 500, proteinG: 20, fatG: 45, carbG: 0 },
      createdAtIso: NOW,
      updatedAtIso: NOW,
    };
    const customIndexes = buildNutritionIndexes({
      catalog: SEED_INGREDIENT_CATALOG,
      nutrients: SEED_INGREDIENT_NUTRIENTS,
      customIngredients: [custom],
      retentionFactors: SEED_RETENTION_FACTORS,
    });
    const nutrition = computeRecipeNutrition(
      recipe({
        servings: 1,
        ingredients: [
          line({
            id: LINE_A,
            rawText: "50 g guanciale",
            quantity: 50,
            unit: "g",
            customIngredientId: CUSTOM_ID,
            matchConfidence: 1,
          }),
        ],
      }),
      customIndexes
    );
    expect(nutrition.total.kcal).toBe(250);
    expect(nutrition.total.proteinG).toBe(10);
    expect(nutrition.confidenceLabel).toBe("high");
  });

  it("marks missing gram conversion as missing data, not unresolved", () => {
    const nutrition = computeRecipeNutrition(
      recipe({
        ingredients: [
          line({
            id: LINE_A,
            rawText: "1 cup chicken breast",
            quantity: 1,
            unit: "cup",
            ingredientId: CHICKEN_ID,
            matchConfidence: 0.99,
          }),
        ],
      }),
      indexes
    );
    expect(nutrition.unresolvedLineIds).toEqual([]);
    expect(nutrition.missingDataLineIds).toEqual([LINE_A]);
    expect(nutrition.total.kcal).toBe(0);
  });

  it("still converts a pinch of salt", () => {
    const nutrition = computeRecipeNutrition(
      recipe({
        servings: 1,
        ingredients: [
          line({
            id: LINE_A,
            rawText: "1 pinch salt",
            quantity: 1,
            unit: "pinch",
            ingredientId: SALT_ID,
            matchConfidence: 1,
          }),
        ],
      }),
      indexes
    );
    expect(nutrition.missingDataLineIds).toEqual([]);
    expect(nutrition.total.sodiumMg).toBeGreaterThan(0);
  });
});
