import type { ApplicationStatusFilter, ApplicationsSortMode } from "../../core/career";
import { styles } from "../../ui/appStyles";

export type ApplicationsToolbarProps = {
  query: string;
  sortMode: ApplicationsSortMode;
  statusFilter: ApplicationStatusFilter;
  resultCount: number;
  totalCount: number;
  onQueryChange: (query: string) => void;
  onSortModeChange: (mode: ApplicationsSortMode) => void;
  onStatusFilterChange: (filter: ApplicationStatusFilter) => void;
};

export function ApplicationsToolbar({
  query,
  sortMode,
  statusFilter,
  resultCount,
  totalCount,
  onQueryChange,
  onSortModeChange,
  onStatusFilterChange,
}: ApplicationsToolbarProps) {
  return (
    <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "center",
        }}
      >
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search company, role, location, notes…"
          aria-label="Search applications"
          style={{ flex: "1 1 200px", minWidth: 0 }}
        />
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span>Status</span>
          <select
            value={statusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value as ApplicationStatusFilter)}
          >
            <option value="all">All</option>
            <option value="saved">Saved</option>
            <option value="applied">Applied</option>
            <option value="in-progress">In progress</option>
            <option value="offer">Offer</option>
            <option value="closed">Closed</option>
            <option value="needs-attention">Needs attention</option>
          </select>
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span>Sort</span>
          <select
            value={sortMode}
            onChange={(e) => onSortModeChange(e.target.value as ApplicationsSortMode)}
          >
            <option value="recent">Recent</option>
            <option value="company">Company</option>
            <option value="status">Status</option>
            <option value="needsAttention">Needs attention</option>
          </select>
        </label>
      </div>
      <div style={{ ...styles.helpText, margin: 0 }}>
        {resultCount} of {totalCount} application{totalCount === 1 ? "" : "s"}
      </div>
    </div>
  );
}
