import { describe, expect, it } from "vitest";
import { SEED_INGREDIENT_CATALOG, seedIngredientIdFor } from "./ingredientCatalog";
import {
  INGREDIENT_FUZZY_THRESHOLD,
  computeRecipeAvailability,
  ingredientLineLabel,
  listMissingIngredientLines,
  matchCustomIngredient,
  matchIngredient,
  normalizeIngredientName,
  parseIngredientLine,
  recipeLineIsInPantry,
  resolveRecipeIngredientLine,
  suggestIngredientMatches,
  trigramSimilarity,
} from "./ingredients";
import type { CustomIngredient, PantryItem, Recipe, RecipeIngredientLine } from "./model";

const NOW = "2026-08-19T12:00:00.000Z";
const RECIPE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LINE_A = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LINE_B = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const LINE_C = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const PANTRY_A = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const PANTRY_B = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const STEP_ID = "99999999-9999-4999-8999-999999999999";

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

function line(overrides: Partial<RecipeIngredientLine> = {}): RecipeIngredientLine {
  return {
    id: LINE_A,
    rawText: "2 eggs",
    ...overrides,
  };
}

function recipe(ingredients: RecipeIngredientLine[]): Recipe {
  return {
    id: RECIPE_ID,
    title: "Test dish",
    category: "dinner",
    difficulty: "easy",
    experienceLevel: "beginner",
    ingredients,
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
  };
}

describe("normalizeIngredientName", () => {
  it("lowercases, strips descriptors, and singularizes", () => {
    expect(normalizeIngredientName("2 Green Bell Peppers, diced")).toBe("green bell pepper");
    expect(normalizeIngredientName("fresh organic tomatoes")).toBe("tomato");
    expect(normalizeIngredientName("extra virgin olive oil")).toBe("olive oil");
    expect(normalizeIngredientName("salt to taste")).toBe("salt");
  });
});

describe("parseIngredientLine", () => {
  it("parses quantity, unit, and name", () => {
    expect(parseIngredientLine("1/2 cup all-purpose flour")).toMatchObject({
      quantity: 0.5,
      unit: "cup",
      name: "all purpose flour",
    });
    expect(parseIngredientLine("2 cloves garlic")).toMatchObject({
      quantity: 2,
      unit: "clove",
      name: "garlic",
    });
    expect(parseIngredientLine("2-3 tbsp olive oil")).toMatchObject({
      quantity: 2.5,
      unit: "tbsp",
      name: "olive oil",
    });
    expect(parseIngredientLine("2 green bell peppers, diced")).toMatchObject({
      quantity: 2,
      name: "green bell pepper",
    });
  });
});

describe("trigramSimilarity", () => {
  it("scores identical strings as 1 and related misspellings above the threshold", () => {
    expect(trigramSimilarity("tomato", "tomato")).toBe(1);
    expect(trigramSimilarity("tomatoe", "tomato")).toBeGreaterThan(INGREDIENT_FUZZY_THRESHOLD);
    expect(trigramSimilarity("brocoli", "broccoli")).toBeGreaterThan(INGREDIENT_FUZZY_THRESHOLD);
    expect(trigramSimilarity("xyz", "broccoli")).toBeLessThan(INGREDIENT_FUZZY_THRESHOLD);
  });
});

describe("matchIngredient", () => {
  it("resolves tortilla to flour tortilla via alias", () => {
    const match = matchIngredient("tortilla", catalog);
    expect(match?.ingredientId).toBe(seedIngredientIdFor(1));
    expect(match?.matchedVia).toBe("alias");
    expect(match?.confidence).toBeGreaterThanOrEqual(0.99);
  });

  it("resolves bell pepper variants", () => {
    expect(matchIngredient("bell pepper", catalog)?.ingredientId).toBe(seedIngredientIdFor(3));
    expect(matchIngredient("green bell pepper", catalog)?.ingredientId).toBe(seedIngredientIdFor(4));
    expect(matchIngredient("yellow bell pepper", catalog)?.ingredientId).toBe(seedIngredientIdFor(5));
    expect(matchIngredient("green pepper", catalog)?.ingredientId).toBe(seedIngredientIdFor(4));
    expect(matchIngredient("tomatoe", catalog)?.matchedVia).toBe("alias");
    expect(matchIngredient("brocoli", catalog)?.matchedVia).toBe("alias");
  });

  it("fuzzy-matches misspellings that are not exact aliases", () => {
    const tomato = matchIngredient("tomatto", catalog);
    expect(tomato?.ingredientId).toBe(seedIngredientIdFor(7));
    expect(tomato?.matchedVia).toBe("fuzzy");
    expect(tomato?.confidence).toBeGreaterThanOrEqual(INGREDIENT_FUZZY_THRESHOLD);

    const broccoli = matchIngredient("brocccoli", catalog);
    expect(broccoli?.ingredientId).toBe(seedIngredientIdFor(8));
    expect(broccoli?.matchedVia).toBe("fuzzy");
  });

  it("returns undefined below the fuzzy threshold", () => {
    expect(matchIngredient("xylophone zest", catalog)).toBeUndefined();
  });
});

