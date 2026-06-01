import {
  EFFECT_PERFORMANCE_OPTIONS,
  type EffectPerformance,
} from "../../core/theme";
import { settingsStyles as s } from "./settingsStyles";

export function EffectPerformanceControl({
  value,
  onChange,
}: {
  value: EffectPerformance;
  onChange: (performance: EffectPerformance) => void;
}) {
  return (
    <div style={s.segmented} role="radiogroup" aria-label="Effect performance">
      {EFFECT_PERFORMANCE_OPTIONS.map((option) => {
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
