import { describe, expect, it } from "vitest";
import type { SchoolCourse, SchoolGradedItem } from "./model";
import { createSchoolCourse, createSchoolGradedItem } from "./school";
import {
  computeCourseGradeWhatIf,
  formatNeedForACaption,
  formatRemainingItemCaption,
  formatSchoolGradePercent,
  SCHOOL_A_MIN_PERCENT,
} from "./schoolGrades";

const NOW = "2026-08-24T12:00:00.000Z";
const COURSE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const HW = "11111111-1111-4111-8111-111111111111";
const QUIZ = "22222222-2222-4222-8222-222222222222";
const EXAM = "33333333-3333-4333-8333-333333333333";
const EC = "44444444-4444-4444-8444-444444444444";

function courseWithCategories(
  categories: SchoolCourse["gradeCategories"]
): SchoolCourse {
  return createSchoolCourse(
    { name: "CS 1332", gradeCategories: categories },
    { id: COURSE_ID, nowIso: NOW }
  );
}

function item(
  id: string,
  input: {
    name: string;
    categoryId?: string;
    score?: number;
    maxScore?: number;
    extraCredit?: boolean;
    dueDate?: string;
  }
): SchoolGradedItem {
  return createSchoolGradedItem(
    { courseId: COURSE_ID, ...input },
    { id, nowIso: NOW }
  );
}

function defaultWeightedCourse(): SchoolCourse {
  return courseWithCategories([
    { id: HW, name: "Homework", weightPercent: 40 },
    { id: QUIZ, name: "Quizzes", weightPercent: 20 },
    { id: EXAM, name: "Exams", weightPercent: 40 },
  ]);
}

