/**
 * Assisted import: validate LLM extraction and map it to a reviewable draft.
 * Pure functions — no I/O. Ingredient matching uses the Phase 7 catalog.
 */

import type { IngredientCatalog } from "./ingredientCatalog";
import {
  canonicalizeIngredientUnit,
  parseIngredientLine,
  parseIngredientQuantity,
  resolveRecipeIngredientLine,
} from "./ingredients";
import type {
  CustomIngredient,
  ExtractedRecipe,
  ExtractedRecipeIngredient,
  ImportedRecipePayload,
  Recipe,
  RecipeImportDraft,
  RecipeIngredientLine,
  RecipeStep,
} from "./model";

export const RECIPE_IMPORT_LOW_CONFIDENCE = 0.7;
export const RECIPE_IMPORT_MATCH_REVIEW_THRESHOLD = 0.7;
export const RECIPE_IMPORT_GUESSED_CONFIDENCE = 0.2;
export const RECIPE_IMPORT_PRESENT_CONFIDENCE = 0.85;

const MAX_INGREDIENTS = 80;
const MAX_STEPS = 80;
const MAX_EQUIPMENT = 40;
const MAX_TITLE = 200;
const MAX_NOTES = 4000;
const MAX_LINE = 400;
const MAX_STEP = 2000;
const MAX_COOK_MINUTES = 24 * 60;
const MAX_SERVINGS = 100;

const OPTIONAL_LINE_RE = /\boptional\b/i;

export type RecipeImportIdFactory = () => string;

export type ImportReviewFormSnapshot = {
  title: string;
  servings: string;
  estimatedMinutes: string;
  category: string;
  difficulty: string;
  experienceLevel: string;
  notes: string;
  ingredients: Array<{ id: string; rawText: string }>;
  steps: Array<{ id: string; text: string }>;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function parseLeadingNumber(raw: string): number | undefined {
  const quantity = parseIngredientQuantity(raw);
  if (quantity !== undefined) return quantity;
  const match = /^(\d+(?:\.\d+)?)/.exec(raw.trim());
  if (!match) return undefined;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const range = /^(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)/.exec(trimmed);
    if (range) {
      const low = Number(range[1]);
      const high = Number(range[2]);
      if (Number.isFinite(low) && Number.isFinite(high)) return (low + high) / 2;
    }
    return parseLeadingNumber(trimmed) ?? parseIngredientQuantity(trimmed) ?? null;
  }
  return null;
}

function clampPositiveInt(value: number | null, max: number): number | null {
  if (value === null) return null;
  if (!Number.isFinite(value) || value <= 0) return null;
  const rounded = Math.round(value);
  if (rounded < 1 || rounded > max) return null;
  return rounded;
}

function unwrapExtracted(value: unknown): unknown {
  if (!isPlainObject(value)) return value;
  if (Array.isArray(value.ingredients) || Array.isArray(value.steps) || "title" in value) {
    return value;
  }
  if (isPlainObject(value.extracted)) return value.extracted;
  if (isPlainObject(value.recipe)) return value.recipe;
  return value;
}

function parseIngredientEntry(value: unknown, index: number): ExtractedRecipeIngredient | undefined {
  if (typeof value === "string") {
    const rawText = value.trim().slice(0, MAX_LINE);
    if (!rawText) return undefined;
    return { rawText, quantity: null, unit: null, name: null };
  }
  if (!isPlainObject(value)) return undefined;

  const rawText =
    asTrimmedString(value.rawText)?.slice(0, MAX_LINE) ??
    asTrimmedString(value.text)?.slice(0, MAX_LINE) ??
    "";
  const name = asTrimmedString(value.name)?.slice(0, MAX_LINE) ?? null;
  const unitRaw = asTrimmedString(value.unit) ?? null;
  const quantity = parseNullableNumber(value.quantity);

  const composed = composeIngredientRawText({
    rawText,
    quantity,
    unit: unitRaw,
    name,
  });
  if (!composed) return undefined;
  void index;
  return {
    rawText: composed.slice(0, MAX_LINE),
    quantity,
    unit: unitRaw,
    name,
  };
}

