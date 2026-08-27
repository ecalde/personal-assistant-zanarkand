import { describe, expect, it } from "vitest";
import type { SchoolCourse, SchoolGradedItem, SchoolReminder } from "./model";
import { createSchoolCourse, createSchoolGradedItem, createSchoolReminder } from "./school";
import {
  applySchoolTimelineLayout,
  buildSchoolSemesterSchedule,
  formatSchoolSundayDate,
  mergeTimelineColumns,
  renameTimelineColumn,
  renameTimelineRow,
  resolveSchoolAcademicTerm,
  revertTimelineColumnMerge,
  revertTimelineColumnName,
  revertTimelineRowName,
  schoolAcademicSeasonFromDate,
  sundayOnOrBefore,
} from "./schoolSchedule";

const NOW = "2026-08-26T12:00:00.000Z";
const COURSE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const COURSE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CAT_QUIZ = "11111111-1111-4111-8111-111111111111";
const CAT_EXERCISE = "22222222-2222-4222-8222-222222222222";
const CAT_PROJECT = "33333333-3333-4333-8333-333333333333";
const CAT_SURVEY = "44444444-4444-4444-8444-444444444444";
const REMINDER_ID = "55555555-5555-4555-8555-555555555555";
const ITEM_ID = "66666666-6666-4666-8666-666666666666";

function courseA(overrides: Partial<SchoolCourse> = {}): SchoolCourse {
  return {
    ...createSchoolCourse(
      {
        name: "CS 1332",
        code: "CS1332",
        colorToken: "blue.base",
        gradeCategories: [
          { id: CAT_SURVEY, name: "Surveys & Other", weightPercent: 2 },
          { id: CAT_QUIZ, name: "Quiz", weightPercent: 12 },
          { id: CAT_EXERCISE, name: "Exercise", weightPercent: 20 },
          { id: CAT_PROJECT, name: "Term Project", weightPercent: 30 },
        ],
      },
      { id: COURSE_A, nowIso: NOW }
    ),
    ...overrides,
  };
}

describe("academic term Sundays", () => {
  it("maps September to Fall with week 1 on the last Sunday of August", () => {
    expect(schoolAcademicSeasonFromDate(new Date(2026, 8, 15))).toBe("fall");
    const term = resolveSchoolAcademicTerm(new Date(2026, 8, 15));
    expect(term.label).toBe("Fall 2026");
    expect(term.sundays).toHaveLength(17);
    expect(term.sundays[0]).toBe("2026-08-30");
    expect(term.gradesSunday).toBe("2026-12-20");
    expect(term.sundays[16]).toBe("2026-12-20");
  });

  it("maps January to Spring and July to Summer", () => {
    const spring = resolveSchoolAcademicTerm(new Date(2026, 0, 20));
    expect(spring.season).toBe("spring");
    expect(spring.sundays).toHaveLength(17);
    expect(spring.sundays[0]).toBe("2026-01-18");
    expect(spring.gradesSunday).toBe("2026-05-10");

    const summer = resolveSchoolAcademicTerm(new Date(2026, 6, 10));
    expect(summer.season).toBe("summer");
    expect(summer.sundays).toHaveLength(13);
    expect(summer.sundays[0]).toBe("2026-05-03");
    expect(summer.gradesSunday).toBe("2026-07-26");
  });

  it("formats Sunday due dates like the hand chart", () => {
    expect(formatSchoolSundayDate("2026-08-30")).toBe("8/30/26");
    expect(formatSchoolSundayDate("2026-12-20")).toBe("12/20/26");
  });

  it("buckets dues onto the Sunday on or before the due date", () => {
    expect(sundayOnOrBefore("2026-08-30")).toBe("2026-08-30");
    expect(sundayOnOrBefore("2026-08-31")).toBe("2026-08-30");
    expect(sundayOnOrBefore("2026-09-04")).toBe("2026-08-30");
    expect(sundayOnOrBefore("2026-09-06")).toBe("2026-09-06");
    expect(sundayOnOrBefore("2026-09-07")).toBe("2026-09-06");
  });
});

