import { describe, expect, it } from "vitest";
import { defaultAppearancePreferences, type AppearancePreferences } from "./theme";
import {
  effectEnvironment,
  resolveEffectSettings,
  resolveReducedMotion,
  type EffectEnvironment,
} from "./themeEffects";

function prefsWith(
  overrides: Partial<AppearancePreferences> = {}
): AppearancePreferences {
  const base = defaultAppearancePreferences();
  return {
    ...base,
    ...overrides,
    effects: { ...base.effects, ...(overrides.effects ?? {}) },
  };
}

/** All four effects on, so resolution is driven purely by env/tier/intensity. */
function allOn(
  overrides: Partial<AppearancePreferences> = {}
): AppearancePreferences {
  return prefsWith({
    ...overrides,
    effects: {
      ambientParticles: true,
      animatedBorders: true,
      energyTrails: true,
      floatingRunes: true,
      ...(overrides.effects ?? {}),
    },
  });
}

const desktopHigh: EffectEnvironment = {
  reducedMotion: false,
  isMobile: false,
  isTouch: false,
  performance: "high",
};

describe("resolveReducedMotion", () => {
  it("honors explicit on/off and follows system otherwise", () => {
    expect(resolveReducedMotion("on", false)).toBe(true);
    expect(resolveReducedMotion("off", true)).toBe(false);
    expect(resolveReducedMotion("system", true)).toBe(true);
    expect(resolveReducedMotion("system", false)).toBe(false);
  });
});

describe("resolveEffectSettings — reduced motion", () => {
  it("disables motion effects and downgrades borders/runes to static", () => {
    const r = resolveEffectSettings(allOn({ effectPerformance: "high" }), {
      ...desktopHigh,
      reducedMotion: true,
    });
    expect(r.ambientParticles).toBe(false);
    expect(r.particleCount).toBe(0);
    expect(r.energyTrails).toBe(false);
    expect(r.trailSegments).toBe(0);
    // Borders/runes may still render but must not animate.
    expect(r.bordersAnimated).toBe(false);
    expect(r.runesAnimated).toBe(false);
  });
});

describe("resolveEffectSettings — mobile & touch degradation", () => {
  it("renders strictly fewer particles/runes on mobile than desktop", () => {
    const prefs = allOn({ effectPerformance: "high" });
    const desktop = resolveEffectSettings(prefs, desktopHigh);
    const mobile = resolveEffectSettings(prefs, {
      ...desktopHigh,
      isMobile: true,
    });
    expect(mobile.particleCount).toBeLessThan(desktop.particleCount);
    expect(mobile.runeCount).toBeLessThanOrEqual(desktop.runeCount);
    expect(mobile.energyTrails).toBe(false);
  });

  it("disables energy trails on touch devices regardless of tier", () => {
    const r = resolveEffectSettings(allOn({ effectPerformance: "high" }), {
      ...desktopHigh,
      isTouch: true,
    });
    expect(r.energyTrails).toBe(false);
    expect(r.trailSegments).toBe(0);
  });
});

describe("resolveEffectSettings — performance tiers", () => {
  it("low disables particles/runes/trails and forces static borders", () => {
    const r = resolveEffectSettings(allOn({ effectPerformance: "low" }), {
      ...desktopHigh,
      performance: "low",
    });
    expect(r.particleCount).toBe(0);
    expect(r.runeCount).toBe(0);
    expect(r.energyTrails).toBe(false);
    expect(r.animatedBorders).toBe(true);
    expect(r.bordersAnimated).toBe(false);
  });

  it("density is monotonic: high >= medium for particles, runes, trails", () => {
    const prefs = allOn();
    const high = resolveEffectSettings(prefs, {
      ...desktopHigh,
      performance: "high",
    });
    const medium = resolveEffectSettings(prefs, {
      ...desktopHigh,
      performance: "medium",
    });
    expect(high.particleCount).toBeGreaterThanOrEqual(medium.particleCount);
    expect(high.runeCount).toBeGreaterThanOrEqual(medium.runeCount);
    expect(high.trailSegments).toBeGreaterThanOrEqual(medium.trailSegments);
    expect(high.particleCount).toBeGreaterThan(0);
  });
});

describe("resolveEffectSettings — accent intensity drives particle density", () => {
  it("vibrant > balanced > soft for the same tier/environment", () => {
    const soft = resolveEffectSettings(
      allOn({ accentIntensity: "soft" }),
      desktopHigh
    );
    const balanced = resolveEffectSettings(
      allOn({ accentIntensity: "balanced" }),
      desktopHigh
    );
    const vibrant = resolveEffectSettings(
      allOn({ accentIntensity: "vibrant" }),
      desktopHigh
    );
    expect(vibrant.particleCount).toBeGreaterThan(balanced.particleCount);
    expect(balanced.particleCount).toBeGreaterThan(soft.particleCount);
  });
});

describe("resolveEffectSettings — per-toggle gating", () => {
  it("an effect toggled off stays off regardless of tier/env", () => {
    const prefs = prefsWith({
      effectPerformance: "high",
      effects: {
        ambientParticles: false,
        animatedBorders: false,
        energyTrails: false,
        floatingRunes: false,
      },
    });
    const r = resolveEffectSettings(prefs, desktopHigh);
    expect(r.ambientParticles).toBe(false);
    expect(r.floatingRunes).toBe(false);
    expect(r.animatedBorders).toBe(false);
    expect(r.bordersAnimated).toBe(false);
    expect(r.energyTrails).toBe(false);
  });
});

describe("effectEnvironment", () => {
  it("derives the performance tier from prefs and applies overrides", () => {
    const env = effectEnvironment(prefsWith({ effectPerformance: "low" }), {
      isMobile: true,
    });
    expect(env.performance).toBe("low");
    expect(env.isMobile).toBe(true);
    expect(env.reducedMotion).toBe(false);
  });
});