describe("school grade what-if", () => {
  it("uses equal split of category weight when maxScore is missing", () => {
    const snapshot = computeCourseGradeWhatIf(defaultWeightedCourse(), [
      item("hw1", { name: "HW1", categoryId: HW, score: 100 }),
      item("hw2", { name: "HW2", categoryId: HW, score: 80 }),
      item("hw3", { name: "HW3", categoryId: HW }),
      item("hw4", { name: "HW4", categoryId: HW }),
      item("q1", { name: "Q1", categoryId: QUIZ, score: 10, maxScore: 10 }),
      item("q2", { name: "Q2", categoryId: QUIZ, score: 9, maxScore: 10 }),
      item("exam", { name: "Midterm", categoryId: EXAM, maxScore: 100 }),
    ]);

    expect(snapshot.requiredWeight).toBe(100);
    expect(snapshot.categories.find((row) => row.categoryId === HW)?.scoring).toBe("equal");
    expect(snapshot.categories.find((row) => row.categoryId === QUIZ)?.scoring).toBe("points");
    expect(snapshot.categories.find((row) => row.categoryId === HW)?.currentPercent).toBe(90);
    expect(snapshot.categories.find((row) => row.categoryId === QUIZ)?.currentPercent).toBe(95);

    // Current excludes ungraded exams (40%) and remaining homework.
    expect(snapshot.currentPercent).toBeCloseTo((90 * 40 + 95 * 20) / 60, 5);
    expect(snapshot.currentLetter).toBe("A");

    // Locked: HW 10+8, quizzes 10+9 = 37. Remaining: 20 HW + 40 exam = 60.
    expect(snapshot.minPercent).toBeCloseTo(37, 5);
    expect(snapshot.minLetter).toBe("F");
    expect(snapshot.maxPercent).toBeCloseTo(97, 5);
    expect(snapshot.maxLetter).toBe("A");
    expect(snapshot.aStatus).toBe("need_remaining");
    expect(snapshot.neededRemainingAverageForA).toBeCloseTo(((90 - 37) / 60) * 100, 5);
  });

  it("points-weights items inside a category when every required item has maxScore", () => {
    const snapshot = computeCourseGradeWhatIf(defaultWeightedCourse(), [
      item("hw1", { name: "HW1", categoryId: HW, score: 10, maxScore: 10 }),
      item("hw2", { name: "HW2", categoryId: HW, score: 8, maxScore: 20 }),
      item("hw3", { name: "HW3", categoryId: HW, maxScore: 10 }),
      item("q1", { name: "Q1", categoryId: QUIZ, score: 10, maxScore: 10 }),
      item("exam", { name: "Midterm", categoryId: EXAM, score: 80, maxScore: 100 }),
    ]);

    const homework = snapshot.categories.find((row) => row.categoryId === HW);
    expect(homework?.scoring).toBe("points");
    // Graded homework 18/30 = 60%, remaining 10 pts still in the category.
    expect(homework?.currentPercent).toBeCloseTo(60, 5);
    expect(homework?.items.find((row) => row.itemId === "hw1")?.coursePointsPossible).toBeCloseTo(
      40 * (10 / 40),
      5
    );
    expect(homework?.items.find((row) => row.itemId === "hw2")?.coursePointsPossible).toBeCloseTo(
      40 * (20 / 40),
      5
    );
  });

  it("does not let a 0% required score drop out of the denominator", () => {
    const snapshot = computeCourseGradeWhatIf(defaultWeightedCourse(), [
      item("hw1", { name: "HW1", categoryId: HW, score: 0 }),
      item("hw2", { name: "HW2", categoryId: HW, score: 100 }),
      item("q1", { name: "Q1", categoryId: QUIZ, score: 100 }),
      item("exam", { name: "Midterm", categoryId: EXAM, score: 100 }),
    ]);

    expect(snapshot.categories.find((row) => row.categoryId === HW)?.currentPercent).toBe(50);
    expect(snapshot.currentPercent).toBeCloseTo((50 * 40 + 100 * 20 + 100 * 40) / 100, 5);
    expect(snapshot.minPercent).toBeCloseTo(80, 5);
    expect(snapshot.maxPercent).toBeCloseTo(80, 5);
  });

  it("ignores ungraded items, 0% weight, and extra-credit-0% in the required pie", () => {
    const course = courseWithCategories([
      { id: HW, name: "Homework", weightPercent: 100 },
      { id: QUIZ, name: "Dropped", weightPercent: 0 },
      { id: EC, name: "Bonus", weightPercent: 0, extraCredit: true },
    ]);
    const snapshot = computeCourseGradeWhatIf(course, [
      item("hw1", { name: "HW1", categoryId: HW, score: 90 }),
      item("hw2", { name: "HW2", categoryId: HW }),
      item("dropped", { name: "Dropped quiz", categoryId: QUIZ, score: 0 }),
      item("bonus", { name: "Bonus", categoryId: EC, score: 100, extraCredit: true }),
    ]);

    expect(snapshot.requiredWeight).toBe(100);
    expect(snapshot.categories.find((row) => row.categoryId === QUIZ)?.consumesRequiredWeight).toBe(
      false
    );
    expect(snapshot.categories.find((row) => row.categoryId === EC)?.consumesRequiredWeight).toBe(
      false
    );
    expect(snapshot.currentPercent).toBe(90);
    expect(snapshot.extraCreditEarned).toBe(0);
    expect(snapshot.minPercent).toBeCloseTo(45, 5);
    expect(snapshot.maxPercent).toBeCloseTo(95, 5);
  });

  it("lets extra credit raise the total above 100%", () => {
    const course = courseWithCategories([
      { id: HW, name: "Homework", weightPercent: 100 },
      { id: EC, name: "Bonus", weightPercent: 5, extraCredit: true },
    ]);
    const snapshot = computeCourseGradeWhatIf(course, [
      item("hw1", { name: "HW1", categoryId: HW, score: 100 }),
      item("bonus", { name: "Bonus", categoryId: EC, score: 100, extraCredit: true }),
    ]);

    expect(snapshot.currentPercent).toBeCloseTo(105, 5);
    expect(snapshot.minPercent).toBeCloseTo(105, 5);
    expect(snapshot.maxPercent).toBeCloseTo(105, 5);
    expect(snapshot.aStatus).toBe("locked");
    expect(formatNeedForACaption(snapshot)).toBe("A is locked.");
  });

  it("adds extra-credit items inside a required category without consuming weight", () => {
    const snapshot = computeCourseGradeWhatIf(defaultWeightedCourse(), [
      item("hw1", { name: "HW1", categoryId: HW, score: 100 }),
      item("hw2", { name: "HW2", categoryId: HW, score: 80 }),
      item("hw3", { name: "HW3", categoryId: HW }),
      item("hw4", { name: "HW4", categoryId: HW }),
      item("hw-ec", { name: "HW EC", categoryId: HW, score: 100, extraCredit: true }),
      item("q1", { name: "Q1", categoryId: QUIZ, score: 10, maxScore: 10 }),
      item("q2", { name: "Q2", categoryId: QUIZ, score: 9, maxScore: 10 }),
      item("exam", { name: "Midterm", categoryId: EXAM, maxScore: 100 }),
    ]);

    // Required locked 37 + EC share of one homework slot (10) = 47.
    expect(snapshot.minPercent).toBeCloseTo(47, 5);
    expect(snapshot.maxPercent).toBeCloseTo(107, 5);
    expect(snapshot.currentPercent).toBeGreaterThan(100);
    expect(snapshot.neededRemainingAverageForA).toBeCloseTo(((90 - 47) / 60) * 100, 5);
  });

  it("computes per-remaining-item floors assuming every other remaining item is 100%", () => {
    const snapshot = computeCourseGradeWhatIf(defaultWeightedCourse(), [
      item("hw1", { name: "HW1", categoryId: HW, score: 100 }),
      item("hw2", { name: "HW2", categoryId: HW, score: 80 }),
      item("hw3", { name: "HW3", categoryId: HW }),
      item("hw4", { name: "HW4", categoryId: HW }),
      item("q1", { name: "Q1", categoryId: QUIZ, score: 10, maxScore: 10 }),
      item("q2", { name: "Q2", categoryId: QUIZ, score: 9, maxScore: 10 }),
      item("exam", { name: "Midterm", categoryId: EXAM, maxScore: 100 }),
    ]);

    const homework = snapshot.categories.find((row) => row.categoryId === HW);
    const exam = snapshot.categories.find((row) => row.categoryId === EXAM)?.items[0];
    const hw3 = homework?.items.find((row) => row.itemId === "hw3");
    expect(hw3?.floorPercentForA).toBeCloseTo(30, 5);
    expect(exam?.floorPercentForA).toBeCloseTo(82.5, 5);
    expect(formatRemainingItemCaption(hw3!, snapshot.neededRemainingAverageForA)).toContain(
      "88.3% avg remaining"
    );
    expect(formatRemainingItemCaption(hw3!)).toContain("safe ≥ 30.0%");
    expect(snapshot.neededRemainingAverageForA).toBeCloseTo(88.333333, 4);
  });

  it("reports A locked or out of reach instead of a need-for-A average", () => {
    const course = courseWithCategories([
      { id: HW, name: "Homework", weightPercent: 40 },
      { id: QUIZ, name: "Quizzes", weightPercent: 20 },
      { id: EXAM, name: "Exams", weightPercent: 40 },
      { id: EC, name: "Bonus", weightPercent: 5, extraCredit: true },
    ]);
    const locked = computeCourseGradeWhatIf(course, [
      item("hw1", { name: "HW1", categoryId: HW, score: 100 }),
      item("q1", { name: "Q1", categoryId: QUIZ, score: 100 }),
      item("exam", { name: "Midterm", categoryId: EXAM, score: 100 }),
      item("bonus", { name: "Bonus", categoryId: EC, extraCredit: true }),
    ]);
    expect(locked.minPercent).toBeGreaterThanOrEqual(SCHOOL_A_MIN_PERCENT);
    expect(locked.aStatus).toBe("locked");
    expect(locked.neededRemainingAverageForA).toBeUndefined();
    expect(formatNeedForACaption(locked)).toBe("A is locked even at 0% on remaining work.");

    const lost = computeCourseGradeWhatIf(defaultWeightedCourse(), [
      item("hw1", { name: "HW1", categoryId: HW, score: 0 }),
      item("hw2", { name: "HW2", categoryId: HW, score: 0 }),
      item("q1", { name: "Q1", categoryId: QUIZ, score: 0 }),
      item("exam", { name: "Midterm", categoryId: EXAM }),
    ]);
    expect(lost.maxPercent).toBeLessThan(SCHOOL_A_MIN_PERCENT);
    expect(lost.aStatus).toBe("impossible");
    expect(formatNeedForACaption(lost)).toBe("A is out of reach even at 100% on remaining work.");
  });

  it("leaves uncategorized items out of the weighted pie", () => {
    const snapshot = computeCourseGradeWhatIf(defaultWeightedCourse(), [
      item("hw1", { name: "HW1", categoryId: HW, score: 100 }),
      item("orphan", { name: "Orphan", score: 0 }),
    ]);
    expect(snapshot.uncategorized).toHaveLength(1);
    expect(snapshot.uncategorized[0]?.coursePointsPossible).toBe(0);
    expect(snapshot.currentPercent).toBe(100);
    expect(snapshot.requiredWeight).toBe(40);
  });

  it("returns an empty snapshot when the course has no grade work", () => {
    const snapshot = computeCourseGradeWhatIf(createSchoolCourse({ name: "Empty" }, { id: COURSE_ID, nowIso: NOW }), []);
    expect(snapshot.aStatus).toBe("empty");
    expect(snapshot.currentPercent).toBeUndefined();
    expect(formatNeedForACaption(snapshot)).toMatch(/Add grade categories/);
    expect(formatSchoolGradePercent(91.667)).toBe("91.7%");
  });
});
