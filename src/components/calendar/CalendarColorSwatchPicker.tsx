import { useEffect, useId, useRef, useState } from "react";
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
  /** Accessible name for the color trigger button. */
  ariaLabel?: string;
};

export function CalendarColorSwatchPicker({
  value,
  onChange,
  usageLabel,
  disabled = false,
  ariaLabel = "Choose color",
}: CalendarColorSwatchPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const preview = getCalendarColorSwatch(value);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function selectToken(token: CalendarColorToken) {
    onChange(token);
    setOpen(false);
  }

  return (
    <div ref={rootRef} style={styles.calendarColorPopoverRoot}>
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        onClick={() => setOpen((current) => !current)}
        style={{
          ...styles.calendarColorPopoverTrigger,
          ...(open ? styles.calendarColorPopoverTriggerOpen : {}),
        }}
      >
        <span
          style={{
            ...styles.calendarColorPreviewSwatch,
            background: preview.background,
            color: preview.foreground,
            borderColor: preview.border,
          }}
          aria-hidden="true"
        />
        <span style={styles.calendarColorPopoverTriggerLabel}>{preview.label}</span>
        <span aria-hidden="true" style={styles.calendarColorPopoverChevron}>
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          style={styles.calendarColorPopoverPanel}
        >
          {usageLabel ? (
            <p style={styles.calendarColorUsageText}>Used by: {usageLabel}</p>
          ) : null}
          <div style={styles.calendarPaletteGrid}>
            {CALENDAR_PALETTE.map((swatch) => {
              const selected = swatch.token === value;
              return (
                <button
                  key={swatch.token}
                  type="button"
                  role="option"
                  aria-label={swatch.label}
                  aria-selected={selected}
                  title={swatch.label}
                  onClick={() => selectToken(swatch.token)}
                  style={{
                    ...styles.calendarPaletteSwatch,
                    background: swatch.background,
                    ...(selected ? styles.calendarPaletteSwatchSelected : {}),
                  }}
                />
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
