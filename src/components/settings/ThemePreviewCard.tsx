import type { ThemeTokens } from "../../core/theme";
import { getAetherProfile } from "../../core/theme";
import { settingsStyles as s } from "./settingsStyles";

/**
 * Live preview that consumes the resolved theme tokens directly (rather than the
 * global CSS variables) so it always reflects the in-progress selection, even
 * mid-render. Shows a sample calendar event, an XP/progress bar, buttons, and a
 * widget panel.
 */
export function ThemePreviewCard({
  tokens,
  animatedBorders,
}: {
  tokens: ThemeTokens;
  animatedBorders: boolean;
}) {
  const profile = getAetherProfile(tokens.profileId);

  return (
    <div
      style={{
        ...s.previewSurface,
        borderColor: tokens.panelBorder,
        background: tokens.surfaceSunken,
        boxShadow: animatedBorders ? tokens.panelGlow : undefined,
        animation: animatedBorders ? "aether-pulse 2.8s ease-in-out infinite" : undefined,
      }}
      aria-label={`Preview of ${profile.name}`}
    >
      <div
        style={{
          ...s.previewEvent,
          background: tokens.accentSoft,
          borderLeft: `3px solid ${tokens.accent}`,
        }}
      >
        <span style={{ fontWeight: 700 }}>Upper Body</span>
        <span style={s.previewEventTime}>6:00 – 7:00 AM</span>
      </div>

      <div>
        <div style={s.previewProgressLabel}>
          <span>Level 2 progress</span>
          <span>55 / 60 XP</span>
        </div>
        <div
          style={{
            ...s.previewProgressTrack,
            background: tokens.surfaceRaised,
            borderColor: tokens.border,
          }}
        >
          <div
            style={{
              ...s.previewProgressFill,
              background: tokens.progressGradient,
              boxShadow: tokens.buttonGlow,
            }}
          />
        </div>
      </div>

      <div style={s.previewButtonRow}>
        <button
          type="button"
          style={{
            ...s.previewButtonPrimary,
            background: tokens.progressGradient,
            boxShadow: tokens.buttonGlow,
          }}
          tabIndex={-1}
        >
          Log session
        </button>
        <button
          type="button"
          style={{ ...s.previewButtonGhost, borderColor: tokens.panelBorder }}
          tabIndex={-1}
        >
          View calendar
        </button>
      </div>

      <div
        style={{
          ...s.previewWidget,
          borderColor: tokens.panelBorder,
          background: tokens.panelBackground,
        }}
      >
        <span style={{ ...s.previewWidgetTitle, color: tokens.accent }}>
          Today
        </span>
        <span style={s.previewWidgetValue}>115 XP</span>
        <span style={{ fontSize: 12, color: tokens.textMuted }}>
          +95 earned today
        </span>
      </div>
    </div>
  );
}
