import { describe, expect, it } from "vitest";
import type { SchoolCourse, SchoolGradedItem, SchoolReminder } from "./model";
import { createSchoolCourse, createSchoolGradedItem, createSchoolReminder } from "./school";
import {
  DUPLICATE_INGEST_WARNING,
  applySchoolIngestSuggestions,
  detectSchoolPasteKind,
  parseSchoolPaste,
  validateSchoolIngestApprovals,
  yearFromCourseTerm,
  type SchoolGradeCategorySuggestion,
  type SchoolIngestSuggestion,
  type SchoolWorkItemSuggestion,
} from "./schoolParse";

const NOW = "2026-08-24T12:00:00.000Z";
const COURSE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const CANVAS_WEIGHT_TABLE_SURVEYS = `Group	Weight
Course Surveys	2%
Quizzes	12%
Exercises	36%
Term Project - Milestones 1	10%
Term Project - Milestone 2	0%
Term Project - Milestone 3	30%
Term Project - Milestone 4	10%
Total	100%`;

const CANVAS_WEIGHT_TABLE_REPORTS = `Group	Weight
Ungraded	0%
Reading/Writing Quiz	4%
Setup Check	2%
Reports	50%
Unit Quizzes	16%
Report Discussions	8%
Extra Credit	0%
Final Exam	20%
Letter Grade	0%
Total	100%`;

const CANVAS_ASSIGNMENT_TABLE = `Name	Due	Submitted	Status	Score		Details	Submission Progress Status
Reading/Writing Quiz
Reading/Writing Quiz
	Sep 7 by 7:59am 			
/ 45
				
Setup Check
Setup Check
	Sep 7 by 7:59am 			
/ 1
				
SL Report
Reports
	Sep 28 by 7:59am 			
/ 100
				
SL Unit Quiz
Unit Quizzes
	Sep 28 by 7:59am 			
/ 65
				
SL Report Discussion
Report Discussions
	Oct 5 by 7:59am 			
				
OL Report
Reports
	Oct 19 by 7:59am 			
/ 100
				
OL Unit Quiz
Unit Quizzes
	Oct 19 by 7:59am 			
/ 36
				
OL Report Discussion
Report Discussions
	Oct 26 by 7:59am 			
				
UL Unit Quiz
Unit Quizzes
	Nov 9 by 7:59am 			
/ 24
				
UL Report
Reports
	Nov 11 by 7:59am 			
/ 100
				
UL Report Discussion
Report Discussions
	Nov 18 by 7:59am 			
				
RL Report
Reports
	Nov 30 by 7:59am 			
/ 100
				
RL Unit Quiz
Unit Quizzes
	Nov 30 by 7:59am 			
/ 33
				
RL Report Discussion
Report Discussions
	Dec 7 by 7:59am 			
				
Problem Set
Extra Credit
	Dec 9 by 7:59am 			
				
Final Fall 2026
Final Exam
	Dec 16 by 11:59pm 			
/ 42
				
CIOS Survey Completion
Extra Credit
				
/ 1
				
Ed Participation
Extra Credit
				
				
Test your Setup for Quizzes and Final (NOT FOR GRADE)
Ungraded
				
/ 2
`;

const SHARED_DUE_ANNOUNCEMENT = `This week's assignments:

Assignment 1: watch the lecture video https://canvas.gatech.edu/courses/1/assignments/a1
Assignment 2: read these papers https://example.com/paper.pdf and extra notes https://example.com/a2-notes
all of these are due Nov 1.

Quiz 3 opens Friday and is due Nov 8 by 7:59am ET.
`;

const SYLLABUS_PROSE = `CS 6515 — Fall 2026

Professor: Ada Lovelace (ada@gatech.edu)
TA: Alan Turing (alan@gatech.edu)

Office hours: Tuesdays 2-4pm, Klaus 2345

All scored assignments are due by the time and date indicated. Here "time and date" means Eastern Time (ET).

Late submissions are accepted up to 3 days with a 10% deduction per day.

Each unit quiz allows 2 attempts.

Extra credit may be offered on the problem set.
`;

function course(overrides: Partial<SchoolCourse> = {}): SchoolCourse {
  return {
    ...createSchoolCourse(
      { name: "Graduate Algorithms", code: "CS6515", term: "Fall 2026" },
      { id: COURSE_ID, nowIso: NOW }
    ),
    ...overrides,
  };
}

function parse(
  text: string,
  options: {
    reminders?: SchoolReminder[];
    gradedItems?: SchoolGradedItem[];
    course?: SchoolCourse;
  } = {}
) {
  return parseSchoolPaste(text, {
    course: options.course ?? course(),
    reminders: options.reminders,
    gradedItems: options.gradedItems,
    referenceYear: 2026,
    suggestionId: sequentialIds("sug"),
  });
}

