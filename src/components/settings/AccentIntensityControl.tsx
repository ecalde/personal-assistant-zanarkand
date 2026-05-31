import {
  ACCENT_INTENSITY_OPTIONS,
  type AccentIntensity,
} from "../../core/theme";
import { settingsStyles as s } from "./settingsStyles";

export function AccentIntensityControl({
  value,
  onChange,
}: {
  value: AccentIntensity;
  onChange: (intensity: AccentIntensity) => void;
}) {
  return (
    <div
      style={s.segmented}
      role="radiogroup"
      aria-label="Accent intensity"
    >
      {ACCENT_INTENSITY_OPTIONS.map((option) => {
        const isActive = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(option.id)}
            style={{
              ...s.segmentedBtn,
              ...(isActive ? s.segmentedBtnActive : {}),
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
