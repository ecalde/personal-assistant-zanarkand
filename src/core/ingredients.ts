/**
 * Ingredient normalization, matching, confidence, and pantry availability.
 * Pure functions — no I/O. Matching is client-side against a loaded catalog
 * (pg_trgm indexes support future SQL typeahead).
 */

import type { IngredientCatalog } from "./ingredientCatalog";
import type {
  CustomIngredient,
  Ingredient,
  IngredientAlias,
  IngredientMatch,
  PantryItem,
  Recipe,
  RecipeAvailability,
  RecipeIngredientLine,
} from "./model";

export const INGREDIENT_FUZZY_THRESHOLD = 0.45;
export const INGREDIENT_EXACT_ALIAS_CONFIDENCE = 0.99;
export const INGREDIENT_EXACT_CANONICAL_CONFIDENCE = 1;

export type ParsedIngredientLine = {
  quantity?: number;
  unit?: string;
  name: string;
};

export type IndexedIngredientCatalog = IngredientCatalog & {
  byId: Map<string, Ingredient>;
  aliasByNormalized: Map<string, IngredientAlias>;
  canonicalByNormalized: Map<string, Ingredient>;
};

export const RECIPE_AVAILABILITY_LABELS: Record<RecipeAvailability, string> = {
  can_make: "Can make",
  partial: "Partial",
  missing: "Missing",
};

export function isRecipeAvailability(value: string): value is RecipeAvailability {
  return value === "can_make" || value === "partial" || value === "missing";
}

export function formatRecipeAvailability(status: RecipeAvailability): string {
  return RECIPE_AVAILABILITY_LABELS[status];
}

const UNIT_ALIASES: Record<string, string> = {
  cup: "cup",
  cups: "cup",
  tbsp: "tbsp",
  tablespoon: "tbsp",
  tablespoons: "tbsp",
  tsp: "tsp",
  teaspoon: "tsp",
  teaspoons: "tsp",
  g: "g",
  gram: "g",
  grams: "g",
  kg: "kg",
  kilogram: "kg",
  kilograms: "kg",
  oz: "oz",
  ounce: "oz",
  ounces: "oz",
  lb: "lb",
  pound: "lb",
  pounds: "lb",
  ml: "ml",
  milliliter: "ml",
  milliliters: "ml",
  millilitre: "ml",
  millilitres: "ml",
  l: "l",
  liter: "l",
  litre: "l",
  liters: "l",
  litres: "l",
  clove: "clove",
  cloves: "clove",
  piece: "piece",
  pieces: "piece",
  pinch: "pinch",
  pinches: "pinch",
  dash: "dash",
  dashes: "dash",
  slice: "slice",
  slices: "slice",
  can: "can",
  cans: "can",
  bunch: "bunch",
  bunches: "bunch",
  handful: "handful",
  sprig: "sprig",
  sprigs: "sprig",
  stick: "stick",
  sticks: "stick",
  head: "head",
  heads: "head",
  fillet: "fillet",
  fillets: "fillet",
};

const UNICODE_FRACTIONS: Record<string, number> = {
  "½": 0.5,
  "¼": 0.25,
  "¾": 0.75,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "⅛": 0.125,
  "⅜": 0.375,
  "⅝": 0.625,
  "⅞": 0.875,
};

const DESCRIPTOR_WORDS = new Set([
  "a",
  "an",
  "of",
  "the",
  "fresh",
  "organic",
  "diced",
  "chopped",
  "minced",
  "sliced",
  "grated",
  "shredded",
  "crushed",
  "peeled",
  "seeded",
  "roughly",
  "finely",
  "coarsely",
  "thinly",
  "cubed",
  "melted",
  "softened",
  "optional",
  "packed",
  "divided",
  "garnish",
  "room",
  "temperature",
  "to",
  "taste",
  "plus",
  "more",
  "for",
  "and",
  "or",
  "about",
  "approximately",
  "large",
  "small",
  "medium",
  "extra",
  "virgin",
  "unsalted",
  "salted",
  "boneless",
  "skinless",
  "cooked",
  "uncooked",
  "raw",
  "dried",
  "frozen",
  "canned",
]);