function sequentialIds(prefix: string) {
  let index = 0;
  return () => `${prefix}-${++index}`;
}

function workItems(suggestions: SchoolIngestSuggestion[]): SchoolWorkItemSuggestion[] {
  return suggestions.filter((row): row is SchoolWorkItemSuggestion => row.type === "workItem");
}

function categories(suggestions: SchoolIngestSuggestion[]): SchoolGradeCategorySuggestion[] {
  return suggestions.filter(
    (row): row is SchoolGradeCategorySuggestion => row.type === "gradeCategory"
  );
}

describe("yearFromCourseTerm", () => {
  it("reads a 20xx year from the term and otherwise uses the fallback", () => {
    expect(yearFromCourseTerm("Fall 2026", 2025)).toBe(2026);
    expect(yearFromCourseTerm("Spring", 2025)).toBe(2025);
  });
});

describe("detectSchoolPasteKind", () => {
  it("detects Canvas weight tables, assignment lists, and prose", () => {
    expect(detectSchoolPasteKind(CANVAS_WEIGHT_TABLE_SURVEYS)).toBe("weightTable");
    expect(detectSchoolPasteKind(CANVAS_WEIGHT_TABLE_REPORTS)).toBe("weightTable");
    expect(detectSchoolPasteKind(CANVAS_ASSIGNMENT_TABLE)).toBe("assignmentTable");
    expect(detectSchoolPasteKind(SHARED_DUE_ANNOUNCEMENT)).toBe("prose");
    expect(detectSchoolPasteKind(SYLLABUS_PROSE)).toBe("prose");
  });
});

describe("Canvas weight tables", () => {
  it("parses Group/Weight rows and skips Total", () => {
    const result = parse(CANVAS_WEIGHT_TABLE_SURVEYS);
    expect(result.kind).toBe("weightTable");
    expect(categories(result.suggestions).map((row) => [row.name, row.weightPercent])).toEqual([
      ["Course Surveys", 2],
      ["Quizzes", 12],
      ["Exercises", 36],
      ["Term Project - Milestones 1", 10],
      ["Term Project - Milestone 2", 0],
      ["Term Project - Milestone 3", 30],
      ["Term Project - Milestone 4", 10],
    ]);
  });

  it("flags Extra Credit and skips Letter Grade / Total on the reports table", () => {
    const result = parse(CANVAS_WEIGHT_TABLE_REPORTS);
    const rows = categories(result.suggestions);
    expect(rows.map((row) => row.name)).toEqual([
      "Ungraded",
      "Reading/Writing Quiz",
      "Setup Check",
      "Reports",
      "Unit Quizzes",
      "Report Discussions",
      "Extra Credit",
      "Final Exam",
    ]);
    expect(rows.find((row) => row.name === "Extra Credit")?.extraCredit).toBe(true);
    expect(rows.find((row) => row.name === "Ungraded")?.weightPercent).toBe(0);
  });
});

describe("Canvas assignment table", () => {
  it("parses names, dues, scores, and kinds from the Canvas list", () => {
    const result = parse(CANVAS_ASSIGNMENT_TABLE);
    expect(result.kind).toBe("assignmentTable");
    const items = workItems(result.suggestions);
    expect(items).toHaveLength(19);

    const quiz = items.find((row) => row.title === "Reading/Writing Quiz");
    expect(quiz).toMatchObject({
      kind: "quiz",
      date: "2026-09-07",
      startTime: "07:59",
      maxScore: 45,
      includeGradedItem: true,
    });

    const report = items.find((row) => row.title === "SL Report");
    expect(report).toMatchObject({
      kind: "assignment",
      categoryName: "Reports",
      date: "2026-09-28",
      maxScore: 100,
    });

    const unitQuiz = items.find((row) => row.title === "SL Unit Quiz");
    expect(unitQuiz).toMatchObject({ kind: "quiz", categoryName: "Unit Quizzes", maxScore: 65 });

    const extra = items.find((row) => row.title === "Problem Set");
    expect(extra).toMatchObject({
      extraCredit: true,
      kind: "assignment",
      date: "2026-12-09",
    });

    const exam = items.find((row) => row.title === "Final Fall 2026");
    expect(exam).toMatchObject({
      kind: "exam",
      date: "2026-12-16",
      startTime: "23:59",
      maxScore: 42,
    });

    const cios = items.find((row) => row.title === "CIOS Survey Completion");
    expect(cios).toMatchObject({ extraCredit: true, maxScore: 1 });
    expect(cios?.date).toBeUndefined();

    const ungraded = items.find((row) =>
      row.title.startsWith("Test your Setup for Quizzes and Final")
    );
    expect(ungraded).toMatchObject({ kind: "other", maxScore: 2 });
  });
});

