"use client"

import * as React from "react"
import { addDays, format, parseISO } from "date-fns"
import type { DateRange } from "react-day-picker"
import { ChevronDown } from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { CalendarRangePicker } from "@/components/custom/calendar-range"
import { SnapshotCardShell } from "@/components/snapshot/snapshot-card-shell"
import { UsersByCountryMap } from "@/components/snapshot/users-by-country-map"
import { fetchSnapshot } from "@/components/snapshot/snapshot-api"
import { useSelectedPropertyId } from "@/components/snapshot/use-selected-property-id"
import { Button } from "@/components/ui/button"
import {
  lastNDaysDateRange,
  lastNDaysEndingYesterday,
  toYmdLocal,
  type DateRangeYmd,
} from "@/lib/dashboard-date-range"
import { cn } from "@/lib/utils"

/** Must match `type` values handled in `pages/api/ga_api.ts` (no server imports here). */
const FETCH_TYPES = [
  "snapshot_main_metric",
  "snapshot_realtime",
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
] as const

type SnapshotFetchType = (typeof FETCH_TYPES)[number]

// --- Response shapes (mirror `ga-snapshot-handlers.ts`) ---

type MainMetricPayload = {
  series: {
    activeUsers: { date: string; value: number }[]
    newUsers: { date: string; value: number }[]
    averageSessionDuration: { date: string; value: number }[]
  }
  totals: {
    activeUsers: number
    newUsers: number
    averageSessionDuration: number
  }
}

type RealtimePayload = {
  totalActive: number
  byMinute: { label: string; value: number }[]
  topCountries: { country: string; users: number }[]
}

type RowChannel = { channel: string; newUsers: number }
type RowSessions = { channel: string; sessions: number }
type RowCountry = { country: string; activeUsers: number }
type ActivityPayload = {
  chart: { date: string; days30: number | null; days7: number | null; days1: number | null }[]
  legendTotals: { days30: number; days7: number; days1: number }
}
type CohortPayload = {
  rowLabels: string[]
  colLabels: string[]
  matrix: number[][]
  usedCohortApi?: boolean
  message?: string
}
type RowPage = { pageTitle: string; views: number }
type RowEvent = { eventName: string; eventCount: number }
type RowKeyEvent = { eventName: string; keyEvents: number }

const CHART_BLUE = "hsl(221 83% 53%)"
const CHART_GREEN = "hsl(142 71% 40%)"
const CHART_ORANGE = "hsl(28 95% 48%)"
const CHART_RED = "hsl(0 84% 52%)"

function formatDurationSeconds(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "0s"
  }
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  if (m === 0) {
    return `${s}s`
  }
  return `${m}m ${s}s`
}

function formatAxisDate(ymd: string) {
  try {
    return format(parseISO(ymd), "MMM d")
  } catch {
    return ymd.slice(5)
  }
}

/** Inclusive YMD list; empty if invalid. Mirrors server `enumerateInclusiveYmd`. */
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

function fillDailySeriesToRange(
  points: { date: string; value: number }[],
  startYmd: string,
  endYmd: string,
): { date: string; value: number }[] {
  const days = enumerateInclusiveYmd(startYmd, endYmd)
  if (!days.length) {
    return points
  }
  const map = new Map(points.map((p) => [p.date, p.value]))
  return days.map((date) => ({ date, value: map.get(date) ?? 0 }))
}

type TabKey = "activeUsers" | "newUsers" | "averageSessionDuration"

