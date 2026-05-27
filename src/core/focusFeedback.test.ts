import { describe, expect, it } from "vitest";
import type { FocusItem } from "./focus";
import type { FocusFeedback } from "./model";
import {
  buildHiddenFocusFeedbackItems,
  cleanupExpiredFeedback,
  dismissUntilEndOfDay,
  buildFocusSourceSnapshot,
  filterSuppressedFocusItems,
  formatFocusFeedbackActionLabel,
  formatFocusFeedbackExpiryLabel,
  isFocusItemSuppressed,
  resolveHiddenFocusDisplayLabel,
  restoreFocusFeedbackItem,
  restoreFocusItemByFocusId,
  snoozeFocusItem,
  snoozeFocusItemUntilTomorrow,
} from "./focusFeedback";
import { addHoursIso, startOfNextLocalDayIso } from "./focus";

const TODAY = "2026-05-27";
const NOW_MORNING = "2026-05-27T10:00:00.000Z";
const NEXT_DAY = "2026-05-28T10:00:00.000Z";

function sampleFocusItem(overrides: Partial<FocusItem> = {}): FocusItem {
  return {
    id: "skill:test-skill",
    category: "skill",
    title: "Log time on Test Skill",
    description: "Daily goal incomplete",
    priorityScore: 80,
    urgency: "high",
    urgencyLabel: "High",
    reasonCodes: ["skill_daily_goal_incomplete"],
    ...overrides,
  };
}

function dismissedEntry(
  focusItemId: string,
  createdAtIso: string,
  updatedAtIso?: string
): FocusFeedback {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    focusItemId,
    action: "dismissed",
    createdAtIso,
    updatedAtIso: updatedAtIso ?? createdAtIso,
  };
}

function snoozedEntry(
  focusItemId: string,
  untilIso: string,
  createdAtIso: string,
  updatedAtIso?: string
): FocusFeedback {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    focusItemId,
    action: "snoozed",
    untilIso,
    createdAtIso,
    updatedAtIso: updatedAtIso ?? createdAtIso,
  };
}

