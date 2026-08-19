/**
 * nutrition-fetch Edge Function contract (pure). USDA/OFF I/O is injected.
 * Keep mapping aligned with supabase/functions/nutrition-fetch/index.ts.
 */

import type { NutrientSource, Per100g } from "./model";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const NUTRITION_FETCH_MAX_IDS = 40;

const USDA_NUTRIENT_NUMBERS: Record<string, keyof Per100g> = {
  "208": "kcal",
  "203": "proteinG",
  "204": "fatG",
  "205": "carbG",
  "291": "fiberG",
  "269": "sugarG",
  "307": "sodiumMg",
};

const USDA_NUTRIENT_IDS: Record<number, keyof Per100g> = {
  1008: "kcal",
  1003: "proteinG",
  1004: "fatG",
  1005: "carbG",
  1079: "fiberG",
  2000: "sugarG",
  1093: "sodiumMg",
};

export type NutritionIngredientRef = {
  id: string;
  fdcId?: number;
};

export type CachedNutrientRow = {
  ingredientId: string;
  source: NutrientSource;
  fdcId?: number;
  per100g: Per100g;
  fetchedAtIso: string;
};

export type UpsertNutrientRow = {
  ingredientId: string;
  source: NutrientSource;
  fdcId?: number;
  per100g: Per100g;
};

export type NutritionFetchRequest = {
  userId: string | null | undefined;
  ingredientIds: unknown;
  barcode?: unknown;
};

export type NutritionFetchDeps = {
  loadIngredients: (ids: string[]) => Promise<NutritionIngredientRef[]>;
  loadCachedNutrients: (ingredientIds: string[]) => Promise<CachedNutrientRow[]>;
  upsertNutrients: (rows: UpsertNutrientRow[]) => Promise<void>;
  fetchUsdaFood: (fdcId: number) => Promise<unknown | null>;
  fetchOffProduct?: (barcode: string) => Promise<unknown | null>;
  nowIso?: () => string;
};

export type NutritionFetchSuccess = {
  ok: true;
  nutrients: CachedNutrientRow[];
  missingIngredientIds: string[];
  offProduct?: { barcode: string; name?: string; per100g: Per100g };
};

export type NutritionFetchFailure = { ok: false; status: number; error: string };
export type NutritionFetchResult = NutritionFetchSuccess | NutritionFetchFailure;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function parseIngredientIdList(value: unknown): string[] | string {
  if (!Array.isArray(value)) return "ingredientIds must be an array of UUIDs.";
  if (value.length === 0) return [];
  if (value.length > NUTRITION_FETCH_MAX_IDS) {
    return `Request at most ${NUTRITION_FETCH_MAX_IDS} ingredient ids.`;
  }
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string" || !isUuid(item)) {
      return "ingredientIds must be an array of UUIDs.";
    }
    if (seen.has(item)) continue;
    seen.add(item);
    ids.push(item);
  }
  return ids;
}

