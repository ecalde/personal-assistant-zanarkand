/**
 * Global effect keyframes + shared CSS, injected once (Phase 37D).
 *
 * Previously these keyframes lived inline in `SettingsPage.tsx`; they are now
 * centralized so every effect (and the Settings live preview) shares a single
 * definition. Includes:
 *  - drift / float / pulse / trail keyframes
 *  - the reusable `.aether-animated-border` treatment, gated by the root
 *    `data-aether-borders` flag set by {@link AnimatedBorderSystem}
 *  - a `prefers-reduced-motion` kill-switch for any element marked
 *    `data-aether-animated`
 *
 * Colors come from the existing `--aether-*` variables, so effects follow the
 * active theme mode + profile + intensity automatically.
 */
const GLOBAL_EFFECT_CSS = `
@keyframes aether-drift {
  0% { transform: translateY(0); opacity: 0; }
  15% { opacity: 0.55; }
  85% { opacity: 0.4; }
  100% { transform: translateY(-120px); opacity: 0; }
}
@keyframes aether-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}
@keyframes aether-pulse {
  0%, 100% { box-shadow: 0 0 8px var(--aether-accent-soft, rgba(70,198,255,0.16)); }
  50% { box-shadow: var(--aether-glow, 0 0 20px rgba(70,198,255,0.4)); }
}
@keyframes aether-border-pulse {
  0%, 100% {
    box-shadow: 0 0 0 1px var(--aether-panel-border, rgba(70,198,255,0.28)),
      0 0 6px var(--aether-accent-soft, rgba(70,198,255,0.16));
  }
  50% {
    box-shadow: 0 0 0 1px var(--aether-panel-border, rgba(70,198,255,0.28)),
      var(--aether-glow, 0 0 18px rgba(70,198,255,0.4));
  }
}

/* Centralized animated borders: opt-in via .aether-animated-border, globally
   gated by the root flag so toggling the effect off is a single attribute
   change (no per-component rerender). Only box-shadow animates (compositor
   friendly) and only when the flag is "on". */
.aether-animated-border {
  transition: box-shadow 240ms ease;
}
:root[data-aether-borders="on"] .aether-animated-border {
  animation: aether-border-pulse 3.4s ease-in-out infinite;
  will-change: box-shadow;
}
:root[data-aether-borders="static"] .aether-animated-border {
  box-shadow: 0 0 0 1px var(--aether-panel-border, rgba(70,198,255,0.28)),
    0 0 8px var(--aether-accent-soft, rgba(70,198,255,0.16));
}

/* Buttons do not inherit color by default (UA stylesheet); inherit the themed
   ancestor color so unstyled button labels stay readable in dark mode. */
button {
  color: inherit;
}

@media (prefers-reduced-motion: reduce) {
  [data-aether-animated] { animation: none !important; }
  :root[data-aether-borders="on"] .aether-animated-border { animation: none !important; }
}
`;

export function GlobalEffectStyles() {
  return <style data-aether-global-effects>{GLOBAL_EFFECT_CSS}</style>;
}
