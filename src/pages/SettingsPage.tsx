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
import { AccentIntensityControl } from "../components/settings/AccentIntensityControl";
import { InterfaceEffectsToggles } from "../components/settings/InterfaceEffectsToggles";
import { FutureSystemsSection } from "../components/settings/FutureSystemsSection";

const EFFECT_KEYFRAMES = `
@keyframes aether-pulse {
  0%, 100% { box-shadow: 0 0 8px var(--aether-accent-soft, rgba(70,198,255,0.16)); }
  50% { box-shadow: var(--aether-glow, 0 0 20px rgba(70,198,255,0.4)); }
}
@keyframes aether-drift {
  0% { transform: translateY(0); opacity: 0; }
  20% { opacity: 0.5; }
  100% { transform: translateY(-40px); opacity: 0; }
}
@keyframes aether-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}
@media (prefers-reduced-motion: reduce) {
  [data-aether-animated] { animation: none !important; }
}
`;

const PARTICLES = [
  { left: "8%", bottom: "10%", size: 5, delay: "0s", duration: "7s" },
  { left: "24%", bottom: "4%", size: 3, delay: "1.4s", duration: "9s" },
  { left: "47%", bottom: "8%", size: 4, delay: "2.6s", duration: "8s" },
  { left: "68%", bottom: "2%", size: 3, delay: "0.8s", duration: "10s" },
  { left: "82%", bottom: "12%", size: 5, delay: "3.2s", duration: "7.5s" },
  { left: "92%", bottom: "6%", size: 3, delay: "2s", duration: "9.5s" },
];

const RUNES = ["✦", "✧", "❖", "✶"];

export type SettingsPageProps = {
  appearance: AppearanceThemeController;
};

export default function SettingsPage({ appearance }: SettingsPageProps) {
  const { preferences, tokens, setProfile, setAccentIntensity, toggleEffect } =
    appearance;
  const isDesktop = useIsDesktopViewport();
  const [activeCategory, setActiveCategory] =
    useState<SettingsCategoryId>("appearance");

  const profile = getAetherProfile(preferences.profileId);
  const { effects } = preferences;

  return (
    <section style={s.page} aria-label="Settings">
      <style>{EFFECT_KEYFRAMES}</style>

      <div style={s.effectLayer} aria-hidden>
        {effects.ambientParticles &&
          PARTICLES.map((p, i) => (
            <span
              key={i}
              data-aether-animated
              style={{
                position: "absolute",
                left: p.left,
                bottom: p.bottom,
                width: p.size,
                height: p.size,
                borderRadius: "50%",
                background: "var(--aether-accent, #46c6ff)",
                boxShadow: "var(--aether-glow, 0 0 20px rgba(70,198,255,0.4))",
                animation: `aether-drift ${p.duration} ease-in ${p.delay} infinite`,
              }}
            />
          ))}
        {effects.floatingRunes &&
          RUNES.map((rune, i) => (
            <span
              key={i}
              data-aether-animated
              style={{
                position: "absolute",
                top: `${12 + i * 22}%`,
                right: i % 2 === 0 ? "4%" : "auto",
                left: i % 2 === 0 ? "auto" : "3%",
                fontSize: 20,
                color: "var(--aether-accent-soft, rgba(70,198,255,0.16))",
                animation: `aether-float ${6 + i}s ease-in-out infinite`,
              }}
            >
              {rune}
            </span>
          ))}
      </div>

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

            <section style={s.panel} aria-labelledby="preview-heading">
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
                  Toggle ambient enchantments. These are saved as preferences and
                  reflected in the preview.
                </p>
              </div>
              <InterfaceEffectsToggles effects={effects} onToggle={toggleEffect} />
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