describe("messy announcement prose", () => {
  it("attaches a shared due date and per-item links", () => {
    const result = parse(SHARED_DUE_ANNOUNCEMENT);
    expect(result.kind).toBe("prose");
    const items = workItems(result.suggestions);
    const assignment1 = items.find((row) => row.title === "Assignment 1");
    const assignment2 = items.find((row) => row.title === "Assignment 2");
    const quiz3 = items.find((row) => row.title === "Quiz 3");

    expect(assignment1).toMatchObject({ kind: "assignment", date: "2026-11-01" });
    expect(assignment1?.links.map((link) => link.url)).toEqual([
      "https://canvas.gatech.edu/courses/1/assignments/a1",
    ]);
    expect(assignment2).toMatchObject({ kind: "assignment", date: "2026-11-01" });
    expect(assignment2?.links.map((link) => link.url)).toEqual([
      "https://example.com/paper.pdf",
      "https://example.com/a2-notes",
    ]);
    expect(quiz3).toMatchObject({
      kind: "quiz",
      date: "2026-11-08",
      startTime: "07:59",
    });
  });

  it("extracts staff, office hours, late policy, attempts, and extra credit", () => {
    const result = parse(SYLLABUS_PROSE);
    expect(result.suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "staff",
          role: "professor",
          name: "Ada Lovelace",
          email: "ada@gatech.edu",
        }),
        expect.objectContaining({
          type: "staff",
          role: "ta",
          name: "Alan Turing",
          email: "alan@gatech.edu",
        }),
        expect.objectContaining({
          type: "officeHours",
          whenText: expect.stringMatching(/tuesdays 2-4pm/i),
        }),
        expect.objectContaining({
          type: "latePolicy",
          lateDaysAllowed: 3,
          deductionPercentPerDay: 10,
        }),
        expect.objectContaining({
          type: "scoringNotes",
          notes: expect.stringMatching(/2 attempts/i),
        }),
        expect.objectContaining({
          type: "extraCreditNotes",
          notes: expect.stringMatching(/extra credit/i),
        }),
      ])
    );
    expect(workItems(result.suggestions)).toEqual([]);
  });
});

describe("dedupe warnings", () => {
  it("flags fingerprint matches and still leaves the suggestion approvable", () => {
    const existing = createSchoolReminder(
      {
        courseId: COURSE_ID,
        kind: "quiz",
        title: "Reading/Writing Quiz",
        date: "2026-09-07",
      },
      { id: "reminder-existing", nowIso: NOW }
    );
    const result = parse(CANVAS_ASSIGNMENT_TABLE, { reminders: [existing] });
    const quiz = workItems(result.suggestions).find((row) => row.title === "Reading/Writing Quiz");
    expect(quiz?.existingReminderId).toBe("reminder-existing");
    expect(quiz?.warning).toBe(DUPLICATE_INGEST_WARNING);
    expect(quiz?.selected).toBe(false);
  });

  it("flags high title-token overlap on the same date", () => {
    const existing = createSchoolReminder(
      {
        courseId: COURSE_ID,
        kind: "quiz",
        title: "Reading Writing Quiz",
        date: "2026-09-07",
      },
      { id: "reminder-overlap", nowIso: NOW }
    );
    const result = parse(CANVAS_ASSIGNMENT_TABLE, { reminders: [existing] });
    const quiz = workItems(result.suggestions).find((row) => row.title === "Reading/Writing Quiz");
    expect(quiz?.existingReminderId).toBe("reminder-overlap");
    expect(quiz?.warning).toBe(DUPLICATE_INGEST_WARNING);
  });
});

