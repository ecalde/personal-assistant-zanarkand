import type { FocusFeedback } from "./model";
import type { FocusItem } from "./focus";
import { addHoursIso, startOfNextLocalDayIso } from "./focus";
import { formatLocalDateKey } from "./timeline";

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

function newFeedbackId(): string {
  return crypto.randomUUID();
}

export function dismissUntilEndOfDay(focusItemId: string, nowIso: string): FocusFeedback {
  return {
    id: newFeedbackId(),
    focusItemId,
    action: "dismissed",
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };
}

export function snoozeFocusItem(
  focusItemId: string,
  nowIso: string,
  hours: number
): FocusFeedback {
  return {
    id: newFeedbackId(),
    focusItemId,
    action: "snoozed",
    untilIso: addHoursIso(nowIso, hours),
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };
}

export function snoozeFocusItemUntilTomorrow(
  focusItemId: string,
  nowIso: string
): FocusFeedback {
  const todayKey = localDateKeyFromIso(nowIso);
  return {
    id: newFeedbackId(),
    focusItemId,
    action: "snoozed",
    untilIso: startOfNextLocalDayIso(todayKey),
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };
}