describe("buildSchoolSemesterSchedule", () => {
  it("places dated work in category columns and keeps grades week merged", () => {
    const reminder: SchoolReminder = createSchoolReminder(
      { courseId: COURSE_A, kind: "quiz", title: "Q1", date: "2026-09-06" },
      { id: REMINDER_ID, nowIso: NOW }
    );
    const quizItem: SchoolGradedItem = createSchoolGradedItem(
      {
        courseId: COURSE_A,
        categoryId: CAT_QUIZ,
        reminderId: REMINDER_ID,
        name: "Q1",
        dueDate: "2026-09-06",
      },
      { id: ITEM_ID, nowIso: NOW }
    );
    const exercise: SchoolGradedItem = createSchoolGradedItem(
      {
        courseId: COURSE_A,
        categoryId: CAT_EXERCISE,
        name: "E1",
        dueDate: "2026-09-13",
      },
      { id: "77777777-7777-4777-8777-777777777777", nowIso: NOW }
    );

    const schedule = buildSchoolSemesterSchedule({
      courses: [courseA()],
      reminders: [reminder],
      gradedItems: [quizItem, exercise],
      now: new Date(2026, 7, 26),
    });

    expect(schedule.columns.map((column) => column.label)).toEqual([
      "Surveys & Other",
      "Quiz",
      "Exercise",
      "Term Project",
    ]);
    expect(schedule.weeks[16]?.isGradesWeek).toBe(true);
    expect(schedule.weeks[1]?.sundayDate).toBe("2026-09-06");
    expect(schedule.weeks[1]?.entriesByColumn.quiz.map((entry) => entry.title)).toEqual(["Q1"]);
    expect(schedule.weeks[2]?.entriesByColumn.exercise.map((entry) => entry.title)).toEqual(["E1"]);
    expect(schedule.weeks.flatMap((week) => Object.values(week.entriesByColumn).flat())).toHaveLength(
      2
    );
  });

  it("moves a cell when an assignment due date changes", () => {
    const item: SchoolGradedItem = createSchoolGradedItem(
      {
        courseId: COURSE_A,
        categoryId: CAT_QUIZ,
        name: "Q1",
        dueDate: "2026-09-06",
      },
      { id: ITEM_ID, nowIso: NOW }
    );
    const before = buildSchoolSemesterSchedule({
      courses: [courseA()],
      reminders: [],
      gradedItems: [item],
      now: new Date(2026, 7, 26),
    });
    const after = buildSchoolSemesterSchedule({
      courses: [courseA()],
      reminders: [],
      gradedItems: [{ ...item, dueDate: "2026-09-20" }],
      now: new Date(2026, 7, 26),
    });
    expect(before.weeks[1]?.entriesByColumn.quiz).toHaveLength(1);
    expect(after.weeks[1]?.entriesByColumn.quiz).toEqual([]);
    expect(after.weeks[3]?.entriesByColumn.quiz.map((entry) => entry.title)).toEqual(["Q1"]);
  });

  it("hides completed and dropped classes from the grid", () => {
    const item: SchoolGradedItem = createSchoolGradedItem(
      { courseId: COURSE_A, categoryId: CAT_QUIZ, name: "Q1", dueDate: "2026-09-06" },
      { id: ITEM_ID, nowIso: NOW }
    );
    const completed = buildSchoolSemesterSchedule({
      courses: [courseA({ enrollmentStatus: "completed" })],
      reminders: [],
      gradedItems: [item],
      now: new Date(2026, 7, 26),
    });
    expect(completed.enrolledCourses).toEqual([]);
    expect(completed.weeks.flatMap((week) => Object.values(week.entriesByColumn).flat())).toEqual([]);

    const dropped = buildSchoolSemesterSchedule({
      courses: [courseA({ enrollmentStatus: "dropped" })],
      reminders: [],
      gradedItems: [item],
      now: new Date(2026, 7, 26),
    });
    expect(dropped.enrolledCourses).toEqual([]);
  });

  it("combines matching categories across classes and can filter to one class", () => {
    const courseB: SchoolCourse = createSchoolCourse(
      {
        name: "PHYS 2211",
        code: "PHYS2211",
        colorToken: "orange.base",
        gradeCategories: [{ id: "88888888-8888-4888-8888-888888888888", name: "Quiz", weightPercent: 15 }],
      },
      { id: COURSE_B, nowIso: NOW }
    );
    const quizA: SchoolGradedItem = createSchoolGradedItem(
      { courseId: COURSE_A, categoryId: CAT_QUIZ, name: "Q1", dueDate: "2026-09-06" },
      { id: ITEM_ID, nowIso: NOW }
    );
    const quizB: SchoolGradedItem = createSchoolGradedItem(
      {
        courseId: COURSE_B,
        categoryId: "88888888-8888-4888-8888-888888888888",
        name: "Q1",
        dueDate: "2026-09-06",
      },
      { id: "99999999-9999-4999-8999-999999999999", nowIso: NOW }
    );

    const combined = buildSchoolSemesterSchedule({
      courses: [courseA(), courseB],
      reminders: [],
      gradedItems: [quizA, quizB],
      now: new Date(2026, 7, 26),
    });
    expect(combined.columns.some((column) => column.key === "quiz")).toBe(true);
    expect(combined.weeks[1]?.entriesByColumn.quiz).toHaveLength(2);

    const filtered = buildSchoolSemesterSchedule({
      courses: [courseA(), courseB],
      reminders: [],
      gradedItems: [quizA, quizB],
      now: new Date(2026, 7, 26),
      courseIdFilter: COURSE_B,
    });
    expect(filtered.columns.map((column) => column.key)).toEqual(["quiz"]);
    expect(filtered.weeks[1]?.entriesByColumn.quiz.map((entry) => entry.courseId)).toEqual([COURSE_B]);
  });

  it("includes uncategorized dated reminders as extra columns", () => {
    const exam = createSchoolReminder(
      { courseId: COURSE_A, kind: "exam", title: "Midterm", date: "2026-10-11" },
      { id: REMINDER_ID, nowIso: NOW }
    );
    const schedule = buildSchoolSemesterSchedule({
      courses: [courseA()],
      reminders: [exam],
      gradedItems: [],
      now: new Date(2026, 7, 26),
    });
    expect(schedule.columns.map((column) => column.key)).toContain("exam");
    const examWeek = schedule.weeks.find((week) => week.sundayDate === "2026-10-11");
    expect(examWeek?.entriesByColumn.exam.map((entry) => entry.title)).toEqual(["Midterm"]);
  });

  it("places a Monday (Sunday midnight) due on the previous Sunday row", () => {
    const item: SchoolGradedItem = createSchoolGradedItem(
      { courseId: COURSE_A, categoryId: CAT_QUIZ, name: "Quiz 1", dueDate: "2026-09-07" },
      { id: ITEM_ID, nowIso: NOW }
    );
    const schedule = buildSchoolSemesterSchedule({
      courses: [courseA()],
      reminders: [],
      gradedItems: [item],
      now: new Date(2026, 7, 26),
    });
    expect(schedule.weeks[1]?.sundayDate).toBe("2026-09-06");
    expect(schedule.weeks[1]?.entriesByColumn.quiz.map((entry) => entry.title)).toEqual(["Quiz 1"]);
    expect(schedule.weeks[2]?.entriesByColumn.quiz).toEqual([]);
  });
});

