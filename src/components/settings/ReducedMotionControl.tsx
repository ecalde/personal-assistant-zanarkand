import {
  REDUCED_MOTION_OPTIONS,
  type ReducedMotionSetting,
} from "../../core/theme";
import { settingsStyles as s } from "./settingsStyles";

export function ReducedMotionControl({
  value,
  onChange,
}: {
  value: ReducedMotionSetting;
  onChange: (setting: ReducedMotionSetting) => void;
}) {
  return (
    <div style={s.segmented} role="radiogroup" aria-label="Reduced motion">
      {REDUCED_MOTION_OPTIONS.map((option) => {
        const isActive = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={isActive}
            title={option.description}
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
