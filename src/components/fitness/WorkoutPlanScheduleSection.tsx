import { useCallback, useRef, useState } from "react";
import type {
  ScheduleBlock,
  Weekday,
  WeeklySchedule,
  WorkoutScheduleSeries,
} from "../../core/model";
import { defaultWeeklySchedule, weekdayLabel } from "../../core/state";
import { SkillScheduleFields } from "../skills/SkillScheduleFields";
import { styles } from "../../ui/appStyles";
import {
  validateWorkoutScheduleForm,
  workoutScheduleFormFromSeries,
  workoutScheduleSeriesEqual,
  workoutScheduleSeriesFromForm,
  type WorkoutScheduleFormState,
  type WorkoutScheduleUiMode,
} from "./workoutScheduleFormState";

const WEEKDAYS: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export type WorkoutPlanScheduleSectionProps = {
  schedule: WeeklySchedule;
  scheduleSeries?: WorkoutScheduleSeries;
  radioGroupName: string;
  onScheduleChange: (schedule: WeeklySchedule) => void;
  onScheduleSeriesChange: (series: WorkoutScheduleSeries | undefined) => void;
  disabled?: boolean;
};

export function WorkoutPlanScheduleSection({
  schedule,
  scheduleSeries,
  radioGroupName,
  onScheduleChange,
  onScheduleSeriesChange,
  disabled = false,
}: WorkoutPlanScheduleSectionProps) {
  const [seriesForm, setSeriesForm] = useState<WorkoutScheduleFormState>(() =>
    workoutScheduleFormFromSeries(scheduleSeries)
  );
  const seriesFormRef = useRef(seriesForm);
  const [seriesError, setSeriesError] = useState<string | null>(null);

  const syncSeriesForm = useCallback((next: WorkoutScheduleFormState) => {
    seriesFormRef.current = next;
    setSeriesForm(next);
  }, []);

  const commitSeriesForm = useCallback(
    (form: WorkoutScheduleFormState) => {
      const error = validateWorkoutScheduleForm(form);
      if (error) {
        setSeriesError(error);
        return;
      }
      setSeriesError(null);
      const series = workoutScheduleSeriesFromForm(form);
      if (workoutScheduleSeriesEqual(series, scheduleSeries)) return;
      onScheduleSeriesChange(series);
    },
    [onScheduleSeriesChange, scheduleSeries]
  );

  const handleModeChange = (mode: WorkoutScheduleUiMode) => {
    const nextForm = { ...seriesFormRef.current, mode };
    syncSeriesForm(nextForm);
    if (mode === "indefinite") {
      setSeriesError(null);
      onScheduleSeriesChange(undefined);
      return;
    }
    commitSeriesForm(nextForm);
  };

  const handleDateBlur = () => {
    commitSeriesForm(seriesFormRef.current);
  };

  const resolvedSchedule = schedule ?? defaultWeeklySchedule();

  const addBlock = (day: Weekday) => {
    const blocks = resolvedSchedule[day] ?? [];
    const next: ScheduleBlock = {
      id: crypto.randomUUID(),
      startTime: "06:00",
      minutes: 60,
    };
    onScheduleChange({ ...resolvedSchedule, [day]: [...blocks, next] });
  };

  const updateBlock = (day: Weekday, blockId: string, patch: Partial<ScheduleBlock>) => {
    const blocks = resolvedSchedule[day] ?? [];
    onScheduleChange({
      ...resolvedSchedule,
      [day]: blocks.map((block) => (block.id === blockId ? { ...block, ...patch } : block)),
    });
  };

  const deleteBlock = (day: Weekday, blockId: string) => {
    const blocks = resolvedSchedule[day] ?? [];
    onScheduleChange({
      ...resolvedSchedule,
      [day]: blocks.filter((block) => block.id !== blockId),
    });
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <SkillScheduleFields
        state={seriesForm}
        radioGroupName={radioGroupName}
        onChange={syncSeriesForm}
        onModeChange={handleModeChange}
        onDateBlur={handleDateBlur}
        error={seriesError}
        disabled={disabled}
        legend="When this plan is scheduled"
      />

      <div>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Weekly workout times</div>
        <div style={{ ...styles.textMuted, marginBottom: 10, fontSize: 13 }}>
          Add blocks on days you plan to run this workout. Leave all days empty to keep this plan
          as a template only.
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          {WEEKDAYS.map((day) => {
            const blocks = resolvedSchedule[day] ?? [];
            return (
              <div key={day} style={styles.dayRow}>
                <div style={{ width: 48, fontWeight: 600 }}>{weekdayLabel(day)}</div>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                    alignItems: "center",
                    flex: 1,
                  }}
                >
                  {blocks.length === 0 ? (
                    <span style={{ ...styles.textDisabled }}>No blocks</span>
                  ) : (
                    blocks.map((block) => (
                      <div key={block.id} style={styles.blockChip}>
                        <input
                          value={block.startTime}
                          disabled={disabled}
                          onChange={(e) => updateBlock(day, block.id, { startTime: e.target.value })}
                          style={styles.timeInput}
                        />
                        <input
                          value={String(block.minutes)}
                          disabled={disabled}
                          onChange={(e) => {
                            const raw = e.target.value.trim();
                            if (!/^\d*$/.test(raw)) return;
                            const n = raw === "" ? 0 : parseInt(raw, 10);
                            updateBlock(day, block.id, { minutes: n });
                          }}
                          style={styles.minInput}
                        />
                        <span style={{ ...styles.textMuted }}>min</span>
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => deleteBlock(day, block.id)}
                          style={styles.smallBtn}
                        >
                          ✕
                        </button>
                      </div>
                    ))
                  )}
                </div>
                <button type="button" disabled={disabled} onClick={() => addBlock(day)}>
                  + Block
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
