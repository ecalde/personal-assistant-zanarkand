import { describe, expect, it } from "vitest";
import { createSchoolCourse } from "../../core/school";
import {
  emptySchoolCourseFormState,
  schoolCourseFormFromCourse,
  schoolCoursePayloadFromForm,
  validateSchoolCourseForm,
} from "./schoolCourseFormState";
import {
  emptySchoolGradedItemFormState,
  validateSchoolGradedItemForm,
} from "./schoolGradedItemFormState";
import {
  emptySchoolReminderFormState,
  schoolReminderPayloadFromForm,
  validateSchoolReminderForm,
} from "./schoolReminderFormState";

const COURSE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NOW = "2026-08-24T12:00:00.000Z";

describe("schoolCourseFormState", () => {
  it("requires a name and a valid timezone", () => {
    const empty = emptySchoolCourseFormState();
    expect(validateSchoolCourseForm(empty)).toBe("Course name is required.");
    expect(validateSchoolCourseForm({ ...empty, name: "Algo", timezone: "Not/AZone" })).toMatch(
      /IANA/
    );
  });

  it("round-trips a course including empty policy fields", () => {
    const course = createSchoolCourse(
      {
        name: "CS 1332",
        code: "CS1332",
        staff: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            role: "professor",
            name: "Ada",
            email: "ada@gatech.edu",
          },
        ],
        latePolicy: { summary: "10% per day", lateDaysAllowed: 2, deductionPercentPerDay: 10 },
      },
      { id: COURSE_ID, nowIso: NOW }
    );
    const form = schoolCourseFormFromCourse(course);
    expect(validateSchoolCourseForm(form)).toBeNull();
    const payload = schoolCoursePayloadFromForm(form);
    expect(payload.name).toBe("CS 1332");
    expect(payload.staff?.[0]?.email).toBe("ada@gatech.edu");
    expect(payload.latePolicy?.lateDaysAllowed).toBe(2);
  });
});

describe("schoolReminderFormState", () => {
  it("requires title, date, and http(s) links", () => {
    const empty = emptySchoolReminderFormState();
    expect(validateSchoolReminderForm(empty)).toBe("Reminder title is required.");
    expect(
      validateSchoolReminderForm({ ...empty, title: "Quiz 1", date: "2026-09-07" })
    ).toBeNull();
    expect(
      validateSchoolReminderForm({
        ...empty,
        title: "Quiz 1",
        date: "2026-09-07",
        links: [{ id: "1", url: "canvas.gatech.edu/q1", label: "" }],
      })
    ).toMatch(/http/);
  });

  it("builds a payload with auto-labeled links", () => {
    const payload = schoolReminderPayloadFromForm(
      {
        ...emptySchoolReminderFormState("2026-09-07"),
        title: "Quiz 1",
        kind: "quiz",
        startTime: "07:59",
        links: [{ id: "1", url: "https://canvas.gatech.edu/courses/1/quizzes/2", label: "" }],
      },
      COURSE_ID
    );
    expect(payload.kind).toBe("quiz");
    expect(payload.startTime).toBe("07:59");
    expect(payload.links?.[0]?.label).toContain("canvas.gatech.edu");
  });
});

describe("schoolGradedItemFormState", () => {
  it("rejects a score above max", () => {
    expect(
      validateSchoolGradedItemForm({
        ...emptySchoolGradedItemFormState(),
        name: "Quiz 1",
        maxScore: "45",
        score: "50",
      })
    ).toMatch(/greater/);
  });
});
