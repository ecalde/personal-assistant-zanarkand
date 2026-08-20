/**
 * Pure helpers for the Cooking domain (labels, search, filter/sort, mastery, XP).
 */

import { COOKING_XP } from "./milestoneTables";
import type {
  AppPayload,
  CookingMethod,
  CookingSession,
  CookingSessionStatus,
  CookingTimerStatus,
  Recipe,
  RecipeAvailability,
  RecipeCategory,
  RecipeDifficulty,
  RecipeExperienceLevel,
  RecipeSource,
  RecipeStepKind,
} from "./model";
import { levelFromTotalXp } from "./progression";
import { startOfWeekLocal } from "./dashboardStats";
import { formatLocalDateKey } from "./timeline";

export const RECIPE_CATEGORY_LABELS: Record<RecipeCategory, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  dessert: "Dessert",
  snack: "Snack",
  beverage: "Beverage",
  meal_prep: "Meal Prep",
};

export const RECIPE_DIFFICULTY_LABELS: Record<RecipeDifficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

export const RECIPE_EXPERIENCE_LABELS: Record<RecipeExperienceLevel, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

export const RECIPE_STEP_KIND_LABELS: Record<RecipeStepKind, string> = {
  blocking: "Blocking",
  parallel: "Parallel",
  wait: "Wait",
  timer: "Timer",
};

export const COOKING_METHOD_LABELS: Record<CookingMethod, string> = {
  boil: "Boil",
  bake: "Bake",
  fry: "Fry",
  saute: "Sauté",
  steam: "Steam",
  grill: "Grill",
  raw: "Raw",
  other: "Other",
};

export type RecipesSortMode =
  | "recent"
  | "title"
  | "category"
  | "cookTime"
  | "difficulty"
  | "experience"
  | "mastery";

export type RecipeCategoryFilter = RecipeCategory | "all";
export type RecipeDifficultyFilter = RecipeDifficulty | "all";
export type RecipeExperienceFilter = RecipeExperienceLevel | "all";
export type RecipeCookTimeFilter =
  | "all"
  | "quick"
  | "moderate"
  | "hour"
  | "long"
  | "unset";
export type RecipeMasteryFilter =
  | "all"
  | "uncooked"
  | "novice"
  | "practiced"
  | "proficient"
  | "skilled"
  | "expert"
  | "master";

export type RecipeAvailabilityFilter = RecipeAvailability | "all";

export type RecipeGalleryFilters = {
  query?: string;
  sortMode: RecipesSortMode;
  categoryFilter?: RecipeCategoryFilter;
  difficultyFilter?: RecipeDifficultyFilter;
  experienceFilter?: RecipeExperienceFilter;
  cookTimeFilter?: RecipeCookTimeFilter;
  masteryFilter?: RecipeMasteryFilter;
  availabilityFilter?: RecipeAvailabilityFilter;
};

export const RECIPE_SORT_MODE_LABELS: Record<RecipesSortMode, string> = {
  recent: "Recently updated",
  title: "Title",
  category: "Category",
  cookTime: "Cook time",
  difficulty: "Difficulty",
  experience: "Experience",
  mastery: "Mastery",
};

export const RECIPE_COOK_TIME_FILTER_LABELS: Record<RecipeCookTimeFilter, string> = {
  all: "All cook times",
  quick: "15 min or less",
  moderate: "16–30 min",
  hour: "31–60 min",
  long: "Over 1 hour",
  unset: "No cook time",
};

export const RECIPE_MASTERY_FILTER_LABELS: Record<RecipeMasteryFilter, string> = {
  all: "All mastery",
  uncooked: "Not yet cooked",
  novice: "Novice",
  practiced: "Practiced",
  proficient: "Proficient",
  skilled: "Skilled",
  expert: "Expert",
  master: "Master",
};

export const RECIPE_AVAILABILITY_FILTER_LABELS: Record<RecipeAvailabilityFilter, string> = {
  all: "All pantry status",
  can_make: "Can make now",
  partial: "Partial pantry",
  missing: "Missing ingredients",
};

const RECIPE_CATEGORIES: RecipeCategory[] = [
  "breakfast",
  "lunch",
  "dinner",
  "dessert",
  "snack",
  "beverage",
  "meal_prep",
];

const RECIPE_DIFFICULTIES: RecipeDifficulty[] = ["easy", "medium", "hard"];

const RECIPE_EXPERIENCE_LEVELS: RecipeExperienceLevel[] = [
  "beginner",
  "intermediate",
  "advanced",
];

const RECIPE_SOURCES: RecipeSource[] = ["manual", "import", "catalog"];

const RECIPE_STEP_KINDS: RecipeStepKind[] = ["blocking", "parallel", "wait", "timer"];

