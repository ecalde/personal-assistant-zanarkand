import type { CSSProperties } from "react";

/**
 * Settings page styling — fantasy-futuristic chrome that participates in the
 * global Theme Mode (Phase 37C.1).
 *
 * Base surfaces, text, and borders read from `--aether-*` CSS custom properties
 * set on `:root` by `useAppearanceTheme`, with literal fallbacks (light-first,
 * matching `LIGHT_BASE`) for pre-hydration. Accent-derived tokens (profile
 * color, glow, panel border) still respond to the selected Aether Profile.
 */

const ACCENT = "var(--aether-accent, #46c6ff)";
const ACCENT_SOFT = "var(--aether-accent-soft, rgba(70,198,255,0.16))";
const BG =
  "var(--aether-bg, linear-gradient(160deg, #f6f8fc 0%, #eef2f8 100%))";
const SURFACE_RAISED = "var(--aether-surface-raised, #f6f6f6)";
const SURFACE_SUNKEN = "var(--aether-surface-sunken, #fafafa)";
const BORDER = "var(--aether-border, #e5e5e5)";
const PANEL_BG = "var(--aether-panel-bg, rgba(255,255,255,0.78))";
const PANEL_BORDER = "var(--aether-panel-border, rgba(70,198,255,0.28))";
const PANEL_GLOW = "var(--aether-panel-glow, 0 0 24px rgba(70,198,255,0.14))";
const BUTTON_GLOW = "var(--aether-button-glow, 0 0 14px rgba(70,198,255,0.4))";
const PROGRESS_GRADIENT =
  "var(--aether-progress-gradient, linear-gradient(90deg, #7b9bff, #46c6ff))";
const TEXT = "var(--aether-text-primary, var(--aether-text, #1a2233))";
const TEXT_MUTED = "var(--aether-text-muted, #5a6b85)";
const TEXT_ON_ACCENT = "var(--aether-text-on-accent, #04101f)";
/** High-contrast label on accent-filled controls (profile badge, preview CTA). */
const ON_ACCENT_TEXT = TEXT_ON_ACCENT;

