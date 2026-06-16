import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CalendarColorPreferences,
} from "../core/calendarColors";
import { formatLocalDateKey } from "../core/timeline";
import type { LifeEvent, Person, Skill, WorkoutPlan, WorkoutSession, JobApplication } from "../core/model";
import { CalendarCategorySidebar } from "../components/calendar/CalendarCategorySidebar";
import { CalendarItemDetailModal } from "../components/calendar/CalendarItemDetailModal";
import { CalendarSettingsSection } from "../components/calendar/CalendarSettingsSection";
import { CalendarToolbar } from "../components/calendar/CalendarToolbar";
import { CalendarUndoSnackbar } from "../components/calendar/CalendarUndoSnackbar";
import { MonthView } from "../components/calendar/MonthView";
import { ThreeDayView } from "../components/calendar/ThreeDayView";
import { WeekView } from "../components/calendar/WeekView";
import { useCalendarController } from "../components/calendar/useCalendarController";
import {
  buildEventDraftFromCalendarSelection,
  type CalendarEventDraftSeed,
  type CalendarEventUndoPayload,
} from "../core/calendarDrag";
import type { EventSeriesEditScope } from "../core/eventSeries";
import { styles } from "../ui/appStyles";
import { useIsDesktopViewport } from "../ui/useMediaQuery";

const UNDO_TIMEOUT_MS = 8000;

export type CalendarPageProps = {
  skills: Skill[];
  events: LifeEvent[];
  people: Person[];
  jobApplications: JobApplication[];
  workoutSessions: WorkoutSession[];
  workoutPlans: WorkoutPlan[];
  calendarPreferences?: CalendarColorPreferences;
  onSaveCalendarPreferences: (prefs: CalendarColorPreferences | undefined) => void;
  onEditOccurrence?: (
    eventId: string,
    scope: EventSeriesEditScope,
    splitDate: string
  ) => void;
  onSkipOccurrence?: (eventId: string, occurrenceDate: string) => void;
  onMoveOccurrence?: (
    eventId: string,
    occurrenceDate: string,
    overrideDate: string
  ) => void;
  onDeleteOccurrencesFromDate?: (eventId: string, fromDate: string) => void;
  onRescheduleItem?: (
    eventId: string,
    date: string,
    startTime: string,
    endTime?: string
  ) => CalendarEventUndoPayload | null;
  onMoveEventDate?: (eventId: string, date: string) => CalendarEventUndoPayload | null;
  onResizeItem?: (eventId: string, endTime: string) => CalendarEventUndoPayload | null;
  onOpenEventDraft?: (seed: CalendarEventDraftSeed) => void;
  onUndoCalendarEvent?: (payload: CalendarEventUndoPayload) => void;
  onOpenCareer?: () => void;
};