export function parseBarcode(
  value: unknown
): { ok: true; barcode?: string } | { ok: false; error: string } {
  if (value === undefined || value === null || value === "") return { ok: true };
  if (typeof value !== "string") return { ok: false, error: "barcode must be a string." };
  const trimmed = value.trim();
  if (!trimmed) return { ok: true };
  if (!/^\d{8,14}$/.test(trimmed)) return { ok: false, error: "barcode must be 8–14 digits." };
  return { ok: true, barcode: trimmed };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export function mapUsdaFoodToPer100g(food: unknown): Per100g | null {
  if (!isPlainObject(food)) return null;
  const nutrients = food.foodNutrients;
  if (!Array.isArray(nutrients)) return null;

  const mapped: Partial<Per100g> = {};
  for (const entry of nutrients) {
    if (!isPlainObject(entry)) continue;
    const amount =
      asFiniteNumber(entry.amount) ??
      asFiniteNumber(entry.value) ??
      asFiniteNumber(entry.nutrientAmount);
    if (amount === undefined) continue;

    const nested = isPlainObject(entry.nutrient) ? entry.nutrient : undefined;
    const numberRaw =
      (typeof entry.nutrientNumber === "string" ? entry.nutrientNumber : undefined) ??
      (typeof nested?.number === "string" ? nested.number : undefined) ??
      (typeof nested?.number === "number" ? String(nested.number) : undefined);
    const idRaw =
      asFiniteNumber(entry.nutrientId) ??
      (nested ? asFiniteNumber(nested.id) : undefined);

    let key: keyof Per100g | undefined;
    if (numberRaw && USDA_NUTRIENT_NUMBERS[numberRaw] !== undefined) {
      key = USDA_NUTRIENT_NUMBERS[numberRaw];
    } else if (idRaw !== undefined && USDA_NUTRIENT_IDS[idRaw] !== undefined) {
      key = USDA_NUTRIENT_IDS[idRaw];
    }
    if (!key) continue;
    mapped[key] = amount;
  }

  if (
    mapped.kcal === undefined ||
    mapped.proteinG === undefined ||
    mapped.fatG === undefined ||
    mapped.carbG === undefined
  ) {
    return null;
  }

  const per100g: Per100g = {
    kcal: mapped.kcal,
    proteinG: mapped.proteinG,
    fatG: mapped.fatG,
    carbG: mapped.carbG,
  };
  if (mapped.fiberG !== undefined) per100g.fiberG = mapped.fiberG;
  if (mapped.sugarG !== undefined) per100g.sugarG = mapped.sugarG;
  if (mapped.sodiumMg !== undefined) per100g.sodiumMg = mapped.sodiumMg;
  return per100g;
}

export function mapOffProductToPer100g(product: unknown): Per100g | null {
  if (!isPlainObject(product)) return null;
  const nutriments = isPlainObject(product.nutriments) ? product.nutriments : product;
  const kcal =
    asFiniteNumber(nutriments["energy-kcal_100g"]) ??
    asFiniteNumber(nutriments["energy-kcal"]);
  const proteinG = asFiniteNumber(nutriments.proteins_100g);
  const fatG = asFiniteNumber(nutriments.fat_100g);
  const carbG = asFiniteNumber(nutriments.carbohydrates_100g);
  if (kcal === undefined || proteinG === undefined || fatG === undefined || carbG === undefined) {
    return null;
  }
  const per100g: Per100g = { kcal, proteinG, fatG, carbG };
  const fiberG = asFiniteNumber(nutriments.fiber_100g);
  const sugarG = asFiniteNumber(nutriments.sugars_100g);
  if (fiberG !== undefined) per100g.fiberG = fiberG;
  if (sugarG !== undefined) per100g.sugarG = sugarG;
  const sodiumG = asFiniteNumber(nutriments.sodium_100g);
  const sodiumMg = asFiniteNumber(nutriments.sodium_100g)
    ? sodiumG !== undefined && sodiumG < 50
      ? sodiumG * 1000
      : sodiumG
    : asFiniteNumber(nutriments.salt_100g) !== undefined
      ? (asFiniteNumber(nutriments.salt_100g) ?? 0) * 400
      : undefined;
  if (sodiumMg !== undefined) per100g.sodiumMg = sodiumMg;
  return per100g;
}

export function offProductName(product: unknown): string | undefined {
  if (!isPlainObject(product)) return undefined;
  if (typeof product.product_name === "string" && product.product_name.trim()) {
    return product.product_name.trim();
  }
  return undefined;
}

export async function handleNutritionFetch(
  request: NutritionFetchRequest,
  deps: NutritionFetchDeps
): Promise<NutritionFetchResult> {
  if (!request.userId || !request.userId.trim()) {
    return { ok: false, status: 401, error: "Authentication required." };
  }

  const idsOrError = parseIngredientIdList(request.ingredientIds);
  if (typeof idsOrError === "string") {
    return { ok: false, status: 400, error: idsOrError };
  }
  const barcodeResult = parseBarcode(request.barcode);
  if (!barcodeResult.ok) {
    return { ok: false, status: 400, error: barcodeResult.error };
  }

  const ingredientIds = idsOrError;
  const barcode = barcodeResult.barcode;
  const nowIso = deps.nowIso ?? (() => new Date().toISOString());

  if (ingredientIds.length === 0 && !barcode) {
    return { ok: true, nutrients: [], missingIngredientIds: [] };
  }

  const cached = ingredientIds.length > 0 ? await deps.loadCachedNutrients(ingredientIds) : [];
  const cachedById = new Map(cached.map((row) => [row.ingredientId, row]));
  const uncachedIds = ingredientIds.filter((id) => !cachedById.has(id));

  const upserts: UpsertNutrientRow[] = [];
  const fetched: CachedNutrientRow[] = [...cached];

  if (uncachedIds.length > 0) {
    const ingredients = await deps.loadIngredients(uncachedIds);
    const byId = new Map(ingredients.map((item) => [item.id, item]));

    for (const id of uncachedIds) {
      const ingredient = byId.get(id);
      if (!ingredient?.fdcId) continue;
      const food = await deps.fetchUsdaFood(ingredient.fdcId);
      const per100g = mapUsdaFoodToPer100g(food);
      if (!per100g) continue;
      const row: UpsertNutrientRow = {
        ingredientId: id,
        source: "usda",
        fdcId: ingredient.fdcId,
        per100g,
      };
      upserts.push(row);
      fetched.push({
        ...row,
        fetchedAtIso: nowIso(),
      });
      cachedById.set(id, fetched[fetched.length - 1]!);
    }
  }

  let offProduct: NutritionFetchSuccess["offProduct"];
  if (barcode && deps.fetchOffProduct) {
    const product = await deps.fetchOffProduct(barcode);
    const per100g = mapOffProductToPer100g(product);
    if (per100g) {
      const name = offProductName(product);
      offProduct = name ? { barcode, name, per100g } : { barcode, per100g };

      const usdaMissed = uncachedIds.filter((id) => !cachedById.has(id));
      if (usdaMissed.length === 1) {
        const ingredientId = usdaMissed[0]!;
        const row: UpsertNutrientRow = {
          ingredientId,
          source: "off",
          per100g,
        };
        upserts.push(row);
        fetched.push({ ...row, fetchedAtIso: nowIso() });
        cachedById.set(ingredientId, fetched[fetched.length - 1]!);
      }
    }
  }

  if (upserts.length > 0) {
    await deps.upsertNutrients(upserts);
  }

  const missingIngredientIds = ingredientIds.filter((id) => !cachedById.has(id));
  const result: NutritionFetchSuccess = {
    ok: true,
    nutrients: fetched,
    missingIngredientIds,
  };
  if (offProduct) result.offProduct = offProduct;
  return result;
}
