/**
 * Client fallback nutrient cache + retention factors for the seed catalog.
 * Used when remote sync is off or ingredient_nutrients has no row yet.
 * Stable ingredient UUIDs match src/core/ingredientCatalog.ts.
 */

import type {
  IngredientNutrients,
  Per100g,
  RetentionFactor,
} from "./model";

function seedIngredientId(n: number): string {
  return `a7e10000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
}

function seedNutrientId(n: number): string {
  return `a7e30000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
}

function seedRetentionId(n: number): string {
  return `a7e40000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
}

const FETCHED_AT = "2026-08-19T12:00:00.000Z";

type SeedNutrition = {
  n: number;
  fdcId: number;
  densityGPerMl?: number;
  gramsPerPiece?: number;
  per100g: Per100g;
};

/** USDA-style per-100g macros for the curated seed catalog (not a full FDC dump). */
export const SEED_INGREDIENT_NUTRITION: SeedNutrition[] = [
  { n: 1, fdcId: 1100854, per100g: { kcal: 312, proteinG: 8.2, fatG: 8.1, carbG: 51, fiberG: 2.4, sugarG: 1.6, sodiumMg: 598 } },
  { n: 2, fdcId: 1100859, per100g: { kcal: 218, proteinG: 5.7, fatG: 2.9, carbG: 44.6, fiberG: 6.3, sugarG: 0.9, sodiumMg: 20 } },
  { n: 3, fdcId: 2258588, per100g: { kcal: 26, proteinG: 1, fatG: 0.3, carbG: 6.0, fiberG: 2.1, sugarG: 4.2, sodiumMg: 4 } },
  { n: 4, fdcId: 170497, per100g: { kcal: 20, proteinG: 0.9, fatG: 0.2, carbG: 4.6, fiberG: 1.7, sugarG: 2.4, sodiumMg: 3 } },
  { n: 5, fdcId: 168374, per100g: { kcal: 27, proteinG: 1, fatG: 0.2, carbG: 6.3, fiberG: 0.9, sugarG: 2.4, sodiumMg: 2 } },
  { n: 6, fdcId: 170108, per100g: { kcal: 31, proteinG: 1, fatG: 0.3, carbG: 6.0, fiberG: 2.1, sugarG: 4.2, sodiumMg: 4 } },
  { n: 7, fdcId: 170457, per100g: { kcal: 18, proteinG: 0.9, fatG: 0.2, carbG: 3.9, fiberG: 1.2, sugarG: 2.6, sodiumMg: 5 } },
  { n: 8, fdcId: 170379, per100g: { kcal: 34, proteinG: 2.8, fatG: 0.4, carbG: 6.6, fiberG: 2.6, sugarG: 1.7, sodiumMg: 33 } },
  { n: 9, fdcId: 748967, per100g: { kcal: 143, proteinG: 12.6, fatG: 9.5, carbG: 0.7, fiberG: 0, sugarG: 0.4, sodiumMg: 142 } },
  { n: 10, fdcId: 748608, densityGPerMl: 0.91, per100g: { kcal: 884, proteinG: 0, fatG: 100, carbG: 0, fiberG: 0, sugarG: 0, sodiumMg: 2 } },
  { n: 11, fdcId: 173468, densityGPerMl: 1.217, per100g: { kcal: 0, proteinG: 0, fatG: 0, carbG: 0, fiberG: 0, sugarG: 0, sodiumMg: 38758 } },
  { n: 12, fdcId: 170931, densityGPerMl: 0.5, per100g: { kcal: 251, proteinG: 10.4, fatG: 3.3, carbG: 64, fiberG: 25.3, sugarG: 0.6, sodiumMg: 20 } },
  { n: 13, fdcId: 169230, per100g: { kcal: 149, proteinG: 6.4, fatG: 0.5, carbG: 33.1, fiberG: 2.1, sugarG: 1, sodiumMg: 17 } },
  { n: 14, fdcId: 170000, per100g: { kcal: 40, proteinG: 1.1, fatG: 0.1, carbG: 9.3, fiberG: 1.7, sugarG: 4.2, sodiumMg: 4 } },
  { n: 15, fdcId: 171077, per100g: { kcal: 120, proteinG: 22.5, fatG: 2.6, carbG: 0, fiberG: 0, sugarG: 0, sodiumMg: 45 } },
  { n: 16, fdcId: 174032, per100g: { kcal: 215, proteinG: 18.6, fatG: 15, carbG: 0, fiberG: 0, sugarG: 0, sodiumMg: 66 } },
  { n: 17, fdcId: 169761, densityGPerMl: 0.85, per100g: { kcal: 365, proteinG: 7.1, fatG: 0.7, carbG: 80, fiberG: 1.3, sugarG: 0.1, sodiumMg: 5 } },
  { n: 18, fdcId: 168894, densityGPerMl: 0.53, per100g: { kcal: 364, proteinG: 10.3, fatG: 1, carbG: 76.3, fiberG: 2.7, sugarG: 0.3, sodiumMg: 2 } },
  { n: 19, fdcId: 173410, densityGPerMl: 0.911, per100g: { kcal: 717, proteinG: 0.9, fatG: 81.1, carbG: 0.1, fiberG: 0, sugarG: 0.1, sodiumMg: 643 } },
  { n: 20, fdcId: 746782, densityGPerMl: 1.03, per100g: { kcal: 61, proteinG: 3.2, fatG: 3.3, carbG: 4.8, fiberG: 0, sugarG: 5.1, sodiumMg: 43 } },
  { n: 21, fdcId: 173414, per100g: { kcal: 403, proteinG: 22.9, fatG: 33.1, carbG: 1.3, fiberG: 0, sugarG: 0.5, sodiumMg: 621 } },
  { n: 22, fdcId: 170881, per100g: { kcal: 392, proteinG: 35.8, fatG: 25.8, carbG: 3.2, fiberG: 0, sugarG: 0.8, sodiumMg: 1529 } },
  { n: 23, fdcId: 168928, per100g: { kcal: 371, proteinG: 13, fatG: 1.5, carbG: 74.7, fiberG: 3.2, sugarG: 2.7, sodiumMg: 6 } },
  { n: 24, fdcId: 167747, per100g: { kcal: 29, proteinG: 1.1, fatG: 0.3, carbG: 9.3, fiberG: 2.8, sugarG: 2.5, sodiumMg: 2 } },
  { n: 25, fdcId: 168155, per100g: { kcal: 30, proteinG: 0.7, fatG: 0.2, carbG: 10.5, fiberG: 2.8, sugarG: 1.7, sodiumMg: 2 } },
  { n: 26, fdcId: 170026, per100g: { kcal: 77, proteinG: 2, fatG: 0.1, carbG: 17.5, fiberG: 2.1, sugarG: 0.8, sodiumMg: 6 } },
  { n: 27, fdcId: 170393, per100g: { kcal: 41, proteinG: 0.9, fatG: 0.2, carbG: 9.6, fiberG: 2.8, sugarG: 4.7, sodiumMg: 69 } },
  { n: 28, fdcId: 169988, gramsPerPiece: 40, per100g: { kcal: 14, proteinG: 0.7, fatG: 0.2, carbG: 3, fiberG: 1.6, sugarG: 1.3, sodiumMg: 80 } },
  { n: 29, fdcId: 168462, per100g: { kcal: 23, proteinG: 2.9, fatG: 0.4, carbG: 3.6, fiberG: 2.2, sugarG: 0.4, sodiumMg: 79 } },
  { n: 30, fdcId: 171705, per100g: { kcal: 160, proteinG: 2, fatG: 14.7, carbG: 8.5, fiberG: 6.7, sugarG: 0.7, sodiumMg: 7 } },
  { n: 31, fdcId: 173944, per100g: { kcal: 89, proteinG: 1.1, fatG: 0.3, carbG: 22.8, fiberG: 2.6, sugarG: 12.2, sodiumMg: 1 } },
  { n: 32, fdcId: 171688, per100g: { kcal: 52, proteinG: 0.3, fatG: 0.2, carbG: 13.8, fiberG: 2.4, sugarG: 10.4, sodiumMg: 1 } },
  { n: 33, fdcId: 169655, densityGPerMl: 0.85, per100g: { kcal: 387, proteinG: 0, fatG: 0, carbG: 100, fiberG: 0, sugarG: 99.8, sodiumMg: 1 } },
  { n: 34, fdcId: 168833, densityGPerMl: 0.8, per100g: { kcal: 380, proteinG: 0.1, fatG: 0, carbG: 98.1, fiberG: 0, sugarG: 97, sodiumMg: 28 } },
  { n: 35, fdcId: 169640, densityGPerMl: 1.42, per100g: { kcal: 304, proteinG: 0.3, fatG: 0, carbG: 82.4, fiberG: 0.2, sugarG: 82.1, sodiumMg: 4 } },
  { n: 36, fdcId: 174490, densityGPerMl: 1.18, per100g: { kcal: 53, proteinG: 8.1, fatG: 0.1, carbG: 4.9, fiberG: 0.8, sugarG: 0.4, sodiumMg: 5493 } },
  { n: 37, fdcId: 170923, densityGPerMl: 0.42, per100g: { kcal: 375, proteinG: 17.8, fatG: 22.3, carbG: 44.2, fiberG: 10.5, sugarG: 2.3, sodiumMg: 168 } },
  { n: 38, fdcId: 171329, densityGPerMl: 0.46, per100g: { kcal: 282, proteinG: 14.1, fatG: 12.9, carbG: 54, fiberG: 34.9, sugarG: 10.3, sodiumMg: 68 } },
  { n: 39, fdcId: 171320, densityGPerMl: 0.56, per100g: { kcal: 247, proteinG: 4, fatG: 1.2, carbG: 80.6, fiberG: 53.1, sugarG: 2.2, sodiumMg: 10 } },
  { n: 40, fdcId: 172232, gramsPerPiece: 2, per100g: { kcal: 23, proteinG: 3.2, fatG: 0.6, carbG: 2.7, fiberG: 1.6, sugarG: 0.3, sodiumMg: 4 } },
  { n: 41, fdcId: 169997, gramsPerPiece: 10, per100g: { kcal: 23, proteinG: 2.1, fatG: 0.5, carbG: 3.7, fiberG: 2.8, sugarG: 0.9, sodiumMg: 46 } },
  { n: 42, fdcId: 170416, gramsPerPiece: 10, per100g: { kcal: 36, proteinG: 3, fatG: 0.8, carbG: 6.3, fiberG: 3.3, sugarG: 0.9, sodiumMg: 56 } },
  { n: 43, fdcId: 169231, gramsPerPiece: 15, per100g: { kcal: 80, proteinG: 1.8, fatG: 0.8, carbG: 17.8, fiberG: 2, sugarG: 1.7, sodiumMg: 13 } },
  { n: 44, fdcId: 168321, gramsPerPiece: 8, per100g: { kcal: 541, proteinG: 37.0, fatG: 41.8, carbG: 1.4, fiberG: 0, sugarG: 0, sodiumMg: 1717 } },
  { n: 45, fdcId: 175180, per100g: { kcal: 99, proteinG: 24, fatG: 0.3, carbG: 0.2, fiberG: 0, sugarG: 0, sodiumMg: 111 } },
  { n: 46, fdcId: 175167, per100g: { kcal: 208, proteinG: 20.4, fatG: 13.4, carbG: 0, fiberG: 0, sugarG: 0, sodiumMg: 59 } },
  { n: 47, fdcId: 172470, per100g: { kcal: 144, proteinG: 17.3, fatG: 8.7, carbG: 2.8, fiberG: 2.3, sugarG: 0.6, sodiumMg: 14 } },
  { n: 48, fdcId: 325871, gramsPerPiece: 30, per100g: { kcal: 265, proteinG: 8.9, fatG: 3.2, carbG: 49.4, fiberG: 2.7, sugarG: 5.7, sodiumMg: 491 } },
  { n: 49, fdcId: 172802, densityGPerMl: 0.9, per100g: { kcal: 53, proteinG: 0, fatG: 0, carbG: 27.7, fiberG: 0.2, sugarG: 0, sodiumMg: 10600 } },
  { n: 50, fdcId: 173469, densityGPerMl: 0.88, per100g: { kcal: 288, proteinG: 0.1, fatG: 0.1, carbG: 12.7, fiberG: 0, sugarG: 12.7, sodiumMg: 9 } },
  { n: 51, fdcId: 169593, densityGPerMl: 0.35, per100g: { kcal: 228, proteinG: 19.6, fatG: 13.7, carbG: 57.9, fiberG: 37, sugarG: 1.8, sodiumMg: 21 } },
  { n: 52, fdcId: 170172, densityGPerMl: 0.96, per100g: { kcal: 197, proteinG: 2, fatG: 21.3, carbG: 2.8, fiberG: 0, sugarG: 1.7, sodiumMg: 13 } },
  { n: 53, fdcId: 173805, densityGPerMl: 0.68, per100g: { kcal: 164, proteinG: 8.9, fatG: 2.6, carbG: 27.4, fiberG: 7.6, sugarG: 4.8, sodiumMg: 246 } },
  { n: 54, fdcId: 173735, densityGPerMl: 0.68, per100g: { kcal: 132, proteinG: 8.9, fatG: 0.5, carbG: 23.7, fiberG: 8.7, sugarG: 0.3, sodiumMg: 232 } },
  { n: 55, fdcId: 170005, gramsPerPiece: 15, per100g: { kcal: 32, proteinG: 1.8, fatG: 0.2, carbG: 7.3, fiberG: 2.6, sugarG: 2.3, sodiumMg: 16 } },
  { n: 56, fdcId: 170499, gramsPerPiece: 25, per100g: { kcal: 72, proteinG: 2.5, fatG: 0.1, carbG: 16.8, fiberG: 3.2, sugarG: 7.9, sodiumMg: 12 } },
];

export const SEED_FDC_ID_BY_N: Record<number, number> = Object.fromEntries(
  SEED_INGREDIENT_NUTRITION.map((row) => [row.n, row.fdcId])
);

export function seedNutritionMetaFor(n: number): SeedNutrition | undefined {
  return SEED_INGREDIENT_NUTRITION.find((row) => row.n === n);
}

export function buildSeedIngredientNutrients(): IngredientNutrients[] {
  return SEED_INGREDIENT_NUTRITION.map((row) => {
    const nutrients: IngredientNutrients = {
      id: seedNutrientId(row.n),
      ingredientId: seedIngredientId(row.n),
      source: "usda",
      fdcId: row.fdcId,
      per100g: { ...row.per100g },
      fetchedAtIso: FETCHED_AT,
    };
    return nutrients;
  });
}

export const SEED_INGREDIENT_NUTRIENTS: IngredientNutrients[] = buildSeedIngredientNutrients();

const COOKING_METHODS = [
  "boil",
  "bake",
  "fry",
  "saute",
  "steam",
  "grill",
  "raw",
  "other",
] as const;

const MACRO_KEYS = ["kcal", "protein_g", "fat_g", "carb_g", "fiber_g", "sugar_g", "sodium_mg"] as const;

const VITAMIN_C_FACTOR: Record<(typeof COOKING_METHODS)[number], number> = {
  boil: 0.7,
  bake: 0.9,
  fry: 0.85,
  saute: 0.9,
  steam: 0.85,
  grill: 0.85,
  raw: 1,
  other: 0.9,
};

export function buildSeedRetentionFactors(): RetentionFactor[] {
  const factors: RetentionFactor[] = [];
  let n = 1;
  for (const method of COOKING_METHODS) {
    for (const key of MACRO_KEYS) {
      factors.push({
        id: seedRetentionId(n),
        cookingMethod: method,
        nutrientKey: key,
        factor: 1,
      });
      n += 1;
    }
    factors.push({
      id: seedRetentionId(n),
      cookingMethod: method,
      nutrientKey: "vitamin_c",
      factor: VITAMIN_C_FACTOR[method],
    });
    n += 1;
  }
  return factors;
}

export const SEED_RETENTION_FACTORS: RetentionFactor[] = buildSeedRetentionFactors();
