import type { CSSProperties, KeyboardEvent } from "react";
import { neighborCareerSection } from "../../core/careerSectionPreferences";
import { AETHER_TEXT, SURFACE } from "../../ui/appStyles";

export type CareerSection = "career" | "school" | "resume";

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
  { id: "resume", label: "Resume" },
];

export type CareerSectionSwitcherProps = {
  value: CareerSection;
  onChange: (section: CareerSection) => void;
};

export function CareerSectionSwitcher({ value, onChange }: CareerSectionSwitcherProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const next = neighborCareerSection(value, event.key);
    if (!next) return;
    event.preventDefault();
    onChange(next);
    const button = event.currentTarget.querySelector<HTMLButtonElement>(
      `[data-career-section="${next}"]`
    );
    button?.focus();
  }

  return (
    <div
      style={switcher}
      role="radiogroup"
      aria-label="Career section"
      onKeyDown={handleKeyDown}
    >
      {OPTIONS.map((option) => {
        const isActive = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            data-career-section={option.id}
            aria-checked={isActive}
            aria-label={option.label}
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
