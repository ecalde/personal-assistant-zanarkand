import { describe, expect, it } from "vitest";
import {
  AETHER_PROFILES,
  DEFAULT_ACCENT_INTENSITY,
  DEFAULT_PROFILE_ID,
  THEME_CSS_VARS,
  defaultAppearancePreferences,
  defaultInterfaceEffects,
  getAetherProfile,
  isAccentIntensity,
  isAetherProfileId,
  normalizeAppearancePreferences,
  resolveThemeTokens,
  themeTokensToCssVars,
  withAlpha,
} from "./theme";

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const key of Object.keys(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

describe("type guards", () => {
  it("recognizes valid profile ids", () => {
    expect(isAetherProfileId("azure")).toBe(true);
    expect(isAetherProfileId("obsidian")).toBe(true);
    expect(isAetherProfileId("unknown")).toBe(false);
    expect(isAetherProfileId(42)).toBe(false);
    expect(isAetherProfileId(null)).toBe(false);
  });

  it("recognizes valid accent intensities", () => {
    expect(isAccentIntensity("soft")).toBe(true);
    expect(isAccentIntensity("balanced")).toBe(true);
    expect(isAccentIntensity("vibrant")).toBe(true);
    expect(isAccentIntensity("loud")).toBe(false);
    expect(isAccentIntensity(undefined)).toBe(false);
  });
});

describe("getAetherProfile", () => {
  it("returns the matching profile", () => {
    expect(getAetherProfile("emerald").name).toBe("Emerald Crystal");
  });

  it("exposes six profiles with the azure default first", () => {
    expect(AETHER_PROFILES).toHaveLength(6);
    expect(AETHER_PROFILES[0].id).toBe(DEFAULT_PROFILE_ID);
  });
});

describe("defaults", () => {
  it("default preferences select azure / balanced", () => {
    const prefs = defaultAppearancePreferences();
    expect(prefs.profileId).toBe(DEFAULT_PROFILE_ID);
    expect(prefs.accentIntensity).toBe(DEFAULT_ACCENT_INTENSITY);
    expect(prefs.effects).toEqual(defaultInterfaceEffects());
  });

  it("returns a fresh effects object each call (no shared reference)", () => {
    const a = defaultInterfaceEffects();
    const b = defaultInterfaceEffects();
    a.ambientParticles = true;
    expect(b.ambientParticles).toBe(false);
  });
});

describe("normalizeAppearancePreferences", () => {
  it("returns defaults for non-object input", () => {
    expect(normalizeAppearancePreferences(null)).toEqual(
      defaultAppearancePreferences()
    );
    expect(normalizeAppearancePreferences("nope")).toEqual(
      defaultAppearancePreferences()
    );
    expect(normalizeAppearancePreferences(undefined)).toEqual(
      defaultAppearancePreferences()
    );
  });

  it("keeps valid fields and falls back on invalid ones", () => {
    const result = normalizeAppearancePreferences({
      profileId: "violet",
      accentIntensity: "screaming",
      effects: { ambientParticles: true, floatingRunes: true },
    });
    expect(result.profileId).toBe("violet");
    expect(result.accentIntensity).toBe(DEFAULT_ACCENT_INTENSITY);
    expect(result.effects.ambientParticles).toBe(true);
    expect(result.effects.floatingRunes).toBe(true);
    // unspecified effects fall back to defaults
    expect(result.effects.animatedBorders).toBe(true);
    expect(result.effects.energyTrails).toBe(false);
  });

  it("ignores unknown keys and non-boolean effect values", () => {
    const result = normalizeAppearancePreferences({
      profileId: "amber",
      accentIntensity: "vibrant",
      effects: { ambientParticles: "yes", bogus: true },
      extra: "dropped",
    });
    expect(result).toEqual({
      profileId: "amber",
      accentIntensity: "vibrant",
      effects: {
        ambientParticles: false,
        animatedBorders: true,
        energyTrails: false,
        floatingRunes: false,
      },
    });
    expect("extra" in result).toBe(false);
  });

  it("does not mutate its input", () => {
    const input = deepFreeze({
      profileId: "crimson",
      accentIntensity: "soft",
      effects: { animatedBorders: false },
    });
    expect(() => normalizeAppearancePreferences(input)).not.toThrow();
  });
});

describe("withAlpha", () => {
  it("converts hex to rgba", () => {
    expect(withAlpha("#46c6ff", 0.5)).toBe("rgba(70, 198, 255, 0.5)");
  });

  it("expands 3-digit hex", () => {
    expect(withAlpha("#fff", 1)).toBe("rgba(255, 255, 255, 1)");
  });

  it("clamps alpha to [0, 1]", () => {
    expect(withAlpha("#000000", -2)).toBe("rgba(0, 0, 0, 0)");
    expect(withAlpha("#000000", 5)).toBe("rgba(0, 0, 0, 1)");
  });
});

describe("resolveThemeTokens", () => {
  it("uses the selected profile's accent colors", () => {
    const tokens = resolveThemeTokens({
      profileId: "emerald",
      accentIntensity: "balanced",
      effects: defaultInterfaceEffects(),
    });
    expect(tokens.accent).toBe("#34e0a1");
    expect(tokens.accentSecondary).toBe("#22d3ee");
    expect(tokens.progressGradient).toContain("#34e0a1");
    expect(tokens.progressGradient).toContain("#22d3ee");
  });

  it("shares the deep-navy background across profiles", () => {
    const azure = resolveThemeTokens({
      profileId: "azure",
      accentIntensity: "balanced",
      effects: defaultInterfaceEffects(),
    });
    const crimson = resolveThemeTokens({
      profileId: "crimson",
      accentIntensity: "balanced",
      effects: defaultInterfaceEffects(),
    });
    expect(azure.background).toBe(crimson.background);
    expect(azure.text).toBe(crimson.text);
  });

  it("scales glow strength with accent intensity", () => {
    const soft = resolveThemeTokens({
      profileId: "azure",
      accentIntensity: "soft",
      effects: defaultInterfaceEffects(),
    });
    const vibrant = resolveThemeTokens({
      profileId: "azure",
      accentIntensity: "vibrant",
      effects: defaultInterfaceEffects(),
    });
    // soft glow blur (20 * 0.45 = 9) < vibrant glow blur (20 * 1.15 = 23)
    expect(soft.glow).toContain("9px");
    expect(vibrant.glow).toContain("23px");
  });
});

describe("themeTokensToCssVars", () => {
  it("maps every token to its CSS custom property", () => {
    const tokens = resolveThemeTokens(defaultAppearancePreferences());
    const vars = themeTokensToCssVars(tokens);
    expect(vars[THEME_CSS_VARS.accent]).toBe(tokens.accent);
    expect(vars[THEME_CSS_VARS.progressGradient]).toBe(tokens.progressGradient);
    expect(vars[THEME_CSS_VARS.background]).toBe(tokens.background);
    expect(Object.keys(vars)).toHaveLength(
      Object.keys(THEME_CSS_VARS).length
    );
  });
});

/**
 * Phase 37B (Theme Adoption Layer) relies on a small set of accent-derived
 * tokens being applied app-wide through `appStyles.ts` (nav active state,
 * buttons, progress bars, panel/section borders, today highlights, badges).
 * The user-visible deliverable is: "selecting a different Aether Profile
 * visibly changes the appearance of the application." These tests pin the
 * contract that each profile yields *distinct* values for the tokens the
 * adoption layer consumes, so a profile switch is guaranteed to recolor the
 * shared chrome rather than silently resolving to the same color.
 */
describe("Phase 37B adoption token contract", () => {
  const ADOPTION_VARS = [
    THEME_CSS_VARS.accent,
    THEME_CSS_VARS.accentSoft,
    THEME_CSS_VARS.panelBorder,
    THEME_CSS_VARS.progressGradient,
  ] as const;

  it("derives the panel border and soft fill from the active accent", () => {
    const tokens = resolveThemeTokens({
      profileId: "violet",
      accentIntensity: "balanced",
      effects: defaultInterfaceEffects(),
    });
    // panelBorder / accentSoft are translucent forms of the accent so borders
    // and highlights tint with the chosen profile.
    expect(tokens.panelBorder).toBe(withAlpha(tokens.accent, 0.28));
    expect(tokens.accentSoft).toBe(withAlpha(tokens.accent, 0.16));
  });

  it("gives every profile a distinct accent + progress gradient", () => {
    const accents = new Set<string>();
    const gradients = new Set<string>();
    for (const profile of AETHER_PROFILES) {
      const tokens = resolveThemeTokens({
        profileId: profile.id,
        accentIntensity: "balanced",
        effects: defaultInterfaceEffects(),
      });
      accents.add(tokens.accent);
      gradients.add(tokens.progressGradient);
    }
    expect(accents.size).toBe(AETHER_PROFILES.length);
    expect(gradients.size).toBe(AETHER_PROFILES.length);
  });

  it("produces distinct adoption CSS variables for each profile", () => {
    for (const variable of ADOPTION_VARS) {
      const values = new Set<string>();
      for (const profile of AETHER_PROFILES) {
        const vars = themeTokensToCssVars(
          resolveThemeTokens({
            profileId: profile.id,
            accentIntensity: "balanced",
            effects: defaultInterfaceEffects(),
          })
        );
        values.add(vars[variable]);
      }
      // Each profile must map this adoption variable to a unique value.
      expect(values.size).toBe(AETHER_PROFILES.length);
    }
  });

  it("keeps the shared light-base background stable across profiles (so adoption only swaps accents, not the legible base)", () => {
    const backgrounds = new Set<string>();
    for (const profile of AETHER_PROFILES) {
      backgrounds.add(
        resolveThemeTokens({
          profileId: profile.id,
          accentIntensity: "balanced",
          effects: defaultInterfaceEffects(),
        }).background
      );
    }
    expect(backgrounds.size).toBe(1);
  });
});
