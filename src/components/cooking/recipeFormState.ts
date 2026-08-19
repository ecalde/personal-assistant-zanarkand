import type {
  Recipe,
  RecipeCategory,
  RecipeDifficulty,
  RecipeExperienceLevel,
  RecipeIngredientLine,
  RecipeStep,
  SanityImageRef,
} from "../../core/model";
import {
  getRecipeCategoryValues,
  getRecipeDifficultyValues,
  getRecipeExperienceLevelValues,
} from "../../core/cooking";

export type IngredientFormRow = {
  id: string;
  rawText: string;
  optional: boolean;
};

export type StepFormRow = {
  id: string;
  text: string;
};

export type EquipmentFormRow = {
  id: string;
  name: string;
};

export type RecipeFormState = {
  title: string;
  category: RecipeCategory | "";
  difficulty: RecipeDifficulty | "";
  experienceLevel: RecipeExperienceLevel | "";
  estimatedMinutes: string;
  servings: string;
  notes: string;
  ingredients: IngredientFormRow[];
  steps: StepFormRow[];
  equipment: EquipmentFormRow[];
  heroImage: SanityImageRef | null;
  gallery: SanityImageRef[];
};

export function emptyIngredientFormRow(): IngredientFormRow {
  return {
    id: crypto.randomUUID(),
    rawText: "",
    optional: false,
  };
}

export function emptyStepFormRow(): StepFormRow {
  return {
    id: crypto.randomUUID(),
    text: "",
  };
}

export function emptyEquipmentFormRow(): EquipmentFormRow {
  return {
    id: crypto.randomUUID(),
    name: "",
  };
}

export function emptyRecipeFormState(): RecipeFormState {
  return {
    title: "",
    category: "dinner",
    difficulty: "medium",
    experienceLevel: "beginner",
    estimatedMinutes: "",
    servings: "",
    notes: "",
    ingredients: [emptyIngredientFormRow()],
    steps: [emptyStepFormRow()],
    equipment: [emptyEquipmentFormRow()],
    heroImage: null,
    gallery: [],
  };
}

export function recipeFormFromRecipe(recipe: Recipe): RecipeFormState {
  return {
    title: recipe.title,
    category: recipe.category,
    difficulty: recipe.difficulty,
    experienceLevel: recipe.experienceLevel,
    estimatedMinutes: recipe.estimatedMinutes !== undefined ? String(recipe.estimatedMinutes) : "",
    servings: recipe.servings !== undefined ? String(recipe.servings) : "",
    notes: recipe.notes ?? "",
    ingredients:
      recipe.ingredients.length > 0
        ? recipe.ingredients.map((line) => ({
            id: line.id,
            rawText: line.rawText,
            optional: line.optional === true,
          }))
        : [emptyIngredientFormRow()],
    steps:
      recipe.steps.length > 0
        ? [...recipe.steps]
            .sort((a, b) => a.order - b.order)
            .map((step) => ({ id: step.id, text: step.text }))
        : [emptyStepFormRow()],
    equipment:
      recipe.equipment.length > 0
        ? recipe.equipment.map((name) => ({ id: crypto.randomUUID(), name }))
        : [emptyEquipmentFormRow()],
    heroImage: recipe.heroImage ?? null,
    gallery: recipe.gallery.map((image) => ({ ...image })),
  };
}

function parsePositiveIntField(raw: string, label: string): number | undefined | string {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return `${label} must be a positive whole number.`;
  }
  return parsed;
}

export function validateRecipeForm(form: RecipeFormState): string | null {
  if (!form.title.trim()) return "Recipe title is required.";

  if (!form.category || !getRecipeCategoryValues().includes(form.category)) {
    return "Choose a category.";
  }
  if (!form.difficulty || !getRecipeDifficultyValues().includes(form.difficulty)) {
    return "Choose a difficulty.";
  }
  if (
    !form.experienceLevel ||
    !getRecipeExperienceLevelValues().includes(form.experienceLevel)
  ) {
    return "Choose an experience level.";
  }

  const minutes = parsePositiveIntField(form.estimatedMinutes, "Cook time");
  if (typeof minutes === "string") return minutes;
  const servings = parsePositiveIntField(form.servings, "Servings");
  if (typeof servings === "string") return servings;

  const ingredientRows = form.ingredients.filter((row) => row.rawText.trim());
  if (ingredientRows.length === 0) {
    return "Add at least one ingredient.";
  }

  const stepRows = form.steps.filter((row) => row.text.trim());
  if (stepRows.length === 0) {
    return "Add at least one step.";
  }

  return null;
}

export function recipePayloadFromForm(
  form: RecipeFormState
): Omit<Recipe, "id" | "createdAtIso" | "updatedAtIso"> {
  const estimatedMinutes = parsePositiveIntField(form.estimatedMinutes, "Cook time");
  const servings = parsePositiveIntField(form.servings, "Servings");

  const ingredients: RecipeIngredientLine[] = form.ingredients
    .filter((row) => row.rawText.trim())
    .map((row) => {
      const line: RecipeIngredientLine = {
        id: row.id,
        rawText: row.rawText.trim(),
      };
      if (row.optional) line.optional = true;
      return line;
    });

  const steps: RecipeStep[] = form.steps
    .filter((row) => row.text.trim())
    .map((row, index) => ({
      id: row.id,
      order: index,
      text: row.text.trim(),
      kind: "blocking",
      blocksProgress: true,
    }));

  const equipment = form.equipment
    .map((row) => row.name.trim())
    .filter((name) => name.length > 0);

  const payload: Omit<Recipe, "id" | "createdAtIso" | "updatedAtIso"> = {
    title: form.title.trim(),
    category: form.category as RecipeCategory,
    difficulty: form.difficulty as RecipeDifficulty,
    experienceLevel: form.experienceLevel as RecipeExperienceLevel,
    ingredients,
    steps,
    equipment,
    gallery: form.gallery.map((image) => ({ ...image })),
    source: "manual",
  };

  if (typeof estimatedMinutes === "number") payload.estimatedMinutes = estimatedMinutes;
  if (typeof servings === "number") payload.servings = servings;
  if (form.notes.trim()) payload.notes = form.notes.trim();
  if (form.heroImage) payload.heroImage = { ...form.heroImage };

  return payload;
}
