import type { CSSProperties } from "react";

export const fullViewportCenter: CSSProperties = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto",
  color: "#333",
};

export const styles: Record<string, CSSProperties> = {
  shell: { padding: "1.5rem", maxWidth: 980, margin: "0 auto", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto" },
  header: { display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 10 },
  title: { fontSize: 28, fontWeight: 800 },
  sub: { opacity: 0.8 },
  actions: { display: "flex", gap: 8, flexWrap: "wrap" },
  nav: { display: "flex", gap: 8, margin: "14px 0" },
  navBtn: { padding: "8px 12px", borderRadius: 10, border: "1px solid #ddd", background: "white" },
  navBtnActive: { border: "1px solid #999", fontWeight: 700 },
  main: { display: "grid", gap: 14 },
  card: { background: "#f6f6f6", padding: 16, borderRadius: 14 },
  cardTitle: { fontSize: 18, fontWeight: 800, marginBottom: 10 },
  errorBox: { background: "#ffe6e6", padding: 12, borderRadius: 12, marginBottom: 10 },
  errorInline: { marginTop: 10, background: "#ffe6e6", padding: 10, borderRadius: 12 },
  input: { padding: "8px 10px", borderRadius: 10, border: "1px solid #ddd", minWidth: 280 },
  select: { padding: "6px 8px", borderRadius: 10, border: "1px solid #ddd" },
  label: { display: "grid", gap: 6 },
  listRow: { background: "white", padding: 12, borderRadius: 12, border: "1px solid #e5e5e5" },
  dayRow: { display: "flex", gap: 10, alignItems: "center", background: "white", padding: 10, borderRadius: 12, border: "1px solid #e5e5e5" },
  blockChip: { display: "flex", gap: 6, alignItems: "center", padding: "6px 8px", borderRadius: 12, border: "1px solid #ddd", background: "#fafafa" },
  timeInput: { width: 76, padding: "4px 6px", borderRadius: 8, border: "1px solid #ddd" },
  minInput: { width: 54, padding: "4px 6px", borderRadius: 8, border: "1px solid #ddd", textAlign: "right" },
  smallBtn: { padding: "2px 6px", borderRadius: 8, border: "1px solid #ddd", background: "white" },
  statusPill: {
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid #ddd",
    background: "white",
    fontSize: 12,
    fontWeight: 700,
    whiteSpace: "nowrap",
  },
  statusOnTrack: {
    border: "1px solid #b9e6c7",
    background: "#ecfff1",
  },
  statusOverdue: {
    border: "1px solid #f2b8b8",
    background: "#ffecec",
  },
  statusIdle: {
    border: "1px solid #ddd",
    background: "#f8f8f8",
  },
};
