import { describe, expect, it } from "vitest";
import type { CookingSession, Recipe, RecipeIngredientLine, RecipeStep } from "./model";
import { defaultPayload } from "./state";
import {
  buildCompletedCookingSession,
  buildPlannedCookingSession,
  buildRecipeMasteryView,
  buildRecipeMasteryViews,
  completeCookingSession,
  crossedMasteryTier,
  cookTimeBucket,
  describeRecipeGalleryEmptyState,
  filterAndSortRecipes,
  formatEstimatedMinutes,
  formatIngredientCount,
  formatRecipeCategory,
  formatRecipeDifficulty,
  formatRecipeExperienceLevel,
  formatServings,
  formatStepCount,
  homeCookedWeekStreak,
  isRecipeCategory,
  masteryTierFromCount,
  recipeGalleryFiltersAreActive,
  recipeMatchesQuery,
  recipeTrackXpFromCount,
  resolveCookingStartHHMM,
  sanitizeCookingReferences,
  xpForCompletion,
} from "./cooking";

const RECIPE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const INGREDIENT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const STEP_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const NOW = "2026-08-18T12:00:00.000Z";

function sampleIngredient(overrides: Partial<RecipeIngredientLine> = {}): RecipeIngredientLine {
  return {
    id: INGREDIENT_ID,
    rawText: "2 eggs",
    ...overrides,
  };
}

function sampleStep(overrides: Partial<RecipeStep> = {}): RecipeStep {
  return {
    id: STEP_ID,
    order: 0,
    text: "Whisk the eggs.",
    kind: "blocking",
    blocksProgress: true,
    ...overrides,
  };
}

function sampleRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: RECIPE_ID,
    title: "Weeknight carbonara",
    category: "dinner",
    difficulty: "easy",
    experienceLevel: "beginner",
    estimatedMinutes: 25,
    servings: 2,
    ingredients: [sampleIngredient()],
    steps: [sampleStep()],
    equipment: ["Skillet"],
    gallery: [],
    source: "manual",
    createdAtIso: NOW,
    updatedAtIso: NOW,
    ...overrides,
  };
}

describe("recipe labels", () => {
  it("formats category, difficulty, and experience", () => {
    expect(formatRecipeCategory("meal_prep")).toBe("Meal Prep");
    expect(formatRecipeDifficulty("medium")).toBe("Medium");
    expect(formatRecipeExperienceLevel("advanced")).toBe("Advanced");
  });

  it("formats cook time, servings, and counts", () => {
    const recipe = sampleRecipe();
    expect(formatEstimatedMinutes(recipe.estimatedMinutes)).toBe("25 min");
    expect(formatEstimatedMinutes(undefined)).toBeUndefined();
    expect(formatServings(1)).toBe("1 serving");
    expect(formatServings(2)).toBe("2 servings");
    expect(formatIngredientCount(recipe)).toBe("1 ingredient");
    expect(formatStepCount(recipe)).toBe("1 step");
  });

  it("rejects unknown categories", () => {
    expect(isRecipeCategory("dinner")).toBe(true);
    expect(isRecipeCategory("brunch")).toBe(false);
  });
});

describe("recipe search helpers", () => {
  it("matches title, ingredient text, and notes", () => {
    expect(recipeMatchesQuery(sampleRecipe(), "carbonara")).toBe(true);
    expect(recipeMatchesQuery(sampleRecipe(), "eggs")).toBe(true);
    expect(recipeMatchesQuery(sampleRecipe({ notes: "Use guanciale" }), "guanciale")).toBe(true);
    expect(recipeMatchesQuery(sampleRecipe(), "pancake")).toBe(false);
  });

  it("matches category and equipment labels", () => {
    expect(recipeMatchesQuery(sampleRecipe(), "dinner")).toBe(true);
    expect(recipeMatchesQuery(sampleRecipe(), "skillet")).toBe(true);
  });
});