const IRREGULAR_SINGULAR: Record<string, string> = {
  tomatoes: "tomato",
  potatoes: "potato",
  leaves: "leaf",
  loaves: "loaf",
  knives: "knife",
  halves: "half",
  berries: "berry",
  cherries: "cherry",
  cloves: "clove",
  molasses: "molasses",
};

const LEADING_QTY_RE =
  /^(?:(\d+\s+\d+\/\d+)|(\d+\/\d+)|(\d+)[–-](\d+(?:\.\d+)?)|([½¼¾⅓⅔⅛⅜⅝⅞])|(\d+(?:\.\d+)?))/;
const MIXED_FRACTION_RE = /^(\d+)\s+(\d+)\/(\d+)$/;
const SIMPLE_FRACTION_RE = /^(\d+)\/(\d+)$/;

export function pantryIsInUse(pantry: readonly PantryItem[]): boolean {
  return pantry.some((item) => item.available);
}

function singularizeWord(word: string): string {
  if (IRREGULAR_SINGULAR[word]) return IRREGULAR_SINGULAR[word];
  if (word.length <= 3) return word;
  if (word.endsWith("ies") && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith("oes")) return word.slice(0, -2);
  if (
    word.endsWith("ses") ||
    word.endsWith("xes") ||
    word.endsWith("zes") ||
    word.endsWith("ches") ||
    word.endsWith("shes")
  ) {
    return word.slice(0, -2);
  }
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

/** Lowercase, strip punctuation, drop culinary descriptors, singularize. */
export function normalizeIngredientName(value: string): string {
  const withoutParens = value.replace(/\([^)]*\)/g, " ");
  const tokens = withoutParens
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length > 0 && !DESCRIPTOR_WORDS.has(token) && !/^\d+(?:\/\d+)?$/.test(token))
    .map(singularizeWord);
  return tokens.join(" ").trim();
}

export function parseIngredientQuantity(raw: string): number | undefined {
  const mixed = MIXED_FRACTION_RE.exec(raw);
  if (mixed) {
    const whole = Number(mixed[1]);
    const num = Number(mixed[2]);
    const den = Number(mixed[3]);
    if (den === 0) return undefined;
    return whole + num / den;
  }
  const fraction = SIMPLE_FRACTION_RE.exec(raw);
  if (fraction) {
    const num = Number(fraction[1]);
    const den = Number(fraction[2]);
    if (den === 0) return undefined;
    return num / den;
  }
  if (UNICODE_FRACTIONS[raw] !== undefined) return UNICODE_FRACTIONS[raw];
  const asNumber = Number(raw);
  if (Number.isFinite(asNumber) && asNumber >= 0) return asNumber;
  return undefined;
}

export function canonicalizeIngredientUnit(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return undefined;
  return UNIT_ALIASES[trimmed];
}

/** Parse quantity + unit from a raw recipe line. */
export function parseIngredientLine(rawText: string): ParsedIngredientLine {
  const trimmed = rawText.trim();
  const primary = trimmed.split(",")[0]?.trim() ?? trimmed;
  const qtyMatch = LEADING_QTY_RE.exec(primary);

  if (!qtyMatch) {
    return { name: normalizeIngredientName(primary) || primary.toLowerCase() };
  }

  let quantity: number | undefined;
  if (qtyMatch[1]) {
    quantity = parseIngredientQuantity(qtyMatch[1]);
  } else if (qtyMatch[2]) {
    quantity = parseIngredientQuantity(qtyMatch[2]);
  } else if (qtyMatch[3] && qtyMatch[4]) {
    const low = Number(qtyMatch[3]);
    const high = Number(qtyMatch[4]);
    if (Number.isFinite(low) && Number.isFinite(high)) {
      quantity = (low + high) / 2;
    }
  } else if (qtyMatch[5]) {
    quantity = UNICODE_FRACTIONS[qtyMatch[5]];
  } else if (qtyMatch[6]) {
    quantity = parseIngredientQuantity(qtyMatch[6]);
  }

  const rest = primary.slice(qtyMatch[0].length).trim();
  const words = rest.split(/\s+/).filter(Boolean);
  let unit: string | undefined;
  let nameWords = words;
  if (words[0]) {
    const unitMatch = canonicalizeIngredientUnit(words[0]);
    if (unitMatch) {
      unit = unitMatch;
      nameWords = words.slice(1);
    }
  }

  const name = normalizeIngredientName(nameWords.join(" "));
  const parsed: ParsedIngredientLine = {
    name: name || normalizeIngredientName(primary) || primary.toLowerCase(),
  };
  if (quantity !== undefined) parsed.quantity = quantity;
  if (unit) parsed.unit = unit;
  return parsed;
}

