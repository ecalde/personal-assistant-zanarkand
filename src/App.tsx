import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AppPayload,
  CalendarColorPreferences,
  CareerTarget,
  FocusFeedback,
  GamificationState,
  JobApplication,
  LifeEvent,
  Person,
  Skill,
  Session,
  WorkoutPlan,
  WorkoutSession,
} from "./core/model";
import {
  cleanupExpiredFeedback,
  dismissUntilEndOfDay,
  restoreFocusFeedbackItem,
  restoreFocusItemByFocusId as removeFocusFeedbackByFocusId,
  snoozeFocusItem as buildSnoozeFocusFeedback,
  snoozeFocusItemUntilTomorrow as buildSnoozeUntilTomorrowFeedback,
} from "./core/focusFeedback";
import {
  initialSync,
  isRemoteSyncEnabled,
  replaceRemotePayload,
} from "./core/remoteStorage";
import { cloudSafeMessage, loadDataErrorMessage } from "./core/syncErrors";
import { parseCalendarColorPreferences } from "./core/dbMappers";
import type { AppData } from "./core/storage";
import { removeSkillFromPayload } from "./core/sessions";
import { exportBackup, importBackup, loadAppData, nowIso, saveAppData } from "./core/storage";
import { defaultWeeklySchedule } from "./core/state";
import { AppShell } from "./components/layout/AppShell";
import { isCalendarPreferencesEmpty } from "./components/calendar/calendarPreferencesFormState";
import CalendarPage from "./pages/CalendarPage";
import CareerPage from "./pages/CareerPage";
import DashboardPage from "./pages/DashboardPage";
import EventsPage, {
  type EventFormDraft,
  type EventSeriesEditIntent,
} from "./pages/EventsPage";
import FitnessPage from "./pages/FitnessPage";
import ReviewPage from "./pages/ReviewPage";
import PeoplePage, { type LinkedEventPreset } from "./pages/PeoplePage";
import SettingsPage from "./pages/SettingsPage";
import SkillsPage from "./pages/SkillsPage";
import {
  detachOccurrenceAsOneTimeEvent,
  moveOccurrenceAtDate,
  skipOccurrenceAtDate,
  truncateRecurringEventBeforeDate,
} from "./core/eventOccurrences";
import {
  splitEventSeriesAtDate,
  isRecurringLifeEvent,
  type EventSeriesEditScope,
} from "./core/eventSeries";
import type {
  CalendarEventDraftSeed,
  CalendarEventUndoPayload,
} from "./core/calendarDrag";
import type { Page } from "./pages/types";
import { fullViewportCenter } from "./ui/appStyles";
import { formatLocal } from "./ui/format";
import { useAppearanceTheme } from "./ui/useAppearanceTheme";
import { GlobalEffectStyles } from "./components/effects/GlobalEffectStyles";
import { ThemeEffectsLayer } from "./components/effects/ThemeEffectsLayer";

const REMOTE_DEBOUNCE_MS = 400;

function id() {
  return crypto.randomUUID();
}

function applyEventPersonFields(
  event: LifeEvent,
  input: { personId?: string; personName?: string },
  people: Person[]
): void {
  if (input.personId) {
    event.personId = input.personId;
    const person = people.find((p) => p.id === input.personId);
    if (person) {
      event.personName = person.name;
    }
    return;
  }

  delete event.personId;
  if (input.personName?.trim()) {
    event.personName = input.personName.trim();
  } else {
    delete event.personName;
  }
}

export type AppProps = {
  userId: string;
  onSignOut?: () => void;
};

