import { describe, expect, it } from "vitest";
import type { SchoolCourse, SchoolGradedItem, SchoolReminder } from "./model";
import {
  autoLabelFromUrl,
  convertSchoolWallTime,
  createSchoolCourse,
  createSchoolGradedItem,
  createSchoolLink,
  createSchoolReminder,
  listLocalizedSchoolDues,
  DEFAULT_SCHOOL_TIMEZONE,
  formatSchoolDueCaption,
  isSchoolDateKey,
  isSchoolReminderKind,
  isValidIanaTimeZone,
  letterGradeFromPercent,
  normalizeCareerFocus,
  normalizeSchoolTimeInput,
  reminderFingerprint,
  removeSchoolCourse,
  removeSchoolReminder,
  resolveSchoolLinkLabel,
  resolveSchoolTimeZone,
  sanitizeSchoolReferences,
  SCHOOL_STAFF_ROLE_COLORS,
  SCHOOL_STAFF_ROLE_LABELS,
  SCHOOL_STAFF_ROLES,
  upsertSchoolReminder,
  withReminderFingerprint,
} from "./school";
import { defaultPayload } from "./state";

const NOW = "2026-08-24T12:00:00.000Z";
const COURSE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REMINDER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ITEM_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CATEGORY_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function sampleCourse(): SchoolCourse {
  return createSchoolCourse(
    { name: "CS 1332", code: "CS1332", term: "Fall 2026" },
    { id: COURSE_ID, nowIso: NOW }
  );
}

describe("school type guards and defaults", () => {
  it("accepts reminder kinds and rejects unknown values", () => {
    expect(isSchoolReminderKind("quiz")).toBe(true);
    expect(isSchoolReminderKind("homework")).toBe(false);
  });

  it("validates IANA time zones and defaults to Georgia Tech ET", () => {
    expect(isValidIanaTimeZone("America/New_York")).toBe(true);
    expect(isValidIanaTimeZone("Not/AZone")).toBe(false);
    expect(resolveSchoolTimeZone(undefined)).toBe(DEFAULT_SCHOOL_TIMEZONE);
    expect(resolveSchoolTimeZone("America/Chicago")).toBe("America/Chicago");
    expect(createSchoolCourse({ name: "Algo" }, { id: COURSE_ID, nowIso: NOW }).timezone).toBe(
      DEFAULT_SCHOOL_TIMEZONE
    );
  });

  it("stores an allowlisted class color and ignores invalid tokens", () => {
    expect(
      createSchoolCourse({ name: "Algo", colorToken: "blue.base" }, { id: COURSE_ID, nowIso: NOW })
        .colorToken
    ).toBe("blue.base");
    expect(
      createSchoolCourse(
        { name: "Algo", colorToken: "not-a-color" as "blue.base" },
        { id: COURSE_ID, nowIso: NOW }
      ).colorToken
    ).toBeUndefined();
  });

  it("maps GT letter bands", () => {
    expect(letterGradeFromPercent(90)).toBe("A");
    expect(letterGradeFromPercent(89.9)).toBe("B");
    expect(letterGradeFromPercent(70)).toBe("C");
    expect(letterGradeFromPercent(60)).toBe("D");
    expect(letterGradeFromPercent(59.9)).toBe("F");
  });

  it("gives each staff role a distinct label and color token", () => {
    expect(SCHOOL_STAFF_ROLES).toEqual(["professor", "ta", "other"]);
    expect(SCHOOL_STAFF_ROLE_LABELS).toEqual({
      professor: "Professor",
      ta: "TA",
      other: "Staff",
    });
    const colors = SCHOOL_STAFF_ROLES.map((role) => SCHOOL_STAFF_ROLE_COLORS[role]);
    expect(new Set(colors).size).toBe(SCHOOL_STAFF_ROLES.length);
  });
});

