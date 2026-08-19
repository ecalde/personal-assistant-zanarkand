/**
 * Gram conversion, nutrient aggregation, retention, and nutrition confidence.
 * Pure functions — no I/O. USDA/OFF fetching lives in nutritionFetchContract.ts.
 */

import { parseIngredientLine } from "./ingredients";
import type { IngredientCatalog } from "./ingredientCatalog";
import type {
  CookingMethod,
  CustomIngredient,
  Ingredient,
  IngredientNutrients,
  NutritionConfidenceLabel,
  Per100g,
  Recipe,
  RecipeIngredientLine,
  RecipeNutrition,
  RetentionFactor,
} from "./model";

export const GRAMS_PER_OZ = 28.3495;
export const GRAMS_PER_LB = 453.592;
export const ML_PER_CUP = 236.588;
export const ML_PER_TBSP = 14.7868;
export const ML_PER_TSP = 4.92892;
export const PINCH_GRAMS = 0.3;
export const DASH_GRAMS = 0.6;

export const NUTRITION_CONFIDENCE_HIGH = 0.8;
export const NUTRITION_CONFIDENCE_MEDIUM = 0.5;

const MASS_TO_GRAMS: Record<string, number> = {
  g: 1,
  kg: 1000,
  oz: GRAMS_PER_OZ,
  lb: GRAMS_PER_LB,
};

const VOLUME_TO_ML: Record<string, number> = {
  ml: 1,
  l: 1000,
  cup: ML_PER_CUP,
  tbsp: ML_PER_TBSP,
  tsp: ML_PER_TSP,
};

const COUNT_UNITS = new Set([
  "piece",
  "clove",
  "slice",
  "fillet",
  "stick",
  "head",
  "bunch",
  "can",
  "sprig",
  "handful",
]);

const DOMAIN_TO_RETENTION_KEY: Record<keyof Per100g, string> = {
  kcal: "kcal",
  proteinG: "protein_g",
  fatG: "fat_g",
  carbG: "carb_g",
  fiberG: "fiber_g",
  sugarG: "sugar_g",
  sodiumMg: "sodium_mg",
};

export type GramConvertible = Pick<Ingredient, "densityGPerMl" | "gramsPerPiece" | "defaultUnit">;

export type NutritionIndexes = {
  ingredientsById: Map<string, Ingredient>;
  nutrientsByIngredientId: Map<string, IngredientNutrients>;
  customById: Map<string, CustomIngredient>;
  retentionByMethodNutrient: Map<string, number>;
};

export function emptyPer100g(): Per100g {
  return { kcal: 0, proteinG: 0, fatG: 0, carbG: 0, fiberG: 0, sugarG: 0, sodiumMg: 0 };
}

export function clonePer100g(value: Per100g): Per100g {
  const next: Per100g = {
    kcal: value.kcal,
    proteinG: value.proteinG,
    fatG: value.fatG,
    carbG: value.carbG,
  };
  if (value.fiberG !== undefined) next.fiberG = value.fiberG;
  if (value.sugarG !== undefined) next.sugarG = value.sugarG;
  if (value.sodiumMg !== undefined) next.sodiumMg = value.sodiumMg;
  return next;
}

export function addPer100g(left: Per100g, right: Per100g): Per100g {
  const next: Per100g = {
    kcal: left.kcal + right.kcal,
    proteinG: left.proteinG + right.proteinG,
    fatG: left.fatG + right.fatG,
    carbG: left.carbG + right.carbG,
  };
  if (left.fiberG !== undefined || right.fiberG !== undefined) {
    next.fiberG = (left.fiberG ?? 0) + (right.fiberG ?? 0);
  }
  if (left.sugarG !== undefined || right.sugarG !== undefined) {
    next.sugarG = (left.sugarG ?? 0) + (right.sugarG ?? 0);
  }
  if (left.sodiumMg !== undefined || right.sodiumMg !== undefined) {
    next.sodiumMg = (left.sodiumMg ?? 0) + (right.sodiumMg ?? 0);
  }
  return next;
}