function MainMetricCard({
  data,
  dateRange,
}: {
  data: MainMetricPayload | undefined
  dateRange: DateRangeYmd
}) {
  const [tab, setTab] = React.useState<TabKey>("activeUsers")

  const series = React.useMemo(() => {
    const raw = data?.series?.[tab] ?? []
    if (!data) {
      return []
    }
    const { start, end } = dateRange
    if (
      !start ||
      !end ||
      !/^\d{4}-\d{2}-\d{2}$/.test(start) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(end)
    ) {
      return raw
    }
    return fillDailySeriesToRange(raw, start, end)
  }, [data, dateRange.start, dateRange.end, tab])

  const chartData = series.map((r) => ({
    date: r.date,
    v: r.value,
  }))

  const rangeDayCount = React.useMemo(() => {
    const { start, end } = dateRange
    if (
      start &&
      end &&
      /^\d{4}-\d{2}-\d{2}$/.test(start) &&
      /^\d{4}-\d{2}-\d{2}$/.test(end)
    ) {
      return enumerateInclusiveYmd(start, end).length
    }
    return chartData.length
  }, [dateRange.start, dateRange.end, chartData.length])

  /** X-axis: show every day only for short ranges; line still uses full `chartData`. */
  const showEveryXAxisLabel = rangeDayCount <= 25

  const tabLabel =
    tab === "activeUsers"
      ? "Active users"
      : tab === "newUsers"
        ? "New users"
        : "Average engagement time"

  return (
    <SnapshotCardShell
      title="Overview"
      hideHeader
      footerLabel="View user acquisition"
      className="min-h-[280px] lg:col-span-5 lg:row-span-1"
    >
      {data ? (
        <div className="mb-3 grid grid-cols-1 gap-2 border-b border-gray-100 pb-3 sm:grid-cols-3 sm:gap-3">
          <button
            type="button"
            onClick={() => setTab("activeUsers")}
            className={cn(
              "rounded-lg px-2 py-2 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
              tab === "activeUsers"
                ? "bg-blue-50 ring-1 ring-blue-200/80"
                : "hover:bg-gray-50",
            )}
          >
            <p className="text-xs font-medium text-gray-500">Active users</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-gray-900 sm:text-xl">
              {Math.round(data.totals.activeUsers).toLocaleString()}
            </p>
          </button>
          <button
            type="button"
            onClick={() => setTab("newUsers")}
            className={cn(
              "rounded-lg px-2 py-2 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
              tab === "newUsers"
                ? "bg-blue-50 ring-1 ring-blue-200/80"
                : "hover:bg-gray-50",
            )}
          >
            <p className="text-xs font-medium text-gray-500">New users</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-gray-900 sm:text-xl">
              {Math.round(data.totals.newUsers).toLocaleString()}
            </p>
          </button>
          <button
            type="button"
            onClick={() => setTab("averageSessionDuration")}
            className={cn(
              "rounded-lg px-2 py-2 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
              tab === "averageSessionDuration"
                ? "bg-blue-50 ring-1 ring-blue-200/80"
                : "hover:bg-gray-50",
            )}
          >
            <p className="text-xs font-medium text-gray-500">Average engagement time</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-gray-900 sm:text-xl">
              {formatDurationSeconds(data.totals.averageSessionDuration)}
            </p>
          </button>
        </div>
      ) : null}

      <div className="h-[188px] w-full min-w-0">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ left: 0, right: 8, top: 4, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200" />
              <XAxis
                dataKey="date"
                type="category"
                {...(showEveryXAxisLabel
                  ? {
                      scale: "point" as const,
                      ticks: chartData.map((d) => d.date),
                      interval: 0 as const,
                      tick: { fontSize: 8 },
                      angle: -42,
                      textAnchor: "end" as const,
                      height: 54,
                    }
                  : {
                      tick: { fontSize: 10 },
                      interval: "equidistantPreserveStart" as const,
                      minTickGap: 32,
                      height: 36,
                    })}
                tickFormatter={(v) => (typeof v === "string" ? formatAxisDate(v) : String(v))}
              />
              <YAxis width={28} tick={{ fontSize: 10 }} />
              <Tooltip
                contentStyle={{ fontSize: 11 , color: "black", backgroundColor: "white"}}
                labelFormatter={(v) =>
                  typeof v === "string" ? formatAxisDate(v) : String(v)
                }
                formatter={(value) => {
                  const n = Number(value ?? 0)
                  return [
                    tab === "averageSessionDuration"
                      ? formatDurationSeconds(n)
                      : Math.round(n).toLocaleString(),
                    tabLabel,
                  ]
                }}
              />
              <Line
                type="linear"
                dataKey="v"
                stroke={CHART_BLUE}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-gray-500">No trend data.</p>
        )}
      </div>
    </SnapshotCardShell>
  )
}

