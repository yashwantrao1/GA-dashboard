import type { NextApiRequest, NextApiResponse } from "next";
import { AnalyticsAdminServiceClient } from "@google-analytics/admin";
import { BetaAnalyticsDataClient } from "@google-analytics/data";

import {
  ALLOWED_GA_METRICS,
  DEFAULT_CARD_METRICS,
} from "@/lib/ga-metric-catalog";
import {
  isSnapshotType,
  parseSnapshotDatesFromRequest,
  runSnapshotHandler,
} from "@/lib/ga-snapshot-handlers";
import { getPreviousRange } from "@/lib/previous-period";

type ErrorResponse = {
  error: string;
};

/**
 * GA4 `date` dimension values are `YYYYMMDD`. The dashboard UI uses `YYYY-MM-DD`
 * for ranges and chart keys — normalize so client maps match API rows.
 */
function normalizeGaDateDimension(value: string): string {
  const v = value.trim();
  if (/^\d{8}$/.test(v)) {
    return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
  }
  return v;
}

function parseDashboardMetrics(
  raw: string | string[] | undefined
): string[] {
  if (typeof raw !== "string" || !raw.trim()) {
    return [...DEFAULT_CARD_METRICS];
  }
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    if (ALLOWED_GA_METRICS.has(p) && !out.includes(p)) {
      out.push(p);
    }
  }
  return out.length ? out : [...DEFAULT_CARD_METRICS];
}

function shouldAverageMetric(metric: string): boolean {
  return (
    metric.endsWith("Rate") ||
    metric === "engagementRate" ||
    metric.includes("Per") ||
    metric === "averageSessionDuration" ||
    metric === "userEngagementDuration" ||
    metric === "averagePurchaseRevenue"
  );
}

function aggregateRows(
  rows: Array<Record<string, number>>,
  metric: string
): number {
  const vals = rows.map((r) => Number(r[metric] ?? 0));
  if (vals.length === 0) {
    return 0;
  }
  if (shouldAverageMetric(metric)) {
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }
  return vals.reduce((a, b) => a + b, 0);
}

