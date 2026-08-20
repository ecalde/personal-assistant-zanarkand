import { describe, expect, it } from "vitest";
import { SEED_INGREDIENT_CATALOG, seedIngredientIdFor } from "./ingredientCatalog";
import {
  applyIngredientAssignments,
  buildRecipeImportDraft,
  composeIngredientRawText,
  deriveExtractionConfidence,
  extractedRecipeIsUsable,
  importDraftRequiredFieldError,
  importReviewHighlightKeys,
  ingredientLineNeedsReview,
  isLowImportConfidence,
  parseExtractedRecipe,
  RECIPE_IMPORT_GUESSED_CONFIDENCE,
  RECIPE_IMPORT_LOW_CONFIDENCE,
} from "./recipeImport";
import type { ExtractedRecipe } from "./model";

const TITLE = "Weeknight carbonara";

function makeIds() {
  let n = 0;
  return () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
}

function validExtracted(overrides: Partial<ExtractedRecipe> = {}): ExtractedRecipe {
  return {
    title: TITLE,
    servings: 2,
    cookTimeMinutes: 25,
    ingredients: [
      { rawText: "2 eggs", quantity: 2, unit: null, name: "eggs" },
      { rawText: "1/2 cup grated cheese", quantity: 0.5, unit: "cup", name: "cheese" },
    ],
    steps: [
      { order: 1, text: "Whisk the eggs with the cheese." },
      { order: 2, text: "Toss with hot pasta." },
    ],
    equipment: ["Skillet"],
    notes: "Use guanciale if you have it.",
    ...overrides,
  };
}

describe("parseExtractedRecipe", () => {
  it("accepts a complete extraction object", () => {
    const parsed = parseExtractedRecipe(validExtracted());
    expect(parsed).toMatchObject({
      title: TITLE,
      servings: 2,
      cookTimeMinutes: 25,
      equipment: ["Skillet"],
    });
    if (typeof parsed === "string") return;
    expect(parsed.ingredients).toHaveLength(2);
    expect(parsed.steps).toHaveLength(2);
  });

  it("unwraps { extracted } wrappers and coerces string ingredient/step rows", () => {
    const parsed = parseExtractedRecipe({
      extracted: {
        title: "Soup",
        servings: "4-6",
        cookTimeMinutes: "30 minutes",
        ingredients: ["2 tortillas", { rawText: "1 onion", quantity: "1", unit: "piece", name: "onion" }],
        steps: ["Warm the tortillas.", { order: 2, text: "Cook the onion." }],
        equipment: ["Pot", "  "],
        notes: null,
      },
    });
    expect(typeof parsed).not.toBe("string");
    if (typeof parsed === "string") return;
    expect(parsed.title).toBe("Soup");
    expect(parsed.servings).toBe(5);
    expect(parsed.cookTimeMinutes).toBe(30);
    expect(parsed.ingredients[0]?.rawText).toBe("2 tortillas");
    expect(parsed.ingredients[1]?.quantity).toBe(1);
    expect(parsed.steps.map((step) => step.text)).toEqual(["Warm the tortillas.", "Cook the onion."]);
    expect(parsed.equipment).toEqual(["Pot"]);
  });

  it("parses fraction quantities and drops empty rows", () => {
    const parsed = parseExtractedRecipe({
      title: "Salad",
      servings: null,
      cookTimeMinutes: null,
      ingredients: [
        { rawText: "", quantity: "1/2", unit: "cup", name: "olive oil" },
        { rawText: "  ", quantity: null, unit: null, name: null },
      ],
      steps: ["Toss.", ""],
      equipment: [],
      notes: "",
    });
    expect(typeof parsed).not.toBe("string");
    if (typeof parsed === "string") return;
    expect(parsed.ingredients).toHaveLength(1);
    expect(parsed.ingredients[0]?.rawText).toBe("0.5 cup olive oil");
    expect(parsed.ingredients[0]?.quantity).toBe(0.5);
    expect(parsed.steps).toEqual([{ order: 0, text: "Toss." }]);
    expect(parsed.notes).toBeNull();
  });

  it("rejects payloads missing ingredients or steps arrays", () => {
    expect(parseExtractedRecipe({ title: "Nope" })).toMatch(/missing ingredients or steps/);
    expect(parseExtractedRecipe(null)).toMatch(/recipe object/);
  });

  it("nulls cook times and servings that are out of range", () => {
    const parsed = parseExtractedRecipe({
      title: "Huge",
      servings: 0,
      cookTimeMinutes: 2000,
      ingredients: [{ rawText: "salt", quantity: null, unit: null, name: "salt" }],
      steps: [{ order: 0, text: "Season." }],
      equipment: [],
      notes: null,
    });
    expect(typeof parsed).not.toBe("string");
    if (typeof parsed === "string") return;
    expect(parsed.servings).toBeNull();
    expect(parsed.cookTimeMinutes).toBeNull();
  });
});

