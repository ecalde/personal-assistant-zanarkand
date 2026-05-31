import { settingsStyles as s } from "./settingsStyles";

const FUTURE_SYSTEMS: readonly { title: string; text: string }[] = [
  {
    title: "AI Configuration",
    text: "Tune optional AI summaries and suggestions once deterministic systems are stable.",
  },
  {
    title: "Automation Rules",
    text: "Define triggers and routines across skills, events, and fitness.",
  },
  {
    title: "Smart Notifications",
    text: "Reminders for events, birthdays, workouts, and focus items.",
  },
  {
    title: "Integrations",
    text: "Connect external calendars and tools to your assistant.",
  },
  {
    title: "Mobile Sync",
    text: "Keep preferences and data in sync across your devices.",
  },
  {
    title: "Account Preferences",
    text: "Manage profile, security, and sign-in options.",
  },
];

export function FutureSystemsSection() {
  return (
    <div style={s.futureGrid}>
      {FUTURE_SYSTEMS.map((item) => (
        <div key={item.title} style={s.futureCard} aria-disabled>
          <span style={s.futureBadge}>Coming Soon</span>
          <span style={s.futureCardTitle}>{item.title}</span>
          <span style={s.futureCardText}>{item.text}</span>
        </div>
      ))}
    </div>
  );
}
