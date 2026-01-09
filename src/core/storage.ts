// This is my app's memory system, it is responsible for loading, saving, exporting, and importing app data

import type { AppPayload } from "./model";
import { defaultPayload } from "./state";

export type AppData = {
    version: 1;
    updatedAtIso: string; // last saved time
    payload: AppPayload;
};

const STORAGE_KEY = "pa.appData.v1";

export function nowIso() {
    return new Date().toISOString();
}

function normalizePayload(payload: unknown): AppPayload {
    const base = defaultPayload();

    if (!payload || typeof payload !== "object") return base;

    const p = payload as any;

    return {
        ...base,
        ...p,
        skills: Array.isArray(p.skills) ? p.skills : [],
        sessions: Array.isArray(p.sessions) ? p.sessions : [],
        overrides: Array.isArray(p.overrides) ? p.overrides : [],
    };
}

// Load app data from localStorage, or return default if none exists
export function loadAppData(): AppData {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
        return { version: 1, updatedAtIso: nowIso(), payload: defaultPayload() };
    }

    try {
        const parsed = JSON.parse(raw) as Partial<AppData>;

        const isValid =
        parsed &&
        parsed.version === 1 &&
        typeof parsed.updatedAtIso === "string";

        if (!isValid) {
        return { version: 1, updatedAtIso: nowIso(), payload: defaultPayload() };
        }

        return {
            version: 1,
            updatedAtIso: (typeof parsed.updatedAtIso === "string" ? parsed.updatedAtIso : nowIso()),
            payload: normalizePayload(parsed.payload),
        };
    } catch {
        return { version: 1, updatedAtIso: nowIso(), payload: defaultPayload() };
    }
}

// Save current app data to localStorage, updating the timestamp
export function saveAppData(data: AppData): AppData {
    const toSave: AppData = {
        version: 1,
        updatedAtIso: nowIso(),
        payload: normalizePayload(data.payload),
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
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