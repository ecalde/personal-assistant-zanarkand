// Phase 8: USDA / Open Food Facts nutrition lookup with cache-on-demand.
// Secrets (supabase secrets set): USDA_FDC_API_KEY
// Mapping stays aligned with src/core/nutritionFetchContract.ts.

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_IDS = 40;

const USDA_NUTRIENT_NUMBERS: Record<string, string> = {
  "208": "kcal",
  "203": "proteinG",
  "204": "fatG",
  "205": "carbG",
  "291": "fiberG",
  "269": "sugarG",
  "307": "sodiumMg",
};

const USDA_NUTRIENT_IDS: Record<number, string> = {
  1008: "kcal",
  1003: "proteinG",
  1004: "fatG",
  1005: "carbG",
  1079: "fiberG",
  2000: "sugarG",
  1093: "sodiumMg",
};

type Per100g = {
  kcal: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  fiberG?: number;
  sugarG?: number;
  sodiumMg?: number;
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
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

function mapUsdaFoodToPer100g(food: unknown): Per100g | null {
  if (!isPlainObject(food)) return null;
  const nutrients = food.foodNutrients;
  if (!Array.isArray(nutrients)) return null;
  const mapped: Record<string, number> = {};
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
    const idRaw = asFiniteNumber(entry.nutrientId) ?? (nested ? asFiniteNumber(nested.id) : undefined);
    let key: string | undefined;
    if (numberRaw && USDA_NUTRIENT_NUMBERS[numberRaw]) key = USDA_NUTRIENT_NUMBERS[numberRaw];
    else if (idRaw !== undefined && USDA_NUTRIENT_IDS[idRaw]) key = USDA_NUTRIENT_IDS[idRaw];
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

function mapOffProductToPer100g(product: unknown): Per100g | null {
  if (!isPlainObject(product)) return null;
  const nutriments = isPlainObject(product.nutriments) ? product.nutriments : product;
  const kcal =
    asFiniteNumber(nutriments["energy-kcal_100g"]) ?? asFiniteNumber(nutriments["energy-kcal"]);
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
  if (sodiumG !== undefined) per100g.sodiumMg = sodiumG < 50 ? sodiumG * 1000 : sodiumG;
  return per100g;
}

function per100gToRow(value: Per100g): Record<string, number> {
  const row: Record<string, number> = {
    kcal: value.kcal,
    protein_g: value.proteinG,
    fat_g: value.fatG,
    carb_g: value.carbG,
  };
  if (value.fiberG !== undefined) row.fiber_g = value.fiberG;
  if (value.sugarG !== undefined) row.sugar_g = value.sugarG;
  if (value.sodiumMg !== undefined) row.sodium_mg = value.sodiumMg;
  return row;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = req.headers.get("Authorization");
  if (!supabaseUrl || !supabaseAnonKey || !authorization) {
    return json(401, { error: "Authentication required." });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return json(401, { error: "Authentication required." });
  }

  let body: { ingredientIds?: unknown; barcode?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Expected JSON body." });
  }

  const rawIds = Array.isArray(body.ingredientIds) ? body.ingredientIds : [];
  if (rawIds.length > MAX_IDS) {
    return json(400, { error: `Request at most ${MAX_IDS} ingredient ids.` });
  }
  const ingredientIds: string[] = [];
  const seen = new Set<string>();
  for (const item of rawIds) {
    if (typeof item !== "string" || !UUID_RE.test(item)) {
      return json(400, { error: "ingredientIds must be an array of UUIDs." });
    }
    if (seen.has(item)) continue;
    seen.add(item);
    ingredientIds.push(item);
  }

  let barcode: string | undefined;
  if (typeof body.barcode === "string" && body.barcode.trim()) {
    const trimmed = body.barcode.trim();
    if (!/^\d{8,14}$/.test(trimmed)) {
      return json(400, { error: "barcode must be 8–14 digits." });
    }
    barcode = trimmed;
  }

  const admin = serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey)
    : supabase;

  const cachedById = new Map<
    string,
    {
      ingredientId: string;
      source: string;
      fdcId?: number;
      per100g: Per100g;
      fetchedAtIso: string;
    }
  >();

  if (ingredientIds.length > 0) {
    const { data: cachedRows, error: cacheError } = await admin
      .from("ingredient_nutrients")
      .select("*")
      .in("ingredient_id", ingredientIds);
    if (cacheError) {
      return json(500, { error: "Could not read nutrition cache." });
    }
    for (const row of cachedRows ?? []) {
      const per100g = mapRowPer100g(row.per_100g);
      if (!per100g) continue;
      cachedById.set(row.ingredient_id, {
        ingredientId: row.ingredient_id,
        source: row.source,
        fdcId: row.fdc_id ?? undefined,
        per100g,
        fetchedAtIso: row.fetched_at,
      });
    }
  }

  const uncachedIds = ingredientIds.filter((id) => !cachedById.has(id));
  const usdaKey = Deno.env.get("USDA_FDC_API_KEY")?.trim();
  const upserts: Array<{
    ingredient_id: string;
    source: string;
    fdc_id: number | null;
    per_100g: Record<string, number>;
  }> = [];

  if (uncachedIds.length > 0 && usdaKey) {
    const { data: ingredients } = await admin
      .from("ingredients")
      .select("id, fdc_id")
      .in("id", uncachedIds);

    for (const ingredient of ingredients ?? []) {
      if (!ingredient.fdc_id) continue;
      try {
        const usdaRes = await fetch(
          `https://api.nal.usda.gov/fdc/v1/food/${ingredient.fdc_id}?api_key=${encodeURIComponent(usdaKey)}`
        );
        if (!usdaRes.ok) continue;
        const food = await usdaRes.json();
        const per100g = mapUsdaFoodToPer100g(food);
        if (!per100g) continue;
        upserts.push({
          ingredient_id: ingredient.id,
          source: "usda",
          fdc_id: ingredient.fdc_id,
          per_100g: per100gToRow(per100g),
        });
        cachedById.set(ingredient.id, {
          ingredientId: ingredient.id,
          source: "usda",
          fdcId: ingredient.fdc_id,
          per100g,
          fetchedAtIso: new Date().toISOString(),
        });
      } catch {
        // Skip this ingredient; it stays in missingIngredientIds.
      }
    }
  }

  let offProduct:
    | { barcode: string; name?: string; per100g: Per100g }
    | undefined;
  if (barcode) {
    try {
      const offRes = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${barcode}.json`,
        { headers: { "User-Agent": "personal-assistant/1.0 (nutrition-fetch)" } }
      );
      if (offRes.ok) {
        const payload = await offRes.json();
        const product = payload?.product ?? payload;
        const per100g = mapOffProductToPer100g(product);
        if (per100g) {
          const name =
            typeof product?.product_name === "string" ? product.product_name.trim() : "";
          offProduct = name ? { barcode, name, per100g } : { barcode, per100g };
          const usdaMissed = uncachedIds.filter((id) => !cachedById.has(id));
          if (usdaMissed.length === 1) {
            const ingredientId = usdaMissed[0]!;
            upserts.push({
              ingredient_id: ingredientId,
              source: "off",
              fdc_id: null,
              per_100g: per100gToRow(per100g),
            });
            cachedById.set(ingredientId, {
              ingredientId,
              source: "off",
              per100g,
              fetchedAtIso: new Date().toISOString(),
            });
          }
        }
      }
    } catch {
      // OFF is optional.
    }
  }

  if (upserts.length > 0 && serviceRoleKey) {
    await admin.from("ingredient_nutrients").upsert(upserts, {
      onConflict: "ingredient_id,source",
    });
  }

  const nutrients = ingredientIds
    .map((id) => cachedById.get(id))
    .filter((row): row is NonNullable<typeof row> => Boolean(row));
  const missingIngredientIds = ingredientIds.filter((id) => !cachedById.has(id));

  return json(200, { nutrients, missingIngredientIds, offProduct });
});

function mapRowPer100g(value: unknown): Per100g | null {
  if (!isPlainObject(value)) return null;
  const kcal = asFiniteNumber(value.kcal);
  const proteinG = asFiniteNumber(value.protein_g ?? value.proteinG);
  const fatG = asFiniteNumber(value.fat_g ?? value.fatG);
  const carbG = asFiniteNumber(value.carb_g ?? value.carbG);
  if (kcal === undefined || proteinG === undefined || fatG === undefined || carbG === undefined) {
    return null;
  }
  const per100g: Per100g = { kcal, proteinG, fatG, carbG };
  const fiberG = asFiniteNumber(value.fiber_g ?? value.fiberG);
  const sugarG = asFiniteNumber(value.sugar_g ?? value.sugarG);
  const sodiumMg = asFiniteNumber(value.sodium_mg ?? value.sodiumMg);
  if (fiberG !== undefined) per100g.fiberG = fiberG;
  if (sugarG !== undefined) per100g.sugarG = sugarG;
  if (sodiumMg !== undefined) per100g.sodiumMg = sodiumMg;
  return per100g;
}
