import type { CSSProperties } from "react";
import { AETHER_TEXT, SURFACE } from "../../ui/appStyles";

export type CareerSection = "career" | "school";

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

const OPTIONS: { id: CareerSection; label: string }[] = [
  { id: "career", label: "Career" },
  { id: "school", label: "School" },
];

export type CareerSectionSwitcherProps = {
  value: CareerSection;
  onChange: (section: CareerSection) => void;
};

export function CareerSectionSwitcher({ value, onChange }: CareerSectionSwitcherProps) {
  return (
    <div style={switcher} role="radiogroup" aria-label="Career section">
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
