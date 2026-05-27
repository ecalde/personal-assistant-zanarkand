import { useId } from "react";
import { styles } from "../../ui/appStyles";

export type ProgressBarProps = {
  value: number;
  max: number;
  label?: string;
  variant?: "default" | "xp";
};

export function ProgressBar({ value, max, label, variant = "default" }: ProgressBarProps) {
  const labelId = useId();
  const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;
  const safeMax = Number.isFinite(max) ? max : 0;
  const hasRange = safeMax > 0;
  const percent = hasRange ? Math.min(100, (safeValue / safeMax) * 100) : 0;
  const ariaNow = hasRange ? Math.min(safeValue, safeMax) : 0;
  const ariaMax = hasRange ? safeMax : 0;
  const showLabel = label !== undefined && label !== "";

  return (
    <div style={{ display: "grid", gap: 6, width: "100%" }}>
      {showLabel && (
        <div style={styles.statLabel} id={labelId}>
          {label}
        </div>
      )}
      <div
        style={styles.progressTrack}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={ariaMax}
        aria-valuenow={ariaNow}
        aria-labelledby={showLabel ? labelId : undefined}
        aria-valuetext={!hasRange ? "No target" : undefined}
      >
        <div
          style={{
            ...(variant === "xp" ? styles.progressFillXp : styles.progressFill),
            width: `${percent}%`,
          }}
        />
      </div>
    </div>
  );
}
