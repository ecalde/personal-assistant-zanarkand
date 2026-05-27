import {
  formatApplicationStatus,
  getStatusBadgeVariant,
  type ApplicationAttentionStatus,
  type StatusBadgeVariant,
} from "../../core/career";
import type { ApplicationStatus } from "../../core/model";
import { styles } from "../../ui/appStyles";

export type ApplicationStatusBadgeProps = {
  status: ApplicationStatus;
  attention: ApplicationAttentionStatus | null;
};

function variantStyle(variant: StatusBadgeVariant) {
  switch (variant) {
    case "positive":
      return styles.statusOnTrack;
    case "warning":
      return styles.statusIdle;
    case "overdue":
      return styles.statusOverdue;
    default:
      return styles.statusIdle;
  }
}

export function ApplicationStatusBadge({ status, attention }: ApplicationStatusBadgeProps) {
  const variant = getStatusBadgeVariant(status, attention);

  return (
    <span style={{ ...styles.statusPill, ...variantStyle(variant) }}>
      {formatApplicationStatus(status)}
    </span>
  );
}