const COOKING_METHODS: CookingMethod[] = [
  "boil",
  "bake",
  "fry",
  "saute",
  "steam",
  "grill",
  "raw",
  "other",
];

const CATEGORY_SORT_ORDER: Record<RecipeCategory, number> = {
  breakfast: 0,
  lunch: 1,
  dinner: 2,
  dessert: 3,
  snack: 4,
  beverage: 5,
  meal_prep: 6,
};

const DIFFICULTY_SORT_ORDER: Record<RecipeDifficulty, number> = {
  easy: 0,
  medium: 1,
  hard: 2,
};

const EXPERIENCE_SORT_ORDER: Record<RecipeExperienceLevel, number> = {
  beginner: 0,
  intermediate: 1,
  advanced: 2,
};

const RECIPE_SORT_MODES: RecipesSortMode[] = [
  "recent",
  "title",
  "category",
  "cookTime",
  "difficulty",
  "experience",
  "mastery",
];

const RECIPE_COOK_TIME_FILTERS: RecipeCookTimeFilter[] = [
  "all",
  "quick",
  "moderate",
  "hour",
  "long",
  "unset",
];

const RECIPE_MASTERY_FILTERS: RecipeMasteryFilter[] = [
  "all",
  "uncooked",
  "novice",
  "practiced",
  "proficient",
  "skilled",
  "expert",
  "master",
];

const RECIPE_AVAILABILITY_FILTERS: RecipeAvailabilityFilter[] = [
  "all",
  "can_make",
  "partial",
  "missing",
];

const MASTERY_FILTER_TIER: Record<
  Exclude<RecipeMasteryFilter, "all" | "uncooked">,
  1 | 2 | 3 | 4 | 5 | 6
> = {
  novice: 1,
  practiced: 2,
  proficient: 3,
  skilled: 4,
  expert: 5,
  master: 6,
};

export function getRecipeCategoryValues(): RecipeCategory[] {
  return [...RECIPE_CATEGORIES];
}

export function getRecipeDifficultyValues(): RecipeDifficulty[] {
  return [...RECIPE_DIFFICULTIES];
}

export function getRecipeExperienceLevelValues(): RecipeExperienceLevel[] {
  return [...RECIPE_EXPERIENCE_LEVELS];
}

export function getRecipeStepKindValues(): RecipeStepKind[] {
  return [...RECIPE_STEP_KINDS];
}

export function getRecipeSortModeValues(): RecipesSortMode[] {
  return [...RECIPE_SORT_MODES];
}

export function getRecipeCookTimeFilterValues(): RecipeCookTimeFilter[] {
  return RECIPE_COOK_TIME_FILTERS.filter((value) => value !== "all");
}

export function getRecipeMasteryFilterValues(): RecipeMasteryFilter[] {
  return RECIPE_MASTERY_FILTERS.filter((value) => value !== "all");
}

export function getRecipeAvailabilityFilterValues(): RecipeAvailabilityFilter[] {
  return RECIPE_AVAILABILITY_FILTERS.filter((value) => value !== "all");
}

export function isRecipeCategory(value: string): value is RecipeCategory {
  return RECIPE_CATEGORIES.includes(value as RecipeCategory);
}

export function isRecipeDifficulty(value: string): value is RecipeDifficulty {
  return RECIPE_DIFFICULTIES.includes(value as RecipeDifficulty);
}

export function isRecipeExperienceLevel(value: string): value is RecipeExperienceLevel {
  return RECIPE_EXPERIENCE_LEVELS.includes(value as RecipeExperienceLevel);
}

export function isRecipesSortMode(value: string): value is RecipesSortMode {
  return RECIPE_SORT_MODES.includes(value as RecipesSortMode);
}

export function isRecipeCategoryFilter(value: string): value is RecipeCategoryFilter {
  return value === "all" || isRecipeCategory(value);
}

export function isRecipeDifficultyFilter(value: string): value is RecipeDifficultyFilter {
  return value === "all" || isRecipeDifficulty(value);
}

export function isRecipeExperienceFilter(value: string): value is RecipeExperienceFilter {
  return value === "all" || isRecipeExperienceLevel(value);
}

export function isRecipeCookTimeFilter(value: string): value is RecipeCookTimeFilter {
  return RECIPE_COOK_TIME_FILTERS.includes(value as RecipeCookTimeFilter);
}

export function isRecipeMasteryFilter(value: string): value is RecipeMasteryFilter {
  return RECIPE_MASTERY_FILTERS.includes(value as RecipeMasteryFilter);
}

export function isRecipeAvailabilityFilter(value: string): value is RecipeAvailabilityFilter {
  return RECIPE_AVAILABILITY_FILTERS.includes(value as RecipeAvailabilityFilter);
}

