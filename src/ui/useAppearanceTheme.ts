import { useCallback, useEffect, useMemo, useState } from "react";
import {
  loadAppearancePreferences,
  saveAppearancePreferences,
} from "../core/appearanceStorage";
import {
  DEFAULT_THEME_MODE,
  resolveEffectiveThemeMode,
  resolveThemeTokens,
  themeTokensToCssVars,
  type AccentIntensity,
  type AetherProfileId,
  type AppearancePreferences,
  type InterfaceEffectKey,
  type ResolvedThemeMode,
  type ThemeMode,
  type ThemeTokens,
} from "../core/theme";
import { useMediaQuery } from "./useMediaQuery";

export type AppearanceThemeController = {
  preferences: AppearancePreferences;
  tokens: ThemeTokens;
  /** Concrete light/dark mode currently applied (after resolving `system`). */
  resolvedMode: ResolvedThemeMode;
  setProfile: (profileId: AetherProfileId) => void;
  setAccentIntensity: (intensity: AccentIntensity) => void;
  setThemeMode: (mode: ThemeMode) => void;
  toggleEffect: (effect: InterfaceEffectKey) => void;
};

/**
 * Loads appearance preferences from localStorage, resolves them (against the OS
 * `prefers-color-scheme` for `system` mode) into theme tokens, and applies those
 * tokens as CSS custom properties on the document root so any inline style can
 * read `var(--aether-*)`. Phase 37C makes the base palette (surfaces + text +
 * background) mode-aware: the root background/text are mirrored onto `body` so
 * the full page (including the area outside the centered shell) flips with the
 * mode, and `data-aether-mode` is exposed for selectors/debugging.
 */
export function useAppearanceTheme(): AppearanceThemeController {
  const [preferences, setPreferences] = useState<AppearancePreferences>(() =>
    loadAppearancePreferences()
  );

  const systemPrefersDark = useMediaQuery("(prefers-color-scheme: dark)");
  const resolvedMode = resolveEffectiveThemeMode(
    preferences.themeMode ?? DEFAULT_THEME_MODE,
    systemPrefersDark
  );

  const tokens = useMemo(
    () => resolveThemeTokens(preferences, resolvedMode),
    [preferences, resolvedMode]
  );

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const vars = themeTokensToCssVars(tokens);
    for (const [name, value] of Object.entries(vars)) {
      root.style.setProperty(name, value);
    }
    root.dataset.aetherProfile = tokens.profileId;
    root.dataset.aetherIntensity = tokens.accentIntensity;
    root.dataset.aetherMode = tokens.themeMode;
    // Mirror the base palette onto the page body so the backdrop and default
    // text color flip with the mode (the shell is a centered max-width box;
    // body fills the rest). Component surfaces read the `--aether-surface*`
    // tokens via `appStyles.ts`.
    const { body } = document;
    if (body) {
      body.style.background = tokens.background;
      body.style.color = tokens.text;
    }
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

  const setThemeMode = useCallback((themeMode: ThemeMode) => {
    setPreferences((prev) => {
      const next = { ...prev, themeMode };
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

  return {
    preferences,
    tokens,
    resolvedMode,
    setProfile,
    setAccentIntensity,
    setThemeMode,
    toggleEffect,
  };
}
