import { describe, expect, it } from "vitest";
import {
  formatNumber,
  formatUtcCompact,
  formatUtcMonthDay,
  isoToLocal,
  localToIso,
} from "./formatters";

/**
 * The items filter crosses a format boundary: `<input type="datetime-local">` speaks local
 * wall time, the API speaks timezone-aware instants (docs/api.md). A silent regression here
 * is how the filter started sending `since=2026-10-21T17:00` and got nothing back.
 */
describe("localToIso", () => {
  it("reads the input as local time, not UTC", () => {
    const local = "2026-10-22T00:30";
    expect(localToIso(local)).toBe(new Date(local).toISOString());
  });

  it("always emits a timezone-aware instant", () => {
    expect(localToIso("2026-10-22T00:30")).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
  });

  it("treats empty and unparseable input as no filter", () => {
    expect(localToIso("")).toBeUndefined();
    expect(localToIso("not-a-date")).toBeUndefined();
  });
});

describe("isoToLocal", () => {
  it("round-trips back to the same wall time", () => {
    const local = "2026-10-22T00:30";
    expect(isoToLocal(localToIso(local))).toBe(local);
  });

  it("returns an empty string for missing or invalid instants", () => {
    expect(isoToLocal(undefined)).toBe("");
    expect(isoToLocal("")).toBe("");
    expect(isoToLocal("nope")).toBe("");
  });
});

describe("formatUtcCompact", () => {
  it("keeps the UTC clock time and the seconds the caller captured", () => {
    expect(formatUtcCompact("2026-10-22T07:05:09Z")).toContain("07:05:09");
  });

  it("drops the year to buy room in dense tables", () => {
    expect(formatUtcCompact("2026-10-22T07:05:09Z")).not.toContain("2026");
  });
});

describe("formatUtcMonthDay", () => {
  it("reads the axis label in UTC, not the viewer's zone", () => {
    // 00:15 UTC on the 22nd is still the 21st in New York — the axis must say the 22nd.
    expect(formatUtcMonthDay("2026-10-22T00:15:00Z")).toContain("Oct 22");
  });

  it("keeps the year only when it is not the current one", () => {
    const lastYear = new Date(Date.now() - 365 * 24 * 3600 * 1000);
    expect(formatUtcMonthDay(lastYear)).toContain(
      String(lastYear.getUTCFullYear()),
    );
    expect(formatUtcMonthDay(new Date())).not.toContain(
      String(new Date().getUTCFullYear()),
    );
  });
});

describe("formatNumber", () => {
  it("drops fractions on metrics that are counts", () => {
    // Locale-agnostic: the same number, rounded, through the same formatter.
    expect(formatNumber(1234.6)).toBe(
      new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(
        1235,
      ),
    );
  });
});