export function isRecipeSource(value: string): value is RecipeSource {
  return RECIPE_SOURCES.includes(value as RecipeSource);
}

export function isRecipeStepKind(value: string): value is RecipeStepKind {
  return RECIPE_STEP_KINDS.includes(value as RecipeStepKind);
}

export function isCookingMethod(value: string): value is CookingMethod {
  return COOKING_METHODS.includes(value as CookingMethod);
}

export function getCookingMethodValues(): CookingMethod[] {
  return [...COOKING_METHODS];
}

export function formatCookingMethod(method: CookingMethod): string {
  return COOKING_METHOD_LABELS[method];
}

export function formatRecipeCategory(category: RecipeCategory): string {
  return RECIPE_CATEGORY_LABELS[category];
}

export function formatRecipeDifficulty(difficulty: RecipeDifficulty): string {
  return RECIPE_DIFFICULTY_LABELS[difficulty];
}

export function formatRecipeExperienceLevel(level: RecipeExperienceLevel): string {
  return RECIPE_EXPERIENCE_LABELS[level];
}

export function formatRecipeStepKind(kind: RecipeStepKind): string {
  return RECIPE_STEP_KIND_LABELS[kind];
}

export function formatEstimatedMinutes(minutes?: number): string | undefined {
  if (minutes === undefined) return undefined;
  return `${minutes} min`;
}

export function formatServings(servings?: number): string | undefined {
  if (servings === undefined) return undefined;
  return servings === 1 ? "1 serving" : `${servings} servings`;
}

export function formatIngredientCount(recipe: Recipe): string {
  const count = recipe.ingredients.length;
  return count === 1 ? "1 ingredient" : `${count} ingredients`;
}

export function formatStepCount(recipe: Recipe): string {
  const count = recipe.steps.length;
  return count === 1 ? "1 step" : `${count} steps`;
}

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

export function recipeMatchesQuery(recipe: Recipe, query: string): boolean {
  const normalized = normalizeQuery(query);
  if (!normalized) return true;

  if (recipe.title.toLowerCase().includes(normalized)) return true;
  if (recipe.notes?.toLowerCase().includes(normalized)) return true;
  if (formatRecipeCategory(recipe.category).toLowerCase().includes(normalized)) return true;
  if (formatRecipeDifficulty(recipe.difficulty).toLowerCase().includes(normalized)) return true;
  if (formatRecipeExperienceLevel(recipe.experienceLevel).toLowerCase().includes(normalized)) {
    return true;
  }
  if (recipe.ingredients.some((line) => line.rawText.toLowerCase().includes(normalized))) {
    return true;
  }
  if (recipe.steps.some((step) => step.text.toLowerCase().includes(normalized))) {
    return true;
  }
  if (recipe.equipment.some((item) => item.toLowerCase().includes(normalized))) {
    return true;
  }
  return false;
}

function compareIsoDesc(a: string, b: string): number {
  return b.localeCompare(a);
}

export function cookTimeBucket(minutes?: number): Exclude<RecipeCookTimeFilter, "all"> {
  if (minutes === undefined) return "unset";
  if (minutes <= 15) return "quick";
  if (minutes <= 30) return "moderate";
  if (minutes <= 60) return "hour";
  return "long";
}

export function recipeMatchesCookTimeFilter(
  recipe: Recipe,
  filter: RecipeCookTimeFilter
): boolean {
  if (filter === "all") return true;
  return cookTimeBucket(recipe.estimatedMinutes) === filter;
}

export function recipeMatchesMasteryFilter(
  recipeId: string,
  filter: RecipeMasteryFilter,
  masteryByRecipeId?: ReadonlyMap<string, RecipeMasteryView>
): boolean {
  if (filter === "all") return true;
  const tier = masteryByRecipeId?.get(recipeId)?.tier ?? null;
  if (filter === "uncooked") return tier === null;
  return tier === MASTERY_FILTER_TIER[filter];
}

export function recipeMatchesAvailabilityFilter(
  recipeId: string,
  filter: RecipeAvailabilityFilter,
  availabilityByRecipeId?: ReadonlyMap<string, RecipeAvailability>
): boolean {
  if (filter === "all") return true;
  const status = availabilityByRecipeId?.get(recipeId) ?? "missing";
  return status === filter;
}

export function recipeGalleryFiltersAreActive(
  opts: Omit<RecipeGalleryFilters, "sortMode">
): boolean {
  return Boolean(
    (opts.query ?? "").trim() ||
      (opts.categoryFilter !== undefined && opts.categoryFilter !== "all") ||
      (opts.difficultyFilter !== undefined && opts.difficultyFilter !== "all") ||
      (opts.experienceFilter !== undefined && opts.experienceFilter !== "all") ||
      (opts.cookTimeFilter !== undefined && opts.cookTimeFilter !== "all") ||
      (opts.masteryFilter !== undefined && opts.masteryFilter !== "all") ||
      (opts.availabilityFilter !== undefined && opts.availabilityFilter !== "all")
  );
}