describe("applySchoolIngestSuggestions", () => {
  it("does not mutate the source course and only writes approved rows", () => {
    const parsed = parse(CANVAS_WEIGHT_TABLE_REPORTS);
    const source = course();
    const applied = applySchoolIngestSuggestions(
      {
        course: source,
        reminders: [],
        gradedItems: [],
        suggestions: parsed.suggestions.map((row) =>
          row.type === "gradeCategory" && row.name === "Reports"
            ? row
            : { ...row, selected: false }
        ),
      },
      { id: sequentialIds("id"), nowIso: NOW }
    );
    expect(source.gradeCategories).toEqual([]);
    expect(applied.course.gradeCategories).toEqual([
      expect.objectContaining({ name: "Reports", weightPercent: 50 }),
    ]);
  });

  it("creates reminders, graded items, and category links from an assignment table", () => {
    const weight = parse(CANVAS_WEIGHT_TABLE_REPORTS);
    const withCategories = applySchoolIngestSuggestions(
      {
        course: course(),
        reminders: [],
        gradedItems: [],
        suggestions: weight.suggestions,
      },
      { id: sequentialIds("cat"), nowIso: NOW }
    );
    const assignments = parse(CANVAS_ASSIGNMENT_TABLE);
    const applied = applySchoolIngestSuggestions(
      {
        course: withCategories.course,
        reminders: [],
        gradedItems: [],
        suggestions: assignments.suggestions,
      },
      { id: sequentialIds("row"), nowIso: NOW }
    );

    const report = applied.reminders.find((row) => row.title === "SL Report");
    expect(report).toMatchObject({
      kind: "assignment",
      date: "2026-09-28",
      startTime: "07:59",
    });
    const graded = applied.gradedItems.find((row) => row.name === "SL Report");
    expect(graded?.maxScore).toBe(100);
    expect(graded?.reminderId).toBe(report?.id);
    const reportsCategory = applied.course.gradeCategories.find((row) => row.name === "Reports");
    expect(graded?.categoryId).toBe(reportsCategory?.id);

    const extra = applied.gradedItems.find((row) => row.name === "Problem Set");
    expect(extra?.extraCredit).toBe(true);

    const cios = applied.gradedItems.find((row) => row.name === "CIOS Survey Completion");
    expect(cios).toBeDefined();
    expect(applied.reminders.find((row) => row.title === "CIOS Survey Completion")).toBeUndefined();
  });

  it("still creates a flagged duplicate when the user approves it", () => {
    const existing = createSchoolReminder(
      {
        courseId: COURSE_ID,
        kind: "assignment",
        title: "Assignment 1",
        date: "2026-11-01",
      },
      { id: "already", nowIso: NOW }
    );
    const parsed = parse(SHARED_DUE_ANNOUNCEMENT, { reminders: [existing] });
    const assignment1 = workItems(parsed.suggestions).find((row) => row.title === "Assignment 1");
    expect(assignment1?.selected).toBe(false);
    const applied = applySchoolIngestSuggestions(
      {
        course: course(),
        reminders: [existing],
        gradedItems: [],
        suggestions: parsed.suggestions.map((row) =>
          row.type === "workItem" && row.title === "Assignment 1" ? { ...row, selected: true } : { ...row, selected: false }
        ),
      },
      { id: sequentialIds("new"), nowIso: NOW }
    );
    expect(applied.reminders.filter((row) => row.title === "Assignment 1")).toHaveLength(2);
  });

  it("writes syllabus policy fields onto the course", () => {
    const parsed = parse(SYLLABUS_PROSE);
    const applied = applySchoolIngestSuggestions(
      {
        course: course(),
        reminders: [],
        gradedItems: [],
        suggestions: parsed.suggestions,
      },
      { id: sequentialIds("pol"), nowIso: NOW }
    );
    expect(applied.course.staff.map((row) => row.name)).toEqual(["Ada Lovelace", "Alan Turing"]);
    expect(applied.course.latePolicy).toMatchObject({
      lateDaysAllowed: 3,
      deductionPercentPerDay: 10,
    });
    expect(applied.course.officeHours[0]?.whenText).toMatch(/2-4pm/i);
    expect(applied.course.extraCreditNotes).toMatch(/extra credit/i);
    expect(applied.course.scoringNotes).toMatch(/attempts/i);
  });
});

describe("parseSchoolPaste purity", () => {
  it("does not write reminders or graded items while parsing", () => {
    const existingCourse = course();
    const existingReminder = createSchoolReminder(
      { courseId: COURSE_ID, kind: "quiz", title: "Keep me", date: "2026-09-01" },
      { id: "keep", nowIso: NOW }
    );
    const existingItem = createSchoolGradedItem(
      { courseId: COURSE_ID, name: "Keep item" },
      { id: "keep-item", nowIso: NOW }
    );
    parse(CANVAS_ASSIGNMENT_TABLE, {
      course: existingCourse,
      reminders: [existingReminder],
      gradedItems: [existingItem],
    });
    expect(existingCourse.gradeCategories).toEqual([]);
    expect(existingReminder.title).toBe("Keep me");
    expect(existingItem.name).toBe("Keep item");
  });
});

describe("validateSchoolIngestApprovals", () => {
  it("requires a selected suggestion and valid work-item fields", () => {
    const parsed = parse(SHARED_DUE_ANNOUNCEMENT);
    expect(validateSchoolIngestApprovals(parsed.suggestions.map((row) => ({ ...row, selected: false })))).toMatch(
      /select at least one/i
    );
    const broken = workItems(parsed.suggestions).map((row, index) =>
      index === 0 ? { ...row, selected: true, title: "" } : { ...row, selected: false }
    );
    expect(validateSchoolIngestApprovals(broken)).toMatch(/title/i);
  });
});