export default function CalendarPage({
  skills,
  events,
  people,
  jobApplications,
  workoutSessions,
  workoutPlans,
  calendarPreferences,
  onSaveCalendarPreferences,
  onOpenCareer,
  onEditOccurrence,
  onSkipOccurrence,
  onMoveOccurrence,
  onDeleteOccurrencesFromDate,
  onRescheduleItem,
  onMoveEventDate,
  onResizeItem,
  onOpenEventDraft,
  onUndoCalendarEvent,
}: CalendarPageProps) {
  const isDesktop = useIsDesktopViewport();
  const now = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => formatLocalDateKey(now), [now]);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const calendar = useCalendarController({
    skills,
    events,
    people,
    jobApplications,
    workoutSessions,
    workoutPlans,
    todayKey,
    viewModeSurface: "calendarPage",
    viewModeViewport: isDesktop ? "desktop" : "mobile",
  });

  const [pendingUndo, setPendingUndo] = useState<CalendarEventUndoPayload | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearUndoTimer = useCallback(() => {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
  }, []);

  const showUndo = useCallback(
    (payload: CalendarEventUndoPayload | null) => {
      if (!payload) return;
      clearUndoTimer();
      setPendingUndo(payload);
      undoTimerRef.current = setTimeout(() => {
        setPendingUndo(null);
        undoTimerRef.current = null;
      }, UNDO_TIMEOUT_MS);
    },
    [clearUndoTimer]
  );

  useEffect(() => clearUndoTimer, [clearUndoTimer]);

  const handleUndo = useCallback(() => {
    if (pendingUndo) onUndoCalendarEvent?.(pendingUndo);
    clearUndoTimer();
    setPendingUndo(null);
  }, [pendingUndo, onUndoCalendarEvent, clearUndoTimer]);

  const handleDismissUndo = useCallback(() => {
    clearUndoTimer();
    setPendingUndo(null);
  }, [clearUndoTimer]);

  const handleReschedule = useMemo(
    () =>
      onRescheduleItem
        ? (eventId: string, date: string, startTime: string, endTime?: string) => {
            showUndo(onRescheduleItem(eventId, date, startTime, endTime));
          }
        : undefined,
    [onRescheduleItem, showUndo]
  );

  const handleResize = useMemo(
    () =>
      onResizeItem
        ? (eventId: string, endTime: string) => {
            showUndo(onResizeItem(eventId, endTime));
          }
        : undefined,
    [onResizeItem, showUndo]
  );

  const handleMoveEventDate = useMemo(
    () =>
      onMoveEventDate
        ? (eventId: string, date: string) => {
            showUndo(onMoveEventDate(eventId, date));
          }
        : undefined,
    [onMoveEventDate, showUndo]
  );

  const handleCreateDraftFromDate = useMemo(
    () =>
      onOpenEventDraft
        ? (dateKey: string) => {
            const seed = buildEventDraftFromCalendarSelection({ dateKey });
            if (seed) onOpenEventDraft(seed);
          }
        : undefined,
    [onOpenEventDraft]
  );

  return (
    <div style={{ display: "grid", gap: 0 }}>
      <div style={styles.card}>
        <h1 style={{ ...styles.cardTitle, margin: "0 0 12px 0" }}>Calendar</h1>

        <div style={isDesktop ? styles.calendarLayout : styles.calendarLayoutMobile}>
          <div style={isDesktop ? styles.calendarMain : styles.calendarMainMobile}>
            <CalendarToolbar
              title={calendar.title}
              viewMode={calendar.viewMode}
              onViewModeChange={calendar.handleViewModeChange}
              onPrev={calendar.handlePrev}
              onNext={calendar.handleNext}
              onToday={calendar.handleToday}
              settingsSlot={
                <CalendarSettingsSection
                  key={JSON.stringify(calendarPreferences ?? null)}
                  preferences={calendarPreferences}
                  onSave={onSaveCalendarPreferences}
                />
              }
            />

            {calendar.viewMode === "month" ? (
              <MonthView
                monthAnchorKey={calendar.anchorKey}
                todayKey={todayKey}
                itemsByDate={calendar.itemsByDate}
                preferences={calendarPreferences}
                onSelectItem={calendar.setSelectedItem}
                onSelectDay={calendar.handleSelectDay}
                onMoveItem={handleMoveEventDate}
                onCreateDraftFromDate={handleCreateDraftFromDate}
              />
            ) : calendar.viewMode === "threeDay" ? (
              <ThreeDayView
                anchorKey={calendar.anchorKey}
                todayKey={todayKey}
                itemsByDate={calendar.itemsByDate}
                preferences={calendarPreferences}
                onSelectItem={calendar.setSelectedItem}
                onAnchorChange={calendar.handleThreeDayAnchorChange}
                onRescheduleItem={handleReschedule}
                onResizeItem={handleResize}
                nowMinutes={nowMinutes}
              />
            ) : (
              <WeekView
                anchorKey={calendar.anchorKey}
                todayKey={todayKey}
                itemsByDate={calendar.itemsByDate}
                preferences={calendarPreferences}
                onSelectItem={calendar.setSelectedItem}
                onRescheduleItem={handleReschedule}
                onResizeItem={handleResize}
                nowMinutes={nowMinutes}
              />
            )}
          </div>

          <CalendarCategorySidebar
            hiddenCategories={calendar.hiddenCategories}
            hiddenEventSubcategories={calendar.hiddenEventSubcategories}
            onToggleCategory={calendar.toggleCategory}
            onToggleEventSubcategory={calendar.toggleEventSubcategory}
            preferences={calendarPreferences}
          />
        </div>

        {calendar.selectedItem ? (
          <CalendarItemDetailModal
            item={calendar.selectedItem}
            preferences={calendarPreferences}
            onClose={() => calendar.setSelectedItem(null)}
            onOpenCareer={onOpenCareer}
            onEditEntireSeries={
              onEditOccurrence
                ? (eventId, occurrenceDate) =>
                    onEditOccurrence(eventId, "entire", occurrenceDate)
                : undefined
            }
            onEditThisAndFuture={
              onEditOccurrence
                ? (eventId, splitDate) =>
                    onEditOccurrence(eventId, "thisAndFuture", splitDate)
                : undefined
            }
            onEditThisOccurrenceOnly={
              onEditOccurrence
                ? (eventId, occurrenceDate) =>
                    onEditOccurrence(eventId, "thisOccurrenceOnly", occurrenceDate)
                : undefined
            }
            onSkipOccurrence={onSkipOccurrence}
            onMoveOccurrence={onMoveOccurrence}
            onDeleteOccurrencesFromDate={onDeleteOccurrencesFromDate}
          />
        ) : null}
      </div>

      {pendingUndo ? (
        <CalendarUndoSnackbar
          message="Event updated"
          onUndo={handleUndo}
          onDismiss={handleDismissUndo}
        />
      ) : null}
    </div>
  );
}
