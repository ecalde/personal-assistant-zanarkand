import { useRef } from "react";
import type { ChangeEvent } from "react";
import { settingsStyles as s } from "./settingsStyles";

export function DataBackupSection({
  lastSavedLabel,
  syncPending,
  onExport,
  onImportFile,
  onSignOut,
}: {
  lastSavedLabel: string;
  syncPending: boolean;
  onExport: () => void;
  onImportFile: (file: File) => void;
  onSignOut?: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function handlePickImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onImportFile(file);
    e.target.value = "";
  }

  return (
    <>
      <section style={s.panel} aria-labelledby="backup-heading">
        <div style={s.panelHeader}>
          <h2 id="backup-heading" style={s.panelTitle}>
            Data & Backup
          </h2>
          <p style={s.panelSubtitle}>
            Changes save automatically to this device and the cloud. Use a JSON
            backup to archive or restore everything at once.
          </p>
        </div>

        <div style={s.effectRow}>
          <div style={s.effectText}>
            <span style={s.effectLabel}>Last saved</span>
            <span style={s.effectDescription}>
              {lastSavedLabel || "Not saved yet"}
              {syncPending ? " · Saving to cloud…" : ""}
            </span>
          </div>
        </div>

        <div style={s.previewButtonRow}>
          <button type="button" style={s.previewButtonPrimary} onClick={onExport}>
            Export Backup
          </button>
          <button
            type="button"
            style={s.previewButtonGhost}
            onClick={() => fileInputRef.current?.click()}
          >
            Import Backup
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            style={{ display: "none" }}
            onChange={handlePickImportFile}
          />
        </div>
      </section>

      {onSignOut && (
        <section style={s.panel} aria-labelledby="account-heading">
          <div style={s.panelHeader}>
            <h2 id="account-heading" style={s.panelTitle}>
              Account
            </h2>
            <p style={s.panelSubtitle}>
              Sign out of this device. Your data stays in the cloud for the next
              sign-in.
            </p>
          </div>
          <div style={s.previewButtonRow}>
            <button type="button" style={s.previewButtonGhost} onClick={onSignOut}>
              Sign out
            </button>
          </div>
        </section>
      )}
    </>
  );
}
