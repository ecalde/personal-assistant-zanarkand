import {
  PROGRESSION_AXES,
  PROGRESSION_AXIS_LABELS,
  type LevelState,
  type ProgressionAxis,
} from "../../core/progressionModel";
import { ProgressBar } from "./ProgressBar";

export type ProgressionAxisRowProps = {
  axes: Record<ProgressionAxis, LevelState>;
};

export function ProgressionAxisRow({ axes }: ProgressionAxisRowProps) {
  return (
    <div
      style={{
        display: "grid",
        gap: 8,
        gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
      }}
      aria-label="Axis levels"
    >
      {PROGRESSION_AXES.map((axis) => {
        const level = axes[axis];
        return (
          <div key={axis} style={{ display: "grid", gap: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ fontWeight: 700 }}>{PROGRESSION_AXIS_LABELS[axis]}</span>
              <span style={{ opacity: 0.7 }}>Lv {level.level}</span>
            </div>
            <ProgressBar
              value={level.xpIntoLevel}
              max={level.xpToNextLevel}
              variant="xp"
            />
          </div>
        );
      })}
    </div>
  );
}
