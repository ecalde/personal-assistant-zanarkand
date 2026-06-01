/**
 * ThemeEffectsLayer (Phase 37D) — the single global visual-effects engine,
 * mounted once near `App.tsx`. It is the only place that turns
 * {@link AppearancePreferences} + the runtime environment into rendered effects:
 *
 *   ThemeEffectsLayer
 *   ├── AmbientParticlesLayer   (behind content)
 *   ├── FloatingRunesLayer      (behind content)
 *   ├── EnergyTrailLayer        (above content, follows the cursor)
 *   └── AnimatedBorderSystem    (root flag → shared .aether-animated-border CSS)
 *
 * Decision logic is delegated to the pure `resolveEffectSettings`; this
 * component only reads media queries (reduced motion / viewport / pointer) and
 * paints. Effects read `--aether-*` variables, so they follow the active theme
 * mode + profile + intensity. Both overlays are `aria-hidden` and
 * `pointer-events: none`, so they never affect focus order or interaction.
 */
import type { CSSProperties } from "react";
import type { AppearancePreferences } from "../../core/theme";
import { DEFAULT_EFFECT_PERFORMANCE } from "../../core/theme";
import {
  resolveEffectSettings,
  resolveReducedMotion,
} from "../../core/themeEffects";
import {
  useIsDesktopViewport,
  useIsTouchDevice,
  usePrefersReducedMotion,
} from "../../ui/useMediaQuery";
import { AmbientParticlesLayer } from "./AmbientParticlesLayer";
import { AnimatedBorderSystem } from "./AnimatedBorderSystem";
import { EnergyTrailLayer } from "./EnergyTrailLayer";
import { FloatingRunesLayer } from "./FloatingRunesLayer";

/** Behind-content overlay: drifting particles + floating runes. */
const backdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  pointerEvents: "none",
  overflow: "hidden",
  zIndex: -1,
};

/** Above-content overlay: the cursor energy trail (motes near the pointer). */
const foregroundStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  pointerEvents: "none",
  overflow: "hidden",
  zIndex: 9998,
};

export function ThemeEffectsLayer({
  preferences,
}: {
  preferences: AppearancePreferences;
}) {
  const systemReducedMotion = usePrefersReducedMotion();
  const isMobile = !useIsDesktopViewport();
  const isTouch = useIsTouchDevice();

  const reducedMotion = resolveReducedMotion(
    preferences.reducedMotion ?? "system",
    systemReducedMotion
  );

  const settings = resolveEffectSettings(preferences, {
    reducedMotion,
    isMobile,
    isTouch,
    performance: preferences.effectPerformance ?? DEFAULT_EFFECT_PERFORMANCE,
  });

  return (
    <>
      <div style={backdropStyle} aria-hidden>
        <AmbientParticlesLayer count={settings.particleCount} />
        <FloatingRunesLayer
          count={settings.runeCount}
          animated={settings.runesAnimated}
        />
      </div>

      {settings.energyTrails && (
        <div style={foregroundStyle} aria-hidden>
          <EnergyTrailLayer segments={settings.trailSegments} />
        </div>
      )}

      <AnimatedBorderSystem
        enabled={settings.animatedBorders}
        animated={settings.bordersAnimated}
      />
    </>
  );
}