describe("focusFeedback", () => {
  describe("dismiss until end of day", () => {
    it("suppresses item for the rest of the local day", () => {
      const item = sampleFocusItem();
      const feedback = [dismissUntilEndOfDay(item.id, NOW_MORNING)];

      expect(isFocusItemSuppressed(item, feedback, NOW_MORNING)).toBe(true);
    });

    it("does not suppress item on the next local day", () => {
      const item = sampleFocusItem();
      const feedback = [dismissUntilEndOfDay(item.id, NOW_MORNING)];

      expect(isFocusItemSuppressed(item, feedback, NEXT_DAY)).toBe(false);
    });
  });

  describe("snooze expiration", () => {
    it("suppresses item before untilIso", () => {
      const item = sampleFocusItem();
      const feedback = [snoozeFocusItem(item.id, NOW_MORNING, 3)];
      const beforeExpiry = addHoursIso(NOW_MORNING, 2);

      expect(isFocusItemSuppressed(item, feedback, beforeExpiry)).toBe(true);
    });

    it("does not suppress item after untilIso", () => {
      const item = sampleFocusItem();
      const feedback = [snoozeFocusItem(item.id, NOW_MORNING, 3)];
      const afterExpiry = addHoursIso(NOW_MORNING, 3);

      expect(isFocusItemSuppressed(item, feedback, afterExpiry)).toBe(false);
    });
  });

  describe("snooze until tomorrow", () => {
    it("suppresses until start of next local day", () => {
      const item = sampleFocusItem();
      const feedback = [snoozeFocusItemUntilTomorrow(item.id, NOW_MORNING)];
      const until = startOfNextLocalDayIso(TODAY);

      expect(isFocusItemSuppressed(item, feedback, NOW_MORNING)).toBe(true);
      expect(isFocusItemSuppressed(item, feedback, until)).toBe(false);
    });
  });

  describe("newest feedback wins", () => {
    it("uses the entry with the latest updatedAtIso", () => {
      const item = sampleFocusItem();
      const olderDismiss = dismissedEntry(item.id, NOW_MORNING, NOW_MORNING);
      const newerSnooze = snoozedEntry(
        item.id,
        addHoursIso(NOW_MORNING, 5),
        NOW_MORNING,
        addHoursIso(NOW_MORNING, 1)
      );
      const feedback = [olderDismiss, newerSnooze];
      const afterSnoozeExpires = addHoursIso(NOW_MORNING, 6);

      expect(isFocusItemSuppressed(item, feedback, afterSnoozeExpires)).toBe(false);
    });
  });

  describe("expired snoozes ignored", () => {
    it("does not suppress when snooze has expired", () => {
      const item = sampleFocusItem();
      const feedback = [
        snoozedEntry(item.id, addHoursIso(NOW_MORNING, 1), NOW_MORNING),
      ];

      expect(isFocusItemSuppressed(item, feedback, addHoursIso(NOW_MORNING, 2))).toBe(false);
    });
  });

  describe("filterSuppressedFocusItems", () => {
    it("removes suppressed items from the list", () => {
      const visible = sampleFocusItem({ id: "skill:visible" });
      const hidden = sampleFocusItem({ id: "skill:hidden" });
      const feedback = [dismissUntilEndOfDay(hidden.id, NOW_MORNING)];

      const result = filterSuppressedFocusItems([visible, hidden], feedback, NOW_MORNING);

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe("skill:visible");
    });
  });

  describe("cleanupExpiredFeedback", () => {
    it("removes stale dismiss entries from prior days", () => {
      const feedback = [dismissedEntry("skill:a", NOW_MORNING)];
      const cleaned = cleanupExpiredFeedback(feedback, NEXT_DAY);

      expect(cleaned).toHaveLength(0);
    });

    it("removes expired snooze entries", () => {
      const feedback = [
        snoozedEntry("skill:a", addHoursIso(NOW_MORNING, 1), NOW_MORNING),
      ];
      const cleaned = cleanupExpiredFeedback(feedback, addHoursIso(NOW_MORNING, 2));

      expect(cleaned).toHaveLength(0);
    });

    it("keeps active feedback entries", () => {
      const feedback = [dismissUntilEndOfDay("skill:a", NOW_MORNING)];
      const cleaned = cleanupExpiredFeedback(feedback, NOW_MORNING);

      expect(cleaned).toHaveLength(1);
    });
  });

  describe("deterministic behavior", () => {
    it("returns the same suppression result for identical inputs", () => {
      const item = sampleFocusItem();
      const feedback = [snoozeFocusItem(item.id, NOW_MORNING, 3)];
      const checkIso = addHoursIso(NOW_MORNING, 1);

      expect(isFocusItemSuppressed(item, feedback, checkIso)).toBe(
        isFocusItemSuppressed(item, feedback, checkIso)
      );
      expect(filterSuppressedFocusItems([item], feedback, checkIso)).toEqual(
        filterSuppressedFocusItems([item], feedback, checkIso)
      );
    });
  });

  describe("sourceSnapshot", () => {
    it("buildFocusSourceSnapshot combines title and description", () => {
      expect(buildFocusSourceSnapshot("Log ML time", "Daily goal incomplete")).toBe(
        "Log ML time\nDaily goal incomplete"
      );
    });

    it("buildFocusSourceSnapshot uses title only when description is empty", () => {
      expect(buildFocusSourceSnapshot("Log ML time", "   ")).toBe("Log ML time");
    });

    it("stores sourceSnapshot on dismiss factory", () => {
      const entry = dismissUntilEndOfDay(
        "skill:test",
        NOW_MORNING,
        "Log ML time\nDaily goal incomplete"
      );
      expect(entry.sourceSnapshot).toBe("Log ML time\nDaily goal incomplete");
    });

    it("does not affect suppression when sourceSnapshot is present", () => {
      const item = sampleFocusItem();
      const feedback = [
        dismissUntilEndOfDay(item.id, NOW_MORNING, "Saved card copy"),
      ];

      expect(isFocusItemSuppressed(item, feedback, NOW_MORNING)).toBe(true);
      expect(filterSuppressedFocusItems([item], feedback, NOW_MORNING)).toHaveLength(0);
    });

    it("omits sourceSnapshot when not provided", () => {
      expect(dismissUntilEndOfDay("skill:test", NOW_MORNING).sourceSnapshot).toBeUndefined();
      expect(snoozeFocusItem("skill:test", NOW_MORNING, 3).sourceSnapshot).toBeUndefined();
      expect(
        snoozeFocusItemUntilTomorrow("skill:test", NOW_MORNING).sourceSnapshot
      ).toBeUndefined();
    });
  });

  describe("buildHiddenFocusFeedbackItems", () => {
    it("returns newest active feedback once per focusItemId", () => {
      const item = sampleFocusItem();
      const olderDismiss = dismissedEntry(
        item.id,
        addHoursIso(NOW_MORNING, -2),
        addHoursIso(NOW_MORNING, -2)
      );
      const newerSnooze = {
        ...snoozedEntry(
          item.id,
          addHoursIso(NOW_MORNING, 5),
          NOW_MORNING,
          addHoursIso(NOW_MORNING, 1)
        ),
        id: "33333333-3333-4333-8333-333333333333",
      };
      const feedback = [olderDismiss, newerSnooze];

      const result = buildHiddenFocusFeedbackItems(feedback, [item], NOW_MORNING);

      expect(result).toHaveLength(1);
      expect(result[0]?.feedback.id).toBe(newerSnooze.id);
      expect(result[0]?.focusItemId).toBe(item.id);
    });

    it("excludes expired entries", () => {
      const activeItem = sampleFocusItem({ id: "skill:active" });
      const expiredItem = sampleFocusItem({ id: "skill:expired" });
      const feedback = [
        dismissUntilEndOfDay(activeItem.id, NOW_MORNING),
        snoozedEntry(
          expiredItem.id,
          addHoursIso(NOW_MORNING, 1),
          addHoursIso(NOW_MORNING, -3)
        ),
      ];
      const now = addHoursIso(NOW_MORNING, 2);

      const result = buildHiddenFocusFeedbackItems(
        feedback,
        [activeItem, expiredItem],
        now
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.focusItemId).toBe(activeItem.id);
    });

    it("precomputes actionLabel and expiryLabel on each DTO", () => {
      const item = sampleFocusItem();
      const feedback = [snoozeFocusItem(item.id, NOW_MORNING, 3, "Log ML time")];

      const result = buildHiddenFocusFeedbackItems(feedback, [item], NOW_MORNING);

      expect(result[0]?.actionLabel).toBe("Snoozed");
      expect(result[0]?.expiryLabel).toMatch(/^Snoozed until /);
      expect(result[0]?.displayLabel).toBe("Log ML time");
    });
  });

  describe("resolveHiddenFocusDisplayLabel", () => {
    it("falls back to Hidden recommendation when sourceSnapshot is missing", () => {
      const entry = dismissedEntry("skill:test-skill", NOW_MORNING);
      expect(resolveHiddenFocusDisplayLabel(entry)).toBe("Hidden recommendation");
    });

    it("uses sourceSnapshot when present", () => {
      const entry = {
        ...dismissUntilEndOfDay("skill:test", NOW_MORNING, "Log ML time"),
      };
      expect(resolveHiddenFocusDisplayLabel(entry)).toBe("Log ML time");
    });
  });

  describe("restoreFocusFeedbackItem", () => {
    it("removes entry by feedback id", () => {
      const keep = dismissedEntry("skill:a", NOW_MORNING);
      const remove = {
        ...dismissedEntry("skill:b", NOW_MORNING),
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      };
      const feedback = [keep, remove];

      const result = restoreFocusFeedbackItem(feedback, remove.id);

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe(keep.id);
    });
  });

  describe("restoreFocusItemByFocusId", () => {
    it("removes only the newest active entry for focusItemId", () => {
      const item = sampleFocusItem();
      const olderDismiss = dismissedEntry(
        item.id,
        addHoursIso(NOW_MORNING, -2),
        addHoursIso(NOW_MORNING, -2)
      );
      const newerSnooze = {
        ...snoozedEntry(
          item.id,
          addHoursIso(NOW_MORNING, 5),
          NOW_MORNING,
          addHoursIso(NOW_MORNING, 1)
        ),
        id: "33333333-3333-4333-8333-333333333333",
      };
      const feedback = [olderDismiss, newerSnooze];

      const result = restoreFocusItemByFocusId(feedback, item.id, NOW_MORNING);

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe(olderDismiss.id);
    });

    it("no-ops when no active entry exists for focusItemId", () => {
      const item = sampleFocusItem();
      const feedback = [
        snoozedEntry(item.id, addHoursIso(NOW_MORNING, 1), NOW_MORNING),
      ];
      const now = addHoursIso(NOW_MORNING, 2);

      const result = restoreFocusItemByFocusId(feedback, item.id, now);

      expect(result).toEqual(feedback);
    });
  });

  describe("formatFocusFeedbackActionLabel", () => {
    it("labels dismissed and snoozed actions", () => {
      expect(formatFocusFeedbackActionLabel("dismissed")).toBe("Dismissed");
      expect(formatFocusFeedbackActionLabel("snoozed")).toBe("Snoozed");
    });
  });

  describe("formatFocusFeedbackExpiryLabel", () => {
    it("labels dismiss expiry as today", () => {
      const entry = dismissUntilEndOfDay("skill:test", NOW_MORNING);
      expect(formatFocusFeedbackExpiryLabel(entry, NOW_MORNING)).toBe("Dismissed today");
    });

    it("labels 3h snooze with local time", () => {
      const entry = snoozeFocusItem("skill:test", NOW_MORNING, 3);
      const label = formatFocusFeedbackExpiryLabel(entry, NOW_MORNING);
      const expectedTime = new Date(entry.untilIso!).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      });
      expect(label).toBe(`Snoozed until ${expectedTime}`);
    });

    it("labels snooze until tomorrow", () => {
      const entry = snoozeFocusItemUntilTomorrow("skill:test", NOW_MORNING);
      expect(formatFocusFeedbackExpiryLabel(entry, NOW_MORNING)).toBe("Snoozed until tomorrow");
    });
  });
});
