import type { CSSProperties } from "react";

export type SettingsGlyphName =
  | "appearance"
  | "notifications"
  | "calendar"
  | "skills"
  | "data"
  | "privacy"
  | "advanced";

/**
 * Minimal symbolic line glyphs drawn as inline SVG (no icon dependency). Each
 * uses `currentColor` so it inherits the surrounding accent/text color.
 */
export function SettingsGlyph({
  name,
  size = 18,
  style,
}: {
  name: SettingsGlyphName;
  size?: number;
  style?: CSSProperties;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: false,
    style,
  };

  switch (name) {
    case "appearance":
      // Faceted crystal / gem.
      return (
        <svg {...common}>
          <path d="M12 3l6 5-6 13-6-13 6-5z" />
          <path d="M6 8h12M12 3v18" />
        </svg>
      );
    case "notifications":
      return (
        <svg {...common}>
          <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" />
          <path d="M10 20a2 2 0 0 0 4 0" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...common}>
          <rect x="3.5" y="5" width="17" height="16" rx="2" />
          <path d="M3.5 9.5h17M8 3v4M16 3v4" />
        </svg>
      );
    case "skills":
      // Upward rune / growth chevrons.
      return (
        <svg {...common}>
          <path d="M12 3l3 6 6 .5-4.5 4 1.5 6L12 16l-6 3.5L7.5 13.5 3 9.5 9 9l3-6z" />
        </svg>
      );
    case "data":
      return (
        <svg {...common}>
          <ellipse cx="12" cy="6" rx="7" ry="3" />
          <path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" />
        </svg>
      );
    case "privacy":
      return (
        <svg {...common}>
          <path d="M12 3l7 3v5c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6l7-3z" />
          <path d="M9.5 12l1.8 1.8L15 10" />
        </svg>
      );
    case "advanced":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3.2" />
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
        </svg>
      );
    default:
      return null;
  }
}