describe("filterAndSortRecipes", () => {
  it("sorts by title", () => {
    const recipes = [
      sampleRecipe({ id: "1", title: "Zebra stew" }),
      sampleRecipe({ id: "2", title: "Apple tart" }),
    ];
    const sorted = filterAndSortRecipes(recipes, { sortMode: "title" });
    expect(sorted.map((recipe) => recipe.title)).toEqual(["Apple tart", "Zebra stew"]);
  });

  it("filters by category", () => {
    const recipes = [
      sampleRecipe({ id: "1", category: "dinner" }),
      sampleRecipe({ id: "2", title: "Oatmeal", category: "breakfast" }),
    ];
    const filtered = filterAndSortRecipes(recipes, {
      sortMode: "recent",
      categoryFilter: "breakfast",
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.category).toBe("breakfast");
  });

  it("sorts by category then title", () => {
    const recipes = [
      sampleRecipe({ id: "1", title: "Steak", category: "dinner" }),
      sampleRecipe({ id: "2", title: "Oats", category: "breakfast" }),
      sampleRecipe({ id: "3", title: "Eggs", category: "breakfast" }),
    ];
    const sorted = filterAndSortRecipes(recipes, { sortMode: "category" });
    expect(sorted.map((recipe) => recipe.title)).toEqual(["Eggs", "Oats", "Steak"]);
  });

  it("sorts recent by updatedAtIso descending", () => {
    const recipes = [
      sampleRecipe({ id: "1", title: "Old", updatedAtIso: "2026-08-01T12:00:00.000Z" }),
      sampleRecipe({ id: "2", title: "New", updatedAtIso: "2026-08-18T12:00:00.000Z" }),
    ];
    const sorted = filterAndSortRecipes(recipes, { sortMode: "recent" });
    expect(sorted[0]?.title).toBe("New");
  });

  it("filters by difficulty and experience", () => {
    const recipes = [
      sampleRecipe({
        id: "1",
        title: "Easy beginner",
        difficulty: "easy",
        experienceLevel: "beginner",
      }),
      sampleRecipe({
        id: "2",
        title: "Hard advanced",
        difficulty: "hard",
        experienceLevel: "advanced",
      }),
      sampleRecipe({
        id: "3",
        title: "Easy advanced",
        difficulty: "easy",
        experienceLevel: "advanced",
      }),
    ];
    const filtered = filterAndSortRecipes(recipes, {
      sortMode: "title",
      difficultyFilter: "easy",
      experienceFilter: "advanced",
    });
    expect(filtered.map((recipe) => recipe.title)).toEqual(["Easy advanced"]);
  });

  it("sorts by difficulty then title", () => {
    const recipes = [
      sampleRecipe({ id: "1", title: "Zest", difficulty: "easy" }),
      sampleRecipe({ id: "2", title: "Broth", difficulty: "hard" }),
      sampleRecipe({ id: "3", title: "Aioli", difficulty: "easy" }),
    ];
    const sorted = filterAndSortRecipes(recipes, { sortMode: "difficulty" });
    expect(sorted.map((recipe) => recipe.title)).toEqual(["Aioli", "Zest", "Broth"]);
  });

  it("sorts by experience then title", () => {
    const recipes = [
      sampleRecipe({ id: "1", title: "Souffle", experienceLevel: "advanced" }),
      sampleRecipe({ id: "2", title: "Toast", experienceLevel: "beginner" }),
      sampleRecipe({ id: "3", title: "Risotto", experienceLevel: "intermediate" }),
    ];
    const sorted = filterAndSortRecipes(recipes, { sortMode: "experience" });
    expect(sorted.map((recipe) => recipe.title)).toEqual(["Toast", "Risotto", "Souffle"]);
  });

  it("buckets cook time and filters exclusive ranges", () => {
    expect(cookTimeBucket(undefined)).toBe("unset");
    expect(cookTimeBucket(15)).toBe("quick");
    expect(cookTimeBucket(16)).toBe("moderate");
    expect(cookTimeBucket(30)).toBe("moderate");
    expect(cookTimeBucket(31)).toBe("hour");
    expect(cookTimeBucket(60)).toBe("hour");
    expect(cookTimeBucket(61)).toBe("long");

    const recipes = [
      sampleRecipe({ id: "1", title: "Toast", estimatedMinutes: 10 }),
      sampleRecipe({ id: "2", title: "Pasta", estimatedMinutes: 25 }),
      sampleRecipe({ id: "3", title: "Roast", estimatedMinutes: 90 }),
      sampleRecipe({ id: "4", title: "Mystery", estimatedMinutes: undefined }),
    ];
    expect(
      filterAndSortRecipes(recipes, { sortMode: "title", cookTimeFilter: "quick" }).map(
        (recipe) => recipe.title
      )
    ).toEqual(["Toast"]);
    expect(
      filterAndSortRecipes(recipes, { sortMode: "title", cookTimeFilter: "unset" }).map(
        (recipe) => recipe.title
      )
    ).toEqual(["Mystery"]);
  });

  it("sorts by cook time with missing times last", () => {
    const recipes = [
      sampleRecipe({ id: "1", title: "Roast", estimatedMinutes: 90 }),
      sampleRecipe({ id: "2", title: "Toast", estimatedMinutes: 10 }),
      sampleRecipe({ id: "3", title: "Mystery", estimatedMinutes: undefined }),
    ];
    const sorted = filterAndSortRecipes(recipes, { sortMode: "cookTime" });
    expect(sorted.map((recipe) => recipe.title)).toEqual(["Toast", "Roast", "Mystery"]);
  });

  it("filters and sorts by mastery using completion views", () => {
    const recipes = [
      sampleRecipe({ id: "1", title: "Carbonara" }),
      sampleRecipe({ id: "2", title: "Oatmeal" }),
      sampleRecipe({ id: "3", title: "Cake" }),
    ];
    const masteryByRecipeId = buildRecipeMasteryViews(recipes, [
      {
        id: "s1",
        recipeId: "1",
        recipeTitle: "Carbonara",
        status: "completed",
        cookDate: "2026-08-01",
        timers: [],
        createdAtIso: NOW,
        updatedAtIso: NOW,
      },
      {
        id: "s2",
        recipeId: "1",
        recipeTitle: "Carbonara",
        status: "completed",
        cookDate: "2026-08-08",
        timers: [],
        createdAtIso: NOW,
        updatedAtIso: NOW,
      },
      {
        id: "s3",
        recipeId: "1",
        recipeTitle: "Carbonara",
        status: "completed",
        cookDate: "2026-08-15",
        timers: [],
        createdAtIso: NOW,
        updatedAtIso: NOW,
      },
      {
        id: "s4",
        recipeId: "3",
        recipeTitle: "Cake",
        status: "completed",
        cookDate: "2026-08-18",
        timers: [],
        createdAtIso: NOW,
        updatedAtIso: NOW,
      },
    ]);

    const practiced = filterAndSortRecipes(recipes, {
      sortMode: "title",
      masteryFilter: "practiced",
      masteryByRecipeId,
    });
    expect(practiced.map((recipe) => recipe.title)).toEqual(["Carbonara"]);

    const uncooked = filterAndSortRecipes(recipes, {
      sortMode: "title",
      masteryFilter: "uncooked",
      masteryByRecipeId,
    });
    expect(uncooked.map((recipe) => recipe.title)).toEqual(["Oatmeal"]);

    const byMastery = filterAndSortRecipes(recipes, {
      sortMode: "mastery",
      masteryByRecipeId,
    });
    expect(byMastery.map((recipe) => recipe.title)).toEqual(["Carbonara", "Cake", "Oatmeal"]);
  });

  it("composes query, category, cook time, and difficulty as AND filters", () => {
    const recipes = [
      sampleRecipe({
        id: "1",
        title: "Weeknight tacos",
        category: "dinner",
        difficulty: "easy",
        estimatedMinutes: 20,
      }),
      sampleRecipe({
        id: "2",
        title: "Slow tacos",
        category: "dinner",
        difficulty: "hard",
        estimatedMinutes: 90,
      }),
      sampleRecipe({
        id: "3",
        title: "Breakfast tacos",
        category: "breakfast",
        difficulty: "easy",
        estimatedMinutes: 15,
      }),
      sampleRecipe({
        id: "4",
        title: "Chili",
        category: "dinner",
        difficulty: "easy",
        estimatedMinutes: 25,
      }),
    ];
    const filtered = filterAndSortRecipes(recipes, {
      query: "taco",
      sortMode: "title",
      categoryFilter: "dinner",
      difficultyFilter: "easy",
      cookTimeFilter: "moderate",
    });
    expect(filtered.map((recipe) => recipe.title)).toEqual(["Weeknight tacos"]);
  });

  it("describes empty gallery states from active filters", () => {
    expect(describeRecipeGalleryEmptyState({})).toBe("No recipes yet.");
    expect(describeRecipeGalleryEmptyState({ query: "  pho  " })).toBe(
      "No matches for “pho”."
    );
    expect(describeRecipeGalleryEmptyState({ categoryFilter: "dessert" })).toBe(
      "No recipes match these filters."
    );
    expect(recipeGalleryFiltersAreActive({ query: "" })).toBe(false);
    expect(recipeGalleryFiltersAreActive({ difficultyFilter: "hard" })).toBe(true);
    expect(recipeGalleryFiltersAreActive({ availabilityFilter: "can_make" })).toBe(true);
  });

  it("filters by pantry availability", () => {
    const recipes = [
      sampleRecipe({ id: "1", title: "Omelette" }),
      sampleRecipe({ id: "2", title: "Tacos" }),
    ];
    const availabilityByRecipeId = new Map([
      ["1", "can_make" as const],
      ["2", "missing" as const],
    ]);
    expect(
      filterAndSortRecipes(recipes, {
        sortMode: "title",
        availabilityFilter: "can_make",
        availabilityByRecipeId,
      }).map((recipe) => recipe.title)
    ).toEqual(["Omelette"]);
  });
});

describe("cooking XP curve", () => {
  it("returns first-cook XP and the documented diminishing repeats", () => {
    expect(xpForCompletion(0)).toBe(50);
    expect(xpForCompletion(1)).toBe(18);
    expect(xpForCompletion(2)).toBe(14);
    expect(xpForCompletion(4)).toBe(11);
    expect(xpForCompletion(9)).toBe(9);
    expect(xpForCompletion(24)).toBe(7);
    expect(xpForCompletion(49)).toBe(6);
    expect(xpForCompletion(100)).toBe(5);
  });

  it("never returns below the repeat floor", () => {
    expect(xpForCompletion(500)).toBe(5);
  });
});

describe("mastery tiers", () => {
  it("maps completion counts to Novice through Master", () => {
    expect(masteryTierFromCount(0)).toBeNull();
    expect(masteryTierFromCount(1)).toBe(1);
    expect(masteryTierFromCount(2)).toBe(1);
    expect(masteryTierFromCount(3)).toBe(2);
    expect(masteryTierFromCount(9)).toBe(2);
    expect(masteryTierFromCount(10)).toBe(3);
    expect(masteryTierFromCount(25)).toBe(4);
    expect(masteryTierFromCount(50)).toBe(5);
    expect(masteryTierFromCount(100)).toBe(6);
  });

  it("detects tier-up boundaries including the first cook", () => {
    expect(crossedMasteryTier(0, 1)).toBe(true);
    expect(crossedMasteryTier(1, 2)).toBe(false);
    expect(crossedMasteryTier(2, 3)).toBe(true);
    expect(crossedMasteryTier(9, 10)).toBe(true);
  });
});

describe("recipe mastery views", () => {
  const SESSION_A = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const SESSION_B = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const SESSION_C = "ffffffff-ffff-4fff-8fff-ffffffffffff";

  function sampleSession(overrides: Partial<CookingSession> = {}): CookingSession {
    return {
      id: SESSION_A,
      recipeId: RECIPE_ID,
      recipeTitle: "Weeknight carbonara",
      status: "completed",
      cookDate: "2026-08-18",
      startedAtIso: "2026-08-18T17:00:00.000Z",
      finishedAtIso: "2026-08-18T17:25:00.000Z",
      timers: [],
      createdAtIso: NOW,
      updatedAtIso: NOW,
      ...overrides,
    };
  }

  it("builds a Novice view after the first cook", () => {
    const view = buildRecipeMasteryView(RECIPE_ID, [sampleSession()]);
    expect(view.tier).toBe(1);
    expect(view.tierName).toBe("Novice");
    expect(view.completionCount).toBe(1);
    expect(view.lifetimeXp).toBe(recipeTrackXpFromCount(1));
    expect(view.recentWeekStreak).toBe(1);
  });

  it("counts consecutive ISO weeks from the most recent cook", () => {
    const sessions = [
      sampleSession({ id: SESSION_A, cookDate: "2026-08-03" }),
      sampleSession({ id: SESSION_B, cookDate: "2026-08-10" }),
      sampleSession({ id: SESSION_C, cookDate: "2026-08-17" }),
    ];
    const view = buildRecipeMasteryView(RECIPE_ID, sessions);
    expect(view.completionCount).toBe(3);
    expect(view.tierName).toBe("Practiced");
    expect(view.recentWeekStreak).toBe(3);
  });

  it("ignores in-progress sessions and recipes that were never cooked", () => {
    const sessions = [
      sampleSession({ status: "in_progress", finishedAtIso: undefined }),
    ];
    const view = buildRecipeMasteryView(RECIPE_ID, sessions);
    expect(view.tier).toBeNull();
    expect(view.completionCount).toBe(0);
    expect(view.lifetimeXp).toBe(0);
  });
});

describe("home-cooked week streak", () => {
  function sampleSession(overrides: Partial<CookingSession> = {}): CookingSession {
    return {
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      recipeId: RECIPE_ID,
      recipeTitle: "Weeknight carbonara",
      status: "completed",
      cookDate: "2026-08-18",
      startedAtIso: "2026-08-18T17:00:00.000Z",
      finishedAtIso: "2026-08-18T17:25:00.000Z",
      timers: [],
      createdAtIso: NOW,
      updatedAtIso: NOW,
      ...overrides,
    };
  }

  it("counts consecutive weeks with a grace period for the current week", () => {
    const sessions = [
      sampleSession({ id: "s1", cookDate: "2026-08-04" }),
      sampleSession({ id: "s2", cookDate: "2026-08-11" }),
    ];
    expect(homeCookedWeekStreak(sessions, "2026-08-18")).toBe(2);
  });

  it("returns 0 when the streak is broken", () => {
    const sessions = [sampleSession({ cookDate: "2026-07-20" })];
    expect(homeCookedWeekStreak(sessions, "2026-08-18")).toBe(0);
  });
});

describe("sanitizeCookingReferences", () => {
  it("nulls recipeId on sessions whose recipe was deleted", () => {
    const payload = {
      ...defaultPayload(),
      cookingSessions: [
        {
          id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          recipeId: RECIPE_ID,
          recipeTitle: "Weeknight carbonara",
          status: "completed" as const,
          cookDate: "2026-08-18",
          startedAtIso: "2026-08-18T17:00:00.000Z",
          finishedAtIso: "2026-08-18T17:25:00.000Z",
          timers: [],
          createdAtIso: NOW,
          updatedAtIso: NOW,
        },
      ],
    };
    const sanitized = sanitizeCookingReferences(payload);
    expect(sanitized.cookingSessions[0]?.recipeId).toBeNull();
    expect(sanitized.cookingSessions[0]?.recipeTitle).toBe("Weeknight carbonara");
  });
});

describe("planned cooking sessions", () => {
  it("builds a planned session from a recipe date and optional start time", () => {
    const planned = buildPlannedCookingSession(sampleRecipe(), {
      cookDate: "2026-08-20",
      startTime: "18:00",
    });
    expect(planned).toMatchObject({
      recipeId: RECIPE_ID,
      recipeTitle: "Weeknight carbonara",
      status: "planned",
      cookDate: "2026-08-20",
      durationMinutes: 25,
    });
    expect(planned?.startedAtIso).toBeDefined();
    expect(resolveCookingStartHHMM({
      id: RECIPE_ID,
      createdAtIso: NOW,
      updatedAtIso: NOW,
      ...planned!,
    })).toBe("18:00");
  });

  it("rejects an invalid cook date", () => {
    expect(
      buildPlannedCookingSession(sampleRecipe(), { cookDate: "not-a-date" })
    ).toBeUndefined();
  });

  it("completes a planned session while keeping recipe identity", () => {
    const planned = buildPlannedCookingSession(sampleRecipe(), { cookDate: "2026-08-20" });
    expect(planned).toBeDefined();
    const completed = completeCookingSession(planned!, {
      startedAtIso: "2026-08-20T23:00:00.000Z",
      finishedAtIso: "2026-08-20T23:25:00.000Z",
      notes: "Extra pepper.",
    });
    expect(completed.status).toBe("completed");
    expect(completed.recipeId).toBe(RECIPE_ID);
    expect(completed.recipeTitle).toBe("Weeknight carbonara");
    expect(completed.notes).toBe("Extra pepper.");
  });

  it("buildCompletedCookingSession still creates a fresh completed cook", () => {
    const completed = buildCompletedCookingSession(sampleRecipe(), {
      startedAtIso: "2026-08-18T17:00:00.000Z",
      finishedAtIso: "2026-08-18T17:25:00.000Z",
    });
    expect(completed.status).toBe("completed");
    expect(completed.cookDate).toBeTruthy();
    expect(completed.durationMinutes).toBe(25);
  });
});
