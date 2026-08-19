import type { ReactNode } from "react";
import type { Page } from "../../pages/types";
import { styles } from "../../ui/appStyles";
import { useIsDesktopViewport, useMediaQuery } from "../../ui/useMediaQuery";
import { NavButton } from "./NavButton";
import { NavEmblem } from "./NavEmblem";

export type AppShellProps = {
  lastSavedLabel: string;
  syncPending: boolean;
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
  error,
  syncError,
  onRetryCloudSave,
  page,
  onPageChange,
  children,
}: AppShellProps) {
  const isDesktop = useIsDesktopViewport();
  const isWideMobile = useMediaQuery("(min-width: 640px)");

  const navItems: { id: Page; label: string }[] = [
    { id: "dashboard", label: "Dashboard" },
    { id: "calendar", label: "Calendar" },
    { id: "skills", label: "Skills" },
    { id: "events", label: "Events" },
    { id: "people", label: "People" },
    { id: "career", label: "Career" },
    { id: "fitness", label: "Fitness" },
    { id: "cooking", label: "Cooking" },
    { id: "review", label: "Review" },
    { id: "settings", label: "Settings" },
  ];

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
        style={
          isDesktop
            ? styles.nav
            : {
                ...styles.navMobile,
                ...(isWideMobile ? styles.navMobileWide : {}),
              }
        }
        aria-label="Main navigation"
        className={isDesktop ? undefined : "pa-nav-mobile"}
      >
        {navItems.map(({ id, label }) => {
          const active = page === id;
          return (
            <NavButton
              key={id}
              active={active}
              onClick={() => onPageChange(id)}
              style={
                isDesktop
                  ? undefined
                  : {
                      ...styles.navBtnMobile,
                      ...(active ? styles.navBtnMobileActive : {}),
                    }
              }
            >
              {isDesktop ? (
                label
              ) : (
                <>
                  <NavEmblem page={id} active={active} />
                  <span style={styles.navEmblemLabel}>{label}</span>
                </>
              )}
            </NavButton>
          );
        })}
      </nav>

      <main style={isDesktop ? styles.main : styles.mainMobile}>{children}</main>
    </div>
  );
}
