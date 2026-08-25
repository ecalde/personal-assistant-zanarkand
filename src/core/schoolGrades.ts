/**
 * Weighted what-if grade calculator (Phase 58).
 *
 * Required category weights form the course pie. Ungraded items, 0% weight,
 * and extra-credit rows do not consume that pie; extra credit can raise the
 * displayed total above 100%. Remaining work uses 100% for max and 0% for min.
 */

import type { SchoolCourse, SchoolGradeCategory, SchoolGradedItem } from "./model";
import { GT_LETTER_SCALE, letterGradeFromPercent, type SchoolLetterGrade } from "./school";

export const SCHOOL_A_MIN_PERCENT =
  GT_LETTER_SCALE.find((band) => band.letter === "A")?.minPercent ?? 90;

const EPSILON = 1e-9;

export type SchoolGradeAStatus = "empty" | "locked" | "impossible" | "need_remaining";

export type SchoolGradeItemStatus = "graded" | "remaining" | "ignored";

export type SchoolGradeScoring = "points" | "equal";

export type SchoolGradeItemBreakdown = {
  itemId: string;
  name: string;
  categoryId?: string;
  extraCredit: boolean;
  status: SchoolGradeItemStatus;
  score?: number;
  maxScore?: number;
  percent?: number;
  coursePointsEarned: number;
  coursePointsPossible: number;
  floorPercentForA?: number;
};

export type SchoolGradeCategoryBreakdown = {
  categoryId: string;
  name: string;
  weightPercent: number;
  extraCredit: boolean;
  consumesRequiredWeight: boolean;
  scoring: SchoolGradeScoring;
  currentPercent?: number;
  requiredEarnedPoints: number;
  requiredRemainingPoints: number;
  extraCreditEarnedPoints: number;
  extraCreditRemainingPoints: number;
  remainingCount: number;
  items: SchoolGradeItemBreakdown[];
};

export type SchoolGradeWhatIf = {
  requiredWeight: number;
  currentPercent?: number;
  currentLetter?: SchoolLetterGrade;
  minPercent: number;
  minLetter: SchoolLetterGrade;
  maxPercent: number;
  maxLetter: SchoolLetterGrade;
  extraCreditEarned: number;
  extraCreditPossible: number;
  remainingCoursePoints: number;
  neededRemainingAverageForA?: number;
  aStatus: SchoolGradeAStatus;
  categories: SchoolGradeCategoryBreakdown[];
  uncategorized: SchoolGradeItemBreakdown[];
};

export function formatSchoolGradePercent(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}

export function formatNeedForACaption(snapshot: SchoolGradeWhatIf): string {
  switch (snapshot.aStatus) {
    case "empty":
      return "Add grade categories and items to see a projected grade.";
    case "locked":
      return snapshot.remainingCoursePoints > EPSILON
        ? "A is locked even at 0% on remaining work."
        : "A is locked.";
    case "impossible":
      return snapshot.remainingCoursePoints > EPSILON
        ? "A is out of reach even at 100% on remaining work."
        : "A is out of reach.";
    case "need_remaining":
      return `Need ${formatSchoolGradePercent(snapshot.neededRemainingAverageForA ?? 0)} average on remaining work for an A (90%).`;
  }
}

export function formatRemainingItemCaption(
  item: SchoolGradeItemBreakdown,
  neededAverage?: number
): string {
  if (item.status !== "remaining") return "";
  const parts: string[] = [];
  if (neededAverage !== undefined) {
    parts.push(`${formatSchoolGradePercent(neededAverage)} avg remaining`);
  }
  if (item.floorPercentForA === undefined) return parts.join(" · ");
  if (item.floorPercentForA <= EPSILON) parts.push("can be 0% if others are 100%");
  else if (item.floorPercentForA > 100 + EPSILON) {
    parts.push("100% here is not enough even if others are 100%");
  } else {
    parts.push(`safe ≥ ${formatSchoolGradePercent(item.floorPercentForA)} if others are 100%`);
  }
  return parts.join(" · ");
}

