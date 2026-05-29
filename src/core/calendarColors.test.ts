import { describe, expect, it } from "vitest";
import {
  buildColorUsageIndex,
  CALENDAR_PALETTE,
  CALENDAR_PALETTE_BY_TOKEN,
  DEFAULT_CATEGORY_COLOR_TOKENS,
  DEFAULT_SUBCATEGORY_COLOR_TOKENS,
  describeColorUsage,
  FALLBACK_COLOR_TOKEN,
  isCalendarCategoryKey,
  isCalendarColorToken,
  resolveCalendarItemColor,
  resolveCalendarItemColorToken,
  resolveCategoryLabel,
  sanitizeCategoryAlias,
  type CalendarColorPreferences,
} from "./calendarColors";

describe("resolution precedence", () => {
  it("uses a valid item color override above everything", () => {
    const prefs: CalendarColorPreferences = {
      categories: { event: "blue.base" },
      subcategories: { "event:birthday": "green.base" },
    };
    const token = resolveCalendarItemColorToken(
      { categoryKey: "event", subcategoryKey: "birthday", colorKey: "teal.strong" },
      prefs
    );
    expect(token).toBe("teal.strong");
  });

  it("prefers subcategory preference over category", () => {
    const prefs: CalendarColorPreferences = {
      categories: { fitness: "green.base" },
      subcategories: { "fitness:push": "orange.base" },
    };
    const token = resolveCalendarItemColorToken(
      { categoryKey: "fitness", subcategoryKey: "push" },
      prefs
    );
    expect(token).toBe("orange.base");
  });

  it("uses default subcategory token when no preference is set", () => {
    const token = resolveCalendarItemColorToken({
      categoryKey: "event",
      subcategoryKey: "birthday",
    });
    expect(token).toBe(DEFAULT_SUBCATEGORY_COLOR_TOKENS["event:birthday"]);
    expect(token).toBe("amber.base");
  });

  it("inherits the category color when the subcategory has no default or preference", () => {
    const token = resolveCalendarItemColorToken({
      categoryKey: "event",
      subcategoryKey: "hangout",
    });
    expect(token).toBe(DEFAULT_CATEGORY_COLOR_TOKENS.event);
  });

  it("prefers category preference over the built-in category default", () => {
    const prefs: CalendarColorPreferences = { categories: { skill: "cyan.strong" } };
    const token = resolveCalendarItemColorToken({ categoryKey: "skill" }, prefs);
    expect(token).toBe("cyan.strong");
  });

  it("falls back to the built-in category default with empty prefs", () => {
    const token = resolveCalendarItemColorToken({ categoryKey: "career" }, {});
    expect(token).toBe(DEFAULT_CATEGORY_COLOR_TOKENS.career);
  });

  it("falls back to the neutral token for an unknown category", () => {
    const token = resolveCalendarItemColorToken({ categoryKey: "mystery" });
    expect(token).toBe(FALLBACK_COLOR_TOKEN);
  });
});

describe("invalid tokens fall through", () => {
  it("ignores an invalid item override and uses the subcategory default", () => {
    const token = resolveCalendarItemColorToken({
      categoryKey: "event",
      subcategoryKey: "birthday",
      colorKey: "not-a-real-token",
    });
    expect(token).toBe("amber.base");
  });

  it("ignores invalid preference tokens and uses defaults", () => {
    const prefs = {
      categories: { event: "ultraviolet.base" },
      subcategories: { "event:birthday": "octarine.dark" },
    } as unknown as CalendarColorPreferences;
    const token = resolveCalendarItemColorToken(
      { categoryKey: "event", subcategoryKey: "birthday" },
      prefs
    );
    expect(token).toBe("amber.base");
  });
});