function parseStepEntry(value: unknown, index: number): { order: number; text: string } | undefined {
  if (typeof value === "string") {
    const text = value.trim().slice(0, MAX_STEP);
    if (!text) return undefined;
    return { order: index, text };
  }
  if (!isPlainObject(value)) return undefined;
  const text =
    asTrimmedString(value.text)?.slice(0, MAX_STEP) ??
    asTrimmedString(value.instruction)?.slice(0, MAX_STEP);
  if (!text) return undefined;
  const orderRaw = parseNullableNumber(value.order);
  const order = orderRaw !== null && Number.isFinite(orderRaw) ? Math.round(orderRaw) : index;
  return { order, text };
}

export function composeIngredientRawText(item: {
  rawText?: string | null;
  quantity?: number | null;
  unit?: string | null;
  name?: string | null;
}): string {
  const explicit = item.rawText?.trim() ?? "";
  if (explicit) return explicit;
  const qty =
    item.quantity !== null && item.quantity !== undefined && Number.isFinite(item.quantity) && item.quantity > 0
      ? formatQuantity(item.quantity)
      : "";
  const unit = item.unit?.trim() ?? "";
  const name = item.name?.trim() ?? "";
  return [qty, unit, name].filter(Boolean).join(" ");
}

function formatQuantity(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 100) / 100);
}

export function parseExtractedRecipe(value: unknown): ExtractedRecipe | string {
  const unwrapped = unwrapExtracted(value);
  if (!isPlainObject(unwrapped)) return "Extraction did not return a recipe object.";

  if (!Array.isArray(unwrapped.ingredients) || !Array.isArray(unwrapped.steps)) {
    return "Extraction is missing ingredients or steps.";
  }
  if (unwrapped.ingredients.length > MAX_INGREDIENTS) {
    return `Extraction has more than ${MAX_INGREDIENTS} ingredients.`;
  }
  if (unwrapped.steps.length > MAX_STEPS) {
    return `Extraction has more than ${MAX_STEPS} steps.`;
  }

  const ingredients: ExtractedRecipeIngredient[] = [];
  for (const [index, entry] of unwrapped.ingredients.entries()) {
    const parsed = parseIngredientEntry(entry, index);
    if (parsed) ingredients.push(parsed);
  }

  const steps: ExtractedRecipe["steps"] = [];
  for (const [index, entry] of unwrapped.steps.entries()) {
    const parsed = parseStepEntry(entry, index);
    if (parsed) steps.push(parsed);
  }

  const equipmentRaw = Array.isArray(unwrapped.equipment) ? unwrapped.equipment : [];
  if (equipmentRaw.length > MAX_EQUIPMENT) {
    return `Extraction has more than ${MAX_EQUIPMENT} equipment items.`;
  }
  const equipment: string[] = [];
  for (const item of equipmentRaw) {
    const name = asTrimmedString(item)?.slice(0, 80);
    if (name) equipment.push(name);
  }

  const title = asTrimmedString(unwrapped.title)?.slice(0, MAX_TITLE) ?? null;
  const notes = asTrimmedString(unwrapped.notes)?.slice(0, MAX_NOTES) ?? null;
  const servings = clampPositiveInt(parseNullableNumber(unwrapped.servings), MAX_SERVINGS);
  const cookTimeMinutes = clampPositiveInt(
    parseNullableNumber(unwrapped.cookTimeMinutes ?? unwrapped.cookTime),
    MAX_COOK_MINUTES
  );

  return {
    title,
    servings,
    cookTimeMinutes,
    ingredients,
    steps,
    equipment,
    notes,
  };
}

export function extractedRecipeIsUsable(extracted: ExtractedRecipe): boolean {
  return Boolean(
    extracted.title?.trim() || extracted.ingredients.length > 0 || extracted.steps.length > 0
  );
}

export function isLowImportConfidence(confidence: number | undefined): boolean {
  return (confidence ?? 0) < RECIPE_IMPORT_LOW_CONFIDENCE;
}