describe("resolveRecipeIngredientLine", () => {
  it("stores parsed quantity/unit and resolved id + confidence", () => {
    const resolved = resolveRecipeIngredientLine(
      { id: LINE_A, rawText: "2 eggs" },
      catalog
    );
    expect(resolved.quantity).toBe(2);
    expect(resolved.ingredientId).toBe(seedIngredientIdFor(9));
    expect(resolved.matchConfidence).toBeGreaterThanOrEqual(0.99);
  });
});

describe("computeRecipeAvailability", () => {
  const eggId = seedIngredientIdFor(9);
  const garlicId = seedIngredientIdFor(13);
  const saltId = seedIngredientIdFor(11);

  it("returns can_make when every required ingredient is in the pantry", () => {
    const dish = recipe([
      line({ ingredientId: eggId, rawText: "2 eggs" }),
      line({ id: LINE_B, ingredientId: garlicId, rawText: "2 cloves garlic" }),
    ]);
    const pantry = [
      pantryItem({ ingredientId: eggId, label: "Egg" }),
      pantryItem({ id: PANTRY_B, ingredientId: garlicId, label: "Garlic" }),
    ];
    expect(computeRecipeAvailability(dish, pantry, catalog)).toBe("can_make");
  });

  it("returns partial when some required ingredients are present", () => {
    const dish = recipe([
      line({ ingredientId: eggId, rawText: "2 eggs" }),
      line({ id: LINE_B, ingredientId: garlicId, rawText: "garlic" }),
    ]);
    const pantry = [pantryItem({ ingredientId: eggId, label: "Egg" })];
    expect(computeRecipeAvailability(dish, pantry, catalog)).toBe("partial");
  });

  it("returns missing when none of the required ingredients are present", () => {
    const dish = recipe([
      line({ ingredientId: eggId, rawText: "2 eggs" }),
      line({ id: LINE_B, ingredientId: garlicId, rawText: "garlic" }),
    ]);
    expect(computeRecipeAvailability(dish, [], catalog)).toBe("missing");
    expect(
      computeRecipeAvailability(dish, [pantryItem({ ingredientId: saltId, label: "Salt" })], catalog)
    ).toBe("missing");
  });

  it("ignores optional ingredients and unavailable pantry rows", () => {
    const dish = recipe([
      line({ ingredientId: eggId, rawText: "2 eggs" }),
      line({
        id: LINE_C,
        ingredientId: saltId,
        rawText: "salt to taste",
        optional: true,
      }),
    ]);
    const pantry = [pantryItem({ ingredientId: eggId, label: "Egg" })];
    expect(computeRecipeAvailability(dish, pantry, catalog)).toBe("can_make");

    const markedOut = [pantryItem({ ingredientId: eggId, label: "Egg", available: false })];
    expect(computeRecipeAvailability(dish, markedOut, catalog)).toBe("missing");
  });

  it("matches unresolved lines against pantry labels", () => {
    const dish = recipe([line({ rawText: "2 eggs" })]);
    const pantry = [pantryItem({ label: "eggs" })];
    expect(recipeLineIsInPantry(dish.ingredients[0]!, pantry, catalog)).toBe(true);
    expect(computeRecipeAvailability(dish, pantry, catalog)).toBe("can_make");
  });

  it("lists missing required lines with a readable label", () => {
    const dish = recipe([
      line({ ingredientId: eggId, rawText: "2 eggs" }),
      line({ id: LINE_B, ingredientId: garlicId, rawText: "2 cloves garlic" }),
    ]);
    const pantry = [pantryItem({ ingredientId: eggId, label: "Egg" })];
    const missing = listMissingIngredientLines(dish, pantry, catalog);
    expect(missing).toHaveLength(1);
    expect(ingredientLineLabel(missing[0]!)).toBe("garlic");
  });
});

describe("custom ingredient matching", () => {
  const custom: CustomIngredient = {
    id: "1c1c1c1c-1c1c-41c1-81c1-1c1c1c1c1c1c",
    name: "Guanciale",
    createdAtIso: NOW,
    updatedAtIso: NOW,
  };

  it("resolves an unmatched catalog line to a custom ingredient", () => {
    expect(matchCustomIngredient("guanciale", [custom])?.customIngredientId).toBe(custom.id);
    const resolved = resolveRecipeIngredientLine(
      { id: LINE_A, rawText: "50 g guanciale" },
      catalog,
      [custom]
    );
    expect(resolved.customIngredientId).toBe(custom.id);
    expect(resolved.ingredientId).toBeUndefined();
    expect(resolved.matchConfidence).toBe(1);
  });
});

describe("suggestIngredientMatches", () => {
  it("ranks tortilla aliases and related catalog items", () => {
    const suggestions = suggestIngredientMatches("tortilla", catalog, 4);
    expect(suggestions[0]?.ingredientId).toBe(seedIngredientIdFor(1));
    expect(suggestions[0]?.matchedVia).toBe("alias");
    expect(suggestions.some((item) => item.ingredientId === seedIngredientIdFor(2))).toBe(true);
  });
});
