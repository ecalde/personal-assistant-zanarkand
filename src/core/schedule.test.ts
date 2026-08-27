import { describe, expect, it } from "vitest";
import {
  formatHHMMTo12HourClock,
  parseFlexibleTimeToHHMM,
} from "./schedule";

describe("parseFlexibleTimeToHHMM", () => {
  it("parses 12-hour times with minutes and meridiem", () => {
    expect(parseFlexibleTimeToHHMM("6:30 PM")).toBe("18:30");
    expect(parseFlexibleTimeToHHMM("6:30 pm")).toBe("18:30");
    expect(parseFlexibleTimeToHHMM("6:30PM")).toBe("18:30");
    expect(parseFlexibleTimeToHHMM("6:30 p.m.")).toBe("18:30");
    expect(parseFlexibleTimeToHHMM("11:00 AM")).toBe("11:00");
    expect(parseFlexibleTimeToHHMM("11:00")).toBe("11:00");
  });

  it("parses hour-only meridiem times and compact forms", () => {
    expect(parseFlexibleTimeToHHMM("6 PM")).toBe("18:00");
    expect(parseFlexibleTimeToHHMM("6pm")).toBe("18:00");
    expect(parseFlexibleTimeToHHMM("630pm")).toBe("18:30");
    expect(parseFlexibleTimeToHHMM("12 AM")).toBe("00:00");
    expect(parseFlexibleTimeToHHMM("12 PM")).toBe("12:00");
  });

  it("parses 24-hour times including HTML time values with seconds", () => {
    expect(parseFlexibleTimeToHHMM("18:30")).toBe("18:30");
    expect(parseFlexibleTimeToHHMM("18:30:00")).toBe("18:30");
    expect(parseFlexibleTimeToHHMM("06:30")).toBe("06:30");
    expect(parseFlexibleTimeToHHMM("0:05")).toBe("00:05");
  });

  it("returns undefined for empty or invalid values", () => {
    expect(parseFlexibleTimeToHHMM("")).toBeUndefined();
    expect(parseFlexibleTimeToHHMM("   ")).toBeUndefined();
    expect(parseFlexibleTimeToHHMM("25:00")).toBeUndefined();
    expect(parseFlexibleTimeToHHMM("6:60 PM")).toBeUndefined();
    expect(parseFlexibleTimeToHHMM("13:00 PM")).toBeUndefined();
    expect(parseFlexibleTimeToHHMM("noon")).toBeUndefined();
  });
});

describe("formatHHMMTo12HourClock", () => {
  it("formats stored HH:MM as a 12-hour clock", () => {
    expect(formatHHMMTo12HourClock("18:30")).toBe("6:30 PM");
    expect(formatHHMMTo12HourClock("06:30")).toBe("6:30 AM");
    expect(formatHHMMTo12HourClock("00:00")).toBe("12:00 AM");
    expect(formatHHMMTo12HourClock("12:00")).toBe("12:00 PM");
    expect(formatHHMMTo12HourClock("11:00")).toBe("11:00 AM");
  });
});
