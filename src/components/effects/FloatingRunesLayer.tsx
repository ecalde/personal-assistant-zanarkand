/**
 * Floating Runes (Phase 37D) — occasional faint glyphs anchored near the
 * viewport corners. Decorative, non-interactive, low frequency. Under reduced
 * motion the resolver passes `animated={false}` so the glyphs render statically
 * (no float animation) instead of disappearing.
 */
import { ANIMATED_ATTR, RUNE_LAYOUTS } from "./effectsConfig";

export function FloatingRunesLayer({
  count,
  animated,
}: {
  count: number;
  animated: boolean;
}) {
  if (count <= 0) return null;
  const runes = RUNE_LAYOUTS.slice(0, Math.min(count, RUNE_LAYOUTS.length));

  return (
    <>
      {runes.map((r, i) => (
        <span
          key={i}
          {...(animated ? { [ANIMATED_ATTR]: "" } : {})}
          style={{
            position: "absolute",
            top: r.top,
            bottom: r.bottom,
            left: r.left,
            right: r.right,
            fontSize: 22,
            lineHeight: 1,
            color: "var(--aether-accent-soft, rgba(70,198,255,0.16))",
            opacity: 0.6,
            animation: animated
              ? `aether-float ${r.duration} ease-in-out ${r.delay} infinite`
              : undefined,
          }}
        >
          {r.glyph}
        </span>
      ))}
    </>
  );
}