describe("resolveCalendarItemColor", () => {
  it("returns the palette swatch for the resolved token", () => {
    const swatch = resolveCalendarItemColor({ categoryKey: "skill" });
    expect(swatch.token).toBe(DEFAULT_CATEGORY_COLOR_TOKENS.skill);
    expect(swatch.background).toMatch(/^#[0-9a-f]{6}$/i);
    expect(swatch.foreground).toMatch(/^#[0-9a-f]{6}$/i);
    expect(swatch.border).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe("display aliases", () => {
  it("returns a sanitized alias when set", () => {
    const prefs: CalendarColorPreferences = { aliases: { skill: "  Growth  " } };
    expect(resolveCategoryLabel("skill", prefs)).toBe("Growth");
  });

  it("falls back to the default label when no alias is set", () => {
    expect(resolveCategoryLabel("skill")).toBe("Skills");
  });

  it("falls back to the default label when the alias is blank", () => {
    const prefs: CalendarColorPreferences = { aliases: { skill: "   " } };
    expect(resolveCategoryLabel("skill", prefs)).toBe("Skills");
  });

  it("returns the raw key for an unknown category", () => {
    expect(resolveCategoryLabel("unknown-key")).toBe("unknown-key");
  });

  it("strips control characters, collapses whitespace, and caps length", () => {
    expect(sanitizeCategoryAlias("Pra\u0000ctice\tTime")).toBe("Practice Time");
    expect(sanitizeCategoryAlias("")).toBeUndefined();
    expect(sanitizeCategoryAlias("   ")).toBeUndefined();
    expect(sanitizeCategoryAlias(42)).toBeUndefined();
    expect(sanitizeCategoryAlias("x".repeat(100))).toHaveLength(40);
  });
});

describe("color usage labeling", () => {
  // Brief example: Red used by Skills + Events, Yellow (amber) by Birthdays.
  const prefs: CalendarColorPreferences = {
    categories: { skill: "red.base", event: "red.base" },
    subcategories: { "event:birthday": "amber.base" },
  };

  it("lists every category sharing a reused color (reuse not blocked)", () => {
    const index = buildColorUsageIndex(prefs);
    const red = index.get("red.base") ?? [];
    const labels = red.map((usage) => usage.label);
    expect(labels).toContain("Skills");
    expect(labels).toContain("Events");
  });

  it("describes reuse as a readable, comma-joined string", () => {
    expect(describeColorUsage("red.base", prefs)).toBe("Skills, Events");
    expect(describeColorUsage("amber.base", prefs)).toBe("Birthdays");
  });

  it("reflects display aliases in usage labels", () => {
    const aliased: CalendarColorPreferences = {
      ...prefs,
      aliases: { skill: "Growth" },
    };
    expect(describeColorUsage("red.base", aliased)).toBe("Growth, Events");
  });

  it("returns an empty string for an unused token", () => {
    expect(describeColorUsage("lime.soft", {})).toBe("");
  });

  it("includes built-in defaults when no preferences are provided", () => {
    const index = buildColorUsageIndex();
    expect(index.get(DEFAULT_CATEGORY_COLOR_TOKENS.fitness)?.some((u) => u.key === "fitness")).toBe(
      true
    );
    expect(
      index.get("amber.base")?.some((u) => u.key === "event:birthday")
    ).toBe(true);
  });
});

describe("palette integrity", () => {
  it("registers every palette swatch in the by-token map", () => {
    expect(CALENDAR_PALETTE.length).toBe(CALENDAR_PALETTE_BY_TOKEN.size);
    for (const swatch of CALENDAR_PALETTE) {
      expect(CALENDAR_PALETTE_BY_TOKEN.get(swatch.token)).toBe(swatch);
      expect(swatch.background).toMatch(/^#[0-9a-f]{6}$/i);
      expect(swatch.foreground).toMatch(/^#[0-9a-f]{6}$/i);
      expect(swatch.border).toMatch(/^#[0-9a-f]{6}$/i);
      expect(swatch.label.length).toBeGreaterThan(0);
    }
  });

  it("backs every default token with a real swatch", () => {
    expect(isCalendarColorToken(FALLBACK_COLOR_TOKEN)).toBe(true);
    for (const token of Object.values(DEFAULT_CATEGORY_COLOR_TOKENS)) {
      expect(isCalendarColorToken(token)).toBe(true);
    }
    for (const token of Object.values(DEFAULT_SUBCATEGORY_COLOR_TOKENS)) {
      expect(isCalendarColorToken(token)).toBe(true);
    }
  });

  it("validates tokens and category keys", () => {
    expect(isCalendarColorToken("red.base")).toBe(true);
    expect(isCalendarColorToken("red.neon")).toBe(false);
    expect(isCalendarColorToken(undefined)).toBe(false);
    expect(isCalendarCategoryKey("event")).toBe(true);
    expect(isCalendarCategoryKey("events")).toBe(false);
  });
});

describe("purity", () => {
  it("does not mutate the preferences object", () => {
    const prefs: CalendarColorPreferences = {
      categories: { event: "blue.base" },
      subcategories: { "event:birthday": "amber.base" },
      aliases: { event: "Plans" },
    };
    const snapshot = JSON.parse(JSON.stringify(prefs));
    resolveCalendarItemColorToken(
      { categoryKey: "event", subcategoryKey: "birthday" },
      prefs
    );
    resolveCalendarItemColor({ categoryKey: "event" }, prefs);
    resolveCategoryLabel("event", prefs);
    buildColorUsageIndex(prefs);
    describeColorUsage("blue.base", prefs);
    expect(prefs).toEqual(snapshot);
  });
});
