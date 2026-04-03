import { addDays, differenceInCalendarDays } from "date-fns"

/**
 * Parse YYYY-MM-DD as a civil calendar date in UTC (not the server's local TZ).
 * GA date-range strings are calendar days; using server local Date caused off-by-one
 * vs Analytics when the API host timezone ≠ reporting context.
 */
export function parseYmdUTC(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number)
  if (!y || !m || !d) {
    return new Date(NaN)
  }
  return new Date(Date.UTC(y, m - 1, d))
}

export function formatYmdUTC(d: Date): string {
  const y = d.getUTCFullYear()
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0")
  const day = String(d.getUTCDate()).padStart(2, "0")
  return `${y}-${mo}-${day}`
}

/**
 * Same length period immediately before [startYmd, endYmd] (both inclusive).
 * Matches GA4 "Previous period" for a custom range.
 */
export function getPreviousRange(startYmd: string, endYmd: string): {
  start: string
  end: string
} {
  const start = parseYmdUTC(startYmd)
  const end = parseYmdUTC(endYmd)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { start: startYmd, end: endYmd }
  }

  const daySpan = differenceInCalendarDays(end, start)
  const prevEnd = addDays(start, -1)
  const prevStart = addDays(prevEnd, -daySpan)

  return {
    start: formatYmdUTC(prevStart),
    end: formatYmdUTC(prevEnd),
  }
}
