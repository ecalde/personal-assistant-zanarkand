export type CalendarUndoSnackbarProps = {
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
};

/** Ephemeral undo affordance for calendar drag/resize. No persistence. */
export function CalendarUndoSnackbar({ message, onUndo, onDismiss }: CalendarUndoSnackbarProps) {
  return (
    <div
      role="status"
      style={{
        position: "fixed",
        left: "50%",
        bottom: 24,
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "10px 16px",
        borderRadius: 10,
        background: "#1f2937",
        color: "white",
        boxShadow: "0 6px 20px rgba(0,0,0,0.25)",
        zIndex: 1100,
      }}
    >
      <span style={{ fontSize: 14 }}>{message}</span>
      <button
        type="button"
        onClick={onUndo}
        style={{
          padding: "4px 12px",
          borderRadius: 8,
          border: "1px solid #60a5fa",
          background: "transparent",
          color: "#bfdbfe",
          cursor: "pointer",
          fontWeight: 700,
          fontSize: 13,
        }}
      >
        Undo
      </button>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        style={{
          padding: "4px 8px",
          borderRadius: 8,
          border: "none",
          background: "transparent",
          color: "#9ca3af",
          cursor: "pointer",
          fontSize: 16,
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  );
}
