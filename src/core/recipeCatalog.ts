/**
 * Curated global recipe catalog: clone-to-personal mapping and published-read contract.
 * Catalog rows are not part of AppPayload.
 */

import type { CatalogRecipe, Recipe } from "./model";

export function catalogRecipeIsClientReadable(entry: Pick<CatalogRecipe, "isPublished">): boolean {
  return entry.isPublished;
}

export function selectPublishedCatalogRecipes<T extends Pick<CatalogRecipe, "isPublished">>(
  entries: readonly T[]
): T[] {
  return entries.filter((entry) => catalogRecipeIsClientReadable(entry));
}

export function catalogRecipeAsRecipe(entry: CatalogRecipe): Recipe {
  const recipe: Recipe = {
    id: entry.id,
    title: entry.title,
    category: entry.category,
    difficulty: entry.difficulty,
    experienceLevel: entry.experienceLevel,
    ingredients: entry.ingredients.map((line) => ({ ...line })),
    steps: entry.steps.map((step) => ({ ...step })),
    equipment: [...entry.equipment],
    gallery: entry.gallery.map((image) => ({ ...image })),
    source: "catalog",
    catalogRecipeId: entry.id,
    createdAtIso: entry.createdAtIso,
    updatedAtIso: entry.updatedAtIso,
  };
  if (entry.estimatedMinutes !== undefined) recipe.estimatedMinutes = entry.estimatedMinutes;
  if (entry.servings !== undefined) recipe.servings = entry.servings;
  if (entry.notes !== undefined) recipe.notes = entry.notes;
  if (entry.cookingMethod !== undefined) recipe.cookingMethod = entry.cookingMethod;
  if (entry.heroImage) recipe.heroImage = { ...entry.heroImage };
  return recipe;
}

export function findClonedCatalogRecipe(
  recipes: readonly Recipe[],
  catalogRecipeId: string
): Recipe | undefined {
  return recipes.find((recipe) => recipe.catalogRecipeId === catalogRecipeId);
}

export function cloneCatalogRecipe(
  entry: CatalogRecipe,
  options: { createId: () => string }
): Omit<Recipe, "id" | "createdAtIso" | "updatedAtIso"> {
  if (!catalogRecipeIsClientReadable(entry)) {
    throw new Error("Cannot clone an unpublished catalog recipe.");
  }

  const clone: Omit<Recipe, "id" | "createdAtIso" | "updatedAtIso"> = {
    title: entry.title,
    category: entry.category,
    difficulty: entry.difficulty,
    experienceLevel: entry.experienceLevel,
    ingredients: entry.ingredients.map((line) => ({ ...line, id: options.createId() })),
    steps: entry.steps.map((step) => ({ ...step, id: options.createId() })),
    equipment: [...entry.equipment],
    gallery: entry.gallery.map((image) => ({ ...image })),
    source: "catalog",
    catalogRecipeId: entry.id,
  };

  if (entry.estimatedMinutes !== undefined) clone.estimatedMinutes = entry.estimatedMinutes;
  if (entry.servings !== undefined) clone.servings = entry.servings;
  if (entry.notes !== undefined) clone.notes = entry.notes;
  if (entry.cookingMethod !== undefined) clone.cookingMethod = entry.cookingMethod;
  if (entry.heroImage) clone.heroImage = { ...entry.heroImage };

  return clone;
}
