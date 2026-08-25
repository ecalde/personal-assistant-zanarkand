import type { SchoolCourse } from "../../core/model";
import { SCHOOL_STAFF_ROLE_LABELS } from "../../core/school";
import { styles } from "../../ui/appStyles";

export type SchoolPolicyGlanceProps = {
  course: SchoolCourse;
};

function GlanceRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 12 }}>{label}</div>
      <div style={{ ...styles.textMuted, fontSize: 13, whiteSpace: "pre-wrap" }}>{value}</div>
    </div>
  );
}

export function SchoolPolicyGlance({ course }: SchoolPolicyGlanceProps) {
  const staffValue =
    course.staff.length === 0
      ? "None yet"
      : course.staff
          .map((member) => {
            const role = SCHOOL_STAFF_ROLE_LABELS[member.role];
            const email = member.email ? ` · ${member.email}` : "";
            return `${role}: ${member.name}${email}`;
          })
          .join("\n");

  const officeValue =
    course.officeHours.length === 0
      ? "None yet"
      : course.officeHours
          .map((entry) => {
            const who = entry.who ? `${entry.who}: ` : "";
            const where = entry.locationOrLink ? ` · ${entry.locationOrLink}` : "";
            return `${who}${entry.whenText}${where}`;
          })
          .join("\n");

  const late = course.latePolicy;
  const lateValue = late
    ? [
        late.summary,
        late.lateDaysAllowed !== undefined ? `${late.lateDaysAllowed} late day(s)` : null,
        late.deductionPercentPerDay !== undefined
          ? `${late.deductionPercentPerDay}% per day`
          : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "None yet";

  return (
    <div
      style={{
        display: "grid",
        gap: 10,
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
      }}
    >
      <GlanceRow label="Staff" value={staffValue} />
      <GlanceRow label="Office hours" value={officeValue} />
      <GlanceRow label="Late policy" value={lateValue} />
      <GlanceRow label="Extra credit" value={course.extraCreditNotes?.trim() || "None yet"} />
    </div>
  );
}