export function describeRecipeGalleryEmptyState(
  opts: Omit<RecipeGalleryFilters, "sortMode">
): string {
  const query = (opts.query ?? "").trim();
  if (query) return `No matches for “${query}”.`;
  if (recipeGalleryFiltersAreActive(opts)) return "No recipes match these filters.";
  return "No recipes yet.";
}

function masterySortKey(
  recipeId: string,
  masteryByRecipeId?: ReadonlyMap<string, RecipeMasteryView>
): { tier: number; count: number } {
  const view = masteryByRecipeId?.get(recipeId);
  return {
    tier: view?.tier ?? 0,
    count: view?.completionCount ?? 0,
  };
}

export function filterAndSortRecipes(
  recipes: Recipe[],
  opts: RecipeGalleryFilters & {
    masteryByRecipeId?: ReadonlyMap<string, RecipeMasteryView>;
    availabilityByRecipeId?: ReadonlyMap<string, RecipeAvailability>;
  }
): Recipe[] {
  const query = opts.query ?? "";
  const categoryFilter = opts.categoryFilter ?? "all";
  const difficultyFilter = opts.difficultyFilter ?? "all";
  const experienceFilter = opts.experienceFilter ?? "all";
  const cookTimeFilter = opts.cookTimeFilter ?? "all";
  const masteryFilter = opts.masteryFilter ?? "all";
  const availabilityFilter = opts.availabilityFilter ?? "all";
  const masteryByRecipeId = opts.masteryByRecipeId;
  const availabilityByRecipeId = opts.availabilityByRecipeId;

  const filtered = recipes.filter((recipe) => {
    if (!recipeMatchesQuery(recipe, query)) return false;
    if (categoryFilter !== "all" && recipe.category !== categoryFilter) return false;
    if (difficultyFilter !== "all" && recipe.difficulty !== difficultyFilter) return false;
    if (experienceFilter !== "all" && recipe.experienceLevel !== experienceFilter) {
      return false;
    }
    if (!recipeMatchesCookTimeFilter(recipe, cookTimeFilter)) return false;
    if (!recipeMatchesMasteryFilter(recipe.id, masteryFilter, masteryByRecipeId)) {
      return false;
    }
    if (!recipeMatchesAvailabilityFilter(recipe.id, availabilityFilter, availabilityByRecipeId)) {
      return false;
    }
    return true;
  });

  const sorted = [...filtered];
  switch (opts.sortMode) {
    case "title":
      sorted.sort((a, b) => a.title.localeCompare(b.title));
      break;
    case "category":
      sorted.sort((a, b) => {
        const byCategory = CATEGORY_SORT_ORDER[a.category] - CATEGORY_SORT_ORDER[b.category];
        if (byCategory !== 0) return byCategory;
        return a.title.localeCompare(b.title);
      });
      break;
    case "cookTime":
      sorted.sort((a, b) => {
        const aMinutes = a.estimatedMinutes ?? Number.POSITIVE_INFINITY;
        const bMinutes = b.estimatedMinutes ?? Number.POSITIVE_INFINITY;
        if (aMinutes !== bMinutes) return aMinutes - bMinutes;
        return a.title.localeCompare(b.title);
      });
      break;
    case "difficulty":
      sorted.sort((a, b) => {
        const byDifficulty =
          DIFFICULTY_SORT_ORDER[a.difficulty] - DIFFICULTY_SORT_ORDER[b.difficulty];
        if (byDifficulty !== 0) return byDifficulty;
        return a.title.localeCompare(b.title);
      });
      break;
    case "experience":
      sorted.sort((a, b) => {
        const byExperience =
          EXPERIENCE_SORT_ORDER[a.experienceLevel] - EXPERIENCE_SORT_ORDER[b.experienceLevel];
        if (byExperience !== 0) return byExperience;
        return a.title.localeCompare(b.title);
      });
      break;
    case "mastery":
      sorted.sort((a, b) => {
        const aKey = masterySortKey(a.id, masteryByRecipeId);
        const bKey = masterySortKey(b.id, masteryByRecipeId);
        if (aKey.tier !== bKey.tier) return bKey.tier - aKey.tier;
        if (aKey.count !== bKey.count) return bKey.count - aKey.count;
        return a.title.localeCompare(b.title);
      });
      break;
    case "recent":
    default:
      sorted.sort((a, b) => compareIsoDesc(a.updatedAtIso, b.updatedAtIso));
      break;
  }

  return sorted;
}