describe("fingerprints and link labels", () => {
  it("builds a stable fingerprint from kind, normalized title, and due date", () => {
    expect(reminderFingerprint("quiz", "  Unit  1 Quiz ", "2026-09-07")).toBe(
      "quiz|unit 1 quiz|2026-09-07"
    );
    const reminder = createSchoolReminder(
      { courseId: COURSE_ID, kind: "assignment", title: "Report 1", date: "2026-09-07" },
      { id: REMINDER_ID, nowIso: NOW }
    );
    expect(reminder.fingerprint).toBe("assignment|report 1|2026-09-07");
    expect(withReminderFingerprint({ ...reminder, title: "Report 1 (revised)" }).fingerprint).toBe(
      "assignment|report 1 (revised)|2026-09-07"
    );
  });

  it("auto-labels links from hostname and last path segment", () => {
    expect(
      autoLabelFromUrl("https://gatech.instructure.com/courses/123/assignments/456")
    ).toBe("gatech.instructure.com / 456");
    expect(autoLabelFromUrl("https://www.example.com/path/syllabus.pdf")).toBe(
      "example.com / syllabus.pdf"
    );
    expect(autoLabelFromUrl("https://canvas.gatech.edu")).toBe("canvas.gatech.edu");
    expect(resolveSchoolLinkLabel("https://example.com/a", "Canvas")).toBe("Canvas");
    expect(createSchoolLink("https://example.com/hw1").label).toBe("example.com / hw1");
  });
});

describe("timezone conversion", () => {
  it("does not shift all-day dates", () => {
    expect(
      convertSchoolWallTime({ date: "2026-09-07" }, "America/New_York", "America/Chicago")
    ).toEqual({ date: "2026-09-07" });
  });

  it("converts timed ET walls to Central on the same date", () => {
    expect(
      convertSchoolWallTime(
        { date: "2026-09-07", time: "07:59" },
        "America/New_York",
        "America/Chicago"
      )
    ).toEqual({ date: "2026-09-07", time: "06:59" });
  });

  it("can roll a timed due into the previous local date", () => {
    expect(
      convertSchoolWallTime(
        { date: "2026-09-07", time: "00:30" },
        "America/New_York",
        "America/Chicago"
      )
    ).toEqual({ date: "2026-09-06", time: "23:30" });
  });

  it("returns null for invalid date or time", () => {
    expect(
      convertSchoolWallTime({ date: "2026-13-40", time: "07:59" }, "America/New_York", "UTC")
    ).toBeNull();
    expect(
      convertSchoolWallTime({ date: "2026-09-07", time: "7:59" }, "America/New_York", "UTC")
    ).toBeNull();
  });

  it("formats a source + local due caption", () => {
    const caption = formatSchoolDueCaption({
      date: "2026-09-07",
      time: "07:59",
      sourceTimeZone: "America/New_York",
      localTimeZone: "America/Chicago",
    });
    expect(caption).toMatch(/^Due 7:59 AM E(T|ST|DT) · 6:59 AM local$/);
    expect(
      formatSchoolDueCaption({
        date: "2026-09-07",
        sourceTimeZone: "America/New_York",
        localTimeZone: "America/Chicago",
      })
    ).toBe("Due Sep 7 (all day)");
    expect(
      formatSchoolDueCaption({
        date: "2026-09-07",
        time: "07:59",
        sourceTimeZone: "America/New_York",
        localTimeZone: "America/Chicago",
        prefix: "Opens",
      })
    ).toMatch(/^Opens 7:59 AM E(T|ST|DT) · 6:59 AM local$/);
  });

  it("lists localized dues and skips orphan reminders", () => {
    const course = sampleCourse();
    const allDay = createSchoolReminder(
      { courseId: COURSE_ID, kind: "assignment", title: "HW 1", date: "2026-09-07" },
      { id: REMINDER_ID, nowIso: NOW }
    );
    const timed = createSchoolReminder(
      {
        courseId: COURSE_ID,
        kind: "quiz",
        title: "Quiz 1",
        date: "2026-09-07",
        startTime: "07:59",
      },
      { id: ITEM_ID, nowIso: NOW }
    );
    const orphan = createSchoolReminder(
      { courseId: "missing-course", kind: "exam", title: "Final", date: "2026-12-01" },
      { id: CATEGORY_ID, nowIso: NOW }
    );

    const dues = listLocalizedSchoolDues(
      [course],
      [allDay, timed, orphan],
      "America/Chicago"
    );
    expect(dues).toHaveLength(2);
    expect(dues[0]).toMatchObject({ localDate: "2026-09-07", reminder: allDay, course });
    expect(dues[0]?.localTime).toBeUndefined();
    expect(dues[1]).toMatchObject({
      localDate: "2026-09-07",
      localTime: "06:59",
      reminder: timed,
    });
  });
});

