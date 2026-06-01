import { THEME_MODE_OPTIONS, type ThemeMode } from "../../core/theme";
import { settingsStyles as s } from "./settingsStyles";

/**
 * Light / Dark / System segmented control (Phase 37C). Mirrors
 * {@link AccentIntensityControl} for visual + a11y consistency: a
 * `radiogroup` of `radio` buttons with `aria-checked`.
 */
export function ThemeModeControl({
  value,
  onChange,
}: {
  value: ThemeMode;
  onChange: (mode: ThemeMode) => void;
}) {
  return (
    <div style={s.segmented} role="radiogroup" aria-label="Theme mode">
      {THEME_MODE_OPTIONS.map((option) => {
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
