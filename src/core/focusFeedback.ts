import type { FocusFeedback, FocusFeedbackAction } from "./model";
import type { FocusItem } from "./focus";
import { addHoursIso, startOfNextLocalDayIso } from "./focus";
import { formatLocalDateKey } from "./timeline";

function formatFeedbackTimeOnly(untilIso: string): string {
  try {
    return new Date(untilIso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return untilIso;
  }
}

function localDateKeyFromIso(iso: string): string {
  return formatLocalDateKey(new Date(iso));
}

export function getLatestFeedbackForItem(
  feedback: FocusFeedback[],
  focusItemId: string
): FocusFeedback | undefined {
  const matches = feedback.filter((entry) => entry.focusItemId === focusItemId);
  if (matches.length === 0) return undefined;

  return matches.reduce((latest, entry) =>
    entry.updatedAtIso.localeCompare(latest.updatedAtIso) > 0 ? entry : latest
  );
}

function isFeedbackActive(entry: FocusFeedback, nowIso: string): boolean {
  if (entry.action === "dismissed") {
    return localDateKeyFromIso(entry.createdAtIso) === localDateKeyFromIso(nowIso);
  }

  if (entry.action === "snoozed" && entry.untilIso !== undefined) {
    return new Date(nowIso).getTime() < new Date(entry.untilIso).getTime();
  }

  return false;
}

export function isFocusItemSuppressed(
  item: FocusItem,
  feedback: FocusFeedback[],
  nowIso: string
): boolean {
  const latest = getLatestFeedbackForItem(feedback, item.id);
  if (!latest) return false;
  return isFeedbackActive(latest, nowIso);
}

export function filterSuppressedFocusItems(
  items: FocusItem[],
  feedback: FocusFeedback[],
  nowIso: string
): FocusItem[] {
  return items.filter((item) => !isFocusItemSuppressed(item, feedback, nowIso));
}

export function cleanupExpiredFeedback(
  feedback: FocusFeedback[],
  nowIso: string
): FocusFeedback[] {
  return feedback.filter((entry) => isFeedbackActive(entry, nowIso));
}

export function countSuppressedFocusItems(
  items: FocusItem[],
  feedback: FocusFeedback[],
  nowIso: string
): number {
  return items.filter((item) => isFocusItemSuppressed(item, feedback, nowIso)).length;
}

export type HiddenFocusFeedbackItem = {
  feedback: FocusFeedback;
  focusItemId: string;
  displayLabel: string;
  actionLabel: string;
  expiryLabel: string;
};

export function buildHiddenFocusFeedbackItems(
  feedback: FocusFeedback[],
  rankedFocusItems: FocusItem[],
  nowIso: string
): HiddenFocusFeedbackItem[] {
  const hidden: HiddenFocusFeedbackItem[] = [];

  for (const item of rankedFocusItems) {
    const latest = getLatestFeedbackForItem(feedback, item.id);
    if (latest && isFeedbackActive(latest, nowIso)) {
      hidden.push({
        feedback: latest,
        focusItemId: latest.focusItemId,
        displayLabel: resolveHiddenFocusDisplayLabel(latest),
        actionLabel: formatFocusFeedbackActionLabel(latest.action),
        expiryLabel: formatFocusFeedbackExpiryLabel(latest, nowIso),
      });
    }
  }

  return hidden.sort((a, b) =>
    b.feedback.createdAtIso.localeCompare(a.feedback.createdAtIso)
  );
}

export function formatFocusFeedbackActionLabel(action: FocusFeedbackAction): string {
  return action === "dismissed" ? "Dismissed" : "Snoozed";
}

export function formatFocusFeedbackExpiryLabel(
  entry: FocusFeedback,
  nowIso: string
): string {
  if (entry.action === "dismissed") {
    return "Dismissed today";
  }

  if (entry.action === "snoozed" && entry.untilIso !== undefined) {
    const todayKey = localDateKeyFromIso(nowIso);
    const tomorrowStart = startOfNextLocalDayIso(todayKey);
    if (entry.untilIso === tomorrowStart) {
      return "Snoozed until tomorrow";
    }
    return `Snoozed until ${formatFeedbackTimeOnly(entry.untilIso)}`;
  }

  return "Snoozed";
}

export function resolveHiddenFocusDisplayLabel(entry: FocusFeedback): string {
  const trimmed = entry.sourceSnapshot?.trim();
  if (trimmed && trimmed.length > 0) return trimmed;
  return "Hidden recommendation";
}

export function restoreFocusFeedbackItem(
  feedback: FocusFeedback[],
  feedbackId: string
): FocusFeedback[] {
  return feedback.filter((entry) => entry.id !== feedbackId);
}

export function restoreFocusItemByFocusId(
  feedback: FocusFeedback[],
  focusItemId: string,
  nowIso: string
): FocusFeedback[] {
  const latest = getLatestFeedbackForItem(feedback, focusItemId);
  if (!latest || !isFeedbackActive(latest, nowIso)) return feedback;
  return feedback.filter((entry) => entry.id !== latest.id);
}

function newFeedbackId(): string {
  return crypto.randomUUID();
}

export function buildFocusSourceSnapshot(title: string, description?: string): string {
  const trimmedTitle = title.trim();
  const trimmedDescription = description?.trim();
  if (trimmedDescription && trimmedDescription.length > 0) {
    return `${trimmedTitle}\n${trimmedDescription}`;
  }
  return trimmedTitle;
}

function withSourceSnapshot(
  entry: FocusFeedback,
  sourceSnapshot?: string
): FocusFeedback {
  const trimmed = sourceSnapshot?.trim();
  if (!trimmed) return entry;
  return { ...entry, sourceSnapshot: trimmed };
}

export function dismissUntilEndOfDay(
  focusItemId: string,
  nowIso: string,
  sourceSnapshot?: string
): FocusFeedback {
  return withSourceSnapshot(
    {
      id: newFeedbackId(),
      focusItemId,
      action: "dismissed",
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    },
    sourceSnapshot
  );
}

export function snoozeFocusItem(
  focusItemId: string,
  nowIso: string,
  hours: number,
  sourceSnapshot?: string
): FocusFeedback {
  return withSourceSnapshot(
    {
      id: newFeedbackId(),
      focusItemId,
      action: "snoozed",
      untilIso: addHoursIso(nowIso, hours),
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    },
    sourceSnapshot
  );
}

export function snoozeFocusItemUntilTomorrow(
  focusItemId: string,
  nowIso: string,
  sourceSnapshot?: string
): FocusFeedback {
  const todayKey = localDateKeyFromIso(nowIso);
  return withSourceSnapshot(
    {
      id: newFeedbackId(),
      focusItemId,
      action: "snoozed",
      untilIso: startOfNextLocalDayIso(todayKey),
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    },
    sourceSnapshot
  );
}