export function computeCourseGradeWhatIf(
  course: SchoolCourse,
  items: readonly SchoolGradedItem[]
): SchoolGradeWhatIf {
  const courseItems = items.filter((item) => item.courseId === course.id);
  const categoryIds = new Set(course.gradeCategories.map((category) => category.id));
  const itemsByCategory = new Map<string, SchoolGradedItem[]>();
  const uncategorizedItems: SchoolGradedItem[] = [];

  for (const item of courseItems) {
    if (item.categoryId && categoryIds.has(item.categoryId)) {
      const list = itemsByCategory.get(item.categoryId) ?? [];
      list.push(item);
      itemsByCategory.set(item.categoryId, list);
    } else {
      uncategorizedItems.push(item);
    }
  }

  const categories = course.gradeCategories.map((category) =>
    computeCategoryBreakdown(category, itemsByCategory.get(category.id) ?? [])
  );

  let requiredWeight = 0;
  let requiredEarnedPoints = 0;
  let requiredRemainingPoints = 0;
  let extraCreditEarned = 0;
  let extraCreditRemaining = 0;
  let currentNumerator = 0;
  let currentDenominator = 0;

  for (const category of categories) {
    extraCreditEarned += category.extraCreditEarnedPoints;
    extraCreditRemaining += category.extraCreditRemainingPoints;
    if (!category.consumesRequiredWeight) continue;
    requiredWeight += category.weightPercent;
    requiredEarnedPoints += category.requiredEarnedPoints;
    requiredRemainingPoints += category.requiredRemainingPoints;
    if (category.currentPercent !== undefined) {
      currentNumerator += category.currentPercent * category.weightPercent;
      currentDenominator += category.weightPercent;
    }
  }

  const remainingCoursePoints = requiredRemainingPoints + extraCreditRemaining;
  const extraCreditPossible = extraCreditEarned + extraCreditRemaining;
  const lockedPoints = requiredEarnedPoints + extraCreditEarned;
  const minPercent = toDisplayPercent(lockedPoints, requiredWeight);
  const maxPercent = toDisplayPercent(lockedPoints + remainingCoursePoints, requiredWeight);

  const hasWork =
    requiredWeight > EPSILON || extraCreditPossible > EPSILON || courseItems.length > 0;
  const currentPercent =
    currentDenominator > EPSILON
      ? currentNumerator / currentDenominator +
        toDisplayPercent(extraCreditEarned, requiredWeight)
      : extraCreditEarned > EPSILON
        ? toDisplayPercent(extraCreditEarned, requiredWeight)
        : undefined;

  const targetPoints = (SCHOOL_A_MIN_PERCENT / 100) * displayDenominator(requiredWeight);
  let aStatus: SchoolGradeAStatus;
  let neededRemainingAverageForA: number | undefined;
  if (!hasWork) {
    aStatus = "empty";
  } else if (minPercent + EPSILON >= SCHOOL_A_MIN_PERCENT) {
    aStatus = "locked";
  } else if (maxPercent + EPSILON < SCHOOL_A_MIN_PERCENT) {
    aStatus = "impossible";
  } else if (remainingCoursePoints <= EPSILON) {
    aStatus = "impossible";
  } else {
    aStatus = "need_remaining";
    neededRemainingAverageForA = ((targetPoints - lockedPoints) / remainingCoursePoints) * 100;
  }

  const remainingContributors: SchoolGradeItemBreakdown[] = [];
  for (const category of categories) {
    for (const item of category.items) {
      if (item.status === "remaining" && item.coursePointsPossible > EPSILON) {
        remainingContributors.push(item);
      }
    }
  }
  for (const item of remainingContributors) {
    const othersMax = remainingCoursePoints - item.coursePointsPossible;
    item.floorPercentForA = ((targetPoints - lockedPoints - othersMax) / item.coursePointsPossible) * 100;
  }

  const snapshot: SchoolGradeWhatIf = {
    requiredWeight,
    minPercent,
    minLetter: letterGradeFromPercent(minPercent),
    maxPercent,
    maxLetter: letterGradeFromPercent(maxPercent),
    extraCreditEarned,
    extraCreditPossible,
    remainingCoursePoints,
    aStatus,
    categories,
    uncategorized: uncategorizedItems.map((item) => itemBreakdown(item, false, 0)),
  };
  if (currentPercent !== undefined) {
    snapshot.currentPercent = currentPercent;
    snapshot.currentLetter = letterGradeFromPercent(currentPercent);
  }
  if (neededRemainingAverageForA !== undefined) {
    snapshot.neededRemainingAverageForA = neededRemainingAverageForA;
  }
  return snapshot;
}