describe("term timeline layout", () => {
  const GROUP_ID = "12121212-1212-4121-8121-121212121212";

  function milestoneSchedule() {
    const course: SchoolCourse = createSchoolCourse(
      {
        name: "CS 1332",
        gradeCategories: [
          { id: CAT_PROJECT, name: "Term Project- Milestones 1", weightPercent: 10 },
          { id: CAT_EXERCISE, name: "Term Project-Milestones 2", weightPercent: 10 },
          { id: CAT_QUIZ, name: "Quiz", weightPercent: 12 },
        ],
      },
      { id: COURSE_A, nowIso: NOW }
    );
    const m1: SchoolGradedItem = createSchoolGradedItem(
      {
        courseId: COURSE_A,
        categoryId: CAT_PROJECT,
        name: "Pitch",
        dueDate: "2026-09-06",
      },
      { id: ITEM_ID, nowIso: NOW }
    );
    const m2: SchoolGradedItem = createSchoolGradedItem(
      {
        courseId: COURSE_A,
        categoryId: CAT_EXERCISE,
        name: "Draft",
        dueDate: "2026-09-13",
      },
      { id: "77777777-7777-4777-8777-777777777777", nowIso: NOW }
    );
    return buildSchoolSemesterSchedule({
      courses: [course],
      reminders: [],
      gradedItems: [m1, m2],
      now: new Date(2026, 7, 26),
    });
  }

  it("keeps distinct category names as separate columns until merged", () => {
    const schedule = milestoneSchedule();
    expect(schedule.columns.map((column) => column.label)).toEqual([
      "Term Project- Milestones 1",
      "Term Project-Milestones 2",
      "Quiz",
    ]);
  });

  it("merges columns for the table only and can revert the merge after saving", () => {
    const schedule = milestoneSchedule();
    const merged = mergeTimelineColumns(
      undefined,
      ["termprojectmilestones1", "termprojectmilestones2"],
      "Term Project",
      GROUP_ID
    );
    const view = applySchoolTimelineLayout(schedule, merged);
    expect(view.columns.map((column) => column.label)).toEqual(["Term Project", "Quiz"]);
    expect(view.weeks[1]?.entriesByColumn[`group:${GROUP_ID}`]?.map((entry) => entry.title)).toEqual([
      "Pitch",
    ]);
    expect(view.weeks[2]?.entriesByColumn[`group:${GROUP_ID}`]?.map((entry) => entry.title)).toEqual([
      "Draft",
    ]);
    expect(schedule.columns.map((column) => column.label)).toContain("Term Project- Milestones 1");

    const reverted = revertTimelineColumnMerge(merged, GROUP_ID);
    const restored = applySchoolTimelineLayout(schedule, reverted);
    expect(restored.columns.map((column) => column.label)).toEqual([
      "Term Project- Milestones 1",
      "Term Project-Milestones 2",
      "Quiz",
    ]);
  });

  it("renames a column or row and can restore the original labels", () => {
    const schedule = milestoneSchedule();
    const view = applySchoolTimelineLayout(schedule);
    const renamedColumn = renameTimelineColumn(undefined, "quiz", "Weekly Quizzes", view.columns);
    const renamedRow = renameTimelineRow(renamedColumn, "2026-09-06", "Labor Day week", "9/6/26");
    const custom = applySchoolTimelineLayout(schedule, renamedRow);
    expect(custom.columns.find((column) => column.key === "quiz")?.label).toBe("Weekly Quizzes");
    expect(custom.weeks[1]?.dueLabel).toBe("Labor Day week");

    const afterColumnRevert = revertTimelineColumnName(renamedRow, "quiz", custom.columns);
    const afterRowRevert = revertTimelineRowName(afterColumnRevert, "2026-09-06");
    const restored = applySchoolTimelineLayout(schedule, afterRowRevert);
    expect(restored.columns.find((column) => column.key === "quiz")?.label).toBe("Quiz");
    expect(restored.weeks[1]?.dueLabel).toBe("9/6/26");
  });
});
