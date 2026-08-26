import { useEffect, useId, useRef, useState } from "react";
import {
  CALENDAR_PALETTE_HUES,
  getCalendarColorSwatch,
  type CalendarColorToken,
} from "../../core/calendarColors";
import { styles } from "../../ui/appStyles";

export type CalendarColorSwatchPickerProps = {
  value?: CalendarColorToken;
  onChange: (token: CalendarColorToken) => void;
  /** When set, the picker can clear back to no color (class overlay off). */
  onClear?: () => void;
  usageLabel?: string;
  disabled?: boolean;
  /** Accessible name for the color trigger button. */
  ariaLabel?: string;
};

export function CalendarColorSwatchPicker({
  value,
  onChange,
  onClear,
  usageLabel,
  disabled = false,
  ariaLabel = "Choose color",
}: CalendarColorSwatchPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const preview = value ? getCalendarColorSwatch(value) : undefined;

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

  function clearColor() {
    onClear?.();
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
            background: preview?.background ?? "transparent",
            color: preview?.foreground ?? "inherit",
            borderColor: preview?.border ?? "var(--aether-border, #e5e5e5)",
            backgroundImage: preview
              ? undefined
              : "linear-gradient(to bottom right, transparent calc(50% - 1px), var(--aether-border, #e5e5e5) calc(50% - 1px), var(--aether-border, #e5e5e5) calc(50% + 1px), transparent calc(50% + 1px))",
          }}
          aria-hidden="true"
        />
        <span style={styles.calendarColorPopoverTriggerLabel}>
          {preview?.label ?? "None"}
        </span>
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
          {onClear ? (
            <button
              type="button"
              role="option"
              aria-selected={!value}
              onClick={clearColor}
              style={styles.calendarColorNoneOption}
            >
              No color
            </button>
          ) : null}
          <div style={styles.calendarPaletteGrid}>
            {CALENDAR_PALETTE_HUES.map((hue) => (
              <div key={hue} style={styles.calendarPaletteHueRow}>
                {(["soft", "base", "strong"] as const).map((variant) => {
                  const token = `${hue}.${variant}` as CalendarColorToken;
                  const swatch = getCalendarColorSwatch(token);
                  const selected = token === value;
                  return (
                    <button
                      key={token}
                      type="button"
                      role="option"
                      aria-label={swatch.label}
                      aria-selected={selected}
                      title={swatch.label}
                      onClick={() => selectToken(token)}
                      style={{
                        ...styles.calendarPaletteSwatch,
                        background: swatch.background,
                        ...(selected ? styles.calendarPaletteSwatchSelected : {}),
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