describe("school CRUD helpers", () => {
  it("upserts reminders and cascades course deletion", () => {
    const course = sampleCourse();
    const reminder = createSchoolReminder(
      { courseId: COURSE_ID, kind: "quiz", title: "Unit Quiz 1", date: "2026-09-07" },
      { id: REMINDER_ID, nowIso: NOW }
    );
    const item = createSchoolGradedItem(
      { courseId: COURSE_ID, reminderId: REMINDER_ID, name: "Unit Quiz 1", maxScore: 45 },
      { id: ITEM_ID, nowIso: NOW }
    );
    const reminders = upsertSchoolReminder([], reminder);
    expect(reminders).toHaveLength(1);

    const afterReminderDelete = removeSchoolReminder(reminders, [item], REMINDER_ID);
    expect(afterReminderDelete.schoolReminders).toEqual([]);
    expect(afterReminderDelete.schoolGradedItems[0]?.reminderId).toBeUndefined();

    const afterCourseDelete = removeSchoolCourse([course], reminders, [item], COURSE_ID);
    expect(afterCourseDelete.schoolCourses).toEqual([]);
    expect(afterCourseDelete.schoolReminders).toEqual([]);
    expect(afterCourseDelete.schoolGradedItems).toEqual([]);
  });

  it("drops orphan reminder, course, and category refs", () => {
    const course = createSchoolCourse(
      {
        name: "CS 1332",
        gradeCategories: [{ id: CATEGORY_ID, name: "Quizzes", weightPercent: 12 }],
      },
      { id: COURSE_ID, nowIso: NOW }
    );
    const orphanReminder: SchoolReminder = {
      id: REMINDER_ID,
      courseId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      kind: "quiz",
      title: "Ghost",
      date: "2026-09-07",
      links: [],
      createdAtIso: NOW,
      updatedAtIso: NOW,
    };
    const orphanItem: SchoolGradedItem = {
      id: ITEM_ID,
      courseId: COURSE_ID,
      categoryId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      reminderId: REMINDER_ID,
      name: "Quiz 1",
      createdAtIso: NOW,
      updatedAtIso: NOW,
    };
    const cleaned = sanitizeSchoolReferences({
      ...defaultPayload(),
      schoolCourses: [course],
      schoolReminders: [orphanReminder],
      schoolGradedItems: [orphanItem],
    });
    expect(cleaned.schoolReminders).toEqual([]);
    expect(cleaned.schoolGradedItems[0]?.categoryId).toBeUndefined();
    expect(cleaned.schoolGradedItems[0]?.reminderId).toBeUndefined();
  });
});

describe("CareerFocus and time input helpers", () => {
  it("normalizes CareerFocus unions and ignores unknown kinds", () => {
    expect(normalizeCareerFocus({ kind: "career" })).toEqual({ kind: "career" });
    expect(normalizeCareerFocus({ kind: "school" })).toEqual({ kind: "school" });
    expect(normalizeCareerFocus({ kind: "school", courseId: "  " })).toEqual({ kind: "school" });
    expect(normalizeCareerFocus({ kind: "school", courseId: COURSE_ID })).toEqual({
      kind: "school",
      courseId: COURSE_ID,
    });
    expect(normalizeCareerFocus(undefined)).toBeUndefined();
    expect(normalizeCareerFocus({ kind: "jobs" } as never)).toBeUndefined();
  });

  it("normalizes HTML time values and rejects invalid clocks", () => {
    expect(normalizeSchoolTimeInput("")).toBeUndefined();
    expect(normalizeSchoolTimeInput("  ")).toBeUndefined();
    expect(normalizeSchoolTimeInput("7:59")).toBe("07:59");
    expect(normalizeSchoolTimeInput("07:59:00")).toBe("07:59");
    expect(normalizeSchoolTimeInput("24:00")).toBeUndefined();
    expect(isSchoolDateKey("2026-09-07")).toBe(true);
    expect(isSchoolDateKey("2026-13-01")).toBe(false);
  });
});