// ---------------------------------------------------------------------------
// Sessions + mastery
// ---------------------------------------------------------------------------

export type RecipeMasteryTier = 1 | 2 | 3 | 4 | 5 | 6;

export type RecipeMasteryView = {
  recipeId: string;
  completionCount: number;
  tier: RecipeMasteryTier | null;
  tierName: string;
  recentWeekStreak: number;
  lifetimeXp: number;
  level: number;
};

export const RECIPE_MASTERY_TIER_NAMES: Record<RecipeMasteryTier, string> = {
  1: "Novice",
  2: "Practiced",
  3: "Proficient",
  4: "Skilled",
  5: "Expert",
  6: "Master",
};

const COOKING_SESSION_STATUSES: CookingSessionStatus[] = [
  "planned",
  "in_progress",
  "completed",
  "abandoned",
];

const PERSISTED_COOKING_SESSION_STATUSES: CookingSessionStatus[] = [
  "planned",
  "in_progress",
  "completed",
  "abandoned",
];

const COOKING_TIMER_STATUSES: CookingTimerStatus[] = ["idle", "running", "paused", "done"];

const ISO_WEEK_KEY_RE = /^(\d{4})-W(\d{2})$/;
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isCookingSessionStatus(value: string): value is CookingSessionStatus {
  return COOKING_SESSION_STATUSES.includes(value as CookingSessionStatus);
}

export function isPersistedCookingSessionStatus(value: string): value is CookingSessionStatus {
  return PERSISTED_COOKING_SESSION_STATUSES.includes(value as CookingSessionStatus);
}

export function isPlannedCookingSession(session: CookingSession): boolean {
  return session.status === "planned";
}

export function isCookingTimerStatus(value: string): value is CookingTimerStatus {
  return COOKING_TIMER_STATUSES.includes(value as CookingTimerStatus);
}

export function isCompletedCookingSession(session: CookingSession): boolean {
  return session.status === "completed";
}

export function listPlannedCookingSessions(sessions: CookingSession[]): CookingSession[] {
  return sessions.filter(isPlannedCookingSession).sort(compareCookingSessionsAsc);
}

export function listUpcomingPlannedCookingSessions(
  sessions: CookingSession[],
  fromDateKey: string,
  limit: number
): CookingSession[] {
  return listPlannedCookingSessions(sessions)
    .filter((session) => session.cookDate >= fromDateKey)
    .slice(0, Math.max(0, limit));
}

export function findPlannedCookingSession(
  sessions: CookingSession[],
  recipeId: string,
  cookDate: string
): CookingSession | undefined {
  return sessions.find(
    (session) =>
      session.status === "planned" &&
      session.recipeId === recipeId &&
      session.cookDate === cookDate
  );
}

export function combineCookDateAndTime(dateKey: string, hhmm: string): string | undefined {
  if (!DATE_KEY_RE.test(dateKey) || !HHMM_RE.test(hhmm)) return undefined;
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hours, minutes] = hhmm.split(":").map(Number);
  if (!year || !month || !day) return undefined;
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return undefined;
  const date = new Date(year, month - 1, day, hours, minutes, 0, 0);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

export function resolveCookingStartHHMM(session: CookingSession): string | undefined {
  return localHHMMFromIso(session.startedAtIso);
}

export function resolveCookingFinishHHMM(session: CookingSession): string | undefined {
  return localHHMMFromIso(session.finishedAtIso);
}

