import {
  CALENDAR_PALETTE,
  getCalendarColorSwatch,
  type CalendarColorToken,
} from "../../core/calendarColors";
import { styles } from "../../ui/appStyles";

export type CalendarColorSwatchPickerProps = {
  value: CalendarColorToken;
  onChange: (token: CalendarColorToken) => void;
  usageLabel?: string;
  disabled?: boolean;
  fieldsetLegend?: string;
};

export function CalendarColorSwatchPicker({
  value,
  onChange,
  usageLabel,
  disabled = false,
  fieldsetLegend = "Choose color",
}: CalendarColorSwatchPickerProps) {
  const preview = getCalendarColorSwatch(value);

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={styles.calendarColorPreview}>
        <span
          style={{
            ...styles.calendarColorPreviewSwatch,
            background: preview.background,
            color: preview.foreground,
            borderColor: preview.border,
          }}
          aria-hidden="true"
        >
          Aa
        </span>
        <span>{preview.label}</span>
      </div>

      {usageLabel ? (
        <p style={styles.calendarColorUsageText}>Used by: {usageLabel}</p>
      ) : null}

      <fieldset style={styles.calendarPaletteFieldset} disabled={disabled}>
        <legend style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{fieldsetLegend}</legend>
        <div style={styles.calendarPaletteGrid}>
          {CALENDAR_PALETTE.map((swatch) => {
            const selected = swatch.token === value;
            return (
              <button
                key={swatch.token}
                type="button"
                aria-label={swatch.label}
                aria-pressed={selected}
                disabled={disabled}
                title={swatch.label}
                onClick={() => onChange(swatch.token)}
                style={{
                  ...styles.calendarPaletteSwatch,
                  background: swatch.background,
                  ...(selected ? styles.calendarPaletteSwatchSelected : {}),
                }}
              />
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}