function computeCategoryBreakdown(
  category: SchoolGradeCategory,
  items: readonly SchoolGradedItem[]
): SchoolGradeCategoryBreakdown {
  const extraCreditCategory = Boolean(category.extraCredit);
  const sorted = [...items].sort(compareGradedItems);
  const requiredItems = sorted.filter((item) => !isExtraCreditItem(item, extraCreditCategory));
  const extraCreditItems = sorted.filter((item) => isExtraCreditItem(item, extraCreditCategory));
  const contributingRequired = requiredItems.filter(itemCanContribute);
  const contributingExtra = extraCreditItems.filter(itemCanContribute);
  const scoringPool =
    contributingRequired.length > 0 ? contributingRequired : contributingExtra;
  const scoring: SchoolGradeScoring = usesPointsWeighting(scoringPool) ? "points" : "equal";

  const consumesRequiredWeight =
    !extraCreditCategory && category.weightPercent > 0 && contributingRequired.length > 0;
  const requiredCount = contributingRequired.length;
  const extraCreditCount = contributingExtra.length;
  const totalRequiredMax = contributingRequired.reduce(
    (sum, item) => sum + (item.maxScore ?? 0),
    0
  );
  const totalExtraMax = contributingExtra.reduce((sum, item) => sum + (item.maxScore ?? 0), 0);

  const breakdownItems: SchoolGradeItemBreakdown[] = [];
  let requiredEarnedPoints = 0;
  let requiredRemainingPoints = 0;
  let extraCreditEarnedPoints = 0;
  let extraCreditRemainingPoints = 0;
  let gradedRequiredPercentSum = 0;
  let gradedRequiredCount = 0;
  let gradedRequiredScore = 0;
  let gradedRequiredMax = 0;

  for (const item of sorted) {
    const extraCredit = isExtraCreditItem(item, extraCreditCategory);
    const possible = extraCredit
      ? extraCreditPossiblePoints(
          item,
          category.weightPercent,
          scoring,
          requiredCount,
          totalRequiredMax,
          extraCreditCount,
          totalExtraMax
        )
      : requiredPossiblePoints(item, category.weightPercent, scoring, requiredCount, totalRequiredMax);
    const row = itemBreakdown(item, extraCredit, possible);
    breakdownItems.push(row);

    if (row.status === "ignored" || possible <= EPSILON) continue;

    if (row.status === "graded") {
      if (extraCredit) extraCreditEarnedPoints += row.coursePointsEarned;
      else {
        requiredEarnedPoints += row.coursePointsEarned;
        if (row.percent !== undefined) {
          gradedRequiredPercentSum += row.percent;
          gradedRequiredCount += 1;
        }
        if (item.maxScore !== undefined && item.maxScore > 0 && item.score !== undefined) {
          gradedRequiredScore += item.score;
          gradedRequiredMax += item.maxScore;
        }
      }
    } else if (extraCredit) extraCreditRemainingPoints += possible;
    else requiredRemainingPoints += possible;
  }

  const result: SchoolGradeCategoryBreakdown = {
    categoryId: category.id,
    name: category.name,
    weightPercent: category.weightPercent,
    extraCredit: extraCreditCategory,
    consumesRequiredWeight,
    scoring,
    requiredEarnedPoints: consumesRequiredWeight ? requiredEarnedPoints : 0,
    requiredRemainingPoints: consumesRequiredWeight ? requiredRemainingPoints : 0,
    extraCreditEarnedPoints: extraCreditCategory
      ? extraCreditEarnedPoints + requiredEarnedPoints
      : extraCreditEarnedPoints,
    extraCreditRemainingPoints: extraCreditCategory
      ? extraCreditRemainingPoints + requiredRemainingPoints
      : extraCreditRemainingPoints,
    remainingCount: breakdownItems.filter((item) => item.status === "remaining").length,
    items: breakdownItems,
  };

  if (!extraCreditCategory && gradedRequiredCount > 0) {
    result.currentPercent =
      scoring === "points" && gradedRequiredMax > EPSILON
        ? (gradedRequiredScore / gradedRequiredMax) * 100
        : gradedRequiredPercentSum / gradedRequiredCount;
  }

  return result;
}