function localHHMMFromIso(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function formatRecipeIngredientSummary(recipe: Recipe): string | undefined {
  const lines = recipe.ingredients
    .map((line) => line.rawText.trim())
    .filter((text) => text.length > 0);
  if (lines.length === 0) return undefined;
  return lines.join(", ");
}

export function validateCookingSchedule(
  cookDate: string,
  startTime?: string
): string | undefined {
  if (!DATE_KEY_RE.test(cookDate)) return "Pick a cook date.";
  if (startTime !== undefined && startTime.trim().length > 0 && !HHMM_RE.test(startTime)) {
    return "Start time must be a valid time.";
  }
  return undefined;
}

export function compareCookingSessionsAsc(a: CookingSession, b: CookingSession): number {
  const byDate = a.cookDate.localeCompare(b.cookDate);
  if (byDate !== 0) return byDate;
  const aStamp = a.finishedAtIso ?? a.startedAtIso ?? a.createdAtIso;
  const bStamp = b.finishedAtIso ?? b.startedAtIso ?? b.createdAtIso;
  const byStamp = aStamp.localeCompare(bStamp);
  if (byStamp !== 0) return byStamp;
  return a.id.localeCompare(b.id);
}

export function compareCookingSessionsDesc(a: CookingSession, b: CookingSession): number {
  return compareCookingSessionsAsc(b, a);
}

export function listCompletedCookingSessions(sessions: CookingSession[]): CookingSession[] {
  return sessions.filter(isCompletedCookingSession).sort(compareCookingSessionsAsc);
}

export function listRecentCookingSessions(
  sessions: CookingSession[],
  limit: number
): CookingSession[] {
  return [...listCompletedCookingSessions(sessions)]
    .sort(compareCookingSessionsDesc)
    .slice(0, Math.max(0, limit));
}

export function completionsByRecipeId(
  sessions: CookingSession[]
): Map<string, CookingSession[]> {
  const map = new Map<string, CookingSession[]>();
  for (const session of listCompletedCookingSessions(sessions)) {
    if (!session.recipeId) continue;
    const list = map.get(session.recipeId) ?? [];
    list.push(session);
    map.set(session.recipeId, list);
  }
  return map;
}

export function masteryTierFromCount(completionCount: number): RecipeMasteryTier | null {
  if (!Number.isInteger(completionCount) || completionCount < 1) return null;
  if (completionCount <= 2) return 1;
  if (completionCount <= 9) return 2;
  if (completionCount <= 24) return 3;
  if (completionCount <= 49) return 4;
  if (completionCount <= 99) return 5;
  return 6;
}

export function masteryTierName(tier: RecipeMasteryTier | null): string {
  return tier === null ? "Not yet cooked" : RECIPE_MASTERY_TIER_NAMES[tier];
}

export function crossedMasteryTier(priorCount: number, nextCount: number): boolean {
  return masteryTierFromCount(nextCount) !== masteryTierFromCount(priorCount);
}

export function xpForCompletion(priorCompletions: number): number {
  if (!Number.isInteger(priorCompletions) || priorCompletions < 0) return 0;
  if (priorCompletions === 0) return COOKING_XP.firstCook;
  const repeatXp = Math.round(COOKING_XP.repeatBase / (1 + Math.log(1 + priorCompletions)));
  return Math.max(COOKING_XP.repeatMin, repeatXp);
}

export function recipeTrackXpFromCount(completionCount: number): number {
  if (!Number.isInteger(completionCount) || completionCount < 0) return 0;
  let xp = 0;
  for (let prior = 0; prior < completionCount; prior += 1) {
    xp += xpForCompletion(prior);
    if (crossedMasteryTier(prior, prior + 1)) {
      xp += COOKING_XP.masteryTierUp;
    }
  }
  return xp;
}

export function isoWeekKeyFromDateKey(dateKey: string): string | null {
  if (!DATE_KEY_RE.test(dateKey)) return null;
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayNr = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNr + 3);
  const isoYear = date.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDayNr = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNr + 3);
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / 604800000);
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

export function previousIsoWeekKey(weekKey: string): string | null {
  const match = ISO_WEEK_KEY_RE.exec(weekKey);
  if (!match) return null;
  const year = Number(match[1]);
  const week = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(week) || week < 1) return null;
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = (jan4.getUTCDay() + 6) % 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Day);
  const thursday = new Date(week1Monday);
  thursday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7 + 3 - 7);
  const y = thursday.getUTCFullYear();
  const m = String(thursday.getUTCMonth() + 1).padStart(2, "0");
  const d = String(thursday.getUTCDate()).padStart(2, "0");
  return isoWeekKeyFromDateKey(`${y}-${m}-${d}`);
}

export function recentCookWeekStreak(cookDates: string[]): number {
  const weeks = new Set<string>();
  let latest: string | null = null;
  for (const dateKey of cookDates) {
    const weekKey = isoWeekKeyFromDateKey(dateKey);
    if (!weekKey) continue;
    weeks.add(weekKey);
    if (latest === null || weekKey > latest) latest = weekKey;
  }
  if (!latest) return 0;

  let streak = 0;
  let cursor: string | null = latest;
  while (cursor && weeks.has(cursor)) {
    streak += 1;
    cursor = previousIsoWeekKey(cursor);
  }
  return streak;
}

export function homeCookedWeekStreak(sessions: CookingSession[], todayKey: string): number {
  const weeks = new Set<string>();
  for (const session of listCompletedCookingSessions(sessions)) {
    const weekKey = isoWeekKeyFromDateKey(session.cookDate);
    if (weekKey) weeks.add(weekKey);
  }

  const currentWeek = isoWeekKeyFromDateKey(todayKey);
  if (!currentWeek) return 0;
  const previousWeek = previousIsoWeekKey(currentWeek);
  const start = weeks.has(currentWeek)
    ? currentWeek
    : previousWeek && weeks.has(previousWeek)
      ? previousWeek
      : null;
  if (!start) return 0;

  let streak = 0;
  let cursor: string | null = start;
  while (cursor && weeks.has(cursor)) {
    streak += 1;
    cursor = previousIsoWeekKey(cursor);
  }
  return streak;
}

