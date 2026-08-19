import { useCallback, useEffect, useState } from "react";
import type { CookingSession, CookingTimer, Recipe } from "../../core/model";
import {
  advanceStep,
  applyTimerOp,
  pauseTimer,
  rehydrateCookingSession,
  restartTimer,
  resumeTimer,
  retreatStep,
  startTimer,
  tickSession,
} from "../../core/cookingSession";
import {
  readActiveCookingSessionMirror,
  writeActiveCookingSessionMirror,
} from "../../core/cookingSessionStorage";

export function useCookingNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const tick = () => setNow(new Date());
    const id = window.setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [intervalMs]);

  return now;
}

export type UseCookingSessionResult = {
  now: Date;
  alerts: CookingTimer[];
  dismissAlert: (timerId: string) => void;
  start: (timerId: string) => void;
  pause: (timerId: string) => void;
  resume: (timerId: string) => void;
  restart: (timerId: string) => void;
  next: () => void;
  back: () => void;
};

export function useCookingSession({
  session,
  recipe,
  onChange,
}: {
  session: CookingSession;
  recipe: Recipe;
  onChange: (next: CookingSession) => void;
}): UseCookingSessionResult {
  const now = useCookingNow();
  const [alerts, setAlerts] = useState<CookingTimer[]>([]);

  const persist = useCallback(
    (next: CookingSession) => {
      writeActiveCookingSessionMirror(next);
      onChange(next);
    },
    [onChange]
  );

  const pushAlerts = useCallback((timers: CookingTimer[]) => {
    if (timers.length === 0) return;
    setAlerts((current) => {
      const seen = new Set(current.map((timer) => timer.id));
      const extra = timers.filter((timer) => !seen.has(timer.id));
      return extra.length === 0 ? current : [...current, ...extra];
    });
  }, []);

  useEffect(() => {
    const local = readActiveCookingSessionMirror();
    const localForThis = local?.id === session.id ? local : undefined;
    const result = rehydrateCookingSession(session, localForThis, new Date());
    if (!result.session) return;
    writeActiveCookingSessionMirror(result.session);
    if (result.changed || (localForThis && localForThis.updatedAtIso > session.updatedAtIso)) {
      persist(result.session);
    }
    pushAlerts(result.newlyDone);
    // Rehydrate once per session identity. Timer ticks persist afterward.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount/id only
  }, [session.id]);

  useEffect(() => {
    const result = tickSession(session, now);
    if (!result.changed) return;
    persist(result.session);
    pushAlerts(result.newlyDone);
  }, [now, session, persist, pushAlerts]);

  const start = useCallback(
    (timerId: string) => {
      persist(applyTimerOp(session, timerId, (timer) => startTimer(timer, new Date())));
    },
    [persist, session]
  );
  const pause = useCallback(
    (timerId: string) => {
      persist(applyTimerOp(session, timerId, (timer) => pauseTimer(timer, new Date())));
    },
    [persist, session]
  );
  const resume = useCallback(
    (timerId: string) => {
      persist(applyTimerOp(session, timerId, (timer) => resumeTimer(timer, new Date())));
    },
    [persist, session]
  );
  const restart = useCallback(
    (timerId: string) => {
      persist(applyTimerOp(session, timerId, (timer) => restartTimer(timer, new Date())));
    },
    [persist, session]
  );
  const next = useCallback(() => {
    const advanced = advanceStep(session, recipe);
    if (advanced) persist(advanced);
  }, [persist, recipe, session]);
  const back = useCallback(() => {
    persist(retreatStep(session, recipe));
  }, [persist, recipe, session]);

  const dismissAlert = useCallback((timerId: string) => {
    setAlerts((current) => current.filter((timer) => timer.id !== timerId));
  }, []);

  return { now, alerts, dismissAlert, start, pause, resume, restart, next, back };
}
