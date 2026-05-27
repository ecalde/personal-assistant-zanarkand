import type { PeopleSortMode } from "../../core/people";
import { styles } from "../../ui/appStyles";

export type PeopleToolbarProps = {
  query: string;
  sortMode: PeopleSortMode;
  visibleCount: number;
  totalCount: number;
  onQueryChange: (query: string) => void;
  onSortModeChange: (sortMode: PeopleSortMode) => void;
};

export function PeopleToolbar({
  query,
  sortMode,
  visibleCount,
  totalCount,
  onQueryChange,
  onSortModeChange,
}: PeopleToolbarProps) {
  return (
    <div
      style={{
        display: "grid",
        gap: 10,
        marginBottom: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "end",
          justifyContent: "space-between",
        }}
      >
        <label style={{ ...styles.label, flex: "1 1 220px", minWidth: 0 }}>
          Search
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Name, relationship, likes, notes…"
            style={{ ...styles.input, minWidth: 0, width: "100%" }}
          />
        </label>

        <label style={{ ...styles.label, flex: "0 1 auto" }}>
          Sort by
          <select
            value={sortMode}
            onChange={(e) => onSortModeChange(e.target.value as PeopleSortMode)}
            style={styles.select}
          >
            <option value="name">Name</option>
            <option value="birthday">Upcoming birthday</option>
            <option value="followUp">Needs follow-up</option>
            <option value="recentContact">Recently contacted</option>
          </select>
        </label>
      </div>

      <div style={{ fontSize: 13, opacity: 0.8 }}>
        {visibleCount} of {totalCount} {totalCount === 1 ? "person" : "people"}
      </div>
    </div>
  );
}