export function distinctRecipesCookedCount(sessions: CookingSession[]): number {
  const keys = new Set<string>();
  for (const session of listCompletedCookingSessions(sessions)) {
    keys.add(session.recipeId ?? `title:${session.recipeTitle}`);
  }
  return keys.size;
}

export function maxRecipeMasteryTier(sessions: CookingSession[]): RecipeMasteryTier | null {
  let max: RecipeMasteryTier | null = null;
  for (const list of completionsByRecipeId(sessions).values()) {
    const tier = masteryTierFromCount(list.length);
    if (tier !== null && (max === null || tier > max)) max = tier;
  }
  return max;
}

export function buildRecipeMasteryView(
  recipeId: string,
  sessions: CookingSession[]
): RecipeMasteryView {
  const completions = completionsByRecipeId(sessions).get(recipeId) ?? [];
  const completionCount = completions.length;
  const tier = masteryTierFromCount(completionCount);
  const lifetimeXp = recipeTrackXpFromCount(completionCount);
  return {
    recipeId,
    completionCount,
    tier,
    tierName: masteryTierName(tier),
    recentWeekStreak: recentCookWeekStreak(completions.map((session) => session.cookDate)),
    lifetimeXp,
    level: levelFromTotalXp(lifetimeXp).level,
  };
}

export function buildRecipeMasteryViews(
  recipes: Recipe[],
  sessions: CookingSession[]
): Map<string, RecipeMasteryView> {
  const map = new Map<string, RecipeMasteryView>();
  for (const recipe of recipes) {
    map.set(recipe.id, buildRecipeMasteryView(recipe.id, sessions));
  }
  return map;
}

export function listCompletedCookingSessionsInRange(
  sessions: CookingSession[],
  startKey: string,
  endKey: string
): CookingSession[] {
  if (!DATE_KEY_RE.test(startKey) || !DATE_KEY_RE.test(endKey) || startKey > endKey) {
    return [];
  }
  return listCompletedCookingSessions(sessions).filter(
    (session) => session.cookDate >= startKey && session.cookDate <= endKey
  );
}

