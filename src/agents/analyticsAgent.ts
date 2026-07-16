import { google } from "googleapis";
import { readFileSync } from "fs";
import type {
  AnalyticsBundle,
  GA4Report,
  GSCReport,
  GTMReport,
  ClarityReport,
} from "../types.js";

interface AnalyticsConfig {
  serviceAccountKeyPath: string;
  ga4PropertyId?: string;
  ga4LookbackDays?: number;
  gscSiteUrl?: string;
  gscLookbackDays?: number;
  gtmAccountId?: string;
  gtmContainerId?: string;
  clarityProjectId?: string;
  clarityApiToken?: string;
}

export async function runAnalyticsAudit(config: AnalyticsConfig): Promise<AnalyticsBundle> {
  const auth = createAuth(config.serviceAccountKeyPath);
  const bundle: AnalyticsBundle = {};

  const tasks = await Promise.allSettled([
    config.ga4PropertyId ? fetchGA4(auth, config.ga4PropertyId, config.ga4LookbackDays ?? 30) : Promise.resolve(undefined),
    config.gscSiteUrl ? fetchGSC(auth, config.gscSiteUrl, config.gscLookbackDays ?? 28) : Promise.resolve(undefined),
    config.gtmAccountId && config.gtmContainerId ? fetchGTM(auth, config.gtmAccountId, config.gtmContainerId) : Promise.resolve(undefined),
    config.clarityProjectId && config.clarityApiToken ? fetchClarity(config.clarityProjectId, config.clarityApiToken) : Promise.resolve(undefined),
  ]);

  if (tasks[0].status === "fulfilled" && tasks[0].value) bundle.ga4 = tasks[0].value;
  if (tasks[1].status === "fulfilled" && tasks[1].value) bundle.gsc = tasks[1].value;
  if (tasks[2].status === "fulfilled" && tasks[2].value) bundle.gtm = tasks[2].value;
  if (tasks[3].status === "fulfilled" && tasks[3].value) bundle.clarity = tasks[3].value;

  if (tasks[0].status === "rejected") console.warn("[analytics] GA4 failed:", (tasks[0] as PromiseRejectedResult).reason);
  if (tasks[1].status === "rejected") console.warn("[analytics] GSC failed:", (tasks[1] as PromiseRejectedResult).reason);
  if (tasks[2].status === "rejected") console.warn("[analytics] GTM failed:", (tasks[2] as PromiseRejectedResult).reason);
  if (tasks[3].status === "rejected") console.warn("[analytics] Clarity failed:", (tasks[3] as PromiseRejectedResult).reason);

  return bundle;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

function createAuth(keyPath: string) {
  const key = JSON.parse(readFileSync(keyPath, "utf-8"));
  return new google.auth.GoogleAuth({
    credentials: key,
    scopes: [
      "https://www.googleapis.com/auth/analytics.readonly",
      "https://www.googleapis.com/auth/webmasters.readonly",
      "https://www.googleapis.com/auth/tagmanager.readonly",
    ],
  });
}

// ── Google Analytics 4 ───────────────────────────────────────────────────────

async function fetchGA4(auth: ReturnType<typeof createAuth>, propertyId: string, days: number): Promise<GA4Report> {
  const analyticsData = google.analyticsdata({ version: "v1beta", auth });

  const endDate = "today";
  const startDate = `${days}daysAgo`;
  const period = `Last ${days} days`;

  const [overviewRes, pagesRes, channelsRes] = await Promise.all([
    analyticsData.properties.runReport({
      property: `properties/${propertyId}`,
      requestBody: {
        dateRanges: [{ startDate, endDate }],
        metrics: [
          { name: "sessions" },
          { name: "totalUsers" },
          { name: "newUsers" },
          { name: "bounceRate" },
          { name: "averageSessionDuration" },
        ],
      },
    }),
    analyticsData.properties.runReport({
      property: `properties/${propertyId}`,
      requestBody: {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "pagePath" }],
        metrics: [{ name: "sessions" }, { name: "bounceRate" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: "10",
      },
    }),
    analyticsData.properties.runReport({
      property: `properties/${propertyId}`,
      requestBody: {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "sessionDefaultChannelGroup" }],
        metrics: [{ name: "sessions" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: "8",
      },
    }),
  ]);

  const ov = overviewRes.data.rows?.[0]?.metricValues ?? [];
  const totalSessions = Number(ov[0]?.value ?? 0);

  const topPages = (pagesRes.data.rows ?? []).map(row => ({
    page: row.dimensionValues?.[0]?.value ?? "",
    sessions: Number(row.metricValues?.[0]?.value ?? 0),
    bounceRate: Math.round(Number(row.metricValues?.[1]?.value ?? 0) * 100),
  }));

  const topChannels = (channelsRes.data.rows ?? []).map(row => ({
    channel: row.dimensionValues?.[0]?.value ?? "",
    sessions: Number(row.metricValues?.[0]?.value ?? 0),
    percentage: totalSessions > 0 ? Math.round((Number(row.metricValues?.[0]?.value ?? 0) / totalSessions) * 100) : 0,
  }));

  return {
    period,
    sessions: totalSessions,
    users: Number(ov[1]?.value ?? 0),
    newUsers: Number(ov[2]?.value ?? 0),
    bounceRate: Math.round(Number(ov[3]?.value ?? 0) * 100),
    avgSessionDuration: Math.round(Number(ov[4]?.value ?? 0)),
    topPages,
    topChannels,
  };
}

// ── Google Search Console ─────────────────────────────────────────────────────

async function fetchGSC(auth: ReturnType<typeof createAuth>, siteUrl: string, days: number): Promise<GSCReport> {
  const searchConsole = google.searchconsole({ version: "v1", auth });

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - days);

  const fmt = (d: Date) => d.toISOString().split("T")[0];
  const period = `Last ${days} days`;

  const [queriesRes, pagesRes] = await Promise.all([
    searchConsole.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate: fmt(startDate),
        endDate: fmt(endDate),
        dimensions: ["query"],
        rowLimit: 15,
      },
    }),
    searchConsole.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate: fmt(startDate),
        endDate: fmt(endDate),
        dimensions: ["page"],
        rowLimit: 10,
      },
    }),
  ]);

  const topQueries = (queriesRes.data.rows ?? []).map(r => ({
    query: (r.keys ?? [])[0] ?? "",
    clicks: r.clicks ?? 0,
    impressions: r.impressions ?? 0,
    ctr: Math.round((r.ctr ?? 0) * 10000) / 100,
    position: Math.round((r.position ?? 0) * 10) / 10,
  }));

  const topPages = (pagesRes.data.rows ?? []).map(r => ({
    page: (r.keys ?? [])[0] ?? "",
    clicks: r.clicks ?? 0,
    impressions: r.impressions ?? 0,
    ctr: Math.round((r.ctr ?? 0) * 10000) / 100,
    position: Math.round((r.position ?? 0) * 10) / 10,
  }));

  const totalClicks = topQueries.reduce((s, q) => s + q.clicks, 0);
  const totalImpressions = topQueries.reduce((s, q) => s + q.impressions, 0);
  const avgCtr = totalImpressions > 0 ? Math.round((totalClicks / totalImpressions) * 10000) / 100 : 0;
  const avgPosition = topQueries.length > 0 ? Math.round((topQueries.reduce((s, q) => s + q.position, 0) / topQueries.length) * 10) / 10 : 0;

  return { period, totalClicks, totalImpressions, avgCtr, avgPosition, topQueries, topPages };
}

