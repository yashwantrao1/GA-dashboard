/**
 * GA4 “Reports snapshot” payloads — one function per card.
 * Called from `pages/api/ga_api.ts` when `type=snapshot_*`.
 */

import { BetaAnalyticsDataClient } from "@google-analytics/data"
import { addDays, format, parseISO, subDays } from "date-fns"

type GaDataClient = InstanceType<typeof BetaAnalyticsDataClient>

/** Passed to GA `runReport` `dateRanges` (absolute `YYYY-MM-DD` or GA relative tokens). */
export type GaReportDateRange = { startDate: string; endDate: string }

/** Reads optional `start` / `end` query params on snapshot API calls. */
export function parseSnapshotDatesFromRequest(
  query: Record<string, string | string[] | undefined>,
): GaReportDateRange {
  const pick = (v: string | string[] | undefined): string | undefined => {
    if (typeof v === "string") {
      return v
    }
    if (Array.isArray(v) && v[0] != null) {
      return String(v[0])
    }
    return undefined
  }
  const s = pick(query.start)
  const e = pick(query.end)
  if (
    s &&
    e &&
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    /^\d{4}-\d{2}-\d{2}$/.test(e)
  ) {
    return { startDate: s, endDate: e }
  }
  return { startDate: "28daysAgo", endDate: "yesterday" }
}

function isAbsoluteGaRange(d: GaReportDateRange): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(d.startDate) &&
    /^\d{4}-\d{2}-\d{2}$/.test(d.endDate)
  )
}