export const settingsStyles: Record<string, CSSProperties> = {
  page: {
    position: "relative",
    background: BG,
    color: TEXT,
    borderRadius: 18,
    border: `1px solid ${PANEL_BORDER}`,
    boxShadow: PANEL_GLOW,
    padding: "clamp(16px, 3vw, 28px)",
    overflow: "hidden",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto",
  },
  effectLayer: {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    zIndex: 0,
  },
  content: {
    position: "relative",
    zIndex: 1,
    display: "grid",
    gap: 18,
  },
  header: {
    display: "grid",
    gap: 4,
  },
  title: {
    margin: 0,
    fontSize: "clamp(22px, 3vw, 30px)",
    fontWeight: 800,
    letterSpacing: "0.01em",
    color: TEXT,
    textShadow: `0 0 18px ${ACCENT_SOFT}`,
  },
  subtitle: {
    margin: 0,
    color: TEXT_MUTED,
    fontSize: 14,
  },
  layoutDesktop: {
    display: "grid",
    gridTemplateColumns: "minmax(200px, 240px) minmax(0, 1fr)",
    gap: 18,
    alignItems: "start",
  },
  layoutMobile: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 16,
  },

  // ---------- Sidebar ----------
  sidebar: {
    display: "grid",
    gap: 6,
    alignContent: "start",
    padding: 10,
    background: PANEL_BG,
    border: `1px solid ${PANEL_BORDER}`,
    borderRadius: 14,
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
  },
  sidebarMobile: {
    display: "flex",
    gap: 8,
    overflowX: "auto",
    padding: 8,
    background: PANEL_BG,
    border: `1px solid ${PANEL_BORDER}`,
    borderRadius: 14,
  },
  navItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    textAlign: "left",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid transparent",
    background: "transparent",
    color: TEXT_MUTED,
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
    whiteSpace: "nowrap",
  },
  navItemActive: {
    color: TEXT,
    background: ACCENT_SOFT,
    border: `1px solid ${PANEL_BORDER}`,
    boxShadow: BUTTON_GLOW,
  },
  navItemDisabled: {
    opacity: 0.45,
    cursor: "not-allowed",
  },
  navGlyph: {
    width: 22,
    height: 22,
    flex: "0 0 auto",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    color: ACCENT,
  },
  navComingSoon: {
    marginLeft: "auto",
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: TEXT_MUTED,
    border: `1px solid ${BORDER}`,
    borderRadius: 999,
    padding: "2px 6px",
  },

  // ---------- Main panels ----------
  main: {
    display: "grid",
    gap: 18,
    minWidth: 0,
  },
  panel: {
    background: PANEL_BG,
    border: `1px solid ${PANEL_BORDER}`,
    borderRadius: 16,
    padding: "clamp(14px, 2vw, 20px)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    display: "grid",
    gap: 14,
  },
  panelHeader: {
    display: "grid",
    gap: 2,
  },
  panelTitle: {
    margin: 0,
    fontSize: 17,
    fontWeight: 800,
    color: TEXT,
  },
  panelSubtitle: {
    margin: 0,
    fontSize: 13,
    color: TEXT_MUTED,
  },

  // ---------- Aether profile cards ----------
  profileGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 12,
  },
  profileCard: {
    position: "relative",
    display: "grid",
    gap: 8,
    justifyItems: "center",
    textAlign: "center",
    padding: "16px 12px",
    borderRadius: 14,
    border: `1px solid ${BORDER}`,
    background: SURFACE_SUNKEN,
    color: TEXT,
    cursor: "pointer",
  },
  profileCardSelected: {
    borderColor: PANEL_BORDER,
    boxShadow: PANEL_GLOW,
    background: ACCENT_SOFT,
  },
  profileOrb: {
    width: 52,
    height: 52,
    borderRadius: "50%",
    border: `1px solid ${BORDER}`,
  },
  profileName: {
    fontSize: 14,
    fontWeight: 800,
  },
  profileDescription: {
    fontSize: 11.5,
    lineHeight: 1.4,
    color: TEXT_MUTED,
  },
  profileSelectedBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    fontSize: 10,
    fontWeight: 800,
    color: ON_ACCENT_TEXT,
    background: ACCENT,
    borderRadius: 999,
    width: 18,
    height: 18,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: BUTTON_GLOW,
  },

  // ---------- Live preview ----------
  previewSurface: {
    display: "grid",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    border: `1px solid ${PANEL_BORDER}`,
    background: SURFACE_SUNKEN,
  },
  previewEvent: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    borderRadius: 10,
    background: ACCENT_SOFT,
    borderLeft: `3px solid ${ACCENT}`,
    color: TEXT,
    fontSize: 13,
  },
  previewEventTime: {
    color: TEXT_MUTED,
    fontSize: 12,
  },
  previewProgressLabel: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 12,
    color: TEXT_MUTED,
  },
  previewProgressTrack: {
    width: "100%",
    height: 10,
    borderRadius: 999,
    background: SURFACE_RAISED,
    overflow: "hidden",
    border: `1px solid ${BORDER}`,
  },
  previewProgressFill: {
    height: "100%",
    width: "68%",
    borderRadius: 999,
    background: PROGRESS_GRADIENT,
    boxShadow: BUTTON_GLOW,
  },
  previewButtonRow: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  previewButtonPrimary: {
    padding: "8px 16px",
    borderRadius: 10,
    border: "1px solid transparent",
    background: PROGRESS_GRADIENT,
    color: ON_ACCENT_TEXT,
    fontWeight: 800,
    fontSize: 13,
    cursor: "pointer",
    boxShadow: BUTTON_GLOW,
  },
  previewButtonGhost: {
    padding: "8px 16px",
    borderRadius: 10,
    border: `1px solid ${PANEL_BORDER}`,
    background: "transparent",
    color: TEXT,
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
  },
  previewWidget: {
    display: "grid",
    gap: 6,
    padding: 12,
    borderRadius: 12,
    border: `1px solid ${PANEL_BORDER}`,
    background: PANEL_BG,
  },
  previewWidgetTitle: {
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: ACCENT,
  },
  previewWidgetValue: {
    fontSize: 22,
    fontWeight: 800,
    color: TEXT,
  },

  // ---------- Accent intensity / theme mode segmented controls ----------
  segmented: {
    display: "inline-flex",
    border: `1px solid ${PANEL_BORDER}`,
    borderRadius: 12,
    overflow: "hidden",
    background: SURFACE_SUNKEN,
  },
  segmentedBtn: {
    padding: "8px 18px",
    border: "none",
    background: "transparent",
    color: TEXT_MUTED,
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
  },
  segmentedBtnActive: {
    background: ACCENT_SOFT,
    color: TEXT,
    boxShadow: `inset 0 0 12px ${ACCENT_SOFT}`,
  },

  // ---------- Interface effects toggles ----------
  effectsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 10,
  },
  effectRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "10px 12px",
    borderRadius: 12,
    border: `1px solid ${BORDER}`,
    background: SURFACE_SUNKEN,
  },
  effectText: {
    display: "grid",
    gap: 2,
    minWidth: 0,
  },
  effectLabel: {
    fontSize: 13,
    fontWeight: 700,
    color: TEXT,
  },
  effectDescription: {
    fontSize: 11.5,
    color: TEXT_MUTED,
    lineHeight: 1.35,
  },
  toggle: {
    position: "relative",
    flex: "0 0 auto",
    width: 46,
    height: 26,
    borderRadius: 999,
    border: `1px solid ${PANEL_BORDER}`,
    background: SURFACE_RAISED,
    cursor: "pointer",
    padding: 0,
    transition: "background 0.18s ease",
  },
  toggleOn: {
    background: ACCENT_SOFT,
    boxShadow: BUTTON_GLOW,
  },
  toggleKnob: {
    position: "absolute",
    top: 2,
    left: 2,
    width: 20,
    height: 20,
    borderRadius: "50%",
    background: TEXT_MUTED,
    transition: "transform 0.18s ease, background 0.18s ease",
  },
  toggleKnobOn: {
    transform: "translateX(20px)",
    background: ACCENT,
  },

  // ---------- Future systems ----------
  futureGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
  },
  futureCard: {
    position: "relative",
    display: "grid",
    gap: 6,
    padding: 14,
    borderRadius: 14,
    border: `1px dashed ${BORDER}`,
    background: SURFACE_SUNKEN,
    opacity: 0.72,
  },
  futureCardTitle: {
    fontSize: 14,
    fontWeight: 800,
    color: TEXT,
  },
  futureCardText: {
    fontSize: 11.5,
    color: TEXT_MUTED,
    lineHeight: 1.4,
  },
  futureBadge: {
    justifySelf: "start",
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: TEXT_MUTED,
    border: `1px solid ${BORDER}`,
    borderRadius: 999,
    padding: "2px 8px",
  },
};
