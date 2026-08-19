import type {
  Recipe,
  RecipeCategory,
  RecipeDifficulty,
  RecipeExperienceLevel,
  RecipeIngredientLine,
  RecipeStep,
  RecipeStepKind,
  SanityImageRef,
} from "../../core/model";
import {
  getRecipeCategoryValues,
  getRecipeDifficultyValues,
  getRecipeExperienceLevelValues,
  isRecipeStepKind,
} from "../../core/cooking";
import { defaultsForStepKind } from "../../core/cookingSession";
import type { IngredientCatalog } from "../../core/ingredientCatalog";
import { resolveRecipeIngredients } from "../../core/ingredients";

export type IngredientFormRow = {
  id: string;
  rawText: string;
  optional: boolean;
};

export type StepFormRow = {
  id: string;
  text: string;
  kind: RecipeStepKind;
  blocksProgress: boolean;
  canRunInBackground: boolean;
  timerMinutes: string;
  timerLabel: string;
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
  const defaults = defaultsForStepKind("blocking");
  return {
    id: crypto.randomUUID(),
    text: "",
    kind: "blocking",
    blocksProgress: defaults.blocksProgress,
    canRunInBackground: defaults.canRunInBackground,
    timerMinutes: "",
    timerLabel: "",
  };
}

export function applyStepKindDefaults(row: StepFormRow, kind: RecipeStepKind): StepFormRow {
  const defaults = defaultsForStepKind(kind);
  return {
    ...row,
    kind,
    blocksProgress: defaults.blocksProgress,
    canRunInBackground: defaults.canRunInBackground,
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

function minutesFieldFromSeconds(seconds?: number): string {
  if (seconds === undefined) return "";
  const minutes = seconds / 60;
  return Number.isInteger(minutes) ? String(minutes) : String(minutes);
}

function parseTimerMinutesField(raw: string): number | undefined | string {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return "Timer duration must be a positive number of minutes.";
  }
  const seconds = Math.round(parsed * 60);
  if (seconds < 1) return "Timer duration must be at least 1 second.";
  return seconds;
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
            .map((step) => ({
              id: step.id,
              text: step.text,
              kind: step.kind,
              blocksProgress: step.blocksProgress,
              canRunInBackground: step.canRunInBackground === true,
              timerMinutes: minutesFieldFromSeconds(step.timerSeconds),
              timerLabel: step.timerLabel ?? "",
            }))
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

  for (const [index, row] of stepRows.entries()) {
    if (!isRecipeStepKind(row.kind)) {
      return `Step ${index + 1} needs a valid kind.`;
    }
    const needsTimer = row.kind === "wait" || row.kind === "timer";
    const timerSeconds = parseTimerMinutesField(row.timerMinutes);
    if (typeof timerSeconds === "string") return `Step ${index + 1}: ${timerSeconds}`;
    if (needsTimer && timerSeconds === undefined) {
      return `Step ${index + 1} needs a timer duration.`;
    }
  }

  return null;
}

export function recipePayloadFromForm(
  form: RecipeFormState,
  options?: { catalog?: IngredientCatalog; previous?: Recipe }
): Omit<Recipe, "id" | "createdAtIso" | "updatedAtIso"> {
  const estimatedMinutes = parsePositiveIntField(form.estimatedMinutes, "Cook time");
  const servings = parsePositiveIntField(form.servings, "Servings");

  const rawIngredients: RecipeIngredientLine[] = form.ingredients
    .filter((row) => row.rawText.trim())
    .map((row) => {
      const line: RecipeIngredientLine = {
        id: row.id,
        rawText: row.rawText.trim(),
      };
      if (row.optional) line.optional = true;
      return line;
    });
  const ingredients = options?.catalog
    ? resolveRecipeIngredients(rawIngredients, options.catalog, options.previous?.ingredients)
    : rawIngredients;

  const steps: RecipeStep[] = form.steps
    .filter((row) => row.text.trim())
    .map((row, index) => {
      const kind = isRecipeStepKind(row.kind) ? row.kind : "blocking";
      const step: RecipeStep = {
        id: row.id,
        order: index,
        text: row.text.trim(),
        kind,
        blocksProgress: row.blocksProgress,
      };
      if (row.canRunInBackground) step.canRunInBackground = true;
      const timerSeconds = parseTimerMinutesField(row.timerMinutes);
      if (typeof timerSeconds === "number") step.timerSeconds = timerSeconds;
      if (row.timerLabel.trim()) step.timerLabel = row.timerLabel.trim();
      return step;
    });

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
