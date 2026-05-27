import {
  getQuickStatusActions,
  getSecondaryQuickStatusActions,
  type QuickStatusAction,
} from "../../core/career";
import type { ApplicationStatus } from "../../core/model";

export type ApplicationQuickActionsProps = {
  status: ApplicationStatus;
  onQuickAction: (action: QuickStatusAction) => void;
};

export function ApplicationQuickActions({ status, onQuickAction }: ApplicationQuickActionsProps) {
  const primary = getQuickStatusActions(status);
  const secondary = getSecondaryQuickStatusActions(status);

  if (primary.length === 0 && secondary.length === 0) {
    return null;
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {primary.map((action) => (
        <button
          key={`${action.nextStatus}-primary`}
          type="button"
          onClick={() => onQuickAction(action)}
        >
          {action.label}
        </button>
      ))}
      {secondary.map((action) => (
        <button
          key={`${action.nextStatus}-secondary`}
          type="button"
          onClick={() => onQuickAction(action)}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
