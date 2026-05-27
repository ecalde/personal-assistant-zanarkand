import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AppPayload,
  CareerTarget,
  JobApplication,
  LifeEvent,
  Person,
  Skill,
  Session,
} from "./core/model";
import {
  initialSync,
  isRemoteSyncEnabled,
  replaceRemotePayload,
} from "./core/remoteStorage";
import { cloudSafeMessage, loadDataErrorMessage } from "./core/syncErrors";
import type { AppData } from "./core/storage";
import { exportBackup, importBackup, loadAppData, saveAppData } from "./core/storage";
import { defaultWeeklySchedule } from "./core/state";
import { AppShell } from "./components/layout/AppShell";
import CareerPage from "./pages/CareerPage";
import DashboardPage from "./pages/DashboardPage";
import EventsPage, { type EventFormDraft } from "./pages/EventsPage";
import PeoplePage, { type LinkedEventPreset } from "./pages/PeoplePage";
import SkillsPage from "./pages/SkillsPage";
import type { Page } from "./pages/types";
import { fullViewportCenter } from "./ui/appStyles";
import { formatLocal } from "./ui/format";

const REMOTE_DEBOUNCE_MS = 400;

function id() {
  return crypto.randomUUID();
}

function stripSkillIdFromCareerPayload(
  payload: AppPayload,
  skillId: string
): Pick<AppPayload, "jobApplications" | "careerTarget"> {
  const jobApplications = (payload.jobApplications ?? []).map((app) => ({
    ...app,
    requiredSkillIds: app.requiredSkillIds.filter((id) => id !== skillId),
  }));

  let careerTarget = payload.careerTarget;
  if (careerTarget) {
    careerTarget = {
      ...careerTarget,
      requiredSkillIds: careerTarget.requiredSkillIds.filter((id) => id !== skillId),
    };
  }

  return { jobApplications, careerTarget };
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

  const [page, setPage] = useState<Page>("dashboard");
  const [eventDraft, setEventDraft] = useState<EventFormDraft | null>(null);
  const [eventDraftKey, setEventDraftKey] = useState(0);
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
      const data = await initialSync(userId, () => loadAppData(userId));
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
  function addSkill(name: string) {
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
    const skills = app.payload.skills.map((s) =>
      s.id === skillId ? { ...s, ...patch, updatedAtIso: now } : s
    );
    commit({ ...app, payload: { ...app.payload, skills } });
  }

  function deleteSkill(skillId: string) {
    if (!app) return;

    const skills = app.payload.skills.filter((s) => s.id !== skillId);
    const { jobApplications, careerTarget } = stripSkillIdFromCareerPayload(
      app.payload,
      skillId
    );
    commit({
      ...app,
      payload: { ...app.payload, skills, jobApplications, careerTarget },
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
          onAddSession={addSession}
          onOpenCareer={() => setPage("career")}
        />
      )}

      {page === "skills" && (
        <SkillsPage
          skills={app.payload.skills}
          sessions={app.payload.sessions}
          onAdd={addSkill}
          onUpdate={updateSkill}
          onDelete={deleteSkill}
          onAddSession={addSession}
          onDeleteSession={deleteSession}
        />
      )}

      {page === "events" && (
        <EventsPage
          key={eventDraft ? `draft-${eventDraftKey}` : "events"}
          events={app.payload.events ?? []}
          people={app.payload.people ?? []}
          initialDraft={eventDraft}
          onDraftConsumed={handleEventDraftConsumed}
          onAdd={addEvent}
          onUpdate={updateEvent}
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
    </AppShell>
  );
}
