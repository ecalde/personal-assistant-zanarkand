import { styles } from "../../ui/appStyles";

export type PersonPreferenceSectionProps = {
  title: string;
  content?: string;
};

export function PersonPreferenceSection({ title, content }: PersonPreferenceSectionProps) {
  if (!content) return null;

  return (
    <div style={{ ...styles.dashboardSection, minWidth: 0 }}>
      <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 13 }}>{title}</div>
      <div style={{ fontSize: 13, opacity: 0.9, whiteSpace: "pre-wrap" }}>{content}</div>
    </div>
  );
}
