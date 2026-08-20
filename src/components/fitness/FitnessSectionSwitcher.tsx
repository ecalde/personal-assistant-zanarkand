import type { CSSProperties } from "react";
import { AETHER_TEXT, SURFACE } from "../../ui/appStyles";

export type FitnessSection = "workouts" | "progress" | "supplements";

const switcher: CSSProperties = {
  display: "inline-flex",
  border: `1px solid ${SURFACE.border}`,
  borderRadius: 12,
  overflow: "hidden",
  background: SURFACE.sunken,
};

const btn: CSSProperties = {
  padding: "8px 14px",
  border: "none",
  background: "transparent",
  color: AETHER_TEXT.muted,
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
};

const btnActive: CSSProperties = {
  background: "var(--aether-accent-soft, rgba(70,198,255,0.16))",
  color: AETHER_TEXT.primary,
};

const OPTIONS: { id: FitnessSection; label: string }[] = [
  { id: "workouts", label: "Workouts" },
  { id: "progress", label: "Progress" },
  { id: "supplements", label: "Supplements" },
];

export type FitnessSectionSwitcherProps = {
  value: FitnessSection;
  onChange: (section: FitnessSection) => void;
};

export function FitnessSectionSwitcher({ value, onChange }: FitnessSectionSwitcherProps) {
  return (
    <div style={switcher} role="radiogroup" aria-label="Fitness section">
      {OPTIONS.map((option) => {
        const isActive = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(option.id)}
            style={{ ...btn, ...(isActive ? btnActive : {}) }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