export default function App({ userId, onSignOut }: AppProps) {
  const [app, setApp] = useState<AppData | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncPending, setSyncPending] = useState(false);

  const appearance = useAppearanceTheme();
  const [page, setPage] = useState<Page>("dashboard");
  const [eventDraft, setEventDraft] = useState<EventFormDraft | null>(null);
  const [eventDraftKey, setEventDraftKey] = useState(0);
  const [seriesEditIntent, setSeriesEditIntent] = useState<EventSeriesEditIntent | null>(null);
  const [seriesEditKey, setSeriesEditKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const syncReadyRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updatedAtIso = app?.updatedAtIso;
  const lastSavedLabel = useMemo(
    () => (updatedAtIso ? formatLocal(updatedAtIso) : ""),
    [updatedAtIso]
  );

  const clearDebounce = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  const persistRemote = useCallback(
    async (payload: AppPayload) => {
      if (!isRemoteSyncEnabled()) return;

      setSyncPending(true);
      try {
        await replaceRemotePayload(userId, payload);
        setSyncError(null);
      } catch (err) {
        setSyncError(cloudSafeMessage(err));
      } finally {
        setSyncPending(false);
      }
    },
    [userId]
  );

  const scheduleRemotePersist = useCallback(
    (payload: AppPayload) => {
      if (!syncReadyRef.current || !isRemoteSyncEnabled()) return;

      clearDebounce();
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        void persistRemote(payload);
      }, REMOTE_DEBOUNCE_MS);
    },
    [clearDebounce, persistRemote]
  );

  const runInitialSync = useCallback(async () => {
    setDataLoading(true);
    setDataError(null);
    syncReadyRef.current = false;
    clearDebounce();

    try {
      let data = await initialSync(userId, () => loadAppData(userId));
      const cleaned = cleanupExpiredFeedback(data.payload.focusFeedback ?? [], nowIso());
      if (cleaned.length !== (data.payload.focusFeedback ?? []).length) {
        data = saveAppData(
          { ...data, payload: { ...data.payload, focusFeedback: cleaned } },
          userId
        );
      }
      setApp(data);
      setSyncError(null);
      syncReadyRef.current = true;
    } catch (err) {
      setDataError(loadDataErrorMessage(err));
      setApp(null);
      syncReadyRef.current = false;
    } finally {
      setDataLoading(false);
    }
  }, [userId, clearDebounce]);

  useEffect(() => {
    void runInitialSync();
    return () => {
      syncReadyRef.current = false;
      clearDebounce();
    };
  }, [runInitialSync, clearDebounce]);

  function commit(next: AppData) {
    if (!syncReadyRef.current) return;

    const saved = saveAppData(next, userId);
    setApp(saved);
    setSyncError(null);
    scheduleRemotePersist(saved.payload);
  }

  async function onSaveNow() {
    if (!app || !syncReadyRef.current) return;

    setError(null);
    const saved = saveAppData(app, userId);
    setApp(saved);
    setSyncError(null);
    clearDebounce();

    if (isRemoteSyncEnabled()) {
      await persistRemote(saved.payload);
    }
  }

  function onExport() {
    if (!app) return;

    setError(null);
    const saved = saveAppData(app, userId);
    setApp(saved);
    exportBackup(saved);
  }

  async function onPickImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    if (!syncReadyRef.current) return;

    setError(null);
    const f = e.target.files?.[0];
    if (!f) return;

    try {
      const imported = await importBackup(f);
      commit(imported);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      e.target.value = "";
    }
  }

  async function onRetryCloudSave() {
    if (!app) return;
    await persistRemote(app.payload);
  }

  // ---------- SKILLS CRUD ----------
  function addSkill(name: string, scheduleSeries?: Skill["scheduleSeries"]) {
    if (!app) return;

    const trimmed = name.trim();
    if (!trimmed) return;

    const now = new Date().toISOString();
    const newSkill: Skill = {
      id: id(),
      name: trimmed,
      schedule: defaultWeeklySchedule(),
      createdAtIso: now,
      updatedAtIso: now,
      dailyGoalMinutes: 30,
      weeklyGoalMinutes: 180,
      priority: 2,
    };

    if (scheduleSeries !== undefined) {
      newSkill.scheduleSeries = scheduleSeries;
    }

    commit({
      ...app,
      payload: {
        ...app.payload,
        skills: [newSkill, ...app.payload.skills],
      },
    });
  }

  function updateSkill(skillId: string, patch: Partial<Skill>) {
    if (!app) return;

    const now = new Date().toISOString();
    const skills = app.payload.skills.map((s) => {
      if (s.id !== skillId) return s;
      const next = { ...s, ...patch, updatedAtIso: now };
      if ("scheduleSeries" in patch && patch.scheduleSeries === undefined) {
        delete next.scheduleSeries;
      }
      return next;
    });
    commit({ ...app, payload: { ...app.payload, skills } });
  }

  function setSkillScheduleSeries(
    skillId: string,
    scheduleSeries: Skill["scheduleSeries"]
  ) {
    updateSkill(skillId, { scheduleSeries });
  }

  function deleteSkill(skillId: string) {
    if (!app) return;

    commit({
      ...app,
      payload: removeSkillFromPayload(app.payload, skillId),
    });
  }

  // ---------- SESSIONS ----------
  function addSession(skillId: string, minutes: number) {
    if (!app) return;
    if (!Number.isInteger(minutes) || minutes <= 0) return;

    const now = new Date().toISOString();
    const session: Session = {
      id: id(),
      skillId,
      minutes,
      startedAtIso: now,
      createdAtIso: now,
    };

    commit({
      ...app,
      payload: {
        ...app.payload,
        sessions: [session, ...(app.payload.sessions ?? [])],
      },
    });
  }

  function deleteSession(sessionId: string) {
    if (!app) return;

    const nextSessions = (app.payload.sessions ?? []).filter((s) => s.id !== sessionId);
    commit({
      ...app,
      payload: {
        ...app.payload,
        sessions: nextSessions,
      },
    });
  }

  // ---------- EVENTS ----------
  function addEvent(
    input: Omit<LifeEvent, "id" | "createdAtIso" | "updatedAtIso">
  ) {
    if (!app) return;

    const trimmedTitle = input.title.trim();
    if (!trimmedTitle || !input.date || !input.type) return;

    const now = new Date().toISOString();
    const newEvent: LifeEvent = {
      id: id(),
      title: trimmedTitle,
      date: input.date,
      type: input.type,
      reminder: input.reminder,
      createdAtIso: now,
      updatedAtIso: now,
    };

    if (input.personId) {
      applyEventPersonFields(newEvent, input, app.payload.people ?? []);
    } else if (input.personName?.trim()) {
      newEvent.personName = input.personName.trim();
    }
    if (input.notes?.trim()) {
      newEvent.notes = input.notes.trim();
    }
    if (input.startTime) {
      newEvent.startTime = input.startTime;
    }
    if (input.endTime) {
      newEvent.endTime = input.endTime;
    }
    if (input.recurrence !== undefined) {
      newEvent.recurrence = input.recurrence;
    }

    commit({
      ...app,
      payload: {
        ...app.payload,
        events: [...(app.payload.events ?? []), newEvent],
      },
    });
  }

  function updateEvent(updated: LifeEvent) {
    if (!app) return;

    const trimmedTitle = updated.title.trim();
    if (!trimmedTitle || !updated.date || !updated.type) return;

    const now = new Date().toISOString();
    const nextEvent: LifeEvent = {
      ...updated,
      title: trimmedTitle,
      updatedAtIso: now,
    };

    if (updated.personId) {
      applyEventPersonFields(nextEvent, updated, app.payload.people ?? []);
    } else {
      delete nextEvent.personId;
      if (updated.personName?.trim()) {
        nextEvent.personName = updated.personName.trim();
      } else {
        delete nextEvent.personName;
      }
    }

    if (updated.notes?.trim()) {
      nextEvent.notes = updated.notes.trim();
    } else {
      delete nextEvent.notes;
    }

    if (updated.startTime) {
      nextEvent.startTime = updated.startTime;
    } else {
      delete nextEvent.startTime;
    }

    if (updated.endTime) {
      nextEvent.endTime = updated.endTime;
    } else {
      delete nextEvent.endTime;
    }

    if (updated.recurrence !== undefined) {
      nextEvent.recurrence = updated.recurrence;
    } else {
      delete nextEvent.recurrence;
      delete nextEvent.seriesId;
    }

    const events = (app.payload.events ?? []).map((event) =>
      event.id === updated.id ? nextEvent : event
    );

    commit({ ...app, payload: { ...app.payload, events } });
  }

  function deleteEvent(eventId: string) {
    if (!app) return;

    const events = (app.payload.events ?? []).filter((event) => event.id !== eventId);
    commit({ ...app, payload: { ...app.payload, events } });
  }

  function replaceEventInPayload(eventId: string, nextEvent: LifeEvent) {
    if (!app) return;

    const events = (app.payload.events ?? []).map((event) =>
      event.id === eventId ? nextEvent : event
    );
    commit({ ...app, payload: { ...app.payload, events } });
  }

  function skipEventOccurrence(eventId: string, occurrenceDate: string) {
    if (!app) return;

    const original = (app.payload.events ?? []).find((event) => event.id === eventId);
    if (!original) return;

    const updated = skipOccurrenceAtDate(original, occurrenceDate, new Date().toISOString());
    replaceEventInPayload(eventId, updated);
  }

  function moveEventOccurrence(
    eventId: string,
    occurrenceDate: string,
    overrideDate: string
  ) {
    if (!app) return;

    const original = (app.payload.events ?? []).find((event) => event.id === eventId);
    if (!original) return;

    const updated = moveOccurrenceAtDate(
      original,
      occurrenceDate,
      overrideDate,
      new Date().toISOString()
    );
    replaceEventInPayload(eventId, updated);
  }

  function deleteEventOccurrencesFromDate(eventId: string, fromDate: string) {
    if (!app) return;

    const original = (app.payload.events ?? []).find((event) => event.id === eventId);
    if (!original) return;

    const truncated = truncateRecurringEventBeforeDate(
      original,
      fromDate,
      new Date().toISOString()
    );
    if (truncated === null) {
      deleteEvent(eventId);
      return;
    }

    replaceEventInPayload(eventId, truncated);
  }

  function detachEventOccurrence(
    eventId: string,
    occurrenceDate: string,
    edited: LifeEvent
  ) {
    if (!app) return;

    const original = (app.payload.events ?? []).find((event) => event.id === eventId);
    if (!original) return;

    const { parentEvent, detachedEvent } = detachOccurrenceAsOneTimeEvent({
      parent: original,
      occurrenceDate,
      editedEvent: edited,
      detachedId: id(),
      nowIso: new Date().toISOString(),
    });

    const withoutOriginal = (app.payload.events ?? []).filter((event) => event.id !== eventId);
    commit({
      ...app,
      payload: { ...app.payload, events: [...withoutOriginal, parentEvent, detachedEvent] },
    });
  }

  function updateEventSeries(
    scope: EventSeriesEditScope,
    splitDate: string,
    updated: LifeEvent
  ) {
    if (!app) return;

    if (scope === "entire") {
      updateEvent(updated);
      return;
    }

    if (scope === "thisOccurrenceOnly") {
      detachEventOccurrence(updated.id, splitDate, updated);
      return;
    }

    const original = (app.payload.events ?? []).find((event) => event.id === updated.id);
    if (!original) return;

    const seriesId = original.seriesId ?? id();
    const afterEventId = id();
    const now = new Date().toISOString();

    const { beforeEvent, afterEvent } = splitEventSeriesAtDate({
      original,
      splitDate,
      editedEvent: updated,
      seriesId,
      afterEventId,
      nowIso: now,
    });

    const withoutOriginal = (app.payload.events ?? []).filter(
      (event) => event.id !== original.id
    );
    const nextEvents = beforeEvent
      ? [...withoutOriginal, beforeEvent, afterEvent]
      : [...withoutOriginal, afterEvent];

    commit({ ...app, payload: { ...app.payload, events: nextEvents } });
  }

  function openSeriesEdit(eventId: string, scope: EventSeriesEditScope, splitDate: string) {
    setSeriesEditIntent({ eventId, scope, splitDate });
    setSeriesEditKey((current) => current + 1);
    setPage("events");
  }

  function rescheduleLifeEvent(
    eventId: string,
    date: string,
    startTime: string,
    endTime?: string
  ): CalendarEventUndoPayload | null {
    if (!app) return null;

    const existing = (app.payload.events ?? []).find((event) => event.id === eventId);
    if (!existing || isRecurringLifeEvent(existing)) return null;

    const undo: CalendarEventUndoPayload = {
      eventId,
      date: existing.date,
      startTime: existing.startTime,
      endTime: existing.endTime,
    };

    const updated: LifeEvent = {
      ...existing,
      date,
      startTime,
      updatedAtIso: new Date().toISOString(),
    };
    if (endTime) {
      updated.endTime = endTime;
    } else {
      delete updated.endTime;
    }

    replaceEventInPayload(eventId, updated);
    return undo;
  }

  function moveLifeEventDate(
    eventId: string,
    date: string
  ): CalendarEventUndoPayload | null {
    if (!app) return null;

    const existing = (app.payload.events ?? []).find((event) => event.id === eventId);
    if (!existing || isRecurringLifeEvent(existing)) return null;

    const undo: CalendarEventUndoPayload = {
      eventId,
      date: existing.date,
      startTime: existing.startTime,
      endTime: existing.endTime,
    };

    const updated: LifeEvent = {
      ...existing,
      date,
      updatedAtIso: new Date().toISOString(),
    };

    replaceEventInPayload(eventId, updated);
    return undo;
  }

  function resizeLifeEvent(
    eventId: string,
    endTime: string
  ): CalendarEventUndoPayload | null {
    if (!app) return null;

    const existing = (app.payload.events ?? []).find((event) => event.id === eventId);
    if (!existing || isRecurringLifeEvent(existing) || !existing.startTime) return null;

    const undo: CalendarEventUndoPayload = {
      eventId,
      date: existing.date,
      startTime: existing.startTime,
      endTime: existing.endTime,
    };

    const updated: LifeEvent = {
      ...existing,
      endTime,
      updatedAtIso: new Date().toISOString(),
    };

    replaceEventInPayload(eventId, updated);
    return undo;
  }

  function applyCalendarEventUndo(payload: CalendarEventUndoPayload) {
    if (!app) return;

    const existing = (app.payload.events ?? []).find(
      (event) => event.id === payload.eventId
    );
    if (!existing || isRecurringLifeEvent(existing)) return;

    const updated: LifeEvent = {
      ...existing,
      date: payload.date,
      updatedAtIso: new Date().toISOString(),
    };
    if (payload.startTime) {
      updated.startTime = payload.startTime;
    } else {
      delete updated.startTime;
    }
    if (payload.endTime) {
      updated.endTime = payload.endTime;
    } else {
      delete updated.endTime;
    }

    replaceEventInPayload(payload.eventId, updated);
  }

  function openCalendarEventDraft(seed: CalendarEventDraftSeed) {
    setEventDraft({
      date: seed.date,
      startTime: seed.startTime,
      endTime: seed.endTime,
    });
    setEventDraftKey((current) => current + 1);
    setPage("events");
  }

  const handleSeriesEditConsumed = useCallback(() => {
    setSeriesEditIntent(null);
  }, []);

  // ---------- PEOPLE ----------
  function addPerson(
    input: Omit<Person, "id" | "createdAtIso" | "updatedAtIso">
  ) {
    if (!app) return;

    const trimmedName = input.name.trim();
    if (!trimmedName) return;

    const now = new Date().toISOString();
    const newPerson: Person = {
      id: id(),
      name: trimmedName,
      createdAtIso: now,
      updatedAtIso: now,
    };

    if (input.nickname?.trim()) newPerson.nickname = input.nickname.trim();
    if (input.birthdayMonthDay) newPerson.birthdayMonthDay = input.birthdayMonthDay;
    if (input.relationship?.trim()) newPerson.relationship = input.relationship.trim();
    if (input.likes?.trim()) newPerson.likes = input.likes.trim();
    if (input.dislikes?.trim()) newPerson.dislikes = input.dislikes.trim();
    if (input.giftIdeas?.trim()) newPerson.giftIdeas = input.giftIdeas.trim();
    if (input.notes?.trim()) newPerson.notes = input.notes.trim();
    if (input.lastContactDate) newPerson.lastContactDate = input.lastContactDate;
    if (input.contactCadenceDays !== undefined && input.contactCadenceDays > 0) {
      newPerson.contactCadenceDays = input.contactCadenceDays;
    }

    commit({
      ...app,
      payload: {
        ...app.payload,
        people: [...(app.payload.people ?? []), newPerson],
      },
    });
  }

  function updatePerson(updated: Person) {
    if (!app) return;

    const trimmedName = updated.name.trim();
    if (!trimmedName) return;

    const now = new Date().toISOString();
    const nextPerson: Person = {
      ...updated,
      name: trimmedName,
      updatedAtIso: now,
    };

    if (updated.nickname?.trim()) {
      nextPerson.nickname = updated.nickname.trim();
    } else {
      delete nextPerson.nickname;
    }
    if (updated.birthdayMonthDay) {
      nextPerson.birthdayMonthDay = updated.birthdayMonthDay;
    } else {
      delete nextPerson.birthdayMonthDay;
    }
    if (updated.relationship?.trim()) {
      nextPerson.relationship = updated.relationship.trim();
    } else {
      delete nextPerson.relationship;
    }
    if (updated.likes?.trim()) {
      nextPerson.likes = updated.likes.trim();
    } else {
      delete nextPerson.likes;
    }
    if (updated.dislikes?.trim()) {
      nextPerson.dislikes = updated.dislikes.trim();
    } else {
      delete nextPerson.dislikes;
    }
    if (updated.giftIdeas?.trim()) {
      nextPerson.giftIdeas = updated.giftIdeas.trim();
    } else {
      delete nextPerson.giftIdeas;
    }
    if (updated.notes?.trim()) {
      nextPerson.notes = updated.notes.trim();
    } else {
      delete nextPerson.notes;
    }
    if (updated.lastContactDate) {
      nextPerson.lastContactDate = updated.lastContactDate;
    } else {
      delete nextPerson.lastContactDate;
    }
    if (updated.contactCadenceDays !== undefined && updated.contactCadenceDays > 0) {
      nextPerson.contactCadenceDays = updated.contactCadenceDays;
    } else {
      delete nextPerson.contactCadenceDays;
    }

    const people = (app.payload.people ?? []).map((person) =>
      person.id === updated.id ? nextPerson : person
    );

    const events = (app.payload.events ?? []).map((event) => {
      if (event.personId !== updated.id) return event;
      return { ...event, personName: trimmedName };
    });

    commit({ ...app, payload: { ...app.payload, people, events } });
  }

  function deletePerson(personId: string) {
    if (!app) return;

    const people = (app.payload.people ?? []).filter((person) => person.id !== personId);
    const events = (app.payload.events ?? []).map((event) => {
      if (event.personId !== personId) return event;
      const next = { ...event };
      delete next.personId;
      return next;
    });

    commit({ ...app, payload: { ...app.payload, people, events } });
  }

  function openLinkedEventDraft(personId: string, preset: LinkedEventPreset) {
    setEventDraft({
      personId,
      type: preset.type,
      title: preset.title,
      date: preset.date,
      useCustomPersonName: false,
    });
    setEventDraftKey((current) => current + 1);
    setPage("events");
  }

  const handleEventDraftConsumed = useCallback(() => {
    setEventDraft(null);
  }, []);

  // ---------- CAREER ----------
  function addJobApplication(
    input: Omit<JobApplication, "id" | "createdAtIso" | "updatedAtIso">
  ) {
    if (!app) return;

    const trimmedCompany = input.company.trim();
    const trimmedRole = input.roleTitle.trim();
    if (!trimmedCompany || !trimmedRole) return;

    const now = new Date().toISOString();
    const newApplication: JobApplication = {
      id: id(),
      company: trimmedCompany,
      roleTitle: trimmedRole,
      status: input.status,
      requiredSkillIds: [...input.requiredSkillIds],
      interviews: [...(input.interviews ?? [])],
      createdAtIso: now,
      updatedAtIso: now,
    };

    if (input.salaryMin !== undefined) newApplication.salaryMin = input.salaryMin;
    if (input.salaryMax !== undefined) newApplication.salaryMax = input.salaryMax;
    if (input.location?.trim()) newApplication.location = input.location.trim();
    if (input.remotePolicy) newApplication.remotePolicy = input.remotePolicy;
    if (input.appliedDate) newApplication.appliedDate = input.appliedDate;
    if (input.url?.trim()) newApplication.url = input.url.trim();
    if (input.notes?.trim()) newApplication.notes = input.notes.trim();
    if (input.requiredSkillsText?.trim()) {
      newApplication.requiredSkillsText = input.requiredSkillsText.trim();
    }

    commit({
      ...app,
      payload: {
        ...app.payload,
        jobApplications: [...(app.payload.jobApplications ?? []), newApplication],
      },
    });
  }

  function updateJobApplication(updated: JobApplication) {
    if (!app) return;

    const trimmedCompany = updated.company.trim();
    const trimmedRole = updated.roleTitle.trim();
    if (!trimmedCompany || !trimmedRole) return;

    const now = new Date().toISOString();
    const nextApplication: JobApplication = {
      ...updated,
      company: trimmedCompany,
      roleTitle: trimmedRole,
      requiredSkillIds: [...updated.requiredSkillIds],
      updatedAtIso: now,
    };

    if (updated.salaryMin !== undefined) {
      nextApplication.salaryMin = updated.salaryMin;
    } else {
      delete nextApplication.salaryMin;
    }
    if (updated.salaryMax !== undefined) {
      nextApplication.salaryMax = updated.salaryMax;
    } else {
      delete nextApplication.salaryMax;
    }
    if (updated.location?.trim()) {
      nextApplication.location = updated.location.trim();
    } else {
      delete nextApplication.location;
    }
    if (updated.remotePolicy) {
      nextApplication.remotePolicy = updated.remotePolicy;
    } else {
      delete nextApplication.remotePolicy;
    }
    if (updated.appliedDate) {
      nextApplication.appliedDate = updated.appliedDate;
    } else {
      delete nextApplication.appliedDate;
    }
    if (updated.url?.trim()) {
      nextApplication.url = updated.url.trim();
    } else {
      delete nextApplication.url;
    }
    if (updated.notes?.trim()) {
      nextApplication.notes = updated.notes.trim();
    } else {
      delete nextApplication.notes;
    }
    if (updated.requiredSkillsText?.trim()) {
      nextApplication.requiredSkillsText = updated.requiredSkillsText.trim();
    } else {
      delete nextApplication.requiredSkillsText;
    }

    nextApplication.interviews = [...(updated.interviews ?? [])];

    const jobApplications = (app.payload.jobApplications ?? []).map((application) =>
      application.id === updated.id ? nextApplication : application
    );

    commit({ ...app, payload: { ...app.payload, jobApplications } });
  }

  function deleteJobApplication(applicationId: string) {
    if (!app) return;

    const jobApplications = (app.payload.jobApplications ?? []).filter(
      (application) => application.id !== applicationId
    );
    commit({ ...app, payload: { ...app.payload, jobApplications } });
  }

  function setCareerTarget(input: Omit<CareerTarget, "id" | "updatedAtIso">) {
    if (!app) return;

    const trimmedRole = input.roleTitle.trim();
    if (!trimmedRole) return;

    const now = new Date().toISOString();
    const existing = app.payload.careerTarget;
    const careerTarget: CareerTarget = {
      id: existing?.id ?? id(),
      roleTitle: trimmedRole,
      requiredSkillIds: [...input.requiredSkillIds],
      updatedAtIso: now,
    };

    if (input.company?.trim()) {
      careerTarget.company = input.company.trim();
    }
    if (input.notes?.trim()) {
      careerTarget.notes = input.notes.trim();
    }
    if (input.requiredSkillsText?.trim()) {
      careerTarget.requiredSkillsText = input.requiredSkillsText.trim();
    }

    commit({ ...app, payload: { ...app.payload, careerTarget } });
  }

  function clearCareerTarget() {
    if (!app) return;

    const nextPayload = { ...app.payload };
    delete nextPayload.careerTarget;
    commit({ ...app, payload: nextPayload });
  }

  function setCalendarPreferences(prefs: CalendarColorPreferences | undefined) {
    if (!app) return;

    const nextPayload = { ...app.payload };
    if (!prefs || isCalendarPreferencesEmpty(prefs)) {
      delete nextPayload.calendarPreferences;
    } else {
      nextPayload.calendarPreferences = parseCalendarColorPreferences(prefs);
    }
    commit({ ...app, payload: nextPayload });
  }

  function acknowledgeGlobalLevel(level: number) {
    if (!app) return;
    const current = app.payload.gamificationState ?? {};
    if ((current.lastAcknowledgedGlobalLevel ?? 0) >= level) return;
    const next: GamificationState = {
      ...current,
      lastAcknowledgedGlobalLevel: level,
      updatedAtIso: nowIso(),
    };
    commit({ ...app, payload: { ...app.payload, gamificationState: next } });
  }

  function dismissAchievementNotification(definitionId: string) {
    if (!app) return;
    const current = app.payload.gamificationState ?? {};
    const dismissed = current.dismissedAchievementIds ?? [];
    if (dismissed.includes(definitionId)) return;
    const next: GamificationState = {
      ...current,
      dismissedAchievementIds: [...dismissed, definitionId],
      updatedAtIso: nowIso(),
    };
    commit({ ...app, payload: { ...app.payload, gamificationState: next } });
  }

  // ---------- FITNESS ----------
  function addWorkoutPlan(
    input: Omit<WorkoutPlan, "id" | "createdAtIso" | "updatedAtIso">
  ) {
    if (!app) return;

    const trimmedName = input.name.trim();
    if (!trimmedName || input.exercises.length === 0) return;

    const now = new Date().toISOString();
    const newPlan: WorkoutPlan = {
      id: id(),
      name: trimmedName,
      exercises: input.exercises.map((entry) => ({ ...entry })),
      createdAtIso: now,
      updatedAtIso: now,
    };

    if (input.focus) newPlan.focus = input.focus;
    if (input.notes?.trim()) newPlan.notes = input.notes.trim();
    if (input.schedule) newPlan.schedule = input.schedule;
    if (input.scheduleSeries !== undefined) newPlan.scheduleSeries = input.scheduleSeries;
    if (input.seriesId) newPlan.seriesId = input.seriesId;

    commit({
      ...app,
      payload: {
        ...app.payload,
        workoutPlans: [...(app.payload.workoutPlans ?? []), newPlan],
      },
    });
  }

  function updateWorkoutPlan(updated: WorkoutPlan) {
    if (!app) return;

    const trimmedName = updated.name.trim();
    if (!trimmedName || updated.exercises.length === 0) return;

    const now = new Date().toISOString();
    const nextPlan: WorkoutPlan = {
      ...updated,
      name: trimmedName,
      exercises: updated.exercises.map((entry) => ({ ...entry })),
      updatedAtIso: now,
    };

    if (updated.focus) {
      nextPlan.focus = updated.focus;
    } else {
      delete nextPlan.focus;
    }
    if (updated.notes?.trim()) {
      nextPlan.notes = updated.notes.trim();
    } else {
      delete nextPlan.notes;
    }
    if (updated.schedule) {
      nextPlan.schedule = updated.schedule;
    } else {
      delete nextPlan.schedule;
    }
    if ("scheduleSeries" in updated && updated.scheduleSeries === undefined) {
      delete nextPlan.scheduleSeries;
    } else if (updated.scheduleSeries !== undefined) {
      nextPlan.scheduleSeries = updated.scheduleSeries;
    }
    if (updated.seriesId) {
      nextPlan.seriesId = updated.seriesId;
    } else {
      delete nextPlan.seriesId;
    }

    const workoutPlans = (app.payload.workoutPlans ?? []).map((plan) =>
      plan.id === updated.id ? nextPlan : plan
    );

    commit({ ...app, payload: { ...app.payload, workoutPlans } });
  }

  function deleteWorkoutPlan(planId: string) {
    if (!app) return;

    const workoutPlans = (app.payload.workoutPlans ?? []).filter((plan) => plan.id !== planId);
    const workoutSessions = (app.payload.workoutSessions ?? []).map((session) => {
      if (session.planId !== planId) return session;
      const next = { ...session };
      delete next.planId;
      return next;
    });

    commit({ ...app, payload: { ...app.payload, workoutPlans, workoutSessions } });
  }

  function addWorkoutSession(
    input: Omit<WorkoutSession, "id" | "createdAtIso" | "updatedAtIso">
  ) {
    if (!app) return;

    if (!input.date || input.exercises.length === 0) return;

    const now = new Date().toISOString();
    const newSession: WorkoutSession = {
      id: id(),
      date: input.date,
      exercises: input.exercises.map((entry) => ({ ...entry })),
      completedAtIso: now,
      createdAtIso: now,
      updatedAtIso: now,
    };

    if (input.focus) newSession.focus = input.focus;
    if (input.planId) newSession.planId = input.planId;
    if (input.notes?.trim()) newSession.notes = input.notes.trim();
    if (input.durationMinutes !== undefined) {
      newSession.durationMinutes = input.durationMinutes;
    }

    commit({
      ...app,
      payload: {
        ...app.payload,
        workoutSessions: [...(app.payload.workoutSessions ?? []), newSession],
      },
    });
  }

  function updateWorkoutSession(updated: WorkoutSession) {
    if (!app) return;

    if (!updated.date || updated.exercises.length === 0) return;

    const now = new Date().toISOString();
    const nextSession: WorkoutSession = {
      ...updated,
      exercises: updated.exercises.map((entry) => ({ ...entry })),
      updatedAtIso: now,
    };

    if (updated.focus) {
      nextSession.focus = updated.focus;
    } else {
      delete nextSession.focus;
    }
    if (updated.planId) {
      nextSession.planId = updated.planId;
    } else {
      delete nextSession.planId;
    }
    if (updated.notes?.trim()) {
      nextSession.notes = updated.notes.trim();
    } else {
      delete nextSession.notes;
    }
    if (updated.durationMinutes !== undefined) {
      nextSession.durationMinutes = updated.durationMinutes;
    } else {
      delete nextSession.durationMinutes;
    }
    if (updated.completedAtIso) {
      nextSession.completedAtIso = updated.completedAtIso;
    } else {
      delete nextSession.completedAtIso;
    }

    const workoutSessions = (app.payload.workoutSessions ?? []).map((session) =>
      session.id === updated.id ? nextSession : session
    );

    commit({ ...app, payload: { ...app.payload, workoutSessions } });
  }

  function deleteWorkoutSession(sessionId: string) {
    if (!app) return;

    const workoutSessions = (app.payload.workoutSessions ?? []).filter(
      (session) => session.id !== sessionId
    );
    commit({ ...app, payload: { ...app.payload, workoutSessions } });
  }

  function upsertFocusFeedbackEntry(entry: FocusFeedback) {
    if (!app) return;

    const existing = app.payload.focusFeedback ?? [];
    const next = [
      ...existing.filter((item) => item.focusItemId !== entry.focusItemId),
      entry,
    ];
    commit({ ...app, payload: { ...app.payload, focusFeedback: next } });
  }

  function dismissFocusItem(focusItemId: string, sourceSnapshot?: string) {
    if (!app) return;
    upsertFocusFeedbackEntry(dismissUntilEndOfDay(focusItemId, nowIso(), sourceSnapshot));
  }

  function snoozeFocusItem(focusItemId: string, hours: number, sourceSnapshot?: string) {
    if (!app) return;
    upsertFocusFeedbackEntry(
      buildSnoozeFocusFeedback(focusItemId, nowIso(), hours, sourceSnapshot)
    );
  }

  function snoozeFocusItemUntilTomorrow(focusItemId: string, sourceSnapshot?: string) {
    if (!app) return;
    upsertFocusFeedbackEntry(
      buildSnoozeUntilTomorrowFeedback(focusItemId, nowIso(), sourceSnapshot)
    );
  }

  function restoreAllFocusItems() {
    if (!app) return;
    commit({ ...app, payload: { ...app.payload, focusFeedback: [] } });
  }

  function restoreFocusFeedbackEntry(feedbackId: string) {
    if (!app) return;
    const next = restoreFocusFeedbackItem(app.payload.focusFeedback ?? [], feedbackId);
    commit({ ...app, payload: { ...app.payload, focusFeedback: next } });
  }

  function restoreFocusItemByFocusId(focusItemId: string) {
    if (!app) return;
    const next = removeFocusFeedbackByFocusId(
      app.payload.focusFeedback ?? [],
      focusItemId,
      nowIso()
    );
    commit({ ...app, payload: { ...app.payload, focusFeedback: next } });
  }

  // ---------- UI ----------
  if (dataLoading) {
    return (
      <div style={fullViewportCenter}>
        Loading your data…
      </div>
    );
  }

  if (dataError) {
    return (
      <div style={{ ...fullViewportCenter, padding: "1.5rem", textAlign: "center" }}>
        <p style={{ marginBottom: 12 }}>{dataError}</p>
        <button type="button" onClick={() => void runInitialSync()}>
          Retry
        </button>
      </div>
    );
  }

  if (!app) {
    return null;
  }

  return (
    <>
      <GlobalEffectStyles />
      <ThemeEffectsLayer preferences={appearance.preferences} />
      <AppShell
      lastSavedLabel={lastSavedLabel}
      syncPending={syncPending}
      onSignOut={onSignOut}
      onSaveNow={onSaveNow}
      onExport={onExport}
      onImportClick={() => fileRef.current?.click()}
      fileInputRef={fileRef}
      onPickImportFile={onPickImportFile}
      error={error}
      syncError={syncError}
      onRetryCloudSave={onRetryCloudSave}
      page={page}
      onPageChange={setPage}
    >
      {page === "dashboard" && (
        <DashboardPage
          skills={app.payload.skills}
          sessions={app.payload.sessions ?? []}
          events={app.payload.events ?? []}
          people={app.payload.people ?? []}
          jobApplications={app.payload.jobApplications ?? []}
          careerTarget={app.payload.careerTarget}
          workoutPlans={app.payload.workoutPlans ?? []}
          workoutSessions={app.payload.workoutSessions ?? []}
          focusFeedback={app.payload.focusFeedback ?? []}
          calendarPreferences={app.payload.calendarPreferences}
          gamificationState={app.payload.gamificationState}
          onAcknowledgeGlobalLevel={acknowledgeGlobalLevel}
          onDismissAchievement={dismissAchievementNotification}
          onAddSession={addSession}
          onDismissFocusItem={dismissFocusItem}
          onSnoozeFocusItem={snoozeFocusItem}
          onSnoozeFocusItemUntilTomorrow={snoozeFocusItemUntilTomorrow}
          onRestoreAllFocusItems={restoreAllFocusItems}
          onRestoreFocusFeedbackEntry={restoreFocusFeedbackEntry}
          onRestoreFocusItemByFocusId={restoreFocusItemByFocusId}
          onOpenSkills={() => setPage("skills")}
          onOpenEvents={() => setPage("events")}
          onOpenPeople={() => setPage("people")}
          onOpenCareer={() => setPage("career")}
          onOpenFitness={() => setPage("fitness")}
          onOpenReview={() => setPage("review")}
          onOpenCalendar={() => setPage("calendar")}
        />
      )}

      {page === "calendar" && (
        <CalendarPage
          skills={app.payload.skills}
          events={app.payload.events ?? []}
          people={app.payload.people ?? []}
          jobApplications={app.payload.jobApplications ?? []}
          workoutSessions={app.payload.workoutSessions ?? []}
          workoutPlans={app.payload.workoutPlans ?? []}
          calendarPreferences={app.payload.calendarPreferences}
          onSaveCalendarPreferences={setCalendarPreferences}
          onOpenCareer={() => setPage("career")}
          onEditOccurrence={openSeriesEdit}
          onSkipOccurrence={skipEventOccurrence}
          onMoveOccurrence={moveEventOccurrence}
          onDeleteOccurrencesFromDate={deleteEventOccurrencesFromDate}
          onRescheduleItem={rescheduleLifeEvent}
          onMoveEventDate={moveLifeEventDate}
          onResizeItem={resizeLifeEvent}
          onOpenEventDraft={openCalendarEventDraft}
          onUndoCalendarEvent={applyCalendarEventUndo}
        />
      )}

      {page === "review" && (
        <ReviewPage
          skills={app.payload.skills}
          sessions={app.payload.sessions ?? []}
          events={app.payload.events ?? []}
          people={app.payload.people ?? []}
          jobApplications={app.payload.jobApplications ?? []}
          workoutPlans={app.payload.workoutPlans ?? []}
          workoutSessions={app.payload.workoutSessions ?? []}
          focusFeedback={app.payload.focusFeedback ?? []}
        />
      )}

      {page === "skills" && (
        <SkillsPage
          skills={app.payload.skills}
          sessions={app.payload.sessions}
          onAdd={addSkill}
          onUpdate={updateSkill}
          onSetScheduleSeries={setSkillScheduleSeries}
          onDelete={deleteSkill}
          onAddSession={addSession}
          onDeleteSession={deleteSession}
        />
      )}

      {page === "events" && (
        <EventsPage
          key={
            seriesEditIntent
              ? `series-${seriesEditKey}`
              : eventDraft
                ? `draft-${eventDraftKey}`
                : "events"
          }
          events={app.payload.events ?? []}
          people={app.payload.people ?? []}
          initialDraft={eventDraft}
          initialSeriesEdit={seriesEditIntent}
          onDraftConsumed={handleEventDraftConsumed}
          onSeriesEditConsumed={handleSeriesEditConsumed}
          onAdd={addEvent}
          onUpdate={updateEvent}
          onUpdateEventSeries={updateEventSeries}
          onDelete={deleteEvent}
        />
      )}

      {page === "people" && (
        <PeoplePage
          people={app.payload.people ?? []}
          events={app.payload.events ?? []}
          onAdd={addPerson}
          onUpdate={updatePerson}
          onDelete={deletePerson}
          onCreateLinkedEvent={openLinkedEventDraft}
        />
      )}

      {page === "career" && (
        <CareerPage
          jobApplications={app.payload.jobApplications ?? []}
          careerTarget={app.payload.careerTarget}
          skills={app.payload.skills}
          onAddApplication={addJobApplication}
          onUpdateApplication={updateJobApplication}
          onDeleteApplication={deleteJobApplication}
          onSetCareerTarget={setCareerTarget}
          onClearCareerTarget={clearCareerTarget}
        />
      )}

      {page === "fitness" && (
        <FitnessPage
          workoutPlans={app.payload.workoutPlans ?? []}
          workoutSessions={app.payload.workoutSessions ?? []}
          onAddPlan={addWorkoutPlan}
          onUpdatePlan={updateWorkoutPlan}
          onDeletePlan={deleteWorkoutPlan}
          onAddSession={addWorkoutSession}
          onUpdateSession={updateWorkoutSession}
          onDeleteSession={deleteWorkoutSession}
        />
      )}

      {page === "settings" && <SettingsPage appearance={appearance} />}
      </AppShell>
    </>
  );
}
