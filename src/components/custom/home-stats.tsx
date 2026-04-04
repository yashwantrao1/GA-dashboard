"use client"

import * as React from "react"
import { addDays, format, startOfDay, subDays } from "date-fns"
import { type DateRange } from "react-day-picker"
import { ChevronDown, TrendingDown, TrendingUp } from "lucide-react"
import {
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts"

import { CalendarRangePicker } from "@/components/custom/calendar-range"
import { MetricPickerDialog } from "@/components/custom/metric-picker-dialog"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  DEFAULT_CARD_METRICS,
  formatMetricDisplayValue,
  getMetricLabel,
} from "@/lib/ga-metric-catalog"
import type { ComparePairState } from "@/lib/compare-state"
import { cn } from "@/lib/utils"

export const description = "Dashboard comparison chart"

type MetricRow = { date: string } & Record<string, number>

type DashboardPayload = {
  current: MetricRow[]
  previous: MetricRow[]
  totals: Record<string, { current: number; previous: number }>
  percentage: Record<string, number>
  compareRange?: { start: string; end: string }
}

function ymdToDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number)
  return new Date(y, m - 1, d)
}

function toYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function toPropertyNumericId(propertyResourceName: string): string {
  return propertyResourceName.startsWith("properties/")
    ? propertyResourceName.replace("properties/", "")
    : propertyResourceName
}

/** Inclusive day count from start to end (YYYY-MM-DD). */
function inclusiveDayCount(start: string, end: string): number {
  const a = ymdToDate(start)
  const b = ymdToDate(end)
  return (
    Math.round((b.getTime() - a.getTime()) / 86400000) + 1
  )
}

/**
 * Last N full calendar days ending **yesterday** (browser local timezone, e.g. IST).
 * Excludes “today” so counts match GA-style completed days when today is still partial.
 */
function presetLastNDays(n: number): { from: Date; to: Date } {
  const to = startOfDay(subDays(new Date(), 1))
  const from = startOfDay(subDays(to, n - 1))
  return { from, to }
}

/** Weeks × 7 days, same rule as presetLastNDays (ends yesterday). */
function presetRangeEndingToday(weeks: number): { from: Date; to: Date } {
  return presetLastNDays(weeks * 7)
}

function defaultLast7DaysStrings() {
  const { from, to } = presetLastNDays(7)
  return { start: toYmd(from), end: toYmd(to) }
}

/** Every calendar day from start→end inclusive (local YYYY-MM-DD strings). */
function enumerateInclusiveDates(startYmd: string, endYmd: string): string[] {
  const out: string[] = []
  let cur = ymdToDate(startYmd)
  const end = ymdToDate(endYmd)
  while (cur.getTime() <= end.getTime()) {
    out.push(toYmd(cur))
    cur = addDays(cur, 1)
  }
  return out
}

type ChartPoint = {
  date: string
  previousDate: string
  current: number
  previous: number
}

type ChartPointDual = {
  date: string
  primary: number
  secondary: number
}

function buildChartSeriesDual(
  dateRange: { start: string; end: string },
  dataA: DashboardPayload,
  dataB: DashboardPayload,
  metric: string,
): ChartPointDual[] {
  if (!dateRange.start || !dateRange.end) {
    return []
  }
  const dates = enumerateInclusiveDates(dateRange.start, dateRange.end)
  const mapA = new Map(dataA.current.map((r) => [r.date, r] as const))
  const mapB = new Map(dataB.current.map((r) => [r.date, r] as const))
  return dates.map((date) => ({
    date,
    primary: Number(mapA.get(date)?.[metric] ?? 0),
    secondary: Number(mapB.get(date)?.[metric] ?? 0),
  }))
}