function RealtimeCard({ data }: { data: RealtimePayload | undefined }) {
  const barData = [...(data?.byMinute ?? [])]
    .sort((a, b) => Number(a.label) - Number(b.label))
    .map((r, i) => ({ name: String(i), value: r.value }))

  return (
    <SnapshotCardShell
      title="Active users in last 30 minutes"
      footerLabel="View realtime"
      className="h-full"
    >
      <p className="text-3xl font-semibold tabular-nums text-gray-900">
        {data ? data.totalActive.toLocaleString() : "—"}
      </p>
      <p className="mb-1 text-xs text-gray-500">Active users per minute</p>
      <div className="h-[100px] w-full">
        {barData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} margin={{ left: 0, right: 4, top: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200" />
              <XAxis dataKey="name" hide />
              <YAxis width={24} tick={{ fontSize: 10 }} />
              <Bar dataKey="value" fill={CHART_BLUE} radius={[2, 2, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center rounded-md bg-gray-50 text-xs text-gray-400">
            No minute breakdown
          </div>
        )}
      </div>
      <div className="mt-2 border-t border-gray-100 pt-2">
        <p className="mb-1 text-xs font-medium text-gray-600">Top countries</p>
        <ul className="space-y-0.5 text-xs text-gray-700">
          {(data?.topCountries ?? []).map((c) => (
            <li key={c.country} className="flex justify-between gap-2">
              <span className="truncate">{c.country}</span>
              <span className="tabular-nums text-gray-500">{c.users}</span>
            </li>
          ))}
          {(!data?.topCountries?.length) && (
            <li className="text-gray-400">No realtime country data</li>
          )}
        </ul>
      </div>
    </SnapshotCardShell>
  )
}

function InsightsCard() {
  return (
    <SnapshotCardShell title="Insights" footerLabel="View all insights">
      <p className="text-sm text-gray-600">
        Your insights will appear here soon.
      </p>
    </SnapshotCardShell>
  )
}

function NewUsersChannelCard({ rows }: { rows: RowChannel[] | undefined }) {
  const data = [...(rows ?? [])]
    .slice(0, 8)
    .map((r) => ({ name: r.channel.slice(0, 22), full: r.channel, v: r.newUsers }))
  const max = Math.max(1, ...data.map((d) => d.v))

  return (
    <SnapshotCardShell title="New users by Channel group" footerLabel="View user acquisition">
      <div className="h-[200px] w-full">
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              layout="vertical"
              data={data}
              margin={{ left: 4, right: 16, top: 4, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200" horizontal={false} />
              <XAxis type="number" domain={[0, max]} tick={{ fontSize: 10 }} />
              <YAxis
                type="category"
                dataKey="name"
                width={100}
                tick={{ fontSize: 9 }}
              />
              <Tooltip
                contentStyle={{
                  fontSize: 10,
                  color: "#000",
                  backgroundColor: "#fff",
                  padding: "4px 6px",
                  border: "1px solid #e5e7eb",
                  borderRadius: 4,
                }}
                labelStyle={{ fontSize: 10, color: "#000", fontWeight: 600, marginBottom: 2 }}
                itemStyle={{ fontSize: 10, color: "#000", padding: 0 }}
                formatter={(value) => [Number(value ?? 0), "New users"]}
                labelFormatter={(_, payload) =>
                  (payload?.[0]?.payload as { full?: string })?.full ?? ""
                }
              />
              <Bar dataKey="v" fill={CHART_BLUE} radius={[0, 4, 4, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-gray-500">No channel data.</p>
        )}
      </div>
    </SnapshotCardShell>
  )
}

function SessionsChannelTable({ rows }: { rows: RowSessions[] | undefined }) {
  return (
    <SnapshotCardShell title="Sessions by Channel group" footerLabel="View traffic acquisition">
      <div className="max-h-[220px] overflow-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500">
              <th className="py-1.5 pr-2 font-medium">Session primary channel group</th>
              <th className="py-1.5 text-right font-medium">Sessions</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((r) => (
              <tr key={r.channel} className="border-b border-gray-50">
                <td className="py-1.5 pr-2 text-gray-800">{r.channel}</td>
                <td className="py-1.5 text-right tabular-nums text-gray-600">
                  {r.sessions.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows?.length && (
          <p className="py-4 text-center text-sm text-gray-500">No sessions data.</p>
        )}
      </div>
    </SnapshotCardShell>
  )
}

function UsersByCountryCard({ rows }: { rows: RowCountry[] | undefined }) {
  const top = (rows ?? []).slice(0, 8)
  const max = Math.max(1, ...top.map((r) => r.activeUsers))

  return (
    <SnapshotCardShell
      title="Active users by Country"
      footerLabel="View countries"
      className="lg:col-span-5"
    >
      <div className="flex flex-col gap-3 lg:flex-row">
        <UsersByCountryMap rows={rows} />
        <div className="w-full shrink-0 lg:w-[42%]">
          <ul className="space-y-1.5 text-xs">
            {top.map((r) => (
              <li key={r.country}>
                <div className="mb-0.5 flex justify-between gap-2">
                  <span className="truncate text-gray-800">{r.country}</span>
                  <span className="tabular-nums text-gray-600">{r.activeUsers}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-blue-500"
                    style={{ width: `${(r.activeUsers / max) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
          {!top.length && (
            <p className="text-sm text-gray-500">No country data.</p>
          )}
        </div>
      </div>
    </SnapshotCardShell>
  )
}

function UserActivityOverTimeCard({ data }: { data: ActivityPayload | undefined }) {
  const chart = data?.chart ?? []

  return (
    <SnapshotCardShell title="User activity over time" footerLabel="View retention">
      <div className="mb-2 flex flex-wrap justify-end gap-3 text-[11px] text-gray-600">
        <span>
          <span className="font-semibold tabular-nums text-blue-600">
            {data?.legendTotals.days30?.toLocaleString() ?? "—"}
          </span>{" "}
          30 days
        </span>
        <span>
          <span className="font-semibold tabular-nums text-emerald-600">
            {data?.legendTotals.days7?.toLocaleString() ?? "—"}
          </span>{" "}
          7 days
        </span>
        <span>
          <span className="font-semibold tabular-nums text-orange-600">
            {data?.legendTotals.days1?.toLocaleString() ?? "—"}
          </span>{" "}
          1 day
        </span>
      </div>
      <div className="h-[200px] w-full">
        {chart.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chart} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 9 }}
                tickFormatter={(v) => (typeof v === "string" ? formatAxisDate(v) : String(v))}
              />
              <YAxis width={28} tick={{ fontSize: 10 }} />
              <Tooltip 
                contentStyle={{
                  fontSize: 10,
                  color: "#000",
                  backgroundColor: "#fff",
                  padding: "4px 6px",
                  border: "1px solid #e5e7eb",
                  borderRadius: 4,
                }}
                labelStyle={{ fontSize: 10, color: "#000", fontWeight: 600, marginBottom: 2 }}
                itemStyle={{ fontSize: 10, color: "#000", padding: 0 }}
               />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line
                type="linear"
                dataKey="days30"
                name="30 days"
                stroke={CHART_BLUE}
                strokeWidth={2}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
              <Line
                type="linear"
                dataKey="days7"
                name="7 days"
                stroke={CHART_GREEN}
                strokeWidth={2}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
              <Line
                type="linear"
                dataKey="days1"
                name="1 day"
                stroke={CHART_ORANGE}
                strokeWidth={2}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-gray-500">No activity series.</p>
        )}
      </div>
    </SnapshotCardShell>
  )
}

function CohortCard({ data }: { data: CohortPayload | undefined }) {
  const matrix = data?.matrix ?? []
  const rowLabels = data?.rowLabels ?? []
  const colLabels = data?.colLabels ?? []
  const flat = matrix.flat()
  const max = Math.max(1, ...flat)

  return (
    <SnapshotCardShell title="User activity by cohort" footerLabel="View retention">
      {!matrix.length ? (
        <p className="text-sm text-gray-500">
          {data?.message ?? "No cohort table for this property yet."}
        </p>
      ) : (
        <div className="overflow-auto">
          <table className="w-full border-collapse text-[10px]">
            <thead>
              <tr>
                <th className="border border-gray-200 bg-gray-50 p-1 text-left font-medium text-gray-600">
                  Cohort
                </th>
                {colLabels.map((c) => (
                  <th
                    key={c}
                    className="border border-gray-200 bg-gray-50 p-1 font-medium text-gray-600"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.map((row, ri) => (
                <tr key={rowLabels[ri] ?? ri}>
                  <td className="border border-gray-200 p-1 text-gray-700">
                    {rowLabels[ri] ?? `Row ${ri + 1}`}
                  </td>
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      className="border border-gray-200 p-1 text-center tabular-nums text-gray-800"
                      style={{
                        backgroundColor: `rgba(37, 99, 235, ${0.08 + (cell / max) * 0.55})`,
                      }}
                    >
                      {cell ? cell.toLocaleString() : "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SnapshotCardShell>
  )
}

function PageTitleCard({ rows }: { rows: RowPage[] | undefined }) {
  const data = [...(rows ?? [])]
    .slice(0, 8)
    .map((r) => ({
      name: r.pageTitle.length > 28 ? `${r.pageTitle.slice(0, 28)}…` : r.pageTitle,
      full: r.pageTitle,
      v: r.views,
    }))
  const max = Math.max(1, ...data.map((d) => d.v))

  return (
    <SnapshotCardShell title="Views by Page title" footerLabel="View pages and screens">
      <div className="h-[220px] w-full">
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              layout="vertical"
              data={data}
              margin={{ left: 4, right: 12, top: 4, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200" horizontal={false} />
              <XAxis type="number" domain={[0, max]} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 9 }} />
              <Tooltip
                contentStyle={{
                  fontSize: 10,
                  color: "#000",
                  backgroundColor: "#fff",
                  padding: "4px 6px",
                  border: "1px solid #e5e7eb",
                  borderRadius: 4,
                }}
                labelStyle={{ fontSize: 10, color: "#000", fontWeight: 600, marginBottom: 2 }}
                itemStyle={{ fontSize: 10, color: "#000", padding: 0 }}
                formatter={(v) => [Number(v ?? 0), "Views"]}
                labelFormatter={(_, p) => (p?.[0]?.payload as { full?: string })?.full ?? ""}
              />
              <Bar dataKey="v" fill={CHART_GREEN} radius={[0, 4, 4, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-gray-500">No page data.</p>
        )}
      </div>
    </SnapshotCardShell>
  )
}

function EventCountCard({ rows }: { rows: RowEvent[] | undefined }) {
  return (
    <SnapshotCardShell title="Event count by Event name" footerLabel="View events">
      <ul className="max-h-[220px] space-y-2 overflow-auto text-xs">
        {(rows ?? []).map((r) => (
          <li key={r.eventName} className="flex justify-between gap-2 border-b border-gray-50 pb-1.5">
            <code className="truncate text-gray-800">{r.eventName}</code>
            <span className="shrink-0 tabular-nums text-gray-600">
              {r.eventCount.toLocaleString()}
            </span>
          </li>
        ))}
        {!rows?.length && <li className="text-gray-500">No events.</li>}
      </ul>
    </SnapshotCardShell>
  )
}

function KeyEventsCard({ rows }: { rows: RowKeyEvent[] | undefined }) {
  const has = rows && rows.length > 0
  return (
    <SnapshotCardShell title="Key events by Event name" footerLabel="View key events">
      {has ? (
        <ul className="max-h-[220px] space-y-2 overflow-auto text-xs">
          {rows!.map((r) => (
            <li key={r.eventName} className="flex justify-between gap-2">
              <code className="truncate text-gray-800">{r.eventName}</code>
              <span className="tabular-nums text-gray-600">{r.keyEvents}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-6 text-center text-sm text-gray-500">No data available</p>
      )}
    </SnapshotCardShell>
  )
}

type RowPurchase = { itemName: string; value: number }
type RowItems = { itemName: string; itemsPurchased: number }
type RowPlatform = { platform: string; keyEvents: number }

const PIE_COLORS = ["#2563eb", "#16a34a", "#ea580c", "#9333ea", "#dc2626", "#0891b2"]

function AvgPurchaseCard({ rows }: { rows: RowPurchase[] | undefined }) {
  const data = (rows ?? []).filter((r) => r.value > 0).slice(0, 6)
  return (
    <SnapshotCardShell title="Average purchase revenue by Item name" footerLabel="View purchases">
      {data.length ? (
        <ul className="space-y-1.5 text-xs">
          {data.map((r) => (
            <li key={r.itemName} className="flex justify-between gap-2">
              <span className="truncate text-gray-800">{r.itemName}</span>
              <span className="tabular-nums text-gray-600">{r.value.toFixed(2)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-6 text-center text-sm text-gray-500">No data available</p>
      )}
    </SnapshotCardShell>
  )
}

function ItemsPurchasedCard({ rows }: { rows: RowItems[] | undefined }) {
  const data = (rows ?? []).filter((r) => r.itemsPurchased > 0).slice(0, 8)
  return (
    <SnapshotCardShell title="Items purchased by Item name" footerLabel="View ecommerce">
      {data.length ? (
        <ul className="space-y-1.5 text-xs">
          {data.map((r) => (
            <li key={r.itemName} className="flex justify-between gap-2">
              <span className="truncate text-gray-800">{r.itemName}</span>
              <span className="tabular-nums text-gray-600">{r.itemsPurchased}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-6 text-center text-sm text-gray-500">No data available</p>
      )}
    </SnapshotCardShell>
  )
}

/** Local `YYYY-MM-DD` → `Date` (avoids UTC day shift from `parseISO`). */
function parseYmdLocal(s: string): Date {
  const [y, m, d] = s.split("-").map(Number)
  return new Date(y, m - 1, d)
}

/** Date range for snapshot cards only — to the right of “Add comparison”. */
function SnapshotDateRangeControl({
  dateRange,
  onDateRangeChange,
  loading,
}: {
  dateRange: DateRangeYmd
  onDateRangeChange: (next: DateRangeYmd) => void
  loading: boolean
}) {
  const [rangeOpen, setRangeOpen] = React.useState(false)
  const [pickerRange, setPickerRange] = React.useState<DateRange | undefined>(
    undefined,
  )
  const rangeRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!dateRange.start || !dateRange.end) {
      return
    }
    setPickerRange({
      from: parseYmdLocal(dateRange.start),
      to: parseYmdLocal(dateRange.end),
    })
  }, [dateRange.start, dateRange.end])

  React.useEffect(() => {
    if (!rangeOpen) {
      return
    }
    function onPointerDown(e: PointerEvent) {
      if (rangeRef.current && !rangeRef.current.contains(e.target as Node)) {
        setRangeOpen(false)
      }
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [rangeOpen])

  function apply(next: DateRangeYmd) {
    onDateRangeChange(next)
    setRangeOpen(false)
  }

  function applyPresetDays(n: number) {
    const { from, to } = lastNDaysDateRange(n)
    setPickerRange({ from, to })
    apply({ start: toYmdLocal(from), end: toYmdLocal(to) })
  }

  function applyPresetWeeks(weeks: number) {
    applyPresetDays(weeks * 7)
  }

  function applyPickerRange() {
    if (!pickerRange?.from || !pickerRange?.to) {
      return
    }
    apply({
      start: toYmdLocal(pickerRange.from),
      end: toYmdLocal(pickerRange.to),
    })
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <button
        type="button"
        className="rounded-md border border-dashed border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
      >
        Add comparison +
      </button>
      <div ref={rangeRef} className="relative shrink-0">
        <button
          type="button"
          onClick={() => setRangeOpen((o) => !o)}
          className="flex min-w-0 max-w-44 items-start gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-left text-xs font-medium text-gray-800 hover:bg-gray-50 sm:max-w-52"
          aria-expanded={rangeOpen}
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-normal uppercase tracking-wide text-gray-500">
              Date range
            </span>
            <span className="block truncate tabular-nums text-gray-900">
              {dateRange.start && dateRange.end
                ? `${dateRange.start} → ${dateRange.end}`
                : "…"}
            </span>
          </span>
          <ChevronDown className="mt-0.5 size-3.5 shrink-0 text-gray-500" aria-hidden />
        </button>
        {rangeOpen ? (
          <div className="absolute right-0 top-full z-50 mt-2 w-[min(100vw-2rem,20rem)] rounded-lg border border-gray-200 bg-white p-3 text-gray-900 shadow-lg">
            <p className="mb-2 text-xs font-medium text-gray-600">
              Snapshot cards only · ends yesterday (full days)
            </p>
            <div className="mb-2 flex flex-wrap gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-7 text-xs"
                onClick={() => applyPresetDays(7)}
              >
                7d
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-7 text-xs"
                onClick={() => applyPresetDays(14)}
              >
                14d
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-7 text-xs"
                onClick={() => applyPresetDays(28)}
              >
                28d
              </Button>
            </div>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {([1, 2, 3] as const).map((w) => (
                <Button
                  key={w}
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => applyPresetWeeks(w)}
                >
                  {w}w
                </Button>
              ))}
            </div>
            <CalendarRangePicker
              value={pickerRange}
              onChange={setPickerRange}
              showCard={false}
              numberOfMonths={1}
            />
            <div className="mt-3 flex justify-end gap-2 border-t border-gray-100 pt-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => setRangeOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                className="text-xs"
                disabled={!pickerRange?.from || !pickerRange?.to}
                onClick={applyPickerRange}
              >
                Apply
              </Button>
            </div>
          </div>
        ) : null}
      </div>
      {loading ? (
        <span className="text-xs text-gray-500">Loading snapshot…</span>
      ) : null}
    </div>
  )
}

function KeyEventsPlatformCard({ rows }: { rows: RowPlatform[] | undefined }) {
  const data = (rows ?? [])
    .filter((r) => r.keyEvents > 0)
    .map((r) => ({ name: r.platform, value: r.keyEvents }))
  return (
    <SnapshotCardShell title="Key events by Platform" footerLabel="View tech">
      {data.length ? (
        <div className="mx-auto h-[200px] w-full max-w-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={48}
                outerRadius={72}
                paddingAngle={2}
                isAnimationActive={false}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  fontSize: 10,
                  color: "#000",
                  backgroundColor: "#fff",
                  padding: "4px 6px",
                  border: "1px solid #e5e7eb",
                  borderRadius: 4,
                }}
                labelStyle={{ fontSize: 10, color: "#000", fontWeight: 600, marginBottom: 2 }}
                itemStyle={{ fontSize: 10, color: "#000", padding: 0 }}
               formatter={(v) => Number(v ?? 0).toLocaleString()} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="py-6 text-center text-sm text-gray-500">No data available</p>
      )}
    </SnapshotCardShell>
  )
}

export function ReportsSnapshot() {
  const [dateRange, setDateRange] = React.useState<DateRangeYmd>(() =>
    lastNDaysEndingYesterday(28),
  )
  const propertyId = useSelectedPropertyId()
  const [bundle, setBundle] = React.useState<
    Partial<Record<SnapshotFetchType | "snapshot_insights", unknown>>
  >({})
  const [errors, setErrors] = React.useState<
    Partial<Record<SnapshotFetchType, string>>
  >({})
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    if (!propertyId) {
      setBundle({})
      setErrors({})
      return
    }

    let cancelled = false
    setLoading(true)
    setErrors({})

    void (async () => {
      const settled = await Promise.allSettled(
        FETCH_TYPES.map((type) =>
          fetchSnapshot(type, propertyId, dateRange),
        ),
      )

      if (cancelled) {
        return
      }

      const next: Partial<Record<SnapshotFetchType | "snapshot_insights", unknown>> = {
        snapshot_insights: { message: "Your insights will appear here soon." },
      }
      const nextErr: Partial<Record<SnapshotFetchType, string>> = {}

      settled.forEach((s, i) => {
        const type = FETCH_TYPES[i]!
        if (s.status === "fulfilled") {
          next[type] = s.value
        } else {
          nextErr[type] =
            s.reason instanceof Error ? s.reason.message : "Request failed"
        }
      })

      setBundle(next)
      setErrors(nextErr)
      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [propertyId, dateRange.start, dateRange.end])

  const main = bundle.snapshot_main_metric as MainMetricPayload | undefined
  const realtime = bundle.snapshot_realtime as RealtimePayload | undefined
  const channels = bundle.snapshot_new_users_by_channel as { rows: RowChannel[] } | undefined
  const sessions = bundle.snapshot_sessions_by_channel as { rows: RowSessions[] } | undefined
  const countries = bundle.snapshot_users_by_country as { rows: RowCountry[] } | undefined
  const activity = bundle.snapshot_user_activity_over_time as ActivityPayload | undefined
  const cohort = bundle.snapshot_cohort_retention as CohortPayload | undefined
  const pages = bundle.snapshot_views_by_page_title as { rows: RowPage[] } | undefined
  const events = bundle.snapshot_event_counts as { rows: RowEvent[] } | undefined
  const keyEv = bundle.snapshot_key_events as { rows: RowKeyEvent[] } | undefined
  const avgPur = bundle.snapshot_avg_purchase_value as { rows: RowPurchase[] } | undefined
  const items = bundle.snapshot_items_purchased as { rows: RowItems[] } | undefined
  const plat = bundle.snapshot_key_events_platform as { rows: RowPlatform[] } | undefined

  const failedCount = Object.keys(errors).length
  const globalError =
    propertyId &&
    !loading &&
    failedCount === FETCH_TYPES.length &&
    FETCH_TYPES.length > 0
      ? Object.values(errors)[0]
      : null

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 border-b border-gray-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Reports snapshot</h2>
          <p className="text-xs text-gray-500">
            GA4-style overview — data loads when a property is selected. The date range
            here applies only to these snapshot cards, not Performance overview.
          </p>
        </div>
        <SnapshotDateRangeControl
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          loading={loading}
        />
      </div>

      {!propertyId ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Select an Analytics property in the header to load the reports snapshot.
        </p>
      ) : null}

      {globalError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {globalError}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-stretch">
        <MainMetricCard data={main} dateRange={dateRange} />
        <div className="lg:col-span-3">
          <RealtimeCard data={realtime} />
        </div>
        <div className="lg:col-span-2">
          <InsightsCard />
        </div>
        <div className="lg:col-span-2">
          <NewUsersChannelCard rows={channels?.rows} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <SessionsChannelTable rows={sessions?.rows} />
        </div>
        <UsersByCountryCard rows={countries?.rows} />
        <div className="lg:col-span-3">
          <UserActivityOverTimeCard data={activity} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <CohortCard data={cohort} />
        <PageTitleCard rows={pages?.rows} />
        <EventCountCard rows={events?.rows} />
        <KeyEventsCard rows={keyEv?.rows} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <AvgPurchaseCard rows={avgPur?.rows} />
        <ItemsPurchasedCard rows={items?.rows} />
        <KeyEventsPlatformCard rows={plat?.rows} />
      </div>
    </section>
  )
}