describe("composeIngredientRawText", () => {
  it("prefers verbatim rawText and otherwise joins qty/unit/name", () => {
    expect(
      composeIngredientRawText({ rawText: "2 large eggs", quantity: 2, unit: "piece", name: "egg" })
    ).toBe("2 large eggs");
    expect(
      composeIngredientRawText({ rawText: "", quantity: 2, unit: "tbsp", name: "olive oil" })
    ).toBe("2 tbsp olive oil");
  });
});

describe("buildRecipeImportDraft", () => {
  it("maps extraction to an import draft with catalog matching", () => {
    const draft = buildRecipeImportDraft(validExtracted(), {
      catalog: SEED_INGREDIENT_CATALOG,
      createId: makeIds(),
    });
    expect(draft.recipe.source).toBe("import");
    expect(draft.recipe.title).toBe(TITLE);
    expect(draft.recipe.category).toBe("dinner");
    expect(draft.recipe.estimatedMinutes).toBe(25);
    expect(draft.recipe.servings).toBe(2);
    expect(draft.recipe.equipment).toEqual(["Skillet"]);
    expect(draft.recipe.ingredients[0]?.ingredientId).toBe(seedIngredientIdFor(9));
    expect(draft.recipe.ingredients[0]?.quantity).toBe(2);
    expect(draft.recipe.steps).toHaveLength(2);
    expect(draft.recipe.steps[0]?.kind).toBe("blocking");
    expect(importDraftRequiredFieldError(draft)).toBeNull();
  });

  it("parses ranges from raw text and flags unresolved lines", () => {
    const draft = buildRecipeImportDraft(
      validExtracted({
        ingredients: [
          { rawText: "2-3 tbsp olive oil", quantity: null, unit: null, name: null },
          { rawText: "a pinch of mystery spice blend", quantity: null, unit: null, name: null },
        ],
      }),
      { catalog: SEED_INGREDIENT_CATALOG, createId: makeIds() }
    );
    expect(draft.recipe.ingredients[0]?.quantity).toBe(2.5);
    expect(draft.recipe.ingredients[0]?.unit).toBe("tbsp");
    expect(draft.recipe.ingredients[0]?.ingredientId).toBe(seedIngredientIdFor(10));
    expect(draft.unresolvedIngredientLineIds).toContain(draft.recipe.ingredients[1]?.id);
    expect(ingredientLineNeedsReview(draft.recipe.ingredients[1]!)).toBe(true);
  });

  it("marks optional lines and overlays structured quantity/unit", () => {
    const draft = buildRecipeImportDraft(
      validExtracted({
        ingredients: [
          { rawText: "parsley (optional)", quantity: null, unit: null, name: "parsley" },
          { rawText: "olive oil", quantity: 2, unit: "tablespoons", name: "olive oil" },
        ],
      }),
      { catalog: SEED_INGREDIENT_CATALOG, createId: makeIds() }
    );
    expect(draft.recipe.ingredients[0]?.optional).toBe(true);
    expect(draft.recipe.ingredients[1]?.quantity).toBe(2);
    expect(draft.recipe.ingredients[1]?.unit).toBe("tbsp");
  });

  it("flags missing title/servings/cook time and guessed category fields", () => {
    const extracted = validExtracted({
      title: null,
      servings: null,
      cookTimeMinutes: null,
      notes: null,
    });
    const draft = buildRecipeImportDraft(extracted, { createId: makeIds() });
    expect(draft.fieldConfidence.title).toBe(0);
    expect(draft.fieldConfidence.servings).toBe(0);
    expect(draft.fieldConfidence.estimatedMinutes).toBe(0);
    expect(draft.fieldConfidence.category).toBe(RECIPE_IMPORT_GUESSED_CONFIDENCE);
    expect(isLowImportConfidence(draft.fieldConfidence.title)).toBe(true);
    expect(isLowImportConfidence(draft.fieldConfidence.category)).toBe(true);
    expect(importDraftRequiredFieldError(draft)).toBe("Recipe title is required.");
  });

  it("blocks save when ingredients or steps are missing", () => {
    expect(
      importDraftRequiredFieldError(
        buildRecipeImportDraft(validExtracted({ ingredients: [] }), { createId: makeIds() })
      )
    ).toBe("Add at least one ingredient.");
    expect(
      importDraftRequiredFieldError(
        buildRecipeImportDraft(validExtracted({ steps: [] }), { createId: makeIds() })
      )
    ).toBe("Add at least one step.");
  });
});

