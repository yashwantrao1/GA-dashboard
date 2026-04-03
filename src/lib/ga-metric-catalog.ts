/**
 * Curated GA4 Data API metric names + labels (see API schema).
 * https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema
 */

export type GaMetricItem = {
  apiName: string
  label: string
}

export type GaMetricCategory = {
  id: string
  label: string
  metrics: GaMetricItem[]
}

export const GA_METRIC_CATEGORIES: GaMetricCategory[] = [
  {
    id: "suggested",
    label: "Suggested",
    metrics: [
      { apiName: "activeUsers", label: "Active users" },
      { apiName: "newUsers", label: "New users" },
      { apiName: "sessions", label: "Sessions" },
      { apiName: "engagedSessions", label: "Engaged sessions" },
      { apiName: "engagementRate", label: "Engagement rate" },
      { apiName: "eventCount", label: "Event count" },
      { apiName: "keyEvents", label: "Key events" },
      { apiName: "screenPageViews", label: "Views" },
    ],
  },
  {
    id: "user",
    label: "User",
    metrics: [
      { apiName: "activeUsers", label: "Active users" },
      { apiName: "newUsers", label: "New users" },
      { apiName: "userEngagementDuration", label: "User engagement duration" },
    ],
  },
  {
    id: "traffic",
    label: "Traffic",
    metrics: [
      { apiName: "sessions", label: "Sessions" },
      { apiName: "sessionsPerUser", label: "Sessions per user" },
      { apiName: "engagedSessions", label: "Engaged sessions" },
      { apiName: "screenPageViews", label: "Views" },
      { apiName: "screenPageViewsPerSession", label: "Views per session" },
    ],
  },
  {
    id: "engagement",
    label: "Engagement",
    metrics: [
      { apiName: "engagementRate", label: "Engagement rate" },
      { apiName: "averageSessionDuration", label: "Average session duration" },
      { apiName: "userEngagementDuration", label: "User engagement duration" },
      { apiName: "eventCount", label: "Event count" },
      { apiName: "eventsPerSession", label: "Events per session" },
      { apiName: "keyEvents", label: "Key events" },
    ],
  },
  {
    id: "ecommerce",
    label: "Ecommerce",
    metrics: [
      { apiName: "totalRevenue", label: "Total revenue" },
      { apiName: "purchaseRevenue", label: "Purchase revenue" },
      { apiName: "ecommercePurchases", label: "Ecommerce purchases" },
      { apiName: "purchaserRate", label: "Purchaser rate" },
      { apiName: "averagePurchaseRevenue", label: "Average purchase revenue" },
      { apiName: "addToCarts", label: "Add to carts" },
      { apiName: "cartToViewRate", label: "Cart-to-view rate" },
    ],
  },
  {
    id: "events",
    label: "Events",
    metrics: [
      { apiName: "eventCount", label: "Event count" },
      { apiName: "eventValue", label: "Event value" },
      { apiName: "eventsPerSession", label: "Events per session" },
      { apiName: "keyEvents", label: "Key events" },
    ],
  },
]

const labelByApi = new Map<string, string>()
for (const cat of GA_METRIC_CATEGORIES) {
  for (const m of cat.metrics) {
    if (!labelByApi.has(m.apiName)) {
      labelByApi.set(m.apiName, m.label)
    }
  }
}

export const ALLOWED_GA_METRICS = new Set(labelByApi.keys())

export function getMetricLabel(apiName: string): string {
  return labelByApi.get(apiName) ?? apiName.replace(/([A-Z])/g, " $1").trim()
}

/** Display a metric value in cards / tooltips (GA returns ratios as 0–1 for many rates). */
export function formatMetricDisplayValue(apiName: string, value: number): string {
  if (!Number.isFinite(value)) {
    return "—"
  }
  if (
    apiName === "averageSessionDuration" ||
    apiName === "userEngagementDuration"
  ) {
    const s = Math.round(value)
    const m = Math.floor(s / 60)
    const r = s % 60
    return m > 0 ? `${m}m ${r}s` : `${s}s`
  }
  if (
    apiName.endsWith("Rate") ||
    apiName === "engagementRate" ||
    apiName === "purchaserRate" ||
    apiName === "cartToViewRate"
  ) {
    const pct = value > 1 ? value : value * 100
    return `${pct.toFixed(1)}%`
  }
  if (
    apiName.includes("Revenue") ||
    apiName.includes("Cost") ||
    apiName === "eventValue"
  ) {
    return value.toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    })
  }
  if (apiName.includes("Per") && !apiName.endsWith("Rate")) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

export const DEFAULT_CARD_METRICS = [
  "activeUsers",
  "eventCount",
  "keyEvents",
  "newUsers",
] as const
