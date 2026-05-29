import { describe, expect, it } from "vitest";
import type { CalendarColorPreferences } from "../../core/calendarColors";
import {
  calendarPreferencesFormFromPrefs,
  calendarPreferencesPayloadFromForm,
  emptyCalendarPreferencesFormState,
  isCalendarPreferencesEmpty,
  validateCalendarPreferencesForm,
} from "./calendarPreferencesFormState";

describe("calendarPreferencesFormFromPrefs", () => {
  it("returns built-in defaults when prefs are omitted", () => {
    const form = calendarPreferencesFormFromPrefs(undefined);
    expect(form.categories.skill.colorToken).toBe("indigo.base");
    expect(form.categories.skill.alias).toBe("Skills");
    expect(form.subcategories["event:birthday"]).toBe("amber.base");
    expect(form.subcategories["event:hangout"]).toBe("red.base");
  });

  it("reflects stored category and alias overrides", () => {
    const prefs: CalendarColorPreferences = {
      categories: { skill: "cyan.strong" },
      aliases: { skill: "Growth" },
    };
    const form = calendarPreferencesFormFromPrefs(prefs);
    expect(form.categories.skill.colorToken).toBe("cyan.strong");
    expect(form.categories.skill.alias).toBe("Growth");
  });

  it("reflects subcategory overrides", () => {
    const prefs: CalendarColorPreferences = {
      subcategories: {
        "event:birthday": "pink.base",
        "fitness:push": "orange.base",
      },
    };
    const form = calendarPreferencesFormFromPrefs(prefs);
    expect(form.subcategories["event:birthday"]).toBe("pink.base");
    expect(form.subcategories["fitness:push"]).toBe("orange.base");
  });
});

describe("calendarPreferencesPayloadFromForm", () => {
  it("returns undefined when the form matches all defaults", () => {
    const form = emptyCalendarPreferencesFormState();
    expect(calendarPreferencesPayloadFromForm(form)).toBeUndefined();
  });

  it("emits sparse overrides only", () => {
    const form = calendarPreferencesFormFromPrefs(undefined);
    form.categories.skill.colorToken = "cyan.strong";
    form.categories.skill.alias = "Growth";
    form.subcategories["fitness:push"] = "orange.base";

    expect(calendarPreferencesPayloadFromForm(form)).toEqual({
      categories: { skill: "cyan.strong" },
      aliases: { skill: "Growth" },
      subcategories: { "fitness:push": "orange.base" },
    });
  });

  it("round-trips prefs through form and back", () => {
    const prefs: CalendarColorPreferences = {
      categories: { event: "blue.base" },
      subcategories: { "event:birthday": "teal.base" },
      aliases: { people: "Friends" },
    };
    const payload = calendarPreferencesPayloadFromForm(
      calendarPreferencesFormFromPrefs(prefs)
    );
    expect(payload).toEqual(prefs);
  });

  it("omits alias when it matches the built-in default label", () => {
    const form = calendarPreferencesFormFromPrefs(undefined);
    form.categories.event.alias = "Events";
    expect(calendarPreferencesPayloadFromForm(form)).toBeUndefined();
  });
});

describe("validateCalendarPreferencesForm", () => {
  it("returns null for a valid form", () => {
    const form = calendarPreferencesFormFromPrefs(undefined);
    expect(validateCalendarPreferencesForm(form)).toBeNull();
  });

  it("rejects invalid alias content", () => {
    const form = calendarPreferencesFormFromPrefs(undefined);
    form.categories.skill.alias = "\u0000";
    expect(validateCalendarPreferencesForm(form)).toMatch(/invalid/i);
  });
});

describe("isCalendarPreferencesEmpty", () => {
  it("returns true for an empty object", () => {
    expect(isCalendarPreferencesEmpty({})).toBe(true);
  });

  it("returns false when any override is present", () => {
    expect(isCalendarPreferencesEmpty({ categories: { skill: "cyan.base" } })).toBe(
      false
    );
  });
});