export function ingredientLineNeedsReview(line: {
  ingredientId?: string;
  customIngredientId?: string;
  matchConfidence?: number;
}): boolean {
  if (line.customIngredientId) return false;
  if (!line.ingredientId) return true;
  return (line.matchConfidence ?? 0) < RECIPE_IMPORT_MATCH_REVIEW_THRESHOLD;
}

function extractionConfidenceForIngredient(item: ExtractedRecipeIngredient): number {
  const raw = item.rawText.trim();
  if (raw.length < 3) return 0.4;
  if (item.quantity !== null || item.unit || item.name) return RECIPE_IMPORT_PRESENT_CONFIDENCE;
  return raw.length >= 8 ? 0.75 : 0.55;
}

function extractionConfidenceForStep(text: string): number {
  if (text.trim().length >= 12) return RECIPE_IMPORT_PRESENT_CONFIDENCE;
  return 0.5;
}

export function deriveExtractionConfidence(
  extracted: ExtractedRecipe,
  lineIds: { ingredients: string[]; steps: string[] }
): Record<string, number> {
  const confidence: Record<string, number> = {
    title: extracted.title?.trim() ? RECIPE_IMPORT_PRESENT_CONFIDENCE : 0,
    servings: extracted.servings !== null ? RECIPE_IMPORT_PRESENT_CONFIDENCE : 0,
    estimatedMinutes: extracted.cookTimeMinutes !== null ? RECIPE_IMPORT_PRESENT_CONFIDENCE : 0,
    category: RECIPE_IMPORT_GUESSED_CONFIDENCE,
    difficulty: RECIPE_IMPORT_GUESSED_CONFIDENCE,
    experienceLevel: RECIPE_IMPORT_GUESSED_CONFIDENCE,
  };
  if (extracted.notes?.trim()) confidence.notes = 0.8;

  for (const [index, item] of extracted.ingredients.entries()) {
    const id = lineIds.ingredients[index];
    if (id) confidence[`ingredient:${id}`] = extractionConfidenceForIngredient(item);
  }
  for (const [index, step] of extracted.steps.entries()) {
    const id = lineIds.steps[index];
    if (id) confidence[`step:${id}`] = extractionConfidenceForStep(step.text);
  }
  return confidence;
}

function overlayExtractedQuantities(
  line: RecipeIngredientLine,
  extracted: ExtractedRecipeIngredient
): RecipeIngredientLine {
  const next = { ...line };
  if (extracted.quantity !== null && Number.isFinite(extracted.quantity) && extracted.quantity > 0) {
    next.quantity = extracted.quantity;
  }
  const unit = canonicalizeIngredientUnit(extracted.unit);
  if (unit) next.unit = unit;
  return next;
}

