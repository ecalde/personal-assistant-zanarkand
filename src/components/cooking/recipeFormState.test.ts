import { describe, expect, it } from "vitest";
import type { Recipe } from "../../core/model";
import { SEED_INGREDIENT_CATALOG, seedIngredientIdFor } from "../../core/ingredientCatalog";
import {
  emptyRecipeFormState,
  recipeFormFromRecipe,
  recipePayloadFromForm,
  validateRecipeForm,
  type RecipeFormState,
} from "./recipeFormState";

const RECIPE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const INGREDIENT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const STEP_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const NOW = "2026-08-18T12:00:00.000Z";

const HERO_IMAGE = {
  assetRef: "image-Tb9Ew8CXIwaY6R1kjMvI0uRR-2000x3000-jpg",
  url: "https://cdn.sanity.io/images/abc123xy/production/Tb9Ew8CXIwaY6R1kjMvI0uRR-2000x3000.jpg",
  alt: "Carbonara",
};

function filledForm(overrides: Partial<RecipeFormState> = {}): RecipeFormState {
  return {
    ...emptyRecipeFormState(),
    title: "Weeknight carbonara",
    category: "dinner",
    difficulty: "easy",
    experienceLevel: "beginner",
    estimatedMinutes: "25",
    servings: "2",
    notes: "Use guanciale if you have it.",
    ingredients: [{ id: INGREDIENT_ID, rawText: "2 eggs", optional: false }],
    steps: [
      {
        id: STEP_ID,
        text: "Whisk the eggs.",
        kind: "blocking",
        blocksProgress: true,
        canRunInBackground: false,
        timerMinutes: "",
        timerLabel: "",
      },
    ],
    equipment: [{ id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", name: "Skillet" }],
    ...overrides,
  };
}

function sampleRecipe(): Recipe {
  return {
    id: RECIPE_ID,
    title: "Weeknight carbonara",
    category: "dinner",
    difficulty: "easy",
    experienceLevel: "beginner",
    estimatedMinutes: 25,
    servings: 2,
    notes: "Use guanciale if you have it.",
    ingredients: [{ id: INGREDIENT_ID, rawText: "2 eggs" }],
    steps: [
      {
        id: STEP_ID,
        order: 0,
        text: "Whisk the eggs.",
        kind: "blocking",
        blocksProgress: true,
      },
    ],
    equipment: ["Skillet"],
    heroImage: HERO_IMAGE,
    gallery: [HERO_IMAGE],
    source: "manual",
    createdAtIso: NOW,
    updatedAtIso: NOW,
  };
}

describe("validateRecipeForm", () => {
  it("accepts a complete recipe", () => {
    expect(validateRecipeForm(filledForm())).toBeNull();
  });

  it("requires a title, category, ingredient, and step", () => {
    expect(validateRecipeForm(filledForm({ title: "  " }))).toBe("Recipe title is required.");
    expect(validateRecipeForm(filledForm({ category: "" }))).toBe("Choose a category.");
    expect(
      validateRecipeForm(filledForm({ ingredients: [{ id: INGREDIENT_ID, rawText: "  ", optional: false }] }))
    ).toBe("Add at least one ingredient.");
    expect(
      validateRecipeForm(
        filledForm({
          steps: [
            {
              id: STEP_ID,
              text: " ",
              kind: "blocking",
              blocksProgress: true,
              canRunInBackground: false,
              timerMinutes: "",
              timerLabel: "",
            },
          ],
        })
      )
    ).toBe("Add at least one step.");
  });

  it("rejects non-positive cook time and servings", () => {
    expect(validateRecipeForm(filledForm({ estimatedMinutes: "0" }))).toBe(
      "Cook time must be a positive whole number."
    );
    expect(validateRecipeForm(filledForm({ servings: "-1" }))).toBe(
      "Servings must be a positive whole number."
    );
  });
});

describe("recipePayloadFromForm", () => {
  it("builds a manual recipe with default step workflow fields", () => {
    const payload = recipePayloadFromForm(filledForm());
    expect(payload.title).toBe("Weeknight carbonara");
    expect(payload.source).toBe("manual");
    expect(payload.gallery).toEqual([]);
    expect(payload.heroImage).toBeUndefined();
    expect(payload.estimatedMinutes).toBe(25);
    expect(payload.servings).toBe(2);
    expect(payload.ingredients[0]?.rawText).toBe("2 eggs");
    expect(payload.steps[0]).toMatchObject({
      order: 0,
      text: "Whisk the eggs.",
      kind: "blocking",
      blocksProgress: true,
    });
    expect(payload.steps[0]?.timerSeconds).toBeUndefined();
    expect(payload.equipment).toEqual(["Skillet"]);
  });

  it("preserves hero and gallery image refs", () => {
    const payload = recipePayloadFromForm(
      filledForm({
        heroImage: HERO_IMAGE,
        gallery: [HERO_IMAGE],
      })
    );
    expect(payload.heroImage).toEqual(HERO_IMAGE);
    expect(payload.gallery).toEqual([HERO_IMAGE]);
  });

  it("drops blank ingredient, step, and equipment rows", () => {
    const payload = recipePayloadFromForm(
      filledForm({
        ingredients: [
          { id: INGREDIENT_ID, rawText: "2 eggs", optional: true },
          { id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", rawText: "  ", optional: false },
        ],
        equipment: [{ id: "ffffffff-ffff-4fff-8fff-ffffffffffff", name: "  " }],
      })
    );
    expect(payload.ingredients).toHaveLength(1);
    expect(payload.ingredients[0]?.optional).toBe(true);
    expect(payload.equipment).toEqual([]);
  });

  it("resolves known ingredient lines against the catalog", () => {
    const payload = recipePayloadFromForm(filledForm({
      ingredients: [{ id: INGREDIENT_ID, rawText: "2 tortillas", optional: false }],
    }), { catalog: SEED_INGREDIENT_CATALOG });
    expect(payload.ingredients[0]?.ingredientId).toBe(seedIngredientIdFor(1));
    expect(payload.ingredients[0]?.matchConfidence).toBeGreaterThanOrEqual(0.99);
    expect(payload.ingredients[0]?.quantity).toBe(2);
  });
});

describe("recipeFormFromRecipe", () => {
  it("round-trips recipe fields into form state", () => {
    const form = recipeFormFromRecipe(sampleRecipe());
    expect(form.title).toBe("Weeknight carbonara");
    expect(form.estimatedMinutes).toBe("25");
    expect(form.ingredients[0]?.rawText).toBe("2 eggs");
    expect(form.steps[0]?.text).toBe("Whisk the eggs.");
    expect(form.equipment[0]?.name).toBe("Skillet");
    expect(form.heroImage).toEqual(HERO_IMAGE);
    expect(form.gallery).toEqual([HERO_IMAGE]);
    expect(form.steps[0]?.kind).toBe("blocking");
  });

  it("round-trips wait-step timer fields", () => {
    const form = recipeFormFromRecipe({
      ...sampleRecipe(),
      steps: [
        {
          id: STEP_ID,
          order: 0,
          text: "Boil pasta 10 min",
          kind: "wait",
          blocksProgress: false,
          canRunInBackground: true,
          timerSeconds: 600,
          timerLabel: "Pasta",
        },
      ],
    });
    expect(form.steps[0]).toMatchObject({
      kind: "wait",
      blocksProgress: false,
      canRunInBackground: true,
      timerMinutes: "10",
      timerLabel: "Pasta",
    });
    const payload = recipePayloadFromForm(form);
    expect(payload.steps[0]).toMatchObject({
      kind: "wait",
      blocksProgress: false,
      canRunInBackground: true,
      timerSeconds: 600,
      timerLabel: "Pasta",
    });
  });
});

describe("step workflow validation", () => {
  it("requires a timer duration on wait and timer steps", () => {
    expect(
      validateRecipeForm(
        filledForm({
          steps: [
            {
              id: STEP_ID,
              text: "Boil pasta",
              kind: "wait",
              blocksProgress: false,
              canRunInBackground: true,
              timerMinutes: "",
              timerLabel: "Pasta",
            },
          ],
        })
      )
    ).toBe("Step 1 needs a timer duration.");
  });
});
