import { describe, expect, it } from "vitest";
import type { Person } from "../../core/model";
import {
  emptyPersonFormState,
  personFormFromPerson,
  personPayloadFromForm,
  validatePersonForm,
} from "./personFormState";

const NOW = "2026-05-26T12:00:00.000Z";
const PERSON_ID = "88888888-8888-4888-8888-888888888888";

function samplePerson(overrides: Partial<Person> = {}): Person {
  return {
    id: PERSON_ID,
    name: "Alex",
    birthdayMonthDay: "06-15",
    birthYear: 1994,
    createdAtIso: NOW,
    updatedAtIso: NOW,
    ...overrides,
  };
}

describe("validatePersonForm", () => {
  it("accepts an optional year of birth", () => {
    const form = { ...emptyPersonFormState(), name: "Alex", birthYear: "1994" };
    expect(validatePersonForm(form)).toBeNull();
  });

  it("rejects a year of birth before 1900", () => {
    const form = { ...emptyPersonFormState(), name: "Alex", birthYear: "1899" };
    expect(validatePersonForm(form)).toMatch(/Year of birth/);
  });
});

describe("personFormFromPerson / personPayloadFromForm", () => {
  it("round-trips year of birth with month and day", () => {
    const form = personFormFromPerson(samplePerson());
    expect(form.birthYear).toBe("1994");
    expect(form.birthdayMonth).toBe("06");
    expect(personPayloadFromForm(form).birthYear).toBe(1994);
  });

  it("omits year of birth when empty", () => {
    const form = { ...emptyPersonFormState(), name: "Alex", birthYear: "" };
    expect(personPayloadFromForm(form).birthYear).toBeUndefined();
  });
});