describe("deriveExtractionConfidence and review highlights", () => {
  it("stops highlighting a field after the user edits it", () => {
    const extracted = validExtracted({ title: null, servings: null });
    const confidence = deriveExtractionConfidence(extracted, { ingredients: [], steps: [] });
    const initial = {
      title: "",
      servings: "",
      estimatedMinutes: "25",
      category: "dinner",
      difficulty: "medium",
      experienceLevel: "beginner",
      notes: "Use guanciale if you have it.",
      ingredients: [],
      steps: [],
    };
    const highlighted = importReviewHighlightKeys({
      fieldConfidence: confidence,
      initial,
      form: { ...initial, title: "Carbonara" },
    });
    expect(highlighted).not.toContain("title");
    expect(highlighted).toContain("servings");
    expect(highlighted).toContain("category");
    expect(confidence.estimatedMinutes).toBeGreaterThanOrEqual(RECIPE_IMPORT_LOW_CONFIDENCE);
  });
});

describe("applyIngredientAssignments", () => {
  it("locks a user-chosen catalog ingredient at confidence 1", () => {
    const draft = buildRecipeImportDraft(
      validExtracted({
        ingredients: [{ rawText: "mystery spice", quantity: null, unit: null, name: null }],
      }),
      { catalog: SEED_INGREDIENT_CATALOG, createId: makeIds() }
    );
    const lineId = draft.recipe.ingredients[0]!.id;
    const next = applyIngredientAssignments(draft.recipe.ingredients, {
      [lineId]: seedIngredientIdFor(11),
    });
    expect(next[0]?.ingredientId).toBe(seedIngredientIdFor(11));
    expect(next[0]?.matchConfidence).toBe(1);
    expect(ingredientLineNeedsReview(next[0]!)).toBe(false);
  });
});

describe("extractedRecipeIsUsable", () => {
  it("requires some title, ingredient, or step content", () => {
    expect(
      extractedRecipeIsUsable({
        title: null,
        servings: 2,
        cookTimeMinutes: 10,
        ingredients: [],
        steps: [],
        equipment: [],
        notes: "hello",
      })
    ).toBe(false);
    expect(extractedRecipeIsUsable(validExtracted({ title: null }))).toBe(true);
  });
});