// ── Google Tag Manager ────────────────────────────────────────────────────────

async function fetchGTM(auth: ReturnType<typeof createAuth>, accountId: string, containerId: string): Promise<GTMReport> {
  const tagmanager = google.tagmanager({ version: "v2", auth });

  const containerPath = `accounts/${accountId}/containers/${containerId}`;

  // Get the live workspace
  const workspacesRes = await tagmanager.accounts.containers.workspaces.list({ parent: containerPath });
  const workspace = workspacesRes.data.workspace?.[0];
  if (!workspace?.path) throw new Error("No GTM workspace found");

  const [tagsRes, triggersRes, variablesRes] = await Promise.all([
    tagmanager.accounts.containers.workspaces.tags.list({ parent: workspace.path }),
    tagmanager.accounts.containers.workspaces.triggers.list({ parent: workspace.path }),
    tagmanager.accounts.containers.workspaces.variables.list({ parent: workspace.path }),
  ]);

  const tags = (tagsRes.data.tag ?? []).map(t => ({
    name: t.name ?? "",
    type: t.type ?? "",
    status: t.paused ? "paused" : "active",
  }));

  const issues: string[] = [];
  const pausedTags = tags.filter(t => t.status === "paused");
  if (pausedTags.length > 0) issues.push(`${pausedTags.length} tags are paused: ${pausedTags.map(t => t.name).join(", ")}`);
  const hasFbPixel = tags.some(t => t.type.toLowerCase().includes("facebook") || t.name.toLowerCase().includes("pixel"));
  const hasGtag = tags.some(t => t.type === "ua" || t.type === "ga4" || t.type === "googtag");
  if (!hasGtag) issues.push("No Google Analytics tag detected in GTM.");

  return {
    containerId,
    tagCount: tags.length,
    triggerCount: (triggersRes.data.trigger ?? []).length,
    variableCount: (variablesRes.data.variable ?? []).length,
    tags,
    issues,
  };
}

// ── Microsoft Clarity ─────────────────────────────────────────────────────────

async function fetchClarity(projectId: string, apiToken: string): Promise<ClarityReport> {
  // Clarity's API is limited — dashboard metrics available via their Projects API
  const today = new Date();
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().split("T")[0];

  try {
    const res = await fetch(
      `https://www.clarity.ms/api/v1/projects/${projectId}/dashboard?startDate=${fmt(weekAgo)}&endDate=${fmt(today)}`,
      {
        headers: { Authorization: `Bearer ${apiToken}` },
        signal: AbortSignal.timeout(15_000),
      }
    );

    if (!res.ok) throw new Error(`Clarity API ${res.status}`);
    const data = (await res.json()) as Record<string, unknown>;

    return {
      projectId,
      period: `${fmt(weekAgo)} to ${fmt(today)}`,
      sessions: typeof data.totalSessions === "number" ? data.totalSessions : undefined,
      pagesPerSession: typeof data.pagesPerSession === "number" ? data.pagesPerSession : undefined,
      engagementRate: typeof data.activeRate === "number" ? Math.round((data.activeRate as number) * 100) : undefined,
      note: "Live Clarity data fetched from dashboard API.",
    };
  } catch {
    return {
      projectId,
      period: `${fmt(weekAgo)} to ${fmt(today)}`,
      note: "Clarity dashboard API data unavailable. Check your project ID and API token. View heatmaps and session recordings directly at https://clarity.microsoft.com.",
    };
  }
}
