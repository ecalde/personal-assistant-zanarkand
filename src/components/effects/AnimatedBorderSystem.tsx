/**
 * Animated Border System (Phase 37D) — the centralized control for the shared
 * `.aether-animated-border` panel treatment. Rather than animating per
 * component, it sets a single root flag (`data-aether-borders`) that the global
 * CSS in {@link GlobalEffectStyles} keys off:
 *
 *  - `"on"`     → panels with the class pulse their accent glow
 *  - `"static"` → panels render a steady glow (reduced motion / low tier)
 *  - absent     → no border treatment (effect off)
 *
 * Renders nothing; it is a behavior-only node so toggling the effect app-wide
 * is one attribute write (no rerender of every panel). Keeping per-panel
 * box-shadow animation off by default avoids the excessive-repaint risk called
 * out in the Phase 37D plan.
 */
import { useEffect } from "react";
import { BORDERS_FLAG_ATTR } from "./effectsConfig";

export function AnimatedBorderSystem({
  enabled,
  animated,
}: {
  enabled: boolean;
  animated: boolean;
}) {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (!enabled) {
      delete root.dataset.aetherBorders;
      return () => {};
    }
    root.dataset.aetherBorders = animated ? "on" : "static";
    return () => {
      delete root.dataset.aetherBorders;
    };
  }, [enabled, animated]);

  void BORDERS_FLAG_ATTR;
  return null;
}
