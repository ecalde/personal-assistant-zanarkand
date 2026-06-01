import { useMemo, type CSSProperties, type ReactNode } from "react";
import {
  APPLICATION_STATUS_LABELS,
  type ApplicationAttentionReason,
} from "../core/career";
import type {
  FocusFeedback,
  JobApplication,
  LifeEvent,
  Person,
  Session,
  Skill,
  WorkoutPlan,
  WorkoutSession,
} from "../core/model";
import {
  buildWeeklyReview,
  isCareerSectionVisible,
  isEventsSectionVisible,
  isFitnessSectionVisible,
  isFocusFeedbackSectionVisible,
  isPeopleSectionVisible,
  isRisksSectionVisible,
  isSkillsSectionVisible,
  isWinsSectionVisible,
  type WeeklyReview,
} from "../core/review";
import { formatLocalDateKey } from "../core/timeline";
import { styles } from "../ui/appStyles";
import { formatMinutes } from "../ui/format";

export type ReviewPageProps = {
  skills: Skill[];
  sessions: Session[];
  events: LifeEvent[];
  people: Person[];
  jobApplications: JobApplication[];
  workoutPlans: WorkoutPlan[];
  workoutSessions: WorkoutSession[];
  focusFeedback: FocusFeedback[];
};

const TONE_CARD_STYLES: Record<WeeklyReview["tone"], CSSProperties> = {
  neutral: {},
  encouraging: {
    borderColor: "#b9e6c7",
    background: "#fafffb",
    color: "#1b3a2a",
  },
  warning: {
    borderColor: "#e8c98a",
    background: "#fffaf0",
    color: "#5a4a1e",
  },
};

const ATTENTION_REASON_LABELS: Record<ApplicationAttentionReason, string> = {
  saved_not_applied: "Ready to apply",
  no_response: "No response",
  stuck_in_stage: "Stuck in stage",
};

function formatWeekRange(weekStartKey: string, weekEndKey: string): string {
  const formatKey = (key: string) => {
    const [year, month, day] = key.split("-").map(Number);
    if (!year || !month || !day) return key;
    return new Date(year, month - 1, day).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };
  return `${formatKey(weekStartKey)} – ${formatKey(weekEndKey)}`;
}