/** GA4 `date` dimension → `YYYY-MM-DD` for charts */
export function snapshotNormalizeDate(value: string): string {
  const v = value.trim()
  if (/^\d{8}$/.test(v)) {
    return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`
  }
  return v
}

function rowDateMetric(
  response: { rows?: unknown[] | null } | null | undefined,
  metricIndex = 0,
): { date: string; value: number }[] {
  const rows = response?.rows ?? []
  return rows.map((row: any) => {
    const rawDate = row.dimensionValues?.[0]?.value ?? ""
    const mv = row.metricValues?.[metricIndex]?.value ?? "0"
    return {
      date: snapshotNormalizeDate(rawDate),
      value: Number(mv),
    }
  })
}

/** Every calendar day from start→end inclusive (`YYYY-MM-DD`). */
function enumerateInclusiveYmd(startYmd: string, endYmd: string): string[] {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(startYmd) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(endYmd)
  ) {
    return []
  }
  const out: string[] = []
  let cur = parseISO(`${startYmd}T12:00:00`)
  const end = parseISO(`${endYmd}T12:00:00`)
  if (cur.getTime() > end.getTime()) {
    return []
  }
  while (cur.getTime() <= end.getTime()) {
    out.push(format(cur, "yyyy-MM-dd"))
    cur = addDays(cur, 1)
  }
  return out
}

function minMaxYmdFromSeries(
  lists: { date: string; value: number }[][],
): { start: string; end: string } | null {
  const dates = lists
    .flatMap((l) => l.map((r) => r.date))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
  if (!dates.length) {
    return null
  }
  const sorted = [...new Set(dates)].sort()
  return { start: sorted[0]!, end: sorted[sorted.length - 1]! }
}

/** One row per day in range; missing days → 0 (chart lines stay continuous). */
function fillDailySeriesGaps(
  points: { date: string; value: number }[],
  startYmd: string,
  endYmd: string,
): { date: string; value: number }[] {
  const map = new Map(points.map((p) => [p.date, p.value]))
  const days = enumerateInclusiveYmd(startYmd, endYmd)
  if (!days.length) {
    return points
  }
  return days.map((date) => ({ date, value: map.get(date) ?? 0 }))
}

// ---------------------------------------------------------------------------
// Card 1 — Main summary: tabs Active users / New users / Avg engagement time
// API: type=snapshot_main_metric
// ---------------------------------------------------------------------------
export async function snapshotMainMetric(
  client: GaDataClient,
  property: string,
  dates: GaReportDateRange,
) {
  const [response] = await client.runReport({
    property: `properties/${property}`,
    dateRanges: [{ startDate: dates.startDate, endDate: dates.endDate }],
    dimensions: [{ name: "date" }],
    metrics: [
      { name: "activeUsers" },
      { name: "newUsers" },
      { name: "averageSessionDuration" },
    ],
    orderBys: [{ dimension: { dimensionName: "date" } }],
    keepEmptyRows: true,
  })

  const rows = response.rows ?? []
  const activeUsers: { date: string; value: number }[] = []
  const newUsers: { date: string; value: number }[] = []
  const avgSession: { date: string; value: number }[] = []

  for (const row of rows as any[]) {
    const rawDate = row.dimensionValues?.[0]?.value ?? ""
    const date = snapshotNormalizeDate(rawDate)
    const m = row.metricValues ?? []
    activeUsers.push({ date, value: Number(m[0]?.value ?? 0) })
    newUsers.push({ date, value: Number(m[1]?.value ?? 0) })
    avgSession.push({ date, value: Number(m[2]?.value ?? 0) })
  }

  const sum = (arr: { value: number }[]) =>
    arr.reduce((a, r) => a + r.value, 0)
  const avg = (arr: { value: number }[]) =>
    arr.length ? sum(arr) / arr.length : 0

  /** Totals from GA rows only (padding days with 0 must not change these). */
  const totals = {
    activeUsers: sum(activeUsers),
    newUsers: sum(newUsers),
    /** Seconds — client formats as mm:ss */
    averageSessionDuration: avg(avgSession),
  }

  const span = isAbsoluteGaRange(dates)
    ? { start: dates.startDate, end: dates.endDate }
    : minMaxYmdFromSeries([activeUsers, newUsers, avgSession])

  let seriesActive = activeUsers
  let seriesNew = newUsers
  let seriesAvg = avgSession
  if (span?.start && span?.end) {
    seriesActive = fillDailySeriesGaps(activeUsers, span.start, span.end)
    seriesNew = fillDailySeriesGaps(newUsers, span.start, span.end)
    seriesAvg = fillDailySeriesGaps(avgSession, span.start, span.end)
  }

  return {
    series: {
      activeUsers: seriesActive,
      newUsers: seriesNew,
      averageSessionDuration: seriesAvg,
    },
    totals,
  }
}

// ---------------------------------------------------------------------------
// Card 2 — Realtime (last ~30 min): total, per-minute bars, top countries
// API: type=snapshot_realtime
// ---------------------------------------------------------------------------
export async function snapshotRealtime(
  client: GaDataClient,
  property: string,
) {
  let totalActive = 0
  const byMinute: { label: string; value: number }[] = []
  const topCountries: { country: string; users: number }[] = []

  try {
    const [totals] = await client.runRealtimeReport({
      property: `properties/${property}`,
      metrics: [{ name: "activeUsers" }],
    })
    const v = totals.rows?.[0]?.metricValues?.[0]?.value
    totalActive = Number(v ?? 0)
  } catch {
    totalActive = 0
  }

  try {
    const [byMin] = await client.runRealtimeReport({
      property: `properties/${property}`,
      dimensions: [{ name: "minutesAgo" }],
      metrics: [{ name: "activeUsers" }],
      orderBys: [
        {
          dimension: {
            dimensionName: "minutesAgo",
            orderType: "NUMERIC",
          },
          desc: true,
        },
      ],
      limit: 30,
    })
    for (const row of (byMin.rows ?? []) as any[]) {
      const label = row.dimensionValues?.[0]?.value ?? ""
      const val = Number(row.metricValues?.[0]?.value ?? 0)
      byMinute.push({ label, value: val })
    }
  } catch {
    /* dimension may be unavailable for some properties */
  }

  try {
    const [countries] = await client.runRealtimeReport({
      property: `properties/${property}`,
      dimensions: [{ name: "country" }],
      metrics: [{ name: "activeUsers" }],
      orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
      limit: 5,
    })
    for (const row of (countries.rows ?? []) as any[]) {
      topCountries.push({
        country: row.dimensionValues?.[0]?.value ?? "(not set)",
        users: Number(row.metricValues?.[0]?.value ?? 0),
      })
    }
  } catch {
    /* ignore */
  }

  return { totalActive, byMinute, topCountries }
}

// ---------------------------------------------------------------------------
// Card 3 — Insights placeholder (no GA query; marketing copy only)
// API: type=snapshot_insights
// ---------------------------------------------------------------------------
export function snapshotInsights() {
  return {
    insights: [] as string[],
    message: "Your insights will appear here soon.",
  }
}

// ---------------------------------------------------------------------------
// Card 4 — New users by default channel group (horizontal bars)
// API: type=snapshot_new_users_by_channel
// ---------------------------------------------------------------------------
export async function snapshotNewUsersByChannel(
  client: GaDataClient,
  property: string,
  dates: GaReportDateRange,
) {
  const [response] = await client.runReport({
    property: `properties/${property}`,
    dateRanges: [{ startDate: dates.startDate, endDate: dates.endDate }],
    dimensions: [{ name: "sessionDefaultChannelGrouping" }],
    metrics: [{ name: "newUsers" }],
    orderBys: [{ metric: { metricName: "newUsers" }, desc: true }],
    limit: 12,
  })

  const rows = (response.rows ?? []) as any[]
  return {
    rows: rows.map((row) => ({
      channel: row.dimensionValues?.[0]?.value ?? "(not set)",
      newUsers: Number(row.metricValues?.[0]?.value ?? 0),
    })),
  }
}

// ---------------------------------------------------------------------------
// Card 5 — Sessions by channel (table)
// API: type=snapshot_sessions_by_channel
// ---------------------------------------------------------------------------
export async function snapshotSessionsByChannel(
  client: GaDataClient,
  property: string,
  dates: GaReportDateRange,
) {
  const [response] = await client.runReport({
    property: `properties/${property}`,
    dateRanges: [{ startDate: dates.startDate, endDate: dates.endDate }],
    dimensions: [{ name: "sessionDefaultChannelGrouping" }],
    metrics: [{ name: "sessions" }],
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    limit: 12,
  })

  const rows = (response.rows ?? []) as any[]
  return {
    rows: rows.map((row) => ({
      channel: row.dimensionValues?.[0]?.value ?? "(not set)",
      sessions: Number(row.metricValues?.[0]?.value ?? 0),
    })),
  }
}

// ---------------------------------------------------------------------------
// Card 6 — Active users by country (map is visual-only on client; data here)
// API: type=snapshot_users_by_country
// ---------------------------------------------------------------------------
export async function snapshotUsersByCountry(
  client: GaDataClient,
  property: string,
  dates: GaReportDateRange,
) {
  const [response] = await client.runReport({
    property: `properties/${property}`,
    dateRanges: [{ startDate: dates.startDate, endDate: dates.endDate }],
    dimensions: [{ name: "country" }],
    metrics: [{ name: "activeUsers" }],
    orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
    limit: 20,
  })

  const rows = (response.rows ?? []) as any[]
  return {
    rows: rows.map((row) => ({
      country: row.dimensionValues?.[0]?.value ?? "(not set)",
      activeUsers: Number(row.metricValues?.[0]?.value ?? 0),
    })),
  }
}

// ---------------------------------------------------------------------------
// Card 7 — User activity over time: 30d / 7d / 1d daily active users (3 lines)
// API: type=snapshot_user_activity_over_time
// Merges three date windows onto one timeline (nullable where out of range).
// ---------------------------------------------------------------------------
export async function snapshotUserActivityOverTime(
  client: GaDataClient,
  property: string,
  dates: GaReportDateRange,
) {
  let endD: string
  let s30: string
  let s7: string
  let s1: string

  if (isAbsoluteGaRange(dates)) {
    endD = dates.endDate
    const endDateObj = parseISO(dates.endDate)
    s30 = format(subDays(endDateObj, 29), "yyyy-MM-dd")
    s7 = format(subDays(endDateObj, 6), "yyyy-MM-dd")
    s1 = dates.endDate
  } else {
    endD = "yesterday"
    s30 = "30daysAgo"
    s7 = "7daysAgo"
    s1 = "1daysAgo"
  }

  async function dailyActive(startDate: string, endDate: string) {
    const [r] = await client.runReport({
      property: `properties/${property}`,
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "date" }],
      metrics: [{ name: "activeUsers" }],
      orderBys: [{ dimension: { dimensionName: "date" } }],
      keepEmptyRows: true,
    })
    return rowDateMetric(r, 0)
  }

  async function totalActiveUsers(startDate: string, endDate: string) {
    const [r] = await client.runReport({
      property: `properties/${property}`,
      dateRanges: [{ startDate, endDate }],
      metrics: [{ name: "activeUsers" }],
    })
    return Number(r.rows?.[0]?.metricValues?.[0]?.value ?? 0)
  }

  const [series30, series7, series1, legend30, legend7, legend1] =
    await Promise.all([
      dailyActive(s30, endD),
      dailyActive(s7, endD),
      dailyActive(s1, endD),
      totalActiveUsers(s30, endD),
      totalActiveUsers(s7, endD),
      totalActiveUsers(s1, endD),
    ])

  const byDate = new Map<
    string,
    { u30: number | null; u7: number | null; u1: number | null }
  >()

  for (const { date, value } of series30) {
    byDate.set(date, { u30: value, u7: null, u1: null })
  }
  for (const { date, value } of series7) {
    const cur = byDate.get(date) ?? { u30: null, u7: null, u1: null }
    cur.u7 = value
    byDate.set(date, cur)
  }
  for (const { date, value } of series1) {
    const cur = byDate.get(date) ?? { u30: null, u7: null, u1: null }
    cur.u1 = value
    byDate.set(date, cur)
  }

  const chart = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date,
      days30: v.u30,
      days7: v.u7,
      days1: v.u1,
    }))

  const last = (arr: { date: string; value: number }[]) =>
    arr.length ? arr[arr.length - 1]!.value : 0

  return {
    chart,
    /** Unique active users over each whole window (matches GA-style totals). */
    legendTotals: {
      days30: legend30,
      days7: legend7,
      days1: legend1,
    },
    lastPoint: {
      days30: last(series30),
      days7: last(series7),
      days1: last(series1),
    },
  }
}

// ---------------------------------------------------------------------------
// Card 8 — User activity by cohort (retention-style matrix when API allows)
// API: type=snapshot_cohort_retention
// ---------------------------------------------------------------------------
export async function snapshotCohortRetention(
  client: GaDataClient,
  property: string,
  dates: GaReportDateRange,
) {
  try {
    const [response] = await client.runReport({
      property: `properties/${property}`,
      dateRanges: [{ startDate: dates.startDate, endDate: dates.endDate }],
      dimensions: [{ name: "cohort" }, { name: "cohortNthWeek" }],
      metrics: [{ name: "cohortActiveUsers" }],
      cohortSpec: {
        cohorts: [
          {
            name: "cohort_weekly",
            dimension: "firstSessionDate",
            dateRange: {
              startDate: dates.startDate,
              endDate: dates.endDate,
            },
          },
        ],
        cohortsRange: {
          granularity: "WEEKLY",
          startOffset: 0,
          endOffset: 5,
        },
      },
      limit: 250,
    })

    const cohorts = new Map<
      string,
      { week: number; users: number }[]
    >()

    for (const row of (response.rows ?? []) as any[]) {
      const cohortName = row.dimensionValues?.[0]?.value ?? ""
      const weekRaw = row.dimensionValues?.[1]?.value ?? "0"
      const week = Number(weekRaw)
      const users = Number(row.metricValues?.[0]?.value ?? 0)
      if (!cohorts.has(cohortName)) {
        cohorts.set(cohortName, [])
      }
      cohorts.get(cohortName)!.push({ week, users })
    }

    const rowLabels = [...cohorts.keys()].slice(0, 8)
    const colLabels = ["Week 0", "Week 1", "Week 2", "Week 3", "Week 4", "Week 5"]
    const matrix: number[][] = rowLabels.map((label) => {
      const cells = cohorts.get(label) ?? []
      const byWeek = new Map(cells.map((c) => [c.week, c.users]))
      return [0, 1, 2, 3, 4, 5].map((w) => byWeek.get(w) ?? 0)
    })

    return { rowLabels, colLabels, matrix, usedCohortApi: true }
  } catch {
    return {
      rowLabels: [] as string[],
      colLabels: ["Week 0", "Week 1", "Week 2", "Week 3", "Week 4", "Week 5"],
      matrix: [] as number[][],
      usedCohortApi: false,
      message:
        "Cohort retention is unavailable for this property or date range.",
    }
  }
}

// ---------------------------------------------------------------------------
// Card 9 — Views by page title
// API: type=snapshot_views_by_page_title
// ---------------------------------------------------------------------------
export async function snapshotViewsByPageTitle(
  client: GaDataClient,
  property: string,
  dates: GaReportDateRange,
) {
  const [response] = await client.runReport({
    property: `properties/${property}`,
    dateRanges: [{ startDate: dates.startDate, endDate: dates.endDate }],
    dimensions: [{ name: "pageTitle" }],
    metrics: [{ name: "screenPageViews" }],
    orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
    limit: 10,
  })

  const rows = (response.rows ?? []) as any[]
  return {
    rows: rows.map((row) => ({
      pageTitle: row.dimensionValues?.[0]?.value ?? "(not set)",
      views: Number(row.metricValues?.[0]?.value ?? 0),
    })),
  }
}

// ---------------------------------------------------------------------------
// Card 10 — Event count by event name
// API: type=snapshot_event_counts
// ---------------------------------------------------------------------------
export async function snapshotEventCounts(
  client: GaDataClient,
  property: string,
  dates: GaReportDateRange,
) {
  const [response] = await client.runReport({
    property: `properties/${property}`,
    dateRanges: [{ startDate: dates.startDate, endDate: dates.endDate }],
    dimensions: [{ name: "eventName" }],
    metrics: [{ name: "eventCount" }],
    orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
    limit: 12,
  })

  const rows = (response.rows ?? []) as any[]
  return {
    rows: rows.map((row) => ({
      eventName: row.dimensionValues?.[0]?.value ?? "(not set)",
      eventCount: Number(row.metricValues?.[0]?.value ?? 0),
    })),
  }
}

// ---------------------------------------------------------------------------
// Card 11 — Key events by event name
// API: type=snapshot_key_events
// ---------------------------------------------------------------------------
export async function snapshotKeyEvents(
  client: GaDataClient,
  property: string,
  dates: GaReportDateRange,
) {
  const [response] = await client.runReport({
    property: `properties/${property}`,
    dateRanges: [{ startDate: dates.startDate, endDate: dates.endDate }],
    dimensions: [{ name: "eventName" }],
    metrics: [{ name: "keyEvents" }],
    orderBys: [{ metric: { metricName: "keyEvents" }, desc: true }],
    limit: 12,
  })

  const rows = (response.rows ?? []) as any[]
  const mapped = rows.map((row) => ({
    eventName: row.dimensionValues?.[0]?.value ?? "(not set)",
    keyEvents: Number(row.metricValues?.[0]?.value ?? 0),
  }))

  return {
    rows: mapped.filter((r) => r.keyEvents > 0),
    hasData: mapped.some((r) => r.keyEvents > 0),
  }
}

// ---------------------------------------------------------------------------
// Cards 12–14 — Monetization row (structure only; often empty for small sites)
// API: type=snapshot_avg_purchase_value | snapshot_items_purchased | snapshot_key_events_platform
// ---------------------------------------------------------------------------
export async function snapshotAvgPurchaseValue(
  client: GaDataClient,
  property: string,
  dates: GaReportDateRange,
) {
  const [response] = await client.runReport({
    property: `properties/${property}`,
    dateRanges: [{ startDate: dates.startDate, endDate: dates.endDate }],
    dimensions: [{ name: "itemName" }],
    metrics: [{ name: "averagePurchaseRevenue" }],
    orderBys: [{ metric: { metricName: "averagePurchaseRevenue" }, desc: true }],
    limit: 8,
  })

  const rows = (response.rows ?? []) as any[]
  return {
    rows: rows.map((row) => ({
      itemName: row.dimensionValues?.[0]?.value ?? "(not set)",
      value: Number(row.metricValues?.[0]?.value ?? 0),
    })),
  }
}

export async function snapshotItemsPurchased(
  client: GaDataClient,
  property: string,
  dates: GaReportDateRange,
) {
  const [response] = await client.runReport({
    property: `properties/${property}`,
    dateRanges: [{ startDate: dates.startDate, endDate: dates.endDate }],
    dimensions: [{ name: "itemName" }],
    metrics: [{ name: "itemsPurchased" }],
    orderBys: [{ metric: { metricName: "itemsPurchased" }, desc: true }],
    limit: 10,
  })

  const rows = (response.rows ?? []) as any[]
  return {
    rows: rows.map((row) => ({
      itemName: row.dimensionValues?.[0]?.value ?? "(not set)",
      itemsPurchased: Number(row.metricValues?.[0]?.value ?? 0),
    })),
  }
}

export async function snapshotKeyEventsByPlatform(
  client: GaDataClient,
  property: string,
  dates: GaReportDateRange,
) {
  const [response] = await client.runReport({
    property: `properties/${property}`,
    dateRanges: [{ startDate: dates.startDate, endDate: dates.endDate }],
    dimensions: [{ name: "platform" }],
    metrics: [{ name: "keyEvents" }],
    orderBys: [{ metric: { metricName: "keyEvents" }, desc: true }],
    limit: 8,
  })

  const rows = (response.rows ?? []) as any[]
  return {
    rows: rows.map((row) => ({
      platform: row.dimensionValues?.[0]?.value ?? "(not set)",
      keyEvents: Number(row.metricValues?.[0]?.value ?? 0),
    })),
  }
}

export type SnapshotType =
  | "snapshot_main_metric"
  | "snapshot_realtime"
  | "snapshot_insights"
  | "snapshot_new_users_by_channel"
  | "snapshot_sessions_by_channel"
  | "snapshot_users_by_country"
  | "snapshot_user_activity_over_time"
  | "snapshot_cohort_retention"
  | "snapshot_views_by_page_title"
  | "snapshot_event_counts"
  | "snapshot_key_events"
  | "snapshot_avg_purchase_value"
  | "snapshot_items_purchased"
  | "snapshot_key_events_platform"

export async function runSnapshotHandler(
  type: SnapshotType,
  client: GaDataClient,
  numericPropertyId: string,
  dates: GaReportDateRange,
): Promise<unknown> {
  switch (type) {
    case "snapshot_main_metric":
      return snapshotMainMetric(client, numericPropertyId, dates)
    case "snapshot_realtime":
      return snapshotRealtime(client, numericPropertyId)
    case "snapshot_insights":
      return snapshotInsights()
    case "snapshot_new_users_by_channel":
      return snapshotNewUsersByChannel(client, numericPropertyId, dates)
    case "snapshot_sessions_by_channel":
      return snapshotSessionsByChannel(client, numericPropertyId, dates)
    case "snapshot_users_by_country":
      return snapshotUsersByCountry(client, numericPropertyId, dates)
    case "snapshot_user_activity_over_time":
      return snapshotUserActivityOverTime(client, numericPropertyId, dates)
    case "snapshot_cohort_retention":
      return snapshotCohortRetention(client, numericPropertyId, dates)
    case "snapshot_views_by_page_title":
      return snapshotViewsByPageTitle(client, numericPropertyId, dates)
    case "snapshot_event_counts":
      return snapshotEventCounts(client, numericPropertyId, dates)
    case "snapshot_key_events":
      return snapshotKeyEvents(client, numericPropertyId, dates)
    case "snapshot_avg_purchase_value":
      return snapshotAvgPurchaseValue(client, numericPropertyId, dates)
    case "snapshot_items_purchased":
      return snapshotItemsPurchased(client, numericPropertyId, dates)
    case "snapshot_key_events_platform":
      return snapshotKeyEventsByPlatform(client, numericPropertyId, dates)
    default:
      throw new Error(`Unknown snapshot type: ${type}`)
  }
}

export const SNAPSHOT_TYPES: SnapshotType[] = [
  "snapshot_main_metric",
  "snapshot_realtime",
  "snapshot_insights",
  "snapshot_new_users_by_channel",
  "snapshot_sessions_by_channel",
  "snapshot_users_by_country",
  "snapshot_user_activity_over_time",
  "snapshot_cohort_retention",
  "snapshot_views_by_page_title",
  "snapshot_event_counts",
  "snapshot_key_events",
  "snapshot_avg_purchase_value",
  "snapshot_items_purchased",
  "snapshot_key_events_platform",
]

export function isSnapshotType(s: string): s is SnapshotType {
  return (SNAPSHOT_TYPES as string[]).includes(s)
}