function getCredentials() {
  const clientEmail = process.env.GA_CLIENT_EMAIL;
  const privateKey = process.env.GA_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!clientEmail || !privateKey) {
    return null;
  }

  return {
    client_email: clientEmail,
    private_key: privateKey,
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<unknown[] | ErrorResponse | unknown>
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const credentials = getCredentials();

  if (!credentials) {
    return res.status(500).json({
      error: "Missing GA credentials in environment variables",
    });
  }

  if (req.query.type === "dashboard") {
    const queryPropertyId =
      typeof req.query.propertyId === "string" ? req.query.propertyId : undefined;

    const propertyId = queryPropertyId || process.env.GA_PROPERTY_ID;
    const start = typeof req.query.start === "string" ? req.query.start : undefined;
    const end = typeof req.query.end === "string" ? req.query.end : undefined;

    if (!propertyId || !start || !end) {
      return res.status(400).json({
        error: "Missing propertyId/start/end",
      });
    }

    const dataClient = new BetaAnalyticsDataClient({
      credentials,
    });

    const numericPropertyId = propertyId.startsWith("properties/")
      ? propertyId.replace("properties/", "")
      : propertyId;

    const prevRange = getPreviousRange(start, end);
    const metricNames = parseDashboardMetrics(req.query.metrics);

    async function fetchRangeRows(rangeStart: string, rangeEnd: string) {
      const [response] = await dataClient.runReport({
        property: `properties/${numericPropertyId}`,
        dateRanges: [{ startDate: rangeStart, endDate: rangeEnd }],
        dimensions: [{ name: "date" }],
        metrics: metricNames.map((name) => ({ name })),
        orderBys: [{ dimension: { dimensionName: "date" } }],
        // Ensure we get rows for every day in the range (even if metrics are 0),
        // so the chart X-axis matches the selected date window.
        keepEmptyRows: true,
      });

      const rows = response.rows ?? [];

      return rows.map((row: any) => {
        const rawDate = row.dimensionValues?.[0]?.value ?? "";
        const date = normalizeGaDateDimension(rawDate);
        const mv = row.metricValues ?? [];

        const rowObj: Record<string, number | string> & { date: string } = {
          date,
        };
        metricNames.forEach((name, i) => {
          rowObj[name] = Number(mv[i]?.value ?? 0);
        });
        return rowObj as {
          date: string;
        } & Record<string, number>;
      });
    }

    function calcChange(curr: number, prev: number) {
      if (prev === 0) return 0;
      return ((curr - prev) / prev) * 100;
    }

    try {
      const [current, previous] = await Promise.all([
        fetchRangeRows(start, end),
        fetchRangeRows(prevRange.start, prevRange.end),
      ]);

      const totals: Record<string, { current: number; previous: number }> = {};
      const percentage: Record<string, number> = {};

      for (const name of metricNames) {
        totals[name] = {
          current: aggregateRows(current as Record<string, number>[], name),
          previous: aggregateRows(previous as Record<string, number>[], name),
        };
        percentage[name] = calcChange(
          totals[name].current,
          totals[name].previous
        );
      }

      return res.status(200).json({
        current,
        previous,
        totals,
        percentage,
        compareRange: prevRange,
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Dashboard report failed";
      return res.status(500).json({ error: message });
    }
  }

  /**
   * ========================================================================
   * REPORTS SNAPSHOT — one `type` query per card (shared propertyId).
   * Query: ?type=<below>&propertyId=<numeric or properties/ID>
   * Optional: &start=YYYY-MM-DD&end=YYYY-MM-DD (otherwise 28daysAgo–yesterday).
   * Fallback property: GA_PROPERTY_ID env when propertyId omitted.
   *
   * snapshot_main_metric — Main card: daily series for activeUsers, newUsers,
   *   averageSessionDuration + period totals (28d ending yesterday).
   *
   * snapshot_realtime — Realtime active users, optional per-minute breakdown
   *   (minutesAgo), top countries.
   *
   * snapshot_insights — No BigQuery/ML; returns placeholder copy for UI.
   *
   * snapshot_new_users_by_channel — Horizontal bar data: newUsers ×
   *   sessionDefaultChannelGrouping.
   *
   * snapshot_sessions_by_channel — Table: sessions × channel.
   *
   * snapshot_users_by_country — Country × activeUsers (map drawn client-side).
   *
   * snapshot_user_activity_over_time — Three lines (30/7/1-day windows) +
   *   unique-user totals per window.
   *
   * snapshot_cohort_retention — Cohort matrix (cohort × week); empty if API
   *   rejects cohort spec for the property.
   *
   * snapshot_views_by_page_title — pageTitle × screenPageViews.
   *
   * snapshot_event_counts — eventName × eventCount.
   *
   * snapshot_key_events — eventName × keyEvents (marks only).
   *
   * snapshot_avg_purchase_value — itemName × averagePurchaseRevenue (120d).
   *
   * snapshot_items_purchased — itemName × itemsPurchased.
   *
   * snapshot_key_events_platform — platform × keyEvents (donut / list).
   * ========================================================================
   */
  if (typeof req.query.type === "string" && isSnapshotType(req.query.type)) {
    const queryPropertyId =
      typeof req.query.propertyId === "string"
        ? req.query.propertyId
        : undefined;
    const propertyId = queryPropertyId || process.env.GA_PROPERTY_ID;

    if (!propertyId) {
      return res.status(400).json({
        error: "Missing propertyId (query) or GA_PROPERTY_ID (env)",
      });
    }

    const dataClient = new BetaAnalyticsDataClient({
      credentials,
    });

    const numericPropertyId = propertyId.startsWith("properties/")
      ? propertyId.replace("properties/", "")
      : propertyId;

    try {
      const snapshotDates = parseSnapshotDatesFromRequest(req.query);
      const payload = await runSnapshotHandler(
        req.query.type,
        dataClient,
        numericPropertyId,
        snapshotDates
      );
      return res.status(200).json(payload);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Snapshot report failed";
      return res.status(500).json({ error: message });
    }
  }

  // Home cards (GA4 data API) branch
  if (req.query.type === "home-cards") {
    const queryPropertyId =
      typeof req.query.propertyId === "string" ? req.query.propertyId : undefined;
    const envPropertyId = process.env.GA_PROPERTY_ID;
    const propertyId = queryPropertyId || envPropertyId;

    if (!propertyId) {
      return res.status(500).json({
        error: "Missing propertyId (query) or GA_PROPERTY_ID (env)",
      });
    }

    const dataClient = new BetaAnalyticsDataClient({
      credentials,
    });

    try {
      const numericPropertyId = propertyId.startsWith("properties/")
        ? propertyId.replace("properties/", "")
        : propertyId;

      const [response] = await dataClient.runReport({
        property: `properties/${numericPropertyId}`,
        dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
        dimensions: [{ name: "date" }],
        metrics: [{ name: "activeUsers" }, { name: "newUsers" }],
      });

      return res.status(200).json(response);
    } catch (error: unknown) {
      const err = error as { message?: string };
      console.error("GA runReport failed:", err?.message ?? error);

      return res.status(500).json({
        error: err?.message ?? "Failed to load home metrics",
      });
    }
  }

  // Default branch: list accounts (admin API)
  const client = new AnalyticsAdminServiceClient({
    credentials,
  });

  try {
    const [accounts] = await client.listAccounts({});
    return res.status(200).json((accounts ?? []) as unknown[]);
  } catch (error: unknown) {
    const err = error as {
      message?: string;
      code?: number;
      details?: string;
    };

    console.error("GA listAccounts failed:", {
      code: err?.code,
      message: err?.message,
      details: err?.details,
    });

    return res.status(500).json({
      error:
        err?.message ??
        "Failed to fetch accounts. Ensure service account has GA account access.",
    });
  }
}
