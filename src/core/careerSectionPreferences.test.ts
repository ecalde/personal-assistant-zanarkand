import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CAREER_SECTION_PREFERENCES_KEY,
  persistCareerSection,
  readCareerSection,
} from "./careerSectionPreferences";

function mockLocalStorage(getItem: ReturnType<typeof vi.fn>, setItem: ReturnType<typeof vi.fn>) {
  const storage = { getItem, setItem };
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", { localStorage: storage });
}

describe("career section preference", () => {
  beforeEach(() => {
    mockLocalStorage(vi.fn(() => null), vi.fn());
  });

  it("returns the fallback when nothing is stored", () => {
    expect(readCareerSection()).toBe("career");
    expect(readCareerSection("school")).toBe("school");
  });

  it("reads a stored school tab", () => {
    const getItem = vi.fn((key: string) =>
      key === CAREER_SECTION_PREFERENCES_KEY ? "school" : null
    );
    mockLocalStorage(getItem, vi.fn());
    expect(readCareerSection()).toBe("school");
  });

  it("ignores unknown stored values", () => {
    const getItem = vi.fn(() => "jobs");
    mockLocalStorage(getItem, vi.fn());
    expect(readCareerSection("career")).toBe("career");
  });

  it("persists the chosen tab", () => {
    const setItem = vi.fn();
    mockLocalStorage(vi.fn(() => null), setItem);
    persistCareerSection("school");
    expect(setItem).toHaveBeenCalledWith(CAREER_SECTION_PREFERENCES_KEY, "school");
  });

  it("reads a stored resume tab", () => {
    const getItem = vi.fn((key: string) =>
      key === CAREER_SECTION_PREFERENCES_KEY ? "resume" : null
    );
    mockLocalStorage(getItem, vi.fn());
    expect(readCareerSection()).toBe("resume");
  });

  it("persists the resume tab", () => {
    const setItem = vi.fn();
    mockLocalStorage(vi.fn(() => null), setItem);
    persistCareerSection("resume");
    expect(setItem).toHaveBeenCalledWith(CAREER_SECTION_PREFERENCES_KEY, "resume");
  });
});
