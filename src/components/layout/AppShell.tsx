import { useEffect, useRef } from "react";
import type { ChangeEvent, ReactNode, RefObject } from "react";
import type { Page } from "../../pages/types";
import { styles } from "../../ui/appStyles";
import { useIsDesktopViewport } from "../../ui/useMediaQuery";
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
  const isDesktop = useIsDesktopViewport();
  const activeNavRef = useRef<HTMLButtonElement>(null);

  const navItems: { id: Page; label: string }[] = [
    { id: "dashboard", label: "Dashboard" },
    { id: "calendar", label: "Calendar" },
    { id: "skills", label: "Skills" },
    { id: "events", label: "Events" },
    { id: "people", label: "People" },
    { id: "career", label: "Career" },
    { id: "fitness", label: "Fitness" },
    { id: "review", label: "Review" },
    { id: "settings", label: "Settings" },
  ];

  useEffect(() => {
    if (isDesktop || !activeNavRef.current) return;
    activeNavRef.current.scrollIntoView({
      inline: "center",
      block: "nearest",
      behavior: "smooth",
    });
  }, [page, isDesktop]);

  return (
    <div style={{ ...styles.shell, ...(isDesktop ? {} : styles.shellMobile) }}>
      <header style={styles.header}>
        <div>
          <div style={styles.title}>Zanarkand</div>
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
            <button type="button" style={styles.actionBtn} onClick={onSignOut}>
              Sign out
            </button>
          )}
          <button type="button" style={styles.actionBtn} onClick={onSaveNow}>
            Save Now
          </button>
          <button type="button" style={styles.actionBtn} onClick={onExport}>
            Export Backup
          </button>
          <button type="button" style={styles.actionBtn} onClick={onImportClick}>
            Import Backup
          </button>
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
          <button type="button" style={styles.smallBtn} onClick={() => void onRetryCloudSave()}>
            Retry cloud save
          </button>
        </div>
      )}

      <nav
        style={isDesktop ? styles.nav : styles.navMobile}
        aria-label="Main navigation"
        className={isDesktop ? undefined : "pa-nav-mobile"}
      >
        {navItems.map(({ id, label }) => (
          <NavButton
            key={id}
            active={page === id}
            onClick={() => onPageChange(id)}
            style={isDesktop ? undefined : styles.navBtnMobile}
            buttonRef={page === id ? activeNavRef : undefined}
          >
            {label}
          </NavButton>
        ))}
      </nav>

      <main style={isDesktop ? styles.main : styles.mainMobile}>{children}</main>
    </div>
  );
}