export function listFirstCookSessionsInRange(
  sessions: CookingSession[],
  startKey: string,
  endKey: string
): CookingSession[] {
  const inRange = listCompletedCookingSessionsInRange(sessions, startKey, endKey);
  const byRecipe = completionsByRecipeId(sessions);
  const firsts: CookingSession[] = [];
  const seen = new Set<string>();

  for (const session of inRange) {
    const key = session.recipeId ?? `title:${session.recipeTitle}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (session.recipeId) {
      const history = byRecipe.get(session.recipeId) ?? [];
      if (history[0]?.id === session.id) firsts.push(session);
      continue;
    }

    const titleHistory = listCompletedCookingSessions(sessions).filter(
      (item) => !item.recipeId && item.recipeTitle === session.recipeTitle
    );
    if (titleHistory[0]?.id === session.id) firsts.push(session);
  }

  return firsts;
}

export function listCompletedCookingSessionsInWeek(
  sessions: CookingSession[],
  todayKey: string
): CookingSession[] {
  if (!DATE_KEY_RE.test(todayKey)) return [];
  const [year, month, day] = todayKey.split("-").map(Number);
  if (!year || !month || !day) return [];
  const weekStart = startOfWeekLocal(new Date(year, month - 1, day));
  const startKey = formatLocalDateKey(weekStart);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const endKey = formatLocalDateKey(weekEnd);
  return listCompletedCookingSessions(sessions).filter(
    (session) => session.cookDate >= startKey && session.cookDate <= endKey
  );
}

export function formatMasteryStreak(streak: number): string | undefined {
  if (!Number.isInteger(streak) || streak < 1) return undefined;
  return streak === 1 ? "cooked 1 week running" : `cooked ${streak} weeks running`;
}

export function formatCookDate(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return dateKey;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function toDatetimeLocalValue(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromDatetimeLocalValue(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

export function defaultCookingWindow(
  estimatedMinutes: number | undefined,
  now: Date = new Date()
): { startedAtIso: string; finishedAtIso: string } {
  const minutes =
    estimatedMinutes !== undefined && Number.isInteger(estimatedMinutes) && estimatedMinutes > 0
      ? estimatedMinutes
      : 30;
  const finished = now;
  const started = new Date(now.getTime() - minutes * 60_000);
  return { startedAtIso: started.toISOString(), finishedAtIso: finished.toISOString() };
}

export function durationMinutesBetween(
  startedAtIso: string,
  finishedAtIso: string
): number | undefined {
  const start = new Date(startedAtIso).getTime();
  const finish = new Date(finishedAtIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(finish) || finish <= start) return undefined;
  return Math.max(1, Math.round((finish - start) / 60_000));
}

export function validateCookingCompletion(
  startedAtIso: string,
  finishedAtIso: string
): string | undefined {
  if (!startedAtIso || !finishedAtIso) return "Start and finish times are required.";
  const start = new Date(startedAtIso).getTime();
  const finish = new Date(finishedAtIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(finish)) {
    return "Enter valid start and finish times.";
  }
  if (finish <= start) return "Finish time must be after the start time.";
  return undefined;
}

export function cookDateFromIso(iso: string): string {
  const date = new Date(iso);
  return formatLocalDateKey(Number.isNaN(date.getTime()) ? new Date() : date);
}

export function buildPlannedCookingSession(
  recipe: Recipe,
  input: { cookDate: string; startTime?: string; notes?: string }
): Omit<CookingSession, "id" | "createdAtIso" | "updatedAtIso"> | undefined {
  if (validateCookingSchedule(input.cookDate, input.startTime) !== undefined) return undefined;

  const session: Omit<CookingSession, "id" | "createdAtIso" | "updatedAtIso"> = {
    recipeId: recipe.id,
    recipeTitle: recipe.title,
    status: "planned",
    cookDate: input.cookDate,
    timers: [],
  };
  if (recipe.estimatedMinutes !== undefined) session.durationMinutes = recipe.estimatedMinutes;
  const startTime = input.startTime?.trim();
  if (startTime) {
    const startedAtIso = combineCookDateAndTime(input.cookDate, startTime);
    if (!startedAtIso) return undefined;
    session.startedAtIso = startedAtIso;
  }
  if (input.notes?.trim()) session.notes = input.notes.trim();
  return session;
}

export function completeCookingSession(
  base: Pick<CookingSession, "recipeId" | "recipeTitle" | "timers" | "notes" | "servingsMade">,
  input: {
    startedAtIso: string;
    finishedAtIso: string;
    servingsMade?: number;
    notes?: string;
  }
): Omit<CookingSession, "id" | "createdAtIso" | "updatedAtIso"> {
  const durationMinutes = durationMinutesBetween(input.startedAtIso, input.finishedAtIso);
  const session: Omit<CookingSession, "id" | "createdAtIso" | "updatedAtIso"> = {
    recipeId: base.recipeId,
    recipeTitle: base.recipeTitle,
    status: "completed",
    cookDate: cookDateFromIso(input.finishedAtIso),
    startedAtIso: input.startedAtIso,
    finishedAtIso: input.finishedAtIso,
    timers: [...base.timers],
  };
  if (durationMinutes !== undefined) session.durationMinutes = durationMinutes;
  const servingsMade = input.servingsMade ?? base.servingsMade;
  if (servingsMade !== undefined) session.servingsMade = servingsMade;
  const notes = input.notes?.trim() || base.notes;
  if (notes) session.notes = notes;
  return session;
}

export function buildCompletedCookingSession(
  recipe: Recipe,
  input: {
    startedAtIso: string;
    finishedAtIso: string;
    servingsMade?: number;
    notes?: string;
  }
): Omit<CookingSession, "id" | "createdAtIso" | "updatedAtIso"> {
  return completeCookingSession(
    { recipeId: recipe.id, recipeTitle: recipe.title, timers: [] },
    input
  );
}

export function sanitizeCookingReferences(payload: AppPayload): AppPayload {
  const recipeIds = new Set(payload.recipes.map((recipe) => recipe.id));
  const customIds = new Set((payload.customIngredients ?? []).map((item) => item.id));
  let changed = false;

  const cookingSessions = (payload.cookingSessions ?? []).map((session) => {
    if (session.recipeId && !recipeIds.has(session.recipeId)) {
      changed = true;
      return { ...session, recipeId: null };
    }
    return session;
  });

  const recipes = payload.recipes.map((recipe) => {
    let recipeChanged = false;
    const ingredients = recipe.ingredients.map((line) => {
      if (line.customIngredientId && !customIds.has(line.customIngredientId)) {
        recipeChanged = true;
        const next = { ...line };
        delete next.customIngredientId;
        return next;
      }
      return line;
    });
    if (!recipeChanged) return recipe;
    changed = true;
    return { ...recipe, ingredients };
  });

  const pantry = (payload.pantry ?? []).map((item) => {
    if (item.customIngredientId && !customIds.has(item.customIngredientId)) {
      changed = true;
      const next = { ...item };
      delete next.customIngredientId;
      return next;
    }
    return item;
  });

  if (!changed) return payload;
  return { ...payload, cookingSessions, recipes, pantry };
}