/** pg_trgm-style Jaccard similarity of character trigrams. */
export function trigramSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const left = trigrams(a);
  const right = trigrams(b);
  let intersection = 0;
  for (const gram of left) {
    if (right.has(gram)) intersection += 1;
  }
  const union = left.size + right.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function trigrams(value: string): Set<string> {
  const padded = `  ${value} `;
  const grams = new Set<string>();
  for (let i = 0; i <= padded.length - 3; i++) {
    grams.add(padded.slice(i, i + 3));
  }
  return grams;
}

export function indexIngredientCatalog(catalog: IngredientCatalog): IndexedIngredientCatalog {
  const byId = new Map<string, Ingredient>();
  const aliasByNormalized = new Map<string, IngredientAlias>();
  const canonicalByNormalized = new Map<string, Ingredient>();

  for (const ingredient of catalog.ingredients) {
    byId.set(ingredient.id, ingredient);
    const normalized = normalizeIngredientName(ingredient.canonicalName);
    if (normalized && !canonicalByNormalized.has(normalized)) {
      canonicalByNormalized.set(normalized, ingredient);
    }
  }
  for (const alias of catalog.aliases) {
    if (!aliasByNormalized.has(alias.aliasNormalized)) {
      aliasByNormalized.set(alias.aliasNormalized, alias);
    }
    const extra = normalizeIngredientName(alias.alias);
    if (extra && !aliasByNormalized.has(extra)) {
      aliasByNormalized.set(extra, alias);
    }
  }

  return { ...catalog, byId, aliasByNormalized, canonicalByNormalized };
}

export function matchIngredient(
  rawName: string,
  catalog: IngredientCatalog | IndexedIngredientCatalog
): IngredientMatch | undefined {
  const indexed = "byId" in catalog ? catalog : indexIngredientCatalog(catalog);
  const normalized = normalizeIngredientName(rawName);
  if (!normalized) return undefined;

  const exactAlias = indexed.aliasByNormalized.get(normalized);
  if (exactAlias && indexed.byId.has(exactAlias.ingredientId)) {
    return {
      ingredientId: exactAlias.ingredientId,
      confidence: INGREDIENT_EXACT_ALIAS_CONFIDENCE,
      matchedVia: "alias",
    };
  }

  const exactCanonical = indexed.canonicalByNormalized.get(normalized);
  if (exactCanonical) {
    return {
      ingredientId: exactCanonical.id,
      confidence: INGREDIENT_EXACT_CANONICAL_CONFIDENCE,
      matchedVia: "canonical",
    };
  }

  let best: { ingredientId: string; similarity: number } | undefined;
  const consider = (ingredientId: string, candidate: string) => {
    if (!candidate) return;
    const similarity = trigramSimilarity(normalized, candidate);
    if (similarity < INGREDIENT_FUZZY_THRESHOLD) return;
    if (!best || similarity > best.similarity) {
      best = { ingredientId, similarity };
    }
  };

  for (const ingredient of indexed.ingredients) {
    consider(ingredient.id, normalizeIngredientName(ingredient.canonicalName));
  }
  for (const alias of indexed.aliases) {
    consider(alias.ingredientId, alias.aliasNormalized);
    consider(alias.ingredientId, normalizeIngredientName(alias.alias));
  }

  if (!best) return undefined;
  return {
    ingredientId: best.ingredientId,
    confidence: roundConfidence(best.similarity),
    matchedVia: "fuzzy",
  };
}

