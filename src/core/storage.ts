export type AppData = {
  version: 1;
  updatedAtIso: string; // last saved time
  // TODO: add real structures here soon: skills, rules, overrides, sessions, etc.
  // For now: generic but stable.
  payload: Record<string, unknown>;
};

const STORAGE_KEY = "pa.appData.v1";

export function nowIso() {
  return new Date().toISOString();
}

export function loadAppData(): AppData {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return { version: 1, updatedAtIso: nowIso(), payload: {} };
    }
  try {
    const parsed = JSON.parse(raw) as AppData;
    if (parsed?.version !== 1 || typeof parsed.updatedAtIso !== "string" || typeof parsed.payload !== "object") {
      // If format changed or corrupted, start fresh 
      return { version: 1, updatedAtIso: nowIso(), payload: {} };
    }
    return parsed;
  } catch {
    return { version: 1, updatedAtIso: nowIso(), payload: {} };
  }
}

export function saveAppData(data: AppData): AppData {
  const toSave: AppData = { ...data, updatedAtIso: nowIso() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  return toSave;
}

export function exportBackup(data: AppData) {
  const filename = `personal-assistant-backup-${formatForFilename(new Date())}.json`;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

export async function importBackup(file: File): Promise<AppData> {
  const text = await file.text();
  const parsed = JSON.parse(text) as AppData;

  if (parsed?.version !== 1 || typeof parsed.updatedAtIso !== "string" || typeof parsed.payload !== "object") {
    throw new Error("Invalid backup file format (expected version 1).");
  }
  return parsed;
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