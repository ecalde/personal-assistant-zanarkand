import {
  getWorkoutFocusValues,
  WORKOUT_FOCUS_LABELS,
  type PlansSortMode,
  type SessionsSortMode,
  type WorkoutFocusFilter,
} from "../../core/fitness";
import { styles } from "../../ui/appStyles";

type FitnessToolbarProps =
  | {
      mode: "plans";
      query: string;
      sortMode: PlansSortMode;
      focusFilter: WorkoutFocusFilter;
      visibleCount: number;
      totalCount: number;
      onQueryChange: (value: string) => void;
      onSortModeChange: (value: PlansSortMode) => void;
      onFocusFilterChange: (value: WorkoutFocusFilter) => void;
    }
  | {
      mode: "sessions";
      query: string;
      sortMode: SessionsSortMode;
      focusFilter: WorkoutFocusFilter;
      visibleCount: number;
      totalCount: number;
      onQueryChange: (value: string) => void;
      onSortModeChange: (value: SessionsSortMode) => void;
      onFocusFilterChange: (value: WorkoutFocusFilter) => void;
    };

export function FitnessToolbar(props: FitnessToolbarProps) {
  const sortOptions =
    props.mode === "plans"
      ? [
          { value: "recent", label: "Recent" },
          { value: "name", label: "Name" },
          { value: "focus", label: "Focus" },
        ]
      : [
          { value: "recent", label: "Recent" },
          { value: "date", label: "Date" },
          { value: "focus", label: "Focus" },
        ];

  return (
    <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
      <div style={{ opacity: 0.85 }}>
        Showing {props.visibleCount} of {props.totalCount}
      </div>

      <label style={styles.label}>
        Search
        <input
          value={props.query}
          onChange={(e) => props.onQueryChange(e.target.value)}
          placeholder="Name, exercise, notes…"
          style={styles.input}
        />
      </label>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <label style={styles.label}>
          Focus
          <select
            value={props.focusFilter}
            onChange={(e) =>
              props.onFocusFilterChange(e.target.value as WorkoutFocusFilter)
            }
            style={styles.input}
          >
            <option value="all">All</option>
            {getWorkoutFocusValues().map((focus) => (
              <option key={focus} value={focus}>
                {WORKOUT_FOCUS_LABELS[focus]}
              </option>
            ))}
          </select>
        </label>

        <label style={styles.label}>
          Sort
          <select
            value={props.sortMode}
            onChange={(e) =>
              props.mode === "plans"
                ? props.onSortModeChange(e.target.value as PlansSortMode)
                : props.onSortModeChange(e.target.value as SessionsSortMode)
            }
            style={styles.input}
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
