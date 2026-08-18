import type { CSSProperties } from "react";
import type { Page } from "../../pages/types";
import { styles } from "../../ui/appStyles";
import calendarEmblem from "../../assets/nav/calendar.webp";
import careerEmblem from "../../assets/nav/career.webp";
import dashboardEmblem from "../../assets/nav/dashboard.webp";
import eventsEmblem from "../../assets/nav/events.webp";
import fitnessEmblem from "../../assets/nav/fitness.webp";
import peopleEmblem from "../../assets/nav/people.webp";
import reviewEmblem from "../../assets/nav/review.webp";
import settingsEmblem from "../../assets/nav/settings.webp";
import skillsEmblem from "../../assets/nav/skills.webp";

const EMBLEMS: Record<Page, string> = {
  dashboard: dashboardEmblem,
  calendar: calendarEmblem,
  skills: skillsEmblem,
  events: eventsEmblem,
  people: peopleEmblem,
  career: careerEmblem,
  fitness: fitnessEmblem,
  review: reviewEmblem,
  settings: settingsEmblem,
};

export function NavEmblem({
  page,
  active,
  size = 44,
}: {
  page: Page;
  active: boolean;
  size?: number;
}) {
  const emblemStyle: CSSProperties = {
    ...styles.navEmblem,
    width: size,
    height: size,
    ...(active
      ? styles.navEmblemActive
      : { opacity: 0.82, filter: "saturate(0.88)" }),
  };

  return (
    <img
      src={EMBLEMS[page]}
      alt=""
      width={size}
      height={size}
      draggable={false}
      decoding="async"
      aria-hidden
      style={emblemStyle}
    />
  );
}
