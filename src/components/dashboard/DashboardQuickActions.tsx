import { styles } from "../../ui/appStyles";

export type DashboardQuickActionsProps = {
  onOpenSkills?: () => void;
  onOpenEvents?: () => void;
  onOpenPeople?: () => void;
  onOpenCareer?: () => void;
  onOpenFitness?: () => void;
  onOpenReview?: () => void;
  onOpenCalendar?: () => void;
};

type QuickAction = {
  label: string;
  onClick?: () => void;
};

/**
 * Compact navigation shortcuts for the dashboard left rail. Deep-links reuse
 * the existing page-navigation callbacks already wired through `App.tsx`.
 */
export function DashboardQuickActions({
  onOpenSkills,
  onOpenEvents,
  onOpenPeople,
  onOpenCareer,
  onOpenFitness,
  onOpenReview,
  onOpenCalendar,
}: DashboardQuickActionsProps) {
  const actions: QuickAction[] = [
    { label: "Calendar", onClick: onOpenCalendar },
    { label: "Skills", onClick: onOpenSkills },
    { label: "Events", onClick: onOpenEvents },
    { label: "People", onClick: onOpenPeople },
    { label: "Career", onClick: onOpenCareer },
    { label: "Fitness", onClick: onOpenFitness },
    { label: "Review", onClick: onOpenReview },
  ];

  const visible = actions.filter((action): action is Required<QuickAction> =>
    Boolean(action.onClick)
  );

  if (visible.length === 0) return null;

  return (
    <section style={styles.dashboardSection} aria-label="Quick actions">
      <h2 style={{ fontWeight: 800, margin: "0 0 8px 0", fontSize: 14 }}>Quick actions</h2>
      <div style={styles.dashboardQuickActions}>
        {visible.map((action) => (
          <button
            key={action.label}
            type="button"
            style={styles.dashboardQuickActionBtn}
            onClick={action.onClick}
          >
            {action.label}
          </button>
        ))}
      </div>
    </section>
  );
}