export function buildRecipeImportDraft(
  extracted: ExtractedRecipe,
  options: {
    catalog?: IngredientCatalog;
    customIngredients?: readonly CustomIngredient[];
    createId?: RecipeImportIdFactory;
    fieldConfidence?: Record<string, number>;
  } = {}
): RecipeImportDraft {
  const createId = options.createId ?? (() => crypto.randomUUID());
  const ingredientIds = extracted.ingredients.map(() => createId());
  const stepIds = extracted.steps.map(() => createId());

  const ingredients: RecipeIngredientLine[] = extracted.ingredients.map((item, index) => {
    const rawText = composeIngredientRawText(item);
    const optional = OPTIONAL_LINE_RE.test(rawText);
    const base: RecipeIngredientLine = {
      id: ingredientIds[index]!,
      rawText,
    };
    if (optional) base.optional = true;
    const resolved = options.catalog
      ? resolveRecipeIngredientLine(base, options.catalog, options.customIngredients)
      : (() => {
          const parsed = parseIngredientLine(rawText);
          const line: RecipeIngredientLine = { ...base };
          if (parsed.quantity !== undefined) line.quantity = parsed.quantity;
          if (parsed.unit) line.unit = parsed.unit;
          return line;
        })();
    return overlayExtractedQuantities(resolved, item);
  });

  const sortedSteps = extracted.steps
    .map((step, index) => ({ ...step, id: stepIds[index]! }))
    .sort((a, b) => a.order - b.order);

  const steps: RecipeStep[] = sortedSteps.map((step, index) => ({
    id: step.id,
    order: index,
    text: step.text.trim(),
    kind: "blocking",
    blocksProgress: true,
  }));

  const recipe: ImportedRecipePayload = {
    title: extracted.title?.trim() ?? "",
    category: "dinner",
    difficulty: "medium",
    experienceLevel: "beginner",
    ingredients,
    steps,
    equipment: [...extracted.equipment],
    gallery: [],
    source: "import",
  };
  if (extracted.cookTimeMinutes !== null) recipe.estimatedMinutes = extracted.cookTimeMinutes;
  if (extracted.servings !== null) recipe.servings = extracted.servings;
  if (extracted.notes?.trim()) recipe.notes = extracted.notes.trim();

  const derived = deriveExtractionConfidence(extracted, {
    ingredients: ingredientIds,
    steps: sortedSteps.map((step) => step.id),
  });
  const fieldConfidence = { ...derived, ...options.fieldConfidence };

  const unresolvedIngredientLineIds = ingredients
    .filter((line) => ingredientLineNeedsReview(line))
    .map((line) => line.id);

  return { recipe, fieldConfidence, unresolvedIngredientLineIds };
}

export function importDraftRequiredFieldError(draft: RecipeImportDraft): string | null {
  if (!draft.recipe.title.trim()) return "Recipe title is required.";
  if (draft.recipe.ingredients.length === 0) return "Add at least one ingredient.";
  if (draft.recipe.steps.length === 0) return "Add at least one step.";
  return null;
}

export function applyIngredientAssignments(
  ingredients: RecipeIngredientLine[],
  assignments: Record<string, string>
): RecipeIngredientLine[] {
  return ingredients.map((line) => {
    const assigned = assignments[line.id]?.trim();
    if (!assigned) return line;
    const next: RecipeIngredientLine = {
      ...line,
      ingredientId: assigned,
      matchConfidence: 1,
    };
    delete next.customIngredientId;
    return next;
  });
}

export function importReviewHighlightKeys(input: {
  fieldConfidence: Record<string, number>;
  form: ImportReviewFormSnapshot;
  initial: ImportReviewFormSnapshot;
  threshold?: number;
}): string[] {
  const threshold = input.threshold ?? RECIPE_IMPORT_LOW_CONFIDENCE;
  const keys: string[] = [];
  const consider = (key: string, current: string, initial: string) => {
    if (current.trim() !== initial.trim()) return;
    const confidence = input.fieldConfidence[key];
    if (confidence === undefined) return;
    if (confidence < threshold) keys.push(key);
  };

  consider("title", input.form.title, input.initial.title);
  consider("servings", input.form.servings, input.initial.servings);
  consider("estimatedMinutes", input.form.estimatedMinutes, input.initial.estimatedMinutes);
  consider("category", input.form.category, input.initial.category);
  consider("difficulty", input.form.difficulty, input.initial.difficulty);
  consider("experienceLevel", input.form.experienceLevel, input.initial.experienceLevel);
  consider("notes", input.form.notes, input.initial.notes);

  for (const row of input.form.ingredients) {
    const initialRow = input.initial.ingredients.find((item) => item.id === row.id);
    const current = row.rawText;
    const initial = initialRow?.rawText ?? "";
    consider(`ingredient:${row.id}`, current, initial);
  }
  for (const row of input.form.steps) {
    const initialRow = input.initial.steps.find((item) => item.id === row.id);
    consider(`step:${row.id}`, row.text, initialRow?.text ?? "");
  }
  return keys;
}

export function importDraftAsRecipe(
  draft: RecipeImportDraft,
  ids: { id: string; createdAtIso: string; updatedAtIso: string }
): Recipe {
  return {
    ...draft.recipe,
    id: ids.id,
    createdAtIso: ids.createdAtIso,
    updatedAtIso: ids.updatedAtIso,
  };
}
