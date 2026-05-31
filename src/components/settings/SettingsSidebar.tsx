import { settingsStyles as s } from "./settingsStyles";
import { SettingsGlyph, type SettingsGlyphName } from "./SettingsGlyph";

export type SettingsCategoryId =
  | "appearance"
  | "notifications"
  | "calendar"
  | "skills"
  | "data"
  | "privacy"
  | "advanced";

type SettingsCategory = {
  id: SettingsCategoryId;
  label: string;
  glyph: SettingsGlyphName;
  available: boolean;
};

export const SETTINGS_CATEGORIES: readonly SettingsCategory[] = [
  { id: "appearance", label: "Appearance", glyph: "appearance", available: true },
  { id: "notifications", label: "Notifications", glyph: "notifications", available: false },
  { id: "calendar", label: "Calendar", glyph: "calendar", available: false },
  { id: "skills", label: "Skills", glyph: "skills", available: false },
  { id: "data", label: "Data & Backup", glyph: "data", available: false },
  { id: "privacy", label: "Privacy", glyph: "privacy", available: false },
  { id: "advanced", label: "Advanced", glyph: "advanced", available: false },
] as const;

export function SettingsSidebar({
  activeCategory,
  onSelect,
  isMobile,
}: {
  activeCategory: SettingsCategoryId;
  onSelect: (id: SettingsCategoryId) => void;
  isMobile: boolean;
}) {
  return (
    <nav
      style={isMobile ? s.sidebarMobile : s.sidebar}
      aria-label="Settings categories"
    >
      {SETTINGS_CATEGORIES.map((cat) => {
        const isActive = cat.id === activeCategory;
        return (
          <button
            key={cat.id}
            type="button"
            disabled={!cat.available}
            aria-disabled={!cat.available}
            aria-current={isActive ? "page" : undefined}
            onClick={() => cat.available && onSelect(cat.id)}
            style={{
              ...s.navItem,
              ...(isActive ? s.navItemActive : {}),
              ...(cat.available ? {} : s.navItemDisabled),
            }}
            title={cat.available ? cat.label : `${cat.label} — coming soon`}
          >
            <span style={s.navGlyph}>
              <SettingsGlyph name={cat.glyph} />
            </span>
            <span>{cat.label}</span>
            {!cat.available && <span style={s.navComingSoon}>Soon</span>}
          </button>
        );
      })}
    </nav>
  );
}
