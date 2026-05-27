import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppPayload, Skill, Session } from "./core/model";
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
import DashboardPage from "./pages/DashboardPage";
import SkillsPage from "./pages/SkillsPage";
import type { Page } from "./pages/types";
import { fullViewportCenter } from "./ui/appStyles";
import { formatLocal } from "./ui/format";

const REMOTE_DEBOUNCE_MS = 400;

function id() {
  return crypto.randomUUID();
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
    commit({ ...app, payload: { ...app.payload, skills } });
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
          onAddSession={addSession}
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
    </AppShell>
  );
}
