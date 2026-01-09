import { useMemo, useRef, useState } from "react";
import type { AppData } from "./core/storage";
import { exportBackup, importBackup, loadAppData, saveAppData } from "./core/storage";

function formatLocal(tsIso: string) {
  try {
    return new Date(tsIso).toLocaleString();
  } catch {
    return tsIso;
  }
}

export default function App() {
  const [data, setData] = useState<AppData>(() => loadAppData());
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const lastSavedLabel = useMemo(() => formatLocal(data.updatedAtIso), [data.updatedAtIso]);

  function onSaveNow() {
    setError(null);
    setData(prev => saveAppData(prev));
  }

  function onExport() {
    setError(null);
    // Make sure we export the latest saved version (optional but nice)
    const saved = saveAppData(data);
    setData(saved);
    exportBackup(saved);
  }

  async function onPickImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const f = e.target.files?.[0];
    if (!f) return;

    try {
      const imported = await importBackup(f);
      // Persist immediately
      const saved = saveAppData(imported);
      setData(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      // allow re-selecting the same file later
      e.target.value = "";
    }
  }

  return (
    <div style={{ padding: "2rem", maxWidth: 800, margin: "0 auto", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto" }}>
      <h1 style={{ marginBottom: 4 }}>Personal Assistant</h1>
      <div style={{ opacity: 0.8, marginBottom: 20 }}>Last saved: <b>{lastSavedLabel}</b></div>

      {error && (
        <div style={{ background: "#ffe6e6", padding: 12, borderRadius: 10, marginBottom: 16 }}>
          <b>Error:</b> {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <button onClick={onSaveNow}>Save Now</button>
        <button onClick={onExport}>Export Backup</button>
        <button onClick={() => fileRef.current?.click()}>Import Backup</button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          style={{ display: "none" }}
          onChange={onPickImportFile}
        />
      </div>

      <div style={{ background: "#f6f6f6", padding: 16, borderRadius: 12 }}>
        <div style={{ marginBottom: 8 }}><b>Debug view (payload)</b></div>
        <pre style={{ margin: 0, overflowX: "auto" }}>{JSON.stringify(data.payload, null, 2)}</pre>
      </div>

      <div style={{ marginTop: 18, opacity: 0.8 }}>
        Next: we’ll replace <code>payload</code> with real structures (skills, schedules, overrides, sessions) while keeping this same storage system.
      </div>
    </div>
  );
}