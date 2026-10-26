/**
 * Renders an API instant as local time, with the exact UTC instant available as the
 * title (hover) — all datetimes in the API are timezone-aware UTC (spec §5).
 */
export function formatInstant(iso: string): string {
  const instant = new Date(iso);
  return instant.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatUtc(iso: string): string {
  return new Date(iso).toISOString();
}

/**
 * A table-friendly UTC instant, for the "Captured at (UTC)" fallback table. Seconds stay
 * because capture frequency can be sub-minute; the raw ISO remains available on hover.
 */
export function formatUtcCompact(iso: string): string {
  const instant = new Date(iso);
  const date = instant.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const time = instant.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
  return `${date}, ${time}`;
}

/**
 * A table-friendly instant: no year, no seconds. The full instant stays available in the
 * `title` so nothing is lost — this only buys horizontal room in dense tables.
 */
export function formatCompactInstant(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** A missing publication time sorts last in the API; the UI must say so, not hide it. */
export function formatPublished(iso: string | null): string {
  return iso === null ? "no publication time" : formatInstant(iso);
}

/**
 * `<input type="datetime-local">` speaks local wall time; the API requires a timezone-aware
 * instant (docs/api.md). These two are what keep the "since/until" filter usable: without
 * them the raw wall-clock string is rejected or silently misread as UTC.
 */
export function localToIso(local: string): string | undefined {
  if (!local) return undefined;
  const parsed = new Date(local);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

/** The inverse of {@link localToIso}, for feeding a stored filter value back into the input. */
export function isoToLocal(iso: string | undefined): string {
  if (!iso) return "";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(
    parsed.getDate(),
  )}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}

/**
 * A rough age, for context next to the exact instant — "how fresh is this" at a glance.
 * Falls back to the full formatting for anything beyond a week.
 */
export function formatRelative(iso: string): string {
  const instant = new Date(iso).getTime();
  if (Number.isNaN(instant)) return formatInstant(iso);

  const seconds = Math.round((Date.now() - instant) / 1000);
  const future = seconds < 0;
  const elapsed = Math.abs(seconds);

  if (elapsed < 45) return future ? "in a moment" : "just now";

  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const sign = future ? 1 : -1;

  if (elapsed < 3600) {
    return rtf.format(sign * Math.round(elapsed / 60), "minute");
  }
  if (elapsed < 86400) {
    return rtf.format(sign * Math.round(elapsed / 3600), "hour");
  }
  if (elapsed < 604800) {
    return rtf.format(sign * Math.round(elapsed / 86400), "day");
  }
  return rtf.format(sign * Math.round(elapsed / 604800), "week");
}

/**
 * The chart's x-axis labels: UTC month + day, with the year only when it is not the
 * current one. UTC matches how `captured_at` is stored (spec §5), so the label never
 * shifts a capture across a date boundary the way the viewer's local zone would.
 */
export function formatUtcMonthDay(value: string | number | Date): string {
  const date = new Date(value);
  const options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  };
  if (date.getUTCFullYear() !== new Date().getUTCFullYear()) {
    options.year = "numeric";
  }
  return date.toLocaleDateString(undefined, options);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(
    value,
  );
}
