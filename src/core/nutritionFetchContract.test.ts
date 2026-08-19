import { describe, expect, it, vi } from "vitest";
import {
  handleNutritionFetch,
  mapOffProductToPer100g,
  mapUsdaFoodToPer100g,
  NUTRITION_FETCH_MAX_IDS,
  parseIngredientIdList,
} from "./nutritionFetchContract";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ING_A = "a7e10000-0000-4000-8000-000000000009";
const ING_B = "a7e10000-0000-4000-8000-00000000000a";
const NOW = "2026-08-19T15:00:00.000Z";

const USDA_EGG = {
  foodNutrients: [
    { nutrientNumber: "208", amount: 143 },
    { nutrientNumber: "203", amount: 12.6 },
    { nutrientNumber: "204", amount: 9.5 },
    { nutrientNumber: "205", amount: 0.7 },
    { nutrient: { id: 1079 }, amount: 0 },
    { nutrient: { id: 2000 }, amount: 0.4 },
    { nutrient: { id: 1093 }, amount: 142 },
  ],
};

const OFF_PRODUCT = {
  product_name: "Branded yogurt",
  nutriments: {
    "energy-kcal_100g": 90,
    proteins_100g: 4.5,
    fat_100g: 3.2,
    carbohydrates_100g: 12,
    fiber_100g: 0,
    sugars_100g: 11,
    sodium_100g: 0.05,
  },
};

describe("mapUsdaFoodToPer100g", () => {
  it("maps nutrient numbers and ids to Per100g", () => {
    expect(mapUsdaFoodToPer100g(USDA_EGG)).toEqual({
      kcal: 143,
      proteinG: 12.6,
      fatG: 9.5,
      carbG: 0.7,
      fiberG: 0,
      sugarG: 0.4,
      sodiumMg: 142,
    });
  });

  it("returns null when macros are missing", () => {
    expect(mapUsdaFoodToPer100g({ foodNutrients: [{ nutrientNumber: "208", amount: 10 }] })).toBeNull();
  });
});

describe("mapOffProductToPer100g", () => {
  it("maps OFF nutriments and converts sodium grams to mg", () => {
    expect(mapOffProductToPer100g(OFF_PRODUCT)).toEqual({
      kcal: 90,
      proteinG: 4.5,
      fatG: 3.2,
      carbG: 12,
      fiberG: 0,
      sugarG: 11,
      sodiumMg: 50,
    });
  });
});

describe("parseIngredientIdList", () => {
  it("dedupes valid UUIDs", () => {
    expect(parseIngredientIdList([ING_A, ING_A, ING_B])).toEqual([ING_A, ING_B]);
  });

  it("rejects invalid payloads", () => {
    expect(parseIngredientIdList("nope")).toMatch(/array/);
    expect(parseIngredientIdList(["not-a-uuid"])).toMatch(/UUID/);
    const tooMany = Array.from({ length: NUTRITION_FETCH_MAX_IDS + 1 }, () => ING_A);
    expect(parseIngredientIdList(tooMany)).toMatch(/at most/);
  });
});

describe("handleNutritionFetch", () => {
  it("rejects unauthenticated callers", async () => {
    const fetchUsdaFood = vi.fn();
    const result = await handleNutritionFetch(
      { userId: null, ingredientIds: [ING_A] },
      {
        loadIngredients: vi.fn(),
        loadCachedNutrients: vi.fn(),
        upsertNutrients: vi.fn(),
        fetchUsdaFood,
      }
    );
    expect(result).toEqual({ ok: false, status: 401, error: "Authentication required." });
    expect(fetchUsdaFood).not.toHaveBeenCalled();
  });

  it("returns cached rows without calling USDA", async () => {
    const fetchUsdaFood = vi.fn();
    const cached = {
      ingredientId: ING_A,
      source: "usda" as const,
      fdcId: 748967,
      per100g: { kcal: 143, proteinG: 12.6, fatG: 9.5, carbG: 0.7 },
      fetchedAtIso: NOW,
    };
    const result = await handleNutritionFetch(
      { userId: USER_ID, ingredientIds: [ING_A] },
      {
        loadIngredients: vi.fn(),
        loadCachedNutrients: vi.fn().mockResolvedValue([cached]),
        upsertNutrients: vi.fn(),
        fetchUsdaFood,
        nowIso: () => NOW,
      }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nutrients).toEqual([cached]);
    expect(result.missingIngredientIds).toEqual([]);
    expect(fetchUsdaFood).not.toHaveBeenCalled();
  });

  it("fetches USDA on cache miss and upserts the cache", async () => {
    const upsertNutrients = vi.fn().mockResolvedValue(undefined);
    const fetchUsdaFood = vi.fn().mockResolvedValue(USDA_EGG);
    const result = await handleNutritionFetch(
      { userId: USER_ID, ingredientIds: [ING_A] },
      {
        loadIngredients: vi.fn().mockResolvedValue([{ id: ING_A, fdcId: 748967 }]),
        loadCachedNutrients: vi.fn().mockResolvedValue([]),
        upsertNutrients,
        fetchUsdaFood,
        nowIso: () => NOW,
      }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(fetchUsdaFood).toHaveBeenCalledWith(748967);
    expect(upsertNutrients).toHaveBeenCalledTimes(1);
    expect(upsertNutrients.mock.calls[0]?.[0]?.[0]).toMatchObject({
      ingredientId: ING_A,
      source: "usda",
      fdcId: 748967,
      per100g: { kcal: 143, proteinG: 12.6, fatG: 9.5, carbG: 0.7 },
    });
    expect(result.nutrients[0]?.per100g.kcal).toBe(143);
    expect(result.missingIngredientIds).toEqual([]);
  });

  it("falls back to Open Food Facts when USDA misses and a barcode is provided", async () => {
    const upsertNutrients = vi.fn().mockResolvedValue(undefined);
    const result = await handleNutritionFetch(
      { userId: USER_ID, ingredientIds: [ING_B], barcode: "3017620422003" },
      {
        loadIngredients: vi.fn().mockResolvedValue([{ id: ING_B, fdcId: 1 }]),
        loadCachedNutrients: vi.fn().mockResolvedValue([]),
        upsertNutrients,
        fetchUsdaFood: vi.fn().mockResolvedValue(null),
        fetchOffProduct: vi.fn().mockResolvedValue(OFF_PRODUCT),
        nowIso: () => NOW,
      }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.offProduct?.name).toBe("Branded yogurt");
    expect(result.nutrients[0]).toMatchObject({
      ingredientId: ING_B,
      source: "off",
      per100g: { kcal: 90, proteinG: 4.5, fatG: 3.2, carbG: 12 },
    });
    expect(upsertNutrients).toHaveBeenCalledTimes(1);
  });
});
