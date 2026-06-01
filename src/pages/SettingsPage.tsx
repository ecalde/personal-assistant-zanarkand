import { useState } from "react";
import type { AppearanceThemeController } from "../ui/useAppearanceTheme";
import { useIsDesktopViewport } from "../ui/useMediaQuery";
import { getAetherProfile } from "../core/theme";
import { settingsStyles as s } from "../components/settings/settingsStyles";
import {
  SettingsSidebar,
  type SettingsCategoryId,
} from "../components/settings/SettingsSidebar";
import { AetherProfileGrid } from "../components/settings/AetherProfileGrid";
import { ThemePreviewCard } from "../components/settings/ThemePreviewCard";
import { ThemeModeControl } from "../components/settings/ThemeModeControl";
import { AccentIntensityControl } from "../components/settings/AccentIntensityControl";
import { InterfaceEffectsToggles } from "../components/settings/InterfaceEffectsToggles";
import { EffectPerformanceControl } from "../components/settings/EffectPerformanceControl";
import { ReducedMotionControl } from "../components/settings/ReducedMotionControl";
import { FutureSystemsSection } from "../components/settings/FutureSystemsSection";
import { ANIMATED_BORDER_CLASS } from "../components/effects/effectsConfig";
import {
  DEFAULT_EFFECT_PERFORMANCE,
  DEFAULT_REDUCED_MOTION,
} from "../core/theme";

export type SettingsPageProps = {
  appearance: AppearanceThemeController;
};

export default function SettingsPage({ appearance }: SettingsPageProps) {
  const {
    preferences,
    tokens,
    resolvedMode,
    setProfile,
    setAccentIntensity,
    setThemeMode,
    toggleEffect,
    setEffectPerformance,
    setReducedMotion,
  } = appearance;
  const isDesktop = useIsDesktopViewport();
  const [activeCategory, setActiveCategory] =
    useState<SettingsCategoryId>("appearance");

  const profile = getAetherProfile(preferences.profileId);
  const { effects } = preferences;
  const themeMode = preferences.themeMode ?? "system";
  const effectPerformance =
    preferences.effectPerformance ?? DEFAULT_EFFECT_PERFORMANCE;
  const reducedMotion = preferences.reducedMotion ?? DEFAULT_REDUCED_MOTION;

  // The global effects layer (mounted in App.tsx) now renders ambient particles
  // and floating runes app-wide, so the Settings page no longer paints its own
  // copies — there is a single implementation.
  return (
    <section style={s.page} aria-label="Settings">
      <div style={s.content}>
        <header style={s.header}>
          <h1 style={s.title}>Settings</h1>
          <p style={s.subtitle}>Customize your personal assistant experience.</p>
        </header>

        <div style={isDesktop ? s.layoutDesktop : s.layoutMobile}>
          <SettingsSidebar
            activeCategory={activeCategory}
            onSelect={setActiveCategory}
            isMobile={!isDesktop}
          />

          <div style={s.main}>
            <section style={s.panel} aria-labelledby="mode-heading">
              <div style={s.panelHeader}>
                <h2 id="mode-heading" style={s.panelTitle}>
                  Theme Mode
                </h2>
                <p style={s.panelSubtitle}>
                  Choose Light, Dark, or follow your device. The Aether Profile
                  sets the accent independently of the mode. Currently showing:{" "}
                  <strong>
                    {themeMode === "system"
                      ? `System (${resolvedMode})`
                      : resolvedMode}
                  </strong>
                  .
                </p>
              </div>
              <ThemeModeControl value={themeMode} onChange={setThemeMode} />
            </section>

            <section style={s.panel} aria-labelledby="appearance-heading">
              <div style={s.panelHeader}>
                <h2 id="appearance-heading" style={s.panelTitle}>
                  Aether Profiles
                </h2>
                <p style={s.panelSubtitle}>
                  Choose a crystal to attune the interface. Currently active:{" "}
                  <strong>{profile.name}</strong>.
                </p>
              </div>
              <AetherProfileGrid
                selectedId={preferences.profileId}
                onSelect={setProfile}
              />
            </section>

            <section
              className={ANIMATED_BORDER_CLASS}
              style={s.panel}
              aria-labelledby="preview-heading"
            >
              <div style={s.panelHeader}>
                <h2 id="preview-heading" style={s.panelTitle}>
                  Live Preview
                </h2>
                <p style={s.panelSubtitle}>
                  A glimpse of how the selected profile shapes the experience.
                </p>
              </div>
              <ThemePreviewCard
                tokens={tokens}
                animatedBorders={effects.animatedBorders}
              />
            </section>

            <section style={s.panel} aria-labelledby="intensity-heading">
              <div style={s.panelHeader}>
                <h2 id="intensity-heading" style={s.panelTitle}>
                  Accent Intensity
                </h2>
                <p style={s.panelSubtitle}>
                  Control how strongly glow and energy effects shine.
                </p>
              </div>
              <AccentIntensityControl
                value={preferences.accentIntensity}
                onChange={setAccentIntensity}
              />
            </section>

            <section style={s.panel} aria-labelledby="effects-heading">
              <div style={s.panelHeader}>
                <h2 id="effects-heading" style={s.panelTitle}>
                  Interface Effects
                </h2>
                <p style={s.panelSubtitle}>
                  Toggle ambient enchantments. These now render across the whole
                  app, not just this page.
                </p>
              </div>
              <InterfaceEffectsToggles effects={effects} onToggle={toggleEffect} />
            </section>

            <section style={s.panel} aria-labelledby="performance-heading">
              <div style={s.panelHeader}>
                <h2 id="performance-heading" style={s.panelTitle}>
                  Effect Performance
                </h2>
                <p style={s.panelSubtitle}>
                  Scale ambient effect density. Lower tiers reduce particles and
                  runes; Low disables motion effects entirely.
                </p>
              </div>
              <EffectPerformanceControl
                value={effectPerformance}
                onChange={setEffectPerformance}
              />
            </section>

            <section style={s.panel} aria-labelledby="reduced-motion-heading">
              <div style={s.panelHeader}>
                <h2 id="reduced-motion-heading" style={s.panelTitle}>
                  Reduced Motion
                </h2>
                <p style={s.panelSubtitle}>
                  Follow your device's reduced-motion setting, or force it on or
                  off. When reduced, particles and trails are disabled and borders
                  and runes become static.
                </p>
              </div>
              <ReducedMotionControl
                value={reducedMotion}
                onChange={setReducedMotion}
              />
            </section>

            <section style={s.panel} aria-labelledby="future-heading">
              <div style={s.panelHeader}>
                <h2 id="future-heading" style={s.panelTitle}>
                  Future Systems
                </h2>
                <p style={s.panelSubtitle}>
                  Planned categories. These are not active yet.
                </p>
              </div>
              <FutureSystemsSection />
            </section>
          </div>
        </div>
      </div>
    </section>
  );
}
