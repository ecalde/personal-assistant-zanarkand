// This is my app's memory system, it is responsible for loading, saving, exporting, and importing app data

import type { AppPayload } from "./model";
import { sanitizeEventReferences } from "./events";
import { sanitizeSkillReferences } from "./sessions";
import { normalizeGamificationState } from "./progressionModel";
import { defaultPayload } from "./state";

export type AppData = {
    version: 1;
    updatedAtIso: string; // last saved time
    payload: AppPayload;
};

const LEGACY_STORAGE_KEY = "pa.appData.v1";

export function nowIso() {
    return new Date().toISOString();
}

function storageKey(userId?: string): string {
    if (!userId) {
        return LEGACY_STORAGE_KEY;
    }
    return `${LEGACY_STORAGE_KEY}.${userId}`;
}

function defaultAppData(): AppData {
    return { version: 1, updatedAtIso: nowIso(), payload: defaultPayload() };
}

// Exported for unit testing (pure; does not touch browser APIs). Old payloads
// missing newer optional fields (e.g. calendarPreferences) load unchanged.
// Per-event optional fields (e.g. recurrence/seriesId) are preserved as-is
// because the events array is kept intact; deep validation lives in dbMappers.
export function normalizePayload(payload: unknown): AppPayload {
    const base = defaultPayload();

    if (!payload || typeof payload !== "object") return base;

    const p = payload as Record<string, unknown>;

    const normalized: AppPayload = {
        ...base,
        ...p,
        skills: Array.isArray(p.skills) ? p.skills : [],
        sessions: Array.isArray(p.sessions) ? p.sessions : [],
        overrides: Array.isArray(p.overrides) ? p.overrides : [],
        events: Array.isArray(p.events) ? p.events : [],
        people: Array.isArray(p.people) ? p.people : [],
        jobApplications: Array.isArray(p.jobApplications)
            ? (p.jobApplications as AppPayload["jobApplications"]).map((app) => ({
                  ...app,
                  interviews: Array.isArray(app.interviews) ? app.interviews : [],
              }))
            : [],
        careerTarget:
            p.careerTarget &&
            typeof p.careerTarget === "object" &&
            !Array.isArray(p.careerTarget)
                ? (p.careerTarget as AppPayload["careerTarget"])
                : undefined,
        workoutPlans: Array.isArray(p.workoutPlans) ? p.workoutPlans : [],
        workoutSessions: Array.isArray(p.workoutSessions) ? p.workoutSessions : [],
        focusFeedback: Array.isArray(p.focusFeedback) ? p.focusFeedback : [],
        calendarPreferences:
            p.calendarPreferences &&
            typeof p.calendarPreferences === "object" &&
            !Array.isArray(p.calendarPreferences)
                ? (p.calendarPreferences as AppPayload["calendarPreferences"])
                : undefined,
        gamificationState: normalizeGamificationState(p.gamificationState),
    };

    return sanitizeEventReferences(sanitizeSkillReferences(normalized));
}

function parseStoredAppData(raw: string): AppData | null {
    try {
        const parsed = JSON.parse(raw) as Partial<AppData>;

        const isValid =
            parsed &&
            parsed.version === 1 &&
            typeof parsed.updatedAtIso === "string";

        if (!isValid) {
            return null;
        }

        return {
            version: 1,
            updatedAtIso:
                typeof parsed.updatedAtIso === "string" ? parsed.updatedAtIso : nowIso(),
            payload: normalizePayload(parsed.payload),
        };
    } catch {
        return null;
    }
}

function readAppDataFromKey(key: string): AppData | null {
    const raw = localStorage.getItem(key);
    if (!raw) {
        return null;
    }
    return parseStoredAppData(raw);
}

// Load app data from localStorage, or return default if none exists
export function loadAppData(userId?: string): AppData {
    if (userId) {
        const namespaced = readAppDataFromKey(storageKey(userId));
        if (namespaced) {
            return namespaced;
        }

        const legacy = readAppDataFromKey(LEGACY_STORAGE_KEY);
        if (legacy) {
            return legacy;
        }

        return defaultAppData();
    }

    return readAppDataFromKey(LEGACY_STORAGE_KEY) ?? defaultAppData();
}

// Save current app data to localStorage, updating the timestamp
export function saveAppData(data: AppData, userId?: string): AppData {
    const toSave: AppData = {
        version: 1,
        updatedAtIso: nowIso(),
        payload: normalizePayload(data.payload),
    };

    localStorage.setItem(storageKey(userId), JSON.stringify(toSave));
    return toSave;
}

// Export app data as a downloadable JSON file
export function exportBackup(data: AppData) {
    const filename = `personal-assistant-backup-${formatForFilename(new Date())}.json`;
    const safe: AppData = {
        version: 1,
        updatedAtIso: nowIso(),
        payload: normalizePayload(data.payload),
    };

    const blob = new Blob([JSON.stringify(safe, null, 2)], {
        type: "application/json",
    });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
}

// Import app data from a JSON file
export async function importBackup(file: File): Promise<AppData> {
    const text = await file.text();
    const parsed = JSON.parse(text) as Partial<AppData>;

    const isValid =
        parsed &&
        parsed.version === 1 &&
        typeof parsed.updatedAtIso === "string";

    if (!isValid) {
        throw new Error("Invalid backup file format (expected version 1).");
    }

    return {
        version: 1,
        updatedAtIso: (typeof parsed.updatedAtIso === "string" ? parsed.updatedAtIso : nowIso()),
        payload: normalizePayload(parsed.payload),
    };
}

function formatForFilename(d: Date) {
    const pad = (n: number) => String(n).padStart(2, "0");
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const mi = pad(d.getMinutes());
    return `${yyyy}-${mm}-${dd}_${hh}-${mi}`;
}
