import { useCallback, useEffect, useMemo, useState } from "react";
import {
  loadAppearancePreferences,
  saveAppearancePreferences,
} from "../core/appearanceStorage";
import {
  resolveThemeTokens,
  themeTokensToCssVars,
  type AccentIntensity,
  type AetherProfileId,
  type AppearancePreferences,
  type InterfaceEffectKey,
  type ThemeTokens,
} from "../core/theme";

export type AppearanceThemeController = {
  preferences: AppearancePreferences;
  tokens: ThemeTokens;
  setProfile: (profileId: AetherProfileId) => void;
  setAccentIntensity: (intensity: AccentIntensity) => void;
  toggleEffect: (effect: InterfaceEffectKey) => void;
};

/**
 * Loads appearance preferences from localStorage, resolves them into theme
 * tokens, and applies those tokens as CSS custom properties on the document
 * root so any inline style can read `var(--aether-*)`. Setting global variables
 * is safe today because the existing (light) dashboard/calendar styles do not
 * yet reference them — the Settings page consumes them immediately, and other
 * surfaces can adopt them gradually without a theme rewrite.
 */
export function useAppearanceTheme(): AppearanceThemeController {
  const [preferences, setPreferences] = useState<AppearancePreferences>(() =>
    loadAppearancePreferences()
  );

  const tokens = useMemo(() => resolveThemeTokens(preferences), [preferences]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const vars = themeTokensToCssVars(tokens);
    for (const [name, value] of Object.entries(vars)) {
      root.style.setProperty(name, value);
    }
    root.dataset.aetherProfile = tokens.profileId;
    root.dataset.aetherIntensity = tokens.accentIntensity;
  }, [tokens]);

  const setProfile = useCallback(
    (profileId: AetherProfileId) => {
      setPreferences((prev) => {
        const next = { ...prev, profileId };
        saveAppearancePreferences(next);
        return next;
      });
    },
    []
  );

  const setAccentIntensity = useCallback((accentIntensity: AccentIntensity) => {
    setPreferences((prev) => {
      const next = { ...prev, accentIntensity };
      saveAppearancePreferences(next);
      return next;
    });
  }, []);

  const toggleEffect = useCallback((effect: InterfaceEffectKey) => {
    setPreferences((prev) => {
      const next = {
        ...prev,
        effects: { ...prev.effects, [effect]: !prev.effects[effect] },
      };
      saveAppearancePreferences(next);
      return next;
    });
  }, []);

  return { preferences, tokens, setProfile, setAccentIntensity, toggleEffect };
}