export function scalePer100g(per100g: Per100g, grams: number): Per100g {
  const factor = grams / 100;
  return scaleNutrients(per100g, factor);
}

function scaleNutrients(value: Per100g, factor: number): Per100g {
  const next: Per100g = {
    kcal: value.kcal * factor,
    proteinG: value.proteinG * factor,
    fatG: value.fatG * factor,
    carbG: value.carbG * factor,
  };
  if (value.fiberG !== undefined) next.fiberG = value.fiberG * factor;
  if (value.sugarG !== undefined) next.sugarG = value.sugarG * factor;
  if (value.sodiumMg !== undefined) next.sodiumMg = value.sodiumMg * factor;
  return next;
}

export function roundNutrition(value: Per100g): Per100g {
  const next: Per100g = {
    kcal: roundTo(value.kcal, 0),
    proteinG: roundTo(value.proteinG, 1),
    fatG: roundTo(value.fatG, 1),
    carbG: roundTo(value.carbG, 1),
  };
  if (value.fiberG !== undefined) next.fiberG = roundTo(value.fiberG, 1);
  if (value.sugarG !== undefined) next.sugarG = roundTo(value.sugarG, 1);
  if (value.sodiumMg !== undefined) next.sodiumMg = roundTo(value.sodiumMg, 0);
  return next;
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function isMassUnit(unit: string): boolean {
  return MASS_TO_GRAMS[unit] !== undefined;
}

export function isVolumeUnit(unit: string): boolean {
  return VOLUME_TO_ML[unit] !== undefined;
}

export function isCountUnit(unit: string): boolean {
  return COUNT_UNITS.has(unit);
}

/**
 * Convert a parsed quantity to grams. Returns null when conversion is impossible
 * (unknown unit, missing density / piece weight).
 */
export function toGrams(
  quantity: number | undefined,
  unit: string | undefined,
  ingredient: GramConvertible | undefined
): number | null {
  if (quantity === undefined || !Number.isFinite(quantity) || quantity < 0) return null;
  if (quantity === 0) return 0;

  if (!unit) {
    if (ingredient?.gramsPerPiece !== undefined) {
      return quantity * ingredient.gramsPerPiece;
    }
    if (ingredient?.defaultUnit) {
      return toGrams(quantity, ingredient.defaultUnit, ingredient);
    }
    return null;
  }

  const massFactor = MASS_TO_GRAMS[unit];
  if (massFactor !== undefined) return quantity * massFactor;

  const mlFactor = VOLUME_TO_ML[unit];
  if (mlFactor !== undefined) {
    const density = ingredient?.densityGPerMl;
    if (density === undefined || !Number.isFinite(density) || density <= 0) return null;
    return quantity * mlFactor * density;
  }

  if (COUNT_UNITS.has(unit)) {
    const gramsPerPiece = ingredient?.gramsPerPiece;
    if (gramsPerPiece === undefined || !Number.isFinite(gramsPerPiece) || gramsPerPiece <= 0) {
      return null;
    }
    return quantity * gramsPerPiece;
  }

  if (unit === "pinch") return quantity * PINCH_GRAMS;
  if (unit === "dash") return quantity * DASH_GRAMS;

  return null;
}

export function retentionKey(method: CookingMethod, nutrientKey: string): string {
  return `${method}:${nutrientKey}`;
}

export function indexRetentionFactors(
  factors: readonly RetentionFactor[]
): Map<string, number> {
  const index = new Map<string, number>();
  for (const factor of factors) {
    index.set(retentionKey(factor.cookingMethod, factor.nutrientKey), factor.factor);
  }
  return index;
}

export function applyRetention(
  nutrients: Per100g,
  cookingMethod: CookingMethod | undefined,
  retentionIndex: Map<string, number>
): Per100g {
  if (!cookingMethod || cookingMethod === "raw") return clonePer100g(nutrients);

  const next = clonePer100g(nutrients);
  (Object.keys(DOMAIN_TO_RETENTION_KEY) as Array<keyof Per100g>).forEach((domainKey) => {
    const value = next[domainKey];
    if (value === undefined) return;
    const tableKey = DOMAIN_TO_RETENTION_KEY[domainKey];
    const factor = retentionIndex.get(retentionKey(cookingMethod, tableKey));
    if (factor === undefined) return;
    next[domainKey] = value * factor;
  });
  return next;
}

export function nutritionConfidenceLabel(confidence: number): NutritionConfidenceLabel {
  if (confidence >= NUTRITION_CONFIDENCE_HIGH) return "high";
  if (confidence >= NUTRITION_CONFIDENCE_MEDIUM) return "medium";
  return "low";
}

export function formatNutritionConfidence(label: NutritionConfidenceLabel): string {
  if (label === "high") return "High";
  if (label === "medium") return "Medium";
  return "Low";
}

export function buildNutritionIndexes(input: {
  catalog: IngredientCatalog;
  nutrients: readonly IngredientNutrients[];
  customIngredients?: readonly CustomIngredient[];
  retentionFactors: readonly RetentionFactor[];
}): NutritionIndexes {
  const ingredientsById = new Map<string, Ingredient>();
  for (const ingredient of input.catalog.ingredients) {
    ingredientsById.set(ingredient.id, ingredient);
  }
  const nutrientsByIngredientId = new Map<string, IngredientNutrients>();
  for (const row of input.nutrients) {
    const existing = nutrientsByIngredientId.get(row.ingredientId);
    if (!existing || sourceRank(row.source) >= sourceRank(existing.source)) {
      nutrientsByIngredientId.set(row.ingredientId, row);
    }
  }
  const customById = new Map<string, CustomIngredient>();
  for (const item of input.customIngredients ?? []) {
    customById.set(item.id, item);
  }
  return {
    ingredientsById,
    nutrientsByIngredientId,
    customById,
    retentionByMethodNutrient: indexRetentionFactors(input.retentionFactors),
  };
}

function sourceRank(source: IngredientNutrients["source"]): number {
  if (source === "usda") return 3;
  if (source === "off") return 2;
  return 1;
}

type LineResolution =
  | {
      kind: "ok";
      grams: number;
      per100g: Per100g;
      matchConfidence: number;
    }
  | { kind: "unresolved" }
  | { kind: "missing_data"; matchConfidence: number };

function resolveLine(
  line: RecipeIngredientLine,
  indexes: NutritionIndexes
): LineResolution {
  const parsed = parseIngredientLine(line.rawText);
  const quantity = line.quantity ?? parsed.quantity;
  const unit = line.unit ?? parsed.unit;

  if (line.customIngredientId) {
    const custom = indexes.customById.get(line.customIngredientId);
    if (!custom) return { kind: "unresolved" };
    const grams = toGrams(quantity, unit, custom);
    if (grams === null || !custom.per100g || !hasRequiredMacros(custom.per100g)) {
      return { kind: "missing_data", matchConfidence: line.matchConfidence ?? 1 };
    }
    return {
      kind: "ok",
      grams,
      per100g: custom.per100g,
      matchConfidence: line.matchConfidence ?? 1,
    };
  }

  const ingredientId = line.ingredientId;
  if (!ingredientId) return { kind: "unresolved" };
  const ingredient = indexes.ingredientsById.get(ingredientId);
  if (!ingredient) return { kind: "unresolved" };
  const grams = toGrams(quantity, unit, ingredient);
  const cached = indexes.nutrientsByIngredientId.get(ingredientId);
  if (grams === null || !cached || !hasRequiredMacros(cached.per100g)) {
    return {
      kind: "missing_data",
      matchConfidence: line.matchConfidence ?? 0,
    };
  }
  return {
    kind: "ok",
    grams,
    per100g: cached.per100g,
    matchConfidence: line.matchConfidence ?? 0,
  };
}

export function hasRequiredMacros(value: Per100g | undefined): value is Per100g {
  if (!value) return false;
  return (
    Number.isFinite(value.kcal) &&
    Number.isFinite(value.proteinG) &&
    Number.isFinite(value.fatG) &&
    Number.isFinite(value.carbG)
  );
}

export function aggregateNutritionConfidence(input: {
  lineWeights: Array<{ grams: number; matchConfidence: number; ok: boolean }>;
}): number {
  if (input.lineWeights.length === 0) return 0;
  let weighted = 0;
  let totalGrams = 0;
  let okCount = 0;
  for (const line of input.lineWeights) {
    const grams = Math.max(line.grams, 1);
    totalGrams += grams;
    if (line.ok) {
      weighted += line.matchConfidence * grams;
      okCount += 1;
    }
  }
  const coverage = okCount / input.lineWeights.length;
  const weightedMean = totalGrams > 0 ? weighted / totalGrams : 0;
  return clamp01(roundTo(weightedMean * coverage, 3));
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function computeRecipeNutrition(
  recipe: Recipe,
  indexes: NutritionIndexes
): RecipeNutrition {
  let total = emptyPer100g();
  const unresolvedLineIds: string[] = [];
  const missingDataLineIds: string[] = [];
  const lineWeights: Array<{ grams: number; matchConfidence: number; ok: boolean }> = [];

  for (const line of recipe.ingredients) {
    const resolved = resolveLine(line, indexes);
    if (resolved.kind === "unresolved") {
      unresolvedLineIds.push(line.id);
      lineWeights.push({ grams: 1, matchConfidence: 0, ok: false });
      continue;
    }
    if (resolved.kind === "missing_data") {
      missingDataLineIds.push(line.id);
      lineWeights.push({
        grams: 1,
        matchConfidence: resolved.matchConfidence,
        ok: false,
      });
      continue;
    }

    const contribution = applyRetention(
      scalePer100g(resolved.per100g, resolved.grams),
      recipe.cookingMethod,
      indexes.retentionByMethodNutrient
    );
    total = addPer100g(total, contribution);
    lineWeights.push({
      grams: resolved.grams,
      matchConfidence: resolved.matchConfidence,
      ok: true,
    });
  }

  const servings = Math.max(1, recipe.servings ?? 1);
  const confidence = aggregateNutritionConfidence({ lineWeights });
  return {
    recipeId: recipe.id,
    total: roundNutrition(total),
    perServing: roundNutrition(scaleNutrients(total, 1 / servings)),
    confidence,
    confidenceLabel: nutritionConfidenceLabel(confidence),
    unresolvedLineIds,
    missingDataLineIds,
  };
}

export function ingredientIdsNeedingFetch(
  recipes: readonly Recipe[],
  indexes: NutritionIndexes
): string[] {
  const missing = new Set<string>();
  for (const recipe of recipes) {
    for (const line of recipe.ingredients) {
      if (!line.ingredientId || line.customIngredientId) continue;
      if (indexes.nutrientsByIngredientId.has(line.ingredientId)) continue;
      const ingredient = indexes.ingredientsById.get(line.ingredientId);
      if (ingredient?.fdcId) missing.add(line.ingredientId);
    }
  }
  return [...missing];
}

export function mergeNutrientCaches(
  primary: readonly IngredientNutrients[],
  fallback: readonly IngredientNutrients[]
): IngredientNutrients[] {
  const byIngredient = new Map<string, IngredientNutrients>();
  for (const row of fallback) byIngredient.set(row.ingredientId, row);
  for (const row of primary) byIngredient.set(row.ingredientId, row);
  return [...byIngredient.values()];
}