function buildChartSeriesFromRanges(
  dateRange: { start: string; end: string },
  compareData: DashboardPayload,
  metric: string,
): ChartPoint[] {
  if (!dateRange.start || !dateRange.end) {
    return []
  }
  const currentDates = enumerateInclusiveDates(dateRange.start, dateRange.end)
  const cr = compareData.compareRange
  if (!cr?.start || !cr?.end) {
    return []
  }
  const previousDates = enumerateInclusiveDates(cr.start, cr.end)
  const n = Math.min(currentDates.length, previousDates.length)
  const currentMap = new Map(
    compareData.current.map((r) => [r.date, r] as const),
  )
  const previousMap = new Map(
    compareData.previous.map((r) => [r.date, r] as const),
  )

  return currentDates.slice(0, n).map((date, i) => {
    const pDate = previousDates[i] ?? ""
    const curRow = currentMap.get(date)
    const prevRow = pDate ? previousMap.get(pDate) : undefined
    return {
      date,
      previousDate: pDate,
      current: Number(curRow?.[metric] ?? 0),
      previous: Number(prevRow?.[metric] ?? 0),
    }
  })
}

function formatAxisDate(ymd: string) {
  try {
    return format(ymdToDate(ymd), "d MMM")
  } catch {
    return ymd.slice(5)
  }
}

function formatTooltipDate(ymd: string) {
  try {
    return format(ymdToDate(ymd), "EEE dd MMM")
  } catch {
    return ymd
  }
}

function pointChangePercent(current: number, previous: number) {
  if (previous === 0) {
    return current === 0 ? 0 : 100
  }
  return ((current - previous) / previous) * 100
}

const CARD_SLOT_COUNT = 4

/** Explicit strokes so lines render in SVG even if `var(--color-*)` fails on paths. */
const CHART_STROKE = {
  current: "hsl(221 83% 45%)",
  previous: "hsl(221 55% 65%)",
} as const

/** First property (pinned) = blue; second = red — property-vs-property compare. */
const CHART_STROKE_COMPARE = {
  primary: "hsl(221 83% 45%)",
  secondary: "hsl(0 84% 52%)",
} as const