function itemBreakdown(
  item: SchoolGradedItem,
  extraCredit: boolean,
  coursePointsPossible: number
): SchoolGradeItemBreakdown {
  const percent = itemEarnedPercent(item);
  const canContribute = itemCanContribute(item);
  let status: SchoolGradeItemStatus = "ignored";
  if (canContribute && percent !== undefined) status = "graded";
  else if (canContribute) status = "remaining";

  const coursePointsEarned =
    status === "graded" && percent !== undefined
      ? coursePointsPossible * (percent / 100)
      : 0;

  const row: SchoolGradeItemBreakdown = {
    itemId: item.id,
    name: item.name,
    extraCredit,
    status,
    coursePointsEarned,
    coursePointsPossible,
  };
  if (item.categoryId) row.categoryId = item.categoryId;
  if (item.score !== undefined) row.score = item.score;
  if (item.maxScore !== undefined) row.maxScore = item.maxScore;
  if (percent !== undefined) row.percent = percent;
  return row;
}

function requiredPossiblePoints(
  item: SchoolGradedItem,
  categoryWeight: number,
  scoring: SchoolGradeScoring,
  requiredCount: number,
  totalRequiredMax: number
): number {
  if (!itemCanContribute(item) || categoryWeight <= 0) return 0;
  if (scoring === "points" && totalRequiredMax > EPSILON && (item.maxScore ?? 0) > 0) {
    return categoryWeight * ((item.maxScore ?? 0) / totalRequiredMax);
  }
  if (requiredCount <= 0) return 0;
  return categoryWeight / requiredCount;
}

function extraCreditPossiblePoints(
  item: SchoolGradedItem,
  categoryWeight: number,
  scoring: SchoolGradeScoring,
  requiredCount: number,
  totalRequiredMax: number,
  extraCreditCount: number,
  totalExtraMax: number
): number {
  if (!itemCanContribute(item) || categoryWeight <= 0) return 0;
  if (requiredCount > 0) {
    if (scoring === "points" && totalRequiredMax > EPSILON && (item.maxScore ?? 0) > 0) {
      return categoryWeight * ((item.maxScore ?? 0) / totalRequiredMax);
    }
    return categoryWeight / requiredCount;
  }
  if (scoring === "points" && totalExtraMax > EPSILON && (item.maxScore ?? 0) > 0) {
    return categoryWeight * ((item.maxScore ?? 0) / totalExtraMax);
  }
  if (extraCreditCount <= 0) return 0;
  return categoryWeight / extraCreditCount;
}

function usesPointsWeighting(requiredItems: readonly SchoolGradedItem[]): boolean {
  return (
    requiredItems.length > 0 &&
    requiredItems.every((item) => item.maxScore !== undefined && item.maxScore > 0)
  );
}

function isExtraCreditItem(item: SchoolGradedItem, categoryIsExtraCredit: boolean): boolean {
  return categoryIsExtraCredit || Boolean(item.extraCredit);
}

function itemCanContribute(item: SchoolGradedItem): boolean {
  if (item.maxScore !== undefined && item.maxScore <= 0) return false;
  return true;
}

function itemEarnedPercent(item: SchoolGradedItem): number | undefined {
  if (item.score === undefined || !Number.isFinite(item.score)) return undefined;
  if (item.maxScore !== undefined) {
    if (item.maxScore <= 0) return undefined;
    return (item.score / item.maxScore) * 100;
  }
  return item.score;
}

function displayDenominator(requiredWeight: number): number {
  return requiredWeight > EPSILON ? requiredWeight : 100;
}

function toDisplayPercent(coursePoints: number, requiredWeight: number): number {
  return (coursePoints / displayDenominator(requiredWeight)) * 100;
}

function compareGradedItems(a: SchoolGradedItem, b: SchoolGradedItem): number {
  const dateA = a.dueDate ?? "";
  const dateB = b.dueDate ?? "";
  if (dateA !== dateB) return dateA.localeCompare(dateB);
  const name = a.name.localeCompare(b.name);
  if (name !== 0) return name;
  return a.id.localeCompare(b.id);
}