function formatEventDate(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return dateKey;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function SectionBlock({
  title,
  children,
  hiddenWhenEmpty,
  isEmpty,
}: {
  title: string;
  children: ReactNode;
  hiddenWhenEmpty?: boolean;
  isEmpty?: boolean;
}) {
  if (hiddenWhenEmpty && isEmpty) return null;

  return (
    <section style={{ ...styles.dashboardSection, marginTop: 12 }} aria-label={title}>
      <h2 style={{ fontWeight: 800, margin: "0 0 10px 0", fontSize: 16 }}>{title}</h2>
      {children}
    </section>
  );
}

export default function ReviewPage({
  skills,
  sessions,
  events,
  people,
  jobApplications,
  workoutPlans,
  workoutSessions,
  focusFeedback,
}: ReviewPageProps) {
  const todayKey = formatLocalDateKey(new Date());
  const review = useMemo(
    () =>
      buildWeeklyReview({
        skills,
        sessions,
        events,
        people,
        jobApplications,
        workoutPlans,
        workoutSessions,
        focusFeedback,
        todayKey,
      }),
    [
      skills,
      sessions,
      events,
      people,
      jobApplications,
      workoutPlans,
      workoutSessions,
      focusFeedback,
      todayKey,
    ]
  );

  const heroStyle: CSSProperties = {
    ...styles.dashboardSection,
    ...TONE_CARD_STYLES[review.tone],
  };

  return (
    <div style={styles.card}>
      <h1 style={{ ...styles.cardTitle, margin: "0 0 4px 0" }}>Weekly review</h1>
      <p style={{ margin: "0 0 12px 0", fontSize: 13, opacity: 0.75 }}>
        {formatWeekRange(review.week.weekStartKey, review.week.weekEndKey)}
      </p>

      <section style={heroStyle} aria-label="Weekly review summary">
        <p style={{ margin: "0 0 8px 0", fontWeight: 800, fontSize: 20 }}>{review.greeting}</p>
        <p style={{ margin: "0 0 8px 0", fontWeight: 600, fontSize: 14 }}>{review.headline}</p>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{review.summary}</p>
      </section>

      <SectionBlock title="Wins of the week" hiddenWhenEmpty isEmpty={!isWinsSectionVisible(review)}>
        <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
          {review.wins.map((win) => (
            <li key={win} style={{ fontSize: 14, lineHeight: 1.45 }}>
              {win}
            </li>
          ))}
        </ul>
      </SectionBlock>

      <SectionBlock title="Risks for next week" hiddenWhenEmpty isEmpty={!isRisksSectionVisible(review)}>
        <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
          {review.risks.map((risk) => (
            <li key={risk} style={{ fontSize: 14, lineHeight: 1.45, color: "#8a5a00" }}>
              {risk}
            </li>
          ))}
        </ul>
      </SectionBlock>

      <SectionBlock
        title="Skills"
        hiddenWhenEmpty
        isEmpty={!isSkillsSectionVisible(review.skills)}
      >
        <p style={{ margin: "0 0 10px 0", opacity: 0.85 }}>
          {formatMinutes(review.skills.totalMinutes)} logged this week.
        </p>

        {review.skills.topConsistent.length > 0 && (
          <>
            <h3 style={{ fontWeight: 600, margin: "0 0 6px 0", fontSize: 13, opacity: 0.8 }}>
              Strongest consistency
            </h3>
            <ul style={{ margin: "0 0 12px 0", paddingLeft: 18, display: "grid", gap: 4 }}>
              {review.skills.topConsistent.map((row) => (
                <li key={row.skillId} style={{ fontSize: 13 }}>
                  {row.skillName} — {Math.round((row.completionRate ?? 0) * 100)}% of scheduled
                  days ({formatMinutes(row.minutesLogged)})
                </li>
              ))}
            </ul>
          </>
        )}

        {review.skills.missedOrOverdue.length > 0 && (
          <>
            <h3 style={{ fontWeight: 600, margin: "0 0 6px 0", fontSize: 13, opacity: 0.8 }}>
              Missed or overdue
            </h3>
            <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
              {review.skills.missedOrOverdue.map((row) => (
                <li key={row.skillId} style={{ fontSize: 13 }}>
                  {row.skillName}
                  {row.weeklyGoalMinutes !== null
                    ? ` — ${formatMinutes(row.minutesLogged)} / ${formatMinutes(row.weeklyGoalMinutes)} goal`
                    : ""}
                </li>
              ))}
            </ul>
          </>
        )}
      </SectionBlock>

      <SectionBlock title="Fitness" hiddenWhenEmpty isEmpty={!isFitnessSectionVisible(review.fitness)}>
        <p style={{ margin: 0, fontSize: 14 }}>{review.fitness.summaryLine}</p>
        {review.fitness.totalDurationMinutes > 0 && (
          <p style={{ margin: "6px 0 0 0", fontSize: 13, opacity: 0.85 }}>
            Total duration: {formatMinutes(review.fitness.totalDurationMinutes)}
          </p>
        )}
      </SectionBlock>

      <SectionBlock
        title="Career"
        hiddenWhenEmpty
        isEmpty={!isCareerSectionVisible(review.career)}
      >
        {review.career.updatedThisWeek.length > 0 && (
          <>
            <h3 style={{ fontWeight: 600, margin: "0 0 6px 0", fontSize: 13, opacity: 0.8 }}>
              Updated this week
            </h3>
            <ul style={{ margin: "0 0 12px 0", paddingLeft: 18, display: "grid", gap: 4 }}>
              {review.career.updatedThisWeek.map((item) => (
                <li key={item.id} style={{ fontSize: 13 }}>
                  {item.company} — {item.roleTitle} ({APPLICATION_STATUS_LABELS[item.status]})
                </li>
              ))}
            </ul>
          </>
        )}

        {review.career.stillNeedingAttention.length > 0 && (
          <>
            <h3 style={{ fontWeight: 600, margin: "0 0 6px 0", fontSize: 13, opacity: 0.8 }}>
              Still needing attention
            </h3>
            <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
              {review.career.stillNeedingAttention.map((item) => (
                <li key={item.id} style={{ fontSize: 13 }}>
                  {item.company} — {item.roleTitle}
                  {item.attentionReason
                    ? ` (${ATTENTION_REASON_LABELS[item.attentionReason]})`
                    : ""}
                </li>
              ))}
            </ul>
          </>
        )}
      </SectionBlock>

      <SectionBlock
        title="People"
        hiddenWhenEmpty
        isEmpty={!isPeopleSectionVisible(review.people)}
      >
        {review.people.followedUpThisWeek.length > 0 && (
          <>
            <h3 style={{ fontWeight: 600, margin: "0 0 6px 0", fontSize: 13, opacity: 0.8 }}>
              Followed up this week
            </h3>
            <ul style={{ margin: "0 0 12px 0", paddingLeft: 18, display: "grid", gap: 4 }}>
              {review.people.followedUpThisWeek.map((item) => (
                <li key={item.person.id} style={{ fontSize: 13 }}>
                  {item.person.name}
                </li>
              ))}
            </ul>
          </>
        )}

        {review.people.stillNeedingFollowUp.length > 0 && (
          <>
            <h3 style={{ fontWeight: 600, margin: "0 0 6px 0", fontSize: 13, opacity: 0.8 }}>
              Still needing follow-up
            </h3>
            <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
              {review.people.stillNeedingFollowUp.map((item) => (
                <li key={item.person.id} style={{ fontSize: 13 }}>
                  {item.person.name} — {item.daysSinceContact} days since last contact
                </li>
              ))}
            </ul>
          </>
        )}
      </SectionBlock>

      <SectionBlock
        title="Events"
        hiddenWhenEmpty
        isEmpty={!isEventsSectionVisible(review.events)}
      >
        {review.events.completedThisWeek.length > 0 && (
          <>
            <h3 style={{ fontWeight: 600, margin: "0 0 6px 0", fontSize: 13, opacity: 0.8 }}>
              Completed this week
            </h3>
            <ul style={{ margin: "0 0 12px 0", paddingLeft: 18, display: "grid", gap: 4 }}>
              {review.events.completedThisWeek.map((item) => (
                <li key={item.event.id} style={{ fontSize: 13 }}>
                  {formatEventDate(item.event.date)} — {item.event.title}
                </li>
              ))}
            </ul>
          </>
        )}

        {review.events.upcomingNextWeek.length > 0 && (
          <>
            <h3 style={{ fontWeight: 600, margin: "0 0 6px 0", fontSize: 13, opacity: 0.8 }}>
              Upcoming next week
            </h3>
            <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
              {review.events.upcomingNextWeek.map((item) => (
                <li key={item.event.id} style={{ fontSize: 13 }}>
                  {formatEventDate(item.event.date)} — {item.event.title} ({item.urgencyLabel})
                </li>
              ))}
            </ul>
          </>
        )}
      </SectionBlock>

      <SectionBlock
        title="Focus feedback"
        hiddenWhenEmpty
        isEmpty={!isFocusFeedbackSectionVisible(review.focusFeedback)}
      >
        <p style={{ margin: "0 0 10px 0", fontSize: 13, opacity: 0.85 }}>
          {review.focusFeedback.totalDismissed} dismissed, {review.focusFeedback.totalSnoozed}{" "}
          snoozed this week.
        </p>
        <h3 style={{ fontWeight: 600, margin: "0 0 6px 0", fontSize: 13, opacity: 0.8 }}>
          Most hidden focus items
        </h3>
        <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
          {review.focusFeedback.mostHidden.map((item) => (
            <li key={item.focusItemId} style={{ fontSize: 13 }}>
              {item.displayLabel.split("\n")[0]} — {item.dismissCount} dismissed,{" "}
              {item.snoozeCount} snoozed
            </li>
          ))}
        </ul>
      </SectionBlock>
    </div>
  );
}