export function HomeStats({
  comparePair = null,
}: {
  comparePair?: ComparePairState
}) {
  const disabled = Boolean(comparePair && comparePair.secondary === null)
  const [chartMetric, setChartMetric] = React.useState<string>("activeUsers")
  const [cardMetrics, setCardMetrics] = React.useState<string[]>(() => [
    ...DEFAULT_CARD_METRICS,
  ])
  const [metricPickerOpen, setMetricPickerOpen] = React.useState(false)
  const [metricPickerSlot, setMetricPickerSlot] = React.useState<number | null>(
    null,
  )
  const [dateRange, setDateRange] = React.useState<{
    start: string
    end: string
  }>({ start: "", end: "" })
  const [pickerRange, setPickerRange] = React.useState<DateRange | undefined>(
    undefined,
  )
  const [rangeOpen, setRangeOpen] = React.useState(false)
  const rangeContainerRef = React.useRef<HTMLDivElement>(null)
  const [compareData, setCompareData] = React.useState<DashboardPayload | null>(
    null,
  )
  const [dualData, setDualData] = React.useState<{
    a: DashboardPayload
    b: DashboardPayload
  } | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [lineStyle, setLineStyle] = React.useState<"linear" | "step">("linear")

  const dateRangeRef = React.useRef(dateRange)
  React.useEffect(() => {
    dateRangeRef.current = dateRange
  }, [dateRange])

  const cardMetricsRef = React.useRef(cardMetrics)
  React.useEffect(() => {
    cardMetricsRef.current = cardMetrics
  }, [cardMetrics])

  const disabledRef = React.useRef(disabled)
  React.useEffect(() => {
    disabledRef.current = disabled
  }, [disabled])

  const comparePairRef = React.useRef(comparePair)
  React.useEffect(() => {
    comparePairRef.current = comparePair
  }, [comparePair])

  const rangeDayCount = React.useMemo(() => {
    if (!dateRange.start || !dateRange.end) {
      return 0
    }
    return inclusiveDayCount(dateRange.start, dateRange.end)
  }, [dateRange.start, dateRange.end])

  const isPropertyCompareChart = Boolean(comparePair?.secondary)

  const chartConfig = React.useMemo(
    () =>
      (isPropertyCompareChart
        ? {
            primary: {
              label: "First property",
              color: CHART_STROKE_COMPARE.primary,
            },
            secondary: {
              label: "Second property",
              color: CHART_STROKE_COMPARE.secondary,
            },
          }
        : {
            current: {
              label: `Last ${rangeDayCount} days`,
              color: CHART_STROKE.current,
            },
            previous: {
              label: "Previous period",
              color: CHART_STROKE.previous,
            },
          }) as ChartConfig,
    [isPropertyCompareChart, rangeDayCount],
  )

  React.useEffect(() => {
    if (!rangeOpen) {
      return
    }
    function handlePointerDown(event: PointerEvent) {
      const el = rangeContainerRef.current
      if (el && !el.contains(event.target as Node)) {
        setRangeOpen(false)
      }
    }
    document.addEventListener("pointerdown", handlePointerDown)
    return () => document.removeEventListener("pointerdown", handlePointerDown)
  }, [rangeOpen])

  const loadDashboard = React.useCallback(
    async (
      propertyOverride?: string | null,
      metricsOverride?: string[],
    ) => {
      if (disabledRef.current) {
        setLoading(false)
        return
      }
      if (comparePairRef.current?.secondary) {
        return
      }

      const cachedProperty =
        propertyOverride ?? window.localStorage.getItem("ga:selectedProperty")

      if (!cachedProperty) {
        setCompareData(null)
        setDualData(null)
        setError("Select a property in the header to see metrics.")
        setLoading(false)
        return
      }

      const numericId = toPropertyNumericId(cachedProperty)

      const { start, end } = dateRangeRef.current

      const metricsList = metricsOverride ?? cardMetricsRef.current
      const metricsParam = [...new Set(metricsList)].join(",")

      setLoading(true)
      setError(null)

      try {
        const response = await fetch(
          `/api/ga_api?type=dashboard&propertyId=${encodeURIComponent(
            numericId,
          )}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(
            end,
          )}&metrics=${encodeURIComponent(metricsParam)}`,
        )
        const data = (await response.json()) as DashboardPayload & {
          error?: string
        }

        if (!response.ok) {
          setCompareData(null)
          setDualData(null)
          setError(data?.error ?? "Failed to load dashboard data")
          return
        }

        setDualData(null)
        setCompareData({
          current: data.current ?? [],
          previous: data.previous ?? [],
          totals: data.totals,
          percentage: data.percentage,
          compareRange: data.compareRange,
        })
      } catch {
        setCompareData(null)
        setDualData(null)
        setError("Failed to load dashboard data")
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  const loadDualCompare = React.useCallback(
    async (
      primaryId: string,
      secondaryId: string,
      metricsOverride?: string[],
    ) => {
      if (disabledRef.current) {
        setLoading(false)
        return
      }

      const { start, end } = dateRangeRef.current
      if (!start || !end) {
        return
      }

      const metricsList = metricsOverride ?? cardMetricsRef.current
      const metricsParam = [...new Set(metricsList)].join(",")
      const p1 = encodeURIComponent(toPropertyNumericId(primaryId))
      const p2 = encodeURIComponent(toPropertyNumericId(secondaryId))

      setLoading(true)
      setError(null)

      try {
        const [responseA, responseB] = await Promise.all([
          fetch(
            `/api/ga_api?type=dashboard&propertyId=${p1}&start=${encodeURIComponent(
              start,
            )}&end=${encodeURIComponent(end)}&metrics=${encodeURIComponent(
              metricsParam,
            )}`,
          ),
          fetch(
            `/api/ga_api?type=dashboard&propertyId=${p2}&start=${encodeURIComponent(
              start,
            )}&end=${encodeURIComponent(end)}&metrics=${encodeURIComponent(
              metricsParam,
            )}`,
          ),
        ])
        const dataA = (await responseA.json()) as DashboardPayload & {
          error?: string
        }
        const dataB = (await responseB.json()) as DashboardPayload & {
          error?: string
        }

        if (!responseA.ok) {
          setCompareData(null)
          setDualData(null)
          setError(dataA?.error ?? "Failed to load first property")
          return
        }
        if (!responseB.ok) {
          setCompareData(null)
          setDualData(null)
          setError(dataB?.error ?? "Failed to load second property")
          return
        }

        setCompareData(null)
        setDualData({
          a: {
            current: dataA.current ?? [],
            previous: dataA.previous ?? [],
            totals: dataA.totals,
            percentage: dataA.percentage,
            compareRange: dataA.compareRange,
          },
          b: {
            current: dataB.current ?? [],
            previous: dataB.previous ?? [],
            totals: dataB.totals,
            percentage: dataB.percentage,
            compareRange: dataB.compareRange,
          },
        })
      } catch {
        setCompareData(null)
        setDualData(null)
        setError("Failed to load compare data")
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  /** Apply correct “last 7 days” in the user’s timezone (no fetch here). */
  React.useEffect(() => {
    const dr = defaultLast7DaysStrings()
    dateRangeRef.current = dr
    setDateRange(dr)
    const { from, to } = presetLastNDays(7)
    setPickerRange({ from, to })
  }, [])

  React.useEffect(() => {
    if (!dateRange.start || !dateRange.end) {
      return
    }
    if (disabled) {
      setLoading(false)
      setCompareData(null)
      setDualData(null)
      setError(null)
      return
    }
    if (comparePair?.secondary) {
      void loadDualCompare(comparePair.primary, comparePair.secondary)
    } else {
      void loadDashboard()
    }
  }, [
    dateRange.start,
    dateRange.end,
    cardMetrics,
    comparePair,
    disabled,
    loadDashboard,
    loadDualCompare,
  ])

  React.useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{ property?: string }>
      const pair = comparePairRef.current
      if (pair?.secondary) {
        void loadDualCompare(pair.primary, pair.secondary)
        return
      }
      void loadDashboard(custom.detail?.property ?? null)
    }
    window.addEventListener("ga:selectedPropertyChanged", handler)
    return () => {
      window.removeEventListener("ga:selectedPropertyChanged", handler)
    }
  }, [loadDashboard, loadDualCompare])

  const chartSeries = React.useMemo(() => {
    if (!dateRange.start || !dateRange.end) {
      return []
    }
    if (comparePair?.secondary && dualData) {
      return buildChartSeriesDual(
        dateRange,
        dualData.a,
        dualData.b,
        chartMetric,
      )
    }
    if (!compareData) {
      return []
    }
    return buildChartSeriesFromRanges(dateRange, compareData, chartMetric)
  }, [comparePair?.secondary, dualData, compareData, chartMetric, dateRange])

  function applyPickerRange() {
    if (!pickerRange?.from || !pickerRange?.to) {
      return
    }
    const next = {
      start: toYmd(pickerRange.from),
      end: toYmd(pickerRange.to),
    }
    dateRangeRef.current = next
    setDateRange(next)
    setRangeOpen(false)
  }

  function applyPresetWeeks(weeks: number) {
    const { from, to } = presetRangeEndingToday(weeks)
    setPickerRange({ from, to })
    const next = { start: toYmd(from), end: toYmd(to) }
    dateRangeRef.current = next
    setDateRange(next)
    setRangeOpen(false)
  }

  function applyPresetDays(days: number) {
    const { from, to } = presetLastNDays(days)
    setPickerRange({ from, to })
    const next = { start: toYmd(from), end: toYmd(to) }
    dateRangeRef.current = next
    setDateRange(next)
    setRangeOpen(false)
  }

  function handleMetricPicked(apiName: string) {
    if (metricPickerSlot === null) {
      return
    }
    const slot = metricPickerSlot
    const next = cardMetrics.map((id, i) => (i === slot ? apiName : id))
    setCardMetrics(next)
    setChartMetric(apiName)
    setMetricPickerSlot(null)
  }

  return (
    <div className="relative">
      {disabled ? (
        <div
          className="absolute inset-0 z-20 flex items-start justify-center rounded-xl border border-dashed border-muted-foreground/35 bg-background/75 pt-10 backdrop-blur-[1px]"
          role="status"
          aria-live="polite"
        >
          <p className="max-w-sm rounded-lg border border-border bg-card px-4 py-2 text-center text-sm text-muted-foreground shadow-sm">
            Pick a second property in the header (same range as the pinned one is
            not allowed). Metrics appear here once both properties are selected.
          </p>
        </div>
      ) : null}
      <Card
        className={cn(
          "overflow-hidden border-border/80 shadow-sm",
          disabled && "pointer-events-none select-none opacity-[0.55]",
        )}
      >
      <CardHeader className="space-y-1 border-b bg-muted/30 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-lg font-semibold tracking-tight">
              Performance overview
            </CardTitle>
        <CardDescription>
          {comparePair?.secondary ? (
            <>
              Two properties for the same date range: values are shown side by side;
              the chart uses a <strong className="text-blue-600">blue</strong> line
              for the first (pinned) property and a{" "}
              <strong className="text-red-600">red</strong> line for the second.
            </>
          ) : (
            <>
              Compare your selected range to the previous period of equal length.
              Quick presets use your device timezone and end on{" "}
              <strong>yesterday</strong> so “today” is not a partial day.
            </>
          )}
        </CardDescription>
          </div>
          <div ref={rangeContainerRef} className="relative shrink-0">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="gap-1.5"
              aria-expanded={rangeOpen}
              onClick={() => setRangeOpen((open) => !open)}
            >
              Date range
              <ChevronDown className="size-4 opacity-70" />
            </Button>
            <p className="mt-1 max-w-56 truncate text-right text-xs text-muted-foreground">
              {dateRange.start && dateRange.end
                ? `${dateRange.start} → ${dateRange.end}`
                : "…"}
            </p>
            <p className="mt-0.5 max-w-56 text-right text-[10px] leading-tight text-muted-foreground">
              Through yesterday (local time)
            </p>

            {rangeOpen && (
              <div className="absolute right-0 top-full z-50 mt-2 w-fit min-w-[min(100vw-2rem,20rem)] rounded-lg border bg-popover p-3 text-popover-foreground shadow-md">
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  Quick ranges (end yesterday · full days only)
                </p>
                <div className="mb-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => applyPresetDays(7)}
                  >
                    Last 7 days
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => applyPresetDays(14)}
                  >
                    Last 14 days
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => applyPresetDays(28)}
                  >
                    Last 28 days
                  </Button>
                </div>
                <div className="mb-3 flex flex-wrap gap-2">
                  {([1, 2, 3] as const).map((w) => (
                    <Button
                      key={w}
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => applyPresetWeeks(w)}
                    >
                      {w} week{w === 1 ? "" : "s"}
                    </Button>
                  ))}
                </div>
                <CalendarRangePicker
                  value={pickerRange}
                  onChange={setPickerRange}
                  showCard={false}
                  numberOfMonths={1}
                />
                <div className="mt-3 flex justify-end gap-2 border-t pt-3">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setRangeOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={!pickerRange?.from || !pickerRange?.to}
                    onClick={applyPickerRange}
                  >
                    Apply
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
        {compareData?.compareRange && !comparePair?.secondary && (
          <p className="text-xs text-muted-foreground">
            Previous period: {compareData.compareRange.start} →{" "}
            {compareData.compareRange.end}
          </p>
        )}
      </CardHeader>

      <CardContent className="space-y-4 pt-6">
        {/* GA-style metric cards — chevron opens full metric catalog */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: CARD_SLOT_COUNT }).map((_, slot) => {
            const m = cardMetrics[slot] ?? "activeUsers"
            const total = dualData
              ? (dualData.a.totals?.[m]?.current ?? 0)
              : (compareData?.totals?.[m]?.current ?? 0)
            const totalB = dualData
              ? (dualData.b.totals?.[m]?.current ?? 0)
              : null
            const pct = compareData?.percentage?.[m] ?? 0
            const selected = chartMetric === m
            return (
              <div
                key={slot}
                className={cn(
                  "flex  flex-col rounded-lg border transition-colors min-h-24",
                  selected
                    ? "border-blue-600 bg-blue-50/80 ring-1 ring-blue-600/20 dark:bg-blue-950/30"
                    : "border-border bg-card hover:bg-muted/50",
                )}
              >
                <div className="flex flex-1 items-stretch">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 flex-col p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring "
                    onClick={() => setChartMetric(m)}
                  >
                    <span className="line-clamp-2 text-xs font-medium text-muted-foreground">
                      {getMetricLabel(m)}
                    </span>
                    <span className="text-2xl font-semibold tabular-nums text-foreground">
                      {loading
                        ? "—"
                        : dualData
                          ? `${formatMetricDisplayValue(m, total)} | ${formatMetricDisplayValue(m, totalB ?? 0)}`
                          : formatMetricDisplayValue(m, total)}
                    </span>
                    {!loading && compareData && !dualData && (
                      <span
                        className={cn(
                          "mt-0.5 flex items-center gap-0.5 text-sm font-medium tabular-nums",
                          pct >= 0 ? "text-emerald-600" : "text-red-600",
                        )}
                      >
                        {pct >= 0 ? (
                          <TrendingUp className="size-3.5" />
                        ) : (
                          <TrendingDown className="size-3.5" />
                        )}
                        {pct >= 0 ? "+" : ""}
                        {pct.toFixed(1)}%
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    className="shrink-0 border-l border-border/60 px-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={`Choose metric for card ${slot + 1}`}
                    onClick={() => {
                      setMetricPickerSlot(slot)
                      setMetricPickerOpen(true)
                    }}
                  >
                    <ChevronDown className="size-3.5 opacity-80" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        <MetricPickerDialog
          open={metricPickerOpen}
          onOpenChange={(open) => {
            setMetricPickerOpen(open)
            if (!open) {
              setMetricPickerSlot(null)
            }
          }}
          onSelect={handleMetricPicked}
          title={
            metricPickerSlot !== null
              ? `Card ${metricPickerSlot + 1} — choose metric`
              : "Choose metric"
          }
        />

        {loading && (
          <p className="text-sm text-muted-foreground">Loading chart…</p>
        )}
        {!loading && error && (
          <p className="text-sm text-red-600">{error}</p>
        )}
        {!loading &&
          !error &&
          (compareData || dualData) &&
          chartSeries.length > 0 &&
          dateRange.start && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                Line style
              </span>
              <div className="inline-flex rounded-md border border-border p-0.5">
                <button
                  type="button"
                  onClick={() => setLineStyle("linear")}
                  className={cn(
                    "rounded px-2 py-1 text-xs font-medium transition-colors",
                    lineStyle === "linear"
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Linear
                </button>
                <button
                  type="button"
                  onClick={() => setLineStyle("step")}
                  className={cn(
                    "rounded px-2 py-1 text-xs font-medium transition-colors",
                    lineStyle === "step"
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Step
                </button>
              </div>
            </div>
            <ChartContainer
              config={chartConfig}
              initialDimension={{ width: 800, height: 320 }}
              className="aspect-auto h-[320px] w-full min-w-0 min-h-[280px]"
            >
              <LineChart
                accessibilityLayer
                data={chartSeries as unknown as Record<string, unknown>[]}
                margin={{ left: 4, right: 8, top: 8, bottom: 4 }}
              >
                <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="date"
                  type="category"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={10}
                  interval="equidistantPreserveStart"
                  minTickGap={32}
                  tickFormatter={(v) =>
                    typeof v === "string" ? formatAxisDate(v) : String(v)
                  }
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={36}
                  tickFormatter={(v) => String(v)}
                  domain={[0, (max: number) => (Number.isFinite(max) ? Math.max(max, 1) : 1)]}
                />
                <ChartTooltip
                  cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) {
                      return null
                    }
                    if (dualData) {
                      const row = payload[0].payload as ChartPointDual
                      const label = formatTooltipDate(row.date)
                      return (
                        <div className="grid min-w-[200px] gap-1.5 rounded-lg border border-border/80 bg-background px-3 py-2 text-xs shadow-lg">
                          <div className="font-medium text-foreground">{label}</div>
                          <div className="text-muted-foreground">
                            <span className="font-medium text-blue-600">First</span>
                            {": "}
                            {getMetricLabel(chartMetric)}{" "}
                            <span className="font-semibold tabular-nums text-foreground">
                              {formatMetricDisplayValue(chartMetric, row.primary)}
                            </span>
                          </div>
                          <div className="text-muted-foreground">
                            <span className="font-medium text-red-600">Second</span>
                            {": "}
                            {getMetricLabel(chartMetric)}{" "}
                            <span className="font-semibold tabular-nums text-foreground">
                              {formatMetricDisplayValue(chartMetric, row.secondary)}
                            </span>
                          </div>
                        </div>
                      )
                    }
                    const row = payload[0].payload as {
                      date: string
                      previousDate: string
                      current: number
                      previous: number
                    }
                    const p = pointChangePercent(row.current, row.previous)
                    const labelCurrent = formatTooltipDate(row.date)
                    const labelPrev = row.previousDate
                      ? formatTooltipDate(row.previousDate)
                      : "—"
                    return (
                      <div className="grid min-w-[200px] gap-1.5 rounded-lg border border-border/80 bg-background px-3 py-2 text-xs shadow-lg">
                        <div className="font-medium text-foreground">
                          {labelCurrent}{" "}
                          <span className="text-muted-foreground">vs</span>{" "}
                          {labelPrev}
                        </div>
                        <div className="text-muted-foreground">
                          {getMetricLabel(chartMetric)}{" "}
                          <span className="font-semibold text-foreground">
                            {formatMetricDisplayValue(chartMetric, row.current)}
                          </span>
                        </div>
                        <div
                          className={cn(
                            "flex items-center gap-1 font-medium tabular-nums",
                            p >= 0 ? "text-emerald-600" : "text-red-600",
                          )}
                        >
                          {p >= 0 ? (
                            <TrendingUp className="size-3.5" />
                          ) : (
                            <TrendingDown className="size-3.5" />
                          )}
                          {p >= 0 ? "+" : ""}
                          {p.toFixed(1)}%
                        </div>
                      </div>
                    )
                  }}
                />
                {dualData ? (
                  <>
                    <Line
                      type={lineStyle === "step" ? "stepAfter" : "linear"}
                      dataKey="primary"
                      name="First property"
                      stroke={CHART_STROKE_COMPARE.primary}
                      strokeWidth={2.5}
                      strokeOpacity={1}
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                      activeDot={{ r: 4, fill: CHART_STROKE_COMPARE.primary }}
                    />
                    <Line
                      type={lineStyle === "step" ? "stepAfter" : "linear"}
                      dataKey="secondary"
                      name="Second property"
                      stroke={CHART_STROKE_COMPARE.secondary}
                      strokeWidth={2.5}
                      strokeOpacity={1}
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                      activeDot={{ r: 4, fill: CHART_STROKE_COMPARE.secondary }}
                    />
                  </>
                ) : (
                  <>
                    <Line
                      type={lineStyle === "step" ? "stepAfter" : "linear"}
                      dataKey="previous"
                      stroke={CHART_STROKE.previous}
                      strokeWidth={2}
                      strokeOpacity={1}
                      strokeDasharray="5 5"
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                      activeDot={{ r: 4, fill: CHART_STROKE.previous }}
                    />
                    <Line
                      type={lineStyle === "step" ? "stepAfter" : "linear"}
                      dataKey="current"
                      stroke={CHART_STROKE.current}
                      strokeWidth={2.5}
                      strokeOpacity={1}
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                      activeDot={{ r: 4, fill: CHART_STROKE.current }}
                    />
                  </>
                )}
              </LineChart>
            </ChartContainer>

            <div className="flex flex-wrap items-center gap-6 border-t pt-3 text-xs text-muted-foreground">
              {dualData ? (
                <>
                  <div className="flex items-center gap-2">
                    <span
                      className="h-0.5 w-8 rounded-full bg-[hsl(221_83%_45%)]"
                      aria-hidden
                    />
                    <span>First property</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="h-0.5 w-8 rounded-full bg-[hsl(0_84%_52%)]"
                      aria-hidden
                    />
                    <span>Second property</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <span
                      className="h-0.5 w-8 rounded-full bg-[hsl(221_83%_45%)]"
                      aria-hidden
                    />
                    <span>Last {rangeDayCount} days</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="relative h-0.5 w-8"
                      aria-hidden
                    >
                      <span className="absolute inset-0 border-t-2 border-dashed border-[hsl(221_55%_65%)]" />
                    </span>
                    <span>Previous period</span>
                  </div>
                </>
              )}
            </div>
          </>
        )}
        {!loading && !error && (compareData || dualData) && chartSeries.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No rows returned for this range.
          </p>
        )}
      </CardContent>
    </Card>
    </div>
  )
}