function roundConfidence(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function matchCustomIngredient(
  rawName: string,
  customIngredients: readonly CustomIngredient[]
): { customIngredientId: string; confidence: number } | undefined {
  const normalized = normalizeIngredientName(rawName);
  if (!normalized) return undefined;
  for (const item of customIngredients) {
    if (normalizeIngredientName(item.name) === normalized) {
      return { customIngredientId: item.id, confidence: 1 };
    }
  }
  return undefined;
}

export function resolveRecipeIngredientLine(
  line: Pick<RecipeIngredientLine, "id" | "rawText" | "optional">,
  catalog: IngredientCatalog | IndexedIngredientCatalog,
  customIngredients?: readonly CustomIngredient[]
): RecipeIngredientLine {
  const parsed = parseIngredientLine(line.rawText);
  const match = matchIngredient(parsed.name || line.rawText, catalog);
  const resolved: RecipeIngredientLine = {
    id: line.id,
    rawText: line.rawText.trim(),
  };
  if (line.optional) resolved.optional = true;
  if (parsed.quantity !== undefined) resolved.quantity = parsed.quantity;
  if (parsed.unit) resolved.unit = parsed.unit;
  if (match) {
    resolved.ingredientId = match.ingredientId;
    resolved.matchConfidence = match.confidence;
    return resolved;
  }
  const custom = customIngredients?.length
    ? matchCustomIngredient(parsed.name || line.rawText, customIngredients)
    : undefined;
  if (custom) {
    resolved.customIngredientId = custom.customIngredientId;
    resolved.matchConfidence = custom.confidence;
  }
  return resolved;
}

export function resolveRecipeIngredients(
  lines: RecipeIngredientLine[],
  catalog: IngredientCatalog | IndexedIngredientCatalog,
  previous?: readonly RecipeIngredientLine[],
  customIngredients?: readonly CustomIngredient[]
): RecipeIngredientLine[] {
  const previousById = new Map((previous ?? []).map((line) => [line.id, line]));
  return lines.map((line) => {
    const prior = previousById.get(line.id);
    if (prior && prior.rawText === line.rawText.trim()) {
      const kept: RecipeIngredientLine = { ...prior, rawText: line.rawText.trim() };
      if (line.optional) kept.optional = true;
      else delete kept.optional;
      return kept;
    }
    return resolveRecipeIngredientLine(line, catalog, customIngredients);
  });
}

export function ingredientDisplayName(
  ingredientId: string | undefined,
  catalog: IngredientCatalog | IndexedIngredientCatalog,
  customIngredients?: readonly CustomIngredient[],
  customIngredientId?: string
): string | undefined {
  if (customIngredientId && customIngredients) {
    const custom = customIngredients.find((item) => item.id === customIngredientId);
    if (custom) return custom.name;
  }
  if (!ingredientId) return undefined;
  const indexed = "byId" in catalog ? catalog : indexIngredientCatalog(catalog);
  return indexed.byId.get(ingredientId)?.canonicalName;
}

type PantryIndex = {
  byIngredientId: Set<string>;
  byCustomIngredientId: Set<string>;
  byNormalizedLabel: Set<string>;
};

function indexPantry(
  pantry: readonly PantryItem[],
  catalog?: IngredientCatalog | IndexedIngredientCatalog
): PantryIndex {
  const byIngredientId = new Set<string>();
  const byCustomIngredientId = new Set<string>();
  const byNormalizedLabel = new Set<string>();
  const indexed = catalog
    ? "byId" in catalog
      ? catalog
      : indexIngredientCatalog(catalog)
    : undefined;

  for (const item of pantry) {
    if (!item.available) continue;
    if (item.ingredientId) byIngredientId.add(item.ingredientId);
    if (item.customIngredientId) byCustomIngredientId.add(item.customIngredientId);
    const labelNorm = normalizeIngredientName(item.label);
    if (labelNorm) byNormalizedLabel.add(labelNorm);
    if (!item.ingredientId && indexed) {
      const match = matchIngredient(item.label, indexed);
      if (match) byIngredientId.add(match.ingredientId);
    }
  }

  return { byIngredientId, byCustomIngredientId, byNormalizedLabel };
}

export function resolvedIngredientIdForLine(
  line: RecipeIngredientLine,
  catalog?: IngredientCatalog | IndexedIngredientCatalog
): string | undefined {
  if (line.ingredientId) return line.ingredientId;
  if (!catalog) return undefined;
  const parsed = parseIngredientLine(line.rawText);
  return matchIngredient(parsed.name || line.rawText, catalog)?.ingredientId;
}

export function ingredientLineLabel(line: RecipeIngredientLine): string {
  const parsed = parseIngredientLine(line.rawText);
  return parsed.name || line.rawText.trim();
}

export function listMissingIngredientLines(
  recipe: Recipe,
  pantry: readonly PantryItem[],
  catalog?: IngredientCatalog | IndexedIngredientCatalog
): RecipeIngredientLine[] {
  return recipe.ingredients.filter(
    (line) => !line.optional && !recipeLineIsInPantry(line, pantry, catalog)
  );
}

export function recipeLineIsInPantry(
  line: RecipeIngredientLine,
  pantry: readonly PantryItem[],
  catalog?: IngredientCatalog | IndexedIngredientCatalog
): boolean {
  const index = indexPantry(pantry, catalog);
  if (line.customIngredientId && index.byCustomIngredientId.has(line.customIngredientId)) {
    return true;
  }
  const ingredientId = resolvedIngredientIdForLine(line, catalog);
  if (ingredientId && index.byIngredientId.has(ingredientId)) return true;
  const parsed = parseIngredientLine(line.rawText);
  if (parsed.name && index.byNormalizedLabel.has(parsed.name)) return true;
  const rawNorm = normalizeIngredientName(line.rawText);
  return Boolean(rawNorm && index.byNormalizedLabel.has(rawNorm));
}

export function computeRecipeAvailability(
  recipe: Recipe,
  pantry: readonly PantryItem[],
  catalog?: IngredientCatalog | IndexedIngredientCatalog
): RecipeAvailability {
  const required = recipe.ingredients.filter((line) => !line.optional);
  if (required.length === 0) return "can_make";

  const index = indexPantry(pantry, catalog);
  let present = 0;
  for (const line of required) {
    const ingredientId = resolvedIngredientIdForLine(line, catalog);
    const parsed = parseIngredientLine(line.rawText);
    const inPantry =
      (line.customIngredientId !== undefined &&
        index.byCustomIngredientId.has(line.customIngredientId)) ||
      (ingredientId !== undefined && index.byIngredientId.has(ingredientId)) ||
      (parsed.name !== "" && index.byNormalizedLabel.has(parsed.name)) ||
      index.byNormalizedLabel.has(normalizeIngredientName(line.rawText));
    if (inPantry) present += 1;
  }

  if (present === required.length) return "can_make";
  if (present === 0) return "missing";
  return "partial";
}

export function buildRecipeAvailabilityMap(
  recipes: readonly Recipe[],
  pantry: readonly PantryItem[],
  catalog?: IngredientCatalog | IndexedIngredientCatalog
): Map<string, RecipeAvailability> {
  const map = new Map<string, RecipeAvailability>();
  for (const recipe of recipes) {
    map.set(recipe.id, computeRecipeAvailability(recipe, pantry, catalog));
  }
  return map;
}

export function countRecipesByAvailability(
  recipes: readonly Recipe[],
  pantry: readonly PantryItem[],
  status: RecipeAvailability,
  catalog?: IngredientCatalog | IndexedIngredientCatalog
): number {
  let count = 0;
  for (const recipe of recipes) {
    if (computeRecipeAvailability(recipe, pantry, catalog) === status) count += 1;
  }
  return count;
}

export type IngredientSuggestion = IngredientMatch & {
  name: string;
};

/** Ranked catalog suggestions for a raw ingredient line (match picker). */
export function suggestIngredientMatches(
  rawName: string,
  catalog: IngredientCatalog | IndexedIngredientCatalog,
  limit = 6
): IngredientSuggestion[] {
  const indexed = "byId" in catalog ? catalog : indexIngredientCatalog(catalog);
  const parsed = parseIngredientLine(rawName);
  const query = parsed.name || normalizeIngredientName(rawName);
  if (!query || limit <= 0) return [];

  const bestById = new Map<string, { confidence: number; matchedVia: IngredientMatch["matchedVia"] }>();

  const consider = (
    ingredientId: string,
    candidate: string,
    matchedVia: IngredientMatch["matchedVia"],
    exactConfidence?: number
  ) => {
    if (!candidate || !indexed.byId.has(ingredientId)) return;
    if (exactConfidence !== undefined) {
      const current = bestById.get(ingredientId);
      if (!current || exactConfidence > current.confidence) {
        bestById.set(ingredientId, { confidence: exactConfidence, matchedVia });
      }
      return;
    }
    const similarity = trigramSimilarity(query, candidate);
    if (similarity < INGREDIENT_FUZZY_THRESHOLD) return;
    const current = bestById.get(ingredientId);
    if (current && current.matchedVia !== "fuzzy") return;
    if (!current || similarity > current.confidence) {
      bestById.set(ingredientId, {
        confidence: roundConfidence(similarity),
        matchedVia,
      });
    }
  };

  const exactAlias = indexed.aliasByNormalized.get(query);
  if (exactAlias) {
    consider(exactAlias.ingredientId, query, "alias", INGREDIENT_EXACT_ALIAS_CONFIDENCE);
  }
  const exactCanonical = indexed.canonicalByNormalized.get(query);
  if (exactCanonical) {
    consider(exactCanonical.id, query, "canonical", INGREDIENT_EXACT_CANONICAL_CONFIDENCE);
  }

  for (const ingredient of indexed.ingredients) {
    consider(ingredient.id, normalizeIngredientName(ingredient.canonicalName), "fuzzy");
  }
  for (const alias of indexed.aliases) {
    consider(alias.ingredientId, alias.aliasNormalized, "fuzzy");
    consider(alias.ingredientId, normalizeIngredientName(alias.alias), "fuzzy");
  }

  return [...bestById.entries()]
    .map(([ingredientId, meta]) => ({
      ingredientId,
      name: indexed.byId.get(ingredientId)?.canonicalName ?? ingredientId,
      confidence: meta.confidence,
      matchedVia: meta.matchedVia,
    }))
    .sort((a, b) => b.confidence - a.confidence || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export function describeIngredientMatch(
  rawText: string,
  catalog: IngredientCatalog | IndexedIngredientCatalog,
  customIngredients?: readonly CustomIngredient[]
): string | undefined {
  const parsed = parseIngredientLine(rawText);
  const match = matchIngredient(parsed.name || rawText, catalog);
  if (match) {
    const name = ingredientDisplayName(match.ingredientId, catalog);
    if (!name) return undefined;
    const pct = Math.round(match.confidence * 100);
    return `${name} · ${pct}%`;
  }
  const custom = customIngredients?.length
    ? matchCustomIngredient(parsed.name || rawText, customIngredients)
    : undefined;
  if (!custom) return undefined;
  const name = ingredientDisplayName(undefined, catalog, customIngredients, custom.customIngredientId);
  if (!name) return undefined;
  return `${name} · custom`;
}
