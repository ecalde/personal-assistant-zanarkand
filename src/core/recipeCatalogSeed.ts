/**
 * Starter curated recipes (client fallback + tests).
 * Stable UUIDs match supabase/migrations/20260819150000_cooking_catalog.sql.
 * Hero/gallery image refs are omitted until Sanity assets are authored.
 */

import { seedIngredientIdFor } from "./ingredientCatalog";
import type { CatalogRecipe, RecipeIngredientLine, RecipeStep } from "./model";

const SEED_CREATED_AT = "2026-08-19T00:00:00.000Z";

export function seedCatalogRecipeId(n: number): string {
  return `ca7a1000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
}

export function seedCatalogLineId(n: number): string {
  return `ca7a1100-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
}

export function seedCatalogStepId(n: number): string {
  return `ca7a1200-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
}

function line(
  n: number,
  rawText: string,
  ingredientN: number,
  extras?: Pick<RecipeIngredientLine, "quantity" | "unit" | "optional">
): RecipeIngredientLine {
  const item: RecipeIngredientLine = {
    id: seedCatalogLineId(n),
    rawText,
    ingredientId: seedIngredientIdFor(ingredientN),
    matchConfidence: 1,
  };
  if (extras?.quantity !== undefined) item.quantity = extras.quantity;
  if (extras?.unit) item.unit = extras.unit;
  if (extras?.optional) item.optional = true;
  return item;
}

function step(n: number, order: number, text: string, extras?: Partial<RecipeStep>): RecipeStep {
  const item: RecipeStep = {
    id: seedCatalogStepId(n),
    order,
    text,
    kind: extras?.kind ?? "blocking",
    blocksProgress:
      extras?.blocksProgress ?? (extras?.kind !== "parallel" && extras?.kind !== "wait"),
  };
  if (extras?.kind) item.kind = extras.kind;
  if (extras?.blocksProgress !== undefined) item.blocksProgress = extras.blocksProgress;
  if (extras?.timerSeconds !== undefined) item.timerSeconds = extras.timerSeconds;
  if (extras?.timerLabel) item.timerLabel = extras.timerLabel;
  if (extras?.canRunInBackground) item.canRunInBackground = true;
  return item;
}

function catalogRecipe(
  n: number,
  fields: Omit<CatalogRecipe, "id" | "isPublished" | "createdAtIso" | "updatedAtIso" | "gallery">
): CatalogRecipe {
  return {
    id: seedCatalogRecipeId(n),
    ...fields,
    gallery: [],
    isPublished: true,
    createdAtIso: SEED_CREATED_AT,
    updatedAtIso: SEED_CREATED_AT,
  };
}

export const SEED_RECIPE_CATALOG: CatalogRecipe[] = [
  catalogRecipe(1, {
    title: "Soft scrambled eggs",
    category: "breakfast",
    difficulty: "easy",
    experienceLevel: "beginner",
    estimatedMinutes: 10,
    servings: 2,
    notes: "Keep the heat low and stir often so the curds stay small and creamy.",
    cookingMethod: "saute",
    equipment: ["Nonstick skillet", "Silicone spatula"],
    ingredients: [
      line(1, "3 eggs", 9, { quantity: 3, unit: "piece" }),
      line(2, "1 tbsp butter", 19, { quantity: 1, unit: "tbsp" }),
      line(3, "Pinch of salt", 11),
      line(4, "Black pepper", 12, { optional: true }),
    ],
    steps: [
      step(1, 0, "Crack the eggs into a bowl and beat until the whites and yolks are combined."),
      step(2, 1, "Melt the butter in a nonstick skillet over low heat."),
      step(3, 2, "Pour in the eggs. Stir slowly and constantly until they look barely set and still glossy.", {
        kind: "timer",
        timerSeconds: 180,
        timerLabel: "Soft scramble",
        blocksProgress: true,
      }),
      step(4, 3, "Season with salt and pepper. Serve immediately."),
    ],
  }),
  catalogRecipe(2, {
    title: "Garlic spaghetti",
    category: "dinner",
    difficulty: "easy",
    experienceLevel: "beginner",
    estimatedMinutes: 25,
    servings: 4,
    notes: "Save a splash of pasta water to loosen the sauce.",
    cookingMethod: "boil",
    equipment: ["Large pot", "Skillet", "Colander"],
    ingredients: [
      line(5, "340 g spaghetti", 23, { quantity: 340, unit: "g" }),
      line(6, "3 tbsp olive oil", 10, { quantity: 3, unit: "tbsp" }),
      line(7, "4 garlic cloves, thinly sliced", 13, { quantity: 4, unit: "clove" }),
      line(8, "Salt", 11),
      line(9, "30 g parmesan cheese", 22, { quantity: 30, unit: "g" }),
      line(10, "Fresh parsley", 42, { optional: true }),
      line(11, "1 lemon (optional zest)", 24, { quantity: 1, unit: "piece", optional: true }),
    ],
    steps: [
      step(5, 0, "Bring a large pot of salted water to a boil and cook the spaghetti until al dente.", {
        kind: "timer",
        timerSeconds: 540,
        timerLabel: "Boil pasta",
        blocksProgress: true,
      }),
      step(6, 1, "While the pasta cooks, warm olive oil in a skillet over medium-low heat and cook the garlic until fragrant, not browned.", {
        kind: "parallel",
        blocksProgress: false,
        canRunInBackground: true,
      }),
      step(7, 2, "Drain the pasta, reserving 1/2 cup of pasta water. Toss pasta with the garlic oil, a splash of pasta water, and parmesan."),
      step(8, 3, "Finish with parsley and lemon zest if using. Taste and add salt."),
    ],
  }),
  catalogRecipe(3, {
    title: "Sheet-pan chicken and peppers",
    category: "dinner",
    difficulty: "medium",
    experienceLevel: "beginner",
    estimatedMinutes: 40,
    servings: 4,
    notes: "Cut the peppers and onion into similar-sized strips so they roast evenly.",
    cookingMethod: "bake",
    equipment: ["Sheet pan", "Mixing bowl"],
    ingredients: [
      line(12, "680 g chicken breast", 15, { quantity: 680, unit: "g" }),
      line(13, "2 bell peppers, sliced", 3, { quantity: 2, unit: "piece" }),
      line(14, "1 onion, sliced", 14, { quantity: 1, unit: "piece" }),
      line(15, "2 tbsp olive oil", 10, { quantity: 2, unit: "tbsp" }),
      line(16, "1 tsp cumin", 37, { quantity: 1, unit: "tsp" }),
      line(17, "1 tsp paprika", 38, { quantity: 1, unit: "tsp" }),
      line(18, "Salt", 11),
      line(19, "Black pepper", 12),
    ],
    steps: [
      step(9, 0, "Heat the oven to 425°F (220°C)."),
      step(10, 1, "Toss chicken, peppers, and onion with olive oil, cumin, paprika, salt, and pepper. Spread on a sheet pan."),
      step(11, 2, "Roast until the chicken is cooked through and the peppers are browned at the edges.", {
        kind: "timer",
        timerSeconds: 1500,
        timerLabel: "Roast",
        blocksProgress: true,
      }),
      step(12, 3, "Rest the chicken 5 minutes, then slice and serve with the roasted vegetables.", {
        kind: "wait",
        timerSeconds: 300,
        timerLabel: "Rest",
        blocksProgress: true,
      }),
    ],
  }),
  catalogRecipe(4, {
    title: "Chickpea spinach bowl",
    category: "lunch",
    difficulty: "easy",
    experienceLevel: "beginner",
    estimatedMinutes: 20,
    servings: 2,
    notes: "A pantry lunch: warm chickpeas over wilted spinach with a lemon-garlic dressing.",
    cookingMethod: "saute",
    equipment: ["Skillet"],
    ingredients: [
      line(20, "1 1/2 cups chickpeas, drained", 55, { quantity: 1.5, unit: "cup" }),
      line(21, "4 cups spinach", 29, { quantity: 4, unit: "cup" }),
      line(22, "2 tbsp olive oil", 10, { quantity: 2, unit: "tbsp" }),
      line(23, "2 garlic cloves, minced", 13, { quantity: 2, unit: "clove" }),
      line(24, "1 lemon, juiced", 24, { quantity: 1, unit: "piece" }),
      line(25, "Salt", 11),
    ],
    steps: [
      step(13, 0, "Warm olive oil in a skillet over medium heat. Cook the garlic until fragrant."),
      step(14, 1, "Add chickpeas and a pinch of salt. Cook until they pick up a little color."),
      step(15, 2, "Add spinach and toss until just wilted. Finish with lemon juice and more salt to taste."),
    ],
  }),
  catalogRecipe(5, {
    title: "Banana cinnamon smoothie",
    category: "beverage",
    difficulty: "easy",
    experienceLevel: "beginner",
    estimatedMinutes: 5,
    servings: 1,
    notes: "Use a frozen banana if you want a thicker shake.",
    cookingMethod: "raw",
    equipment: ["Blender"],
    ingredients: [
      line(26, "1 banana", 31, { quantity: 1, unit: "piece" }),
      line(27, "1 cup milk", 20, { quantity: 1, unit: "cup" }),
      line(28, "1 tbsp honey", 35, { quantity: 1, unit: "tbsp", optional: true }),
      line(29, "1/2 tsp cinnamon", 39, { quantity: 0.5, unit: "tsp" }),
    ],
    steps: [
      step(16, 0, "Add banana, milk, honey, and cinnamon to a blender."),
      step(17, 1, "Blend until smooth. Taste and add more cinnamon or honey if you like."),
    ],
  }),
  catalogRecipe(6, {
    title: "Black bean tacos",
    category: "dinner",
    difficulty: "easy",
    experienceLevel: "beginner",
    estimatedMinutes: 20,
    servings: 4,
    notes: "Warm the tortillas last so they stay pliable.",
    cookingMethod: "saute",
    equipment: ["Skillet"],
    ingredients: [
      line(30, "8 flour tortillas", 1, { quantity: 8, unit: "piece" }),
      line(31, "2 cups black beans, drained", 56, { quantity: 2, unit: "cup" }),
      line(32, "1 avocado, sliced", 30, { quantity: 1, unit: "piece" }),
      line(33, "1/2 onion, minced", 14, { quantity: 0.5, unit: "piece" }),
      line(34, "Fresh cilantro", 41, { optional: true }),
      line(35, "1 lime, cut into wedges", 25, { quantity: 1, unit: "piece" }),
      line(36, "1 tbsp olive oil", 10, { quantity: 1, unit: "tbsp" }),
      line(37, "Salt", 11),
    ],
    steps: [
      step(18, 0, "Warm olive oil in a skillet. Cook the onion until softened, then add black beans and salt. Mash some of the beans as they heat."),
      step(19, 1, "Warm the tortillas in a dry skillet or directly over a low flame."),
      step(20, 2, "Fill tortillas with beans, avocado, cilantro, and a squeeze of lime."),
    ],
  }),
];
