import type { ChangeEvent, ReactNode, RefObject } from "react";
import type { Page } from "../../pages/types";
import { styles } from "../../ui/appStyles";
import { NavButton } from "./NavButton";

export type AppShellProps = {
  lastSavedLabel: string;
  syncPending: boolean;
  onSignOut?: () => void;
  onSaveNow: () => void;
  onExport: () => void;
  onImportClick: () => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onPickImportFile: (e: ChangeEvent<HTMLInputElement>) => void;
  error: string | null;
  syncError: string | null;
  onRetryCloudSave: () => void;
  page: Page;
  onPageChange: (page: Page) => void;
  children: ReactNode;
};

export function AppShell({
  lastSavedLabel,
  syncPending,
  onSignOut,
  onSaveNow,
  onExport,
  onImportClick,
  fileInputRef,
  onPickImportFile,
  error,
  syncError,
  onRetryCloudSave,
  page,
  onPageChange,
  children,
}: AppShellProps) {
  return (
    <div style={styles.shell}>
      <header style={styles.header}>
        <div>
          <div style={styles.title}>Personal Assistant</div>
          <div style={styles.sub}>
            Last saved: <b>{lastSavedLabel}</b>
            {syncPending && (
              <>
                {" "}
                · <span>Saving to cloud…</span>
              </>
            )}
          </div>
        </div>

        <div style={styles.actions}>
          {onSignOut && (
            <button type="button" onClick={onSignOut}>
              Sign out
            </button>
          )}
          <button onClick={onSaveNow}>Save Now</button>
          <button onClick={onExport}>Export Backup</button>
          <button onClick={onImportClick}>Import Backup</button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            style={{ display: "none" }}
            onChange={onPickImportFile}
          />
        </div>
      </header>

      {error && (
        <div style={styles.errorBox}>
          <b>Error:</b> {error}
        </div>
      )}

      {syncError && (
        <div style={styles.errorBox}>
          <b>Cloud save failed:</b> {syncError}{" "}
          <button type="button" onClick={() => void onRetryCloudSave()}>
            Retry cloud save
          </button>
        </div>
      )}

      <nav style={styles.nav}>
        <NavButton active={page === "dashboard"} onClick={() => onPageChange("dashboard")}>
          Dashboard
        </NavButton>
        <NavButton active={page === "skills"} onClick={() => onPageChange("skills")}>
          Skills
        </NavButton>
        <NavButton active={page === "events"} onClick={() => onPageChange("events")}>
          Events
        </NavButton>
        <NavButton active={page === "people"} onClick={() => onPageChange("people")}>
          People
        </NavButton>
        <NavButton active={page === "career"} onClick={() => onPageChange("career")}>
          Career
        </NavButton>
        <NavButton active={page === "fitness"} onClick={() => onPageChange("fitness")}>
          Fitness
        </NavButton>
      </nav>

      <main style={styles.main}>{children}</main>
    </div>
  );
}
