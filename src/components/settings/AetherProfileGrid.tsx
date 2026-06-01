import {
  AETHER_PROFILES,
  withAlpha,
  type AetherProfileId,
} from "../../core/theme";
import { settingsStyles as s } from "./settingsStyles";

export function AetherProfileGrid({
  selectedId,
  onSelect,
}: {
  selectedId: AetherProfileId;
  onSelect: (id: AetherProfileId) => void;
}) {
  return (
    <div
      style={s.profileGrid}
      role="radiogroup"
      aria-label="Aether Profile"
    >
      {AETHER_PROFILES.map((profile) => {
        const isSelected = profile.id === selectedId;
        const orb = {
          ...s.profileOrb,
          background: `radial-gradient(circle at 32% 28%, ${withAlpha(
            "#ffffff",
            0.85
          )} 0%, ${profile.accent} 38%, ${profile.accentSecondary} 100%)`,
          boxShadow: `0 0 18px ${withAlpha(profile.accent, isSelected ? 0.7 : 0.4)}`,
        };
        return (
          <button
            key={profile.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onSelect(profile.id)}
            style={{
              ...s.profileCard,
              ...(isSelected ? s.profileCardSelected : {}),
            }}
          >
            {isSelected && (
              <span style={s.profileSelectedBadge} aria-hidden>
                ✓
              </span>
            )}
            <span style={orb} aria-hidden />
            <span style={s.profileName}>{profile.name}</span>
            <span style={s.profileDescription}>{profile.description}</span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                color: isSelected ? "var(--aether-accent, #46c6ff)" : "var(--aether-text-muted, #5a6b85)",
              }}
            >
              {isSelected ? "Active" : "Select"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
