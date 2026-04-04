import { startOfDay, subDays } from "date-fns"

/** Local calendar day as `YYYY-MM-DD`. */
export function toYmdLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/** `{ from, to }` Date objects for the last **n** full days ending yesterday. */
export function lastNDaysDateRange(n: number): { from: Date; to: Date } {
  const to = startOfDay(subDays(new Date(), 1))
  const from = startOfDay(subDays(to, n - 1))
  return { from, to }
}

/**
 * Last **n** full calendar days ending **yesterday** (device timezone).
 * Matches GA “completed days” behaviour used elsewhere in the app.
 */
export function lastNDaysEndingYesterday(n: number): { start: string; end: string } {
  const { from, to } = lastNDaysDateRange(n)
  return { start: toYmdLocal(from), end: toYmdLocal(to) }
}

export type DateRangeYmd = { start: string; end: string }
