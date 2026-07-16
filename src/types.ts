// ── Audit request (parsed from Sokosumi task description) ──────────────────────

export interface AuditRequest {
  url: string;
  competitors?: string[];
  /** Google account email to share the report doc with (doc lands in their "Shared with me"). */
  shareEmail?: string;
  includeAnalytics?: boolean;
  ga4PropertyId?: string;
  gscSiteUrl?: string;
  gtmContainerId?: string;
  clarityProjectId?: string;
  weeklyComparison?: boolean;
  /** Save a PDF copy of the report locally (only when explicitly requested in the task). */
  pdf?: boolean;
}

// ── PageSpeed / Lighthouse ──────────────────────────────────────────────────────

export interface PageSpeedScores {
  performance: number;
  accessibility: number;
  seo: number;
  bestPractices: number;
}

export interface CoreWebVital {
  value: number;
  unit: string;
  rating: "good" | "needs-improvement" | "poor";
  displayValue: string;
}

export interface PageSpeedAuditItem {
  id: string;
  title: string;
  description: string;
  score: number;
  displayValue?: string;
  savings?: string;
}

export interface PageSpeedResult {
  url: string;
  strategy: "mobile" | "desktop";
  scores: PageSpeedScores;
  coreWebVitals: {
    lcp: CoreWebVital;
    inp: CoreWebVital;
    cls: CoreWebVital;
    fcp: CoreWebVital;
    ttfb: CoreWebVital;
    tbt: CoreWebVital;
    speedIndex: CoreWebVital;
  };
  opportunities: PageSpeedAuditItem[];
  failedAudits: PageSpeedAuditItem[];
}

// ── SEO Analysis ────────────────────────────────────────────────────────────────

export type CheckStatus = "good" | "warning" | "error";

export interface SeoCheck<T> {
  value: T;
  status: CheckStatus;
  message: string;
}

export interface SeoAnalysis {
  url: string;
  title: SeoCheck<string>;
  metaDescription: SeoCheck<string>;
  h1: SeoCheck<string[]>;
  canonical: SeoCheck<string | null>;
  robotsTxt: { reachable: boolean; disallowsIndexing: boolean };
  sitemap: { found: boolean; url: string | null };
  openGraph: { title: boolean; description: boolean; image: boolean };
  twitterCard: boolean;
  schemaTypes: string[];
  imagesWithoutAlt: number;
  totalImages: number;
  internalLinks: number;
  externalLinks: number;
  httpsEnabled: boolean;
  issues: SeoIssue[];
}

export interface SeoIssue {
  severity: "high" | "medium" | "low";
  category: string;
  message: string;
  fix: string;
}

// ── Analytics ───────────────────────────────────────────────────────────────────

export interface GA4Report {
  period: string;
  sessions: number;
  users: number;
  newUsers: number;
  bounceRate: number;
  avgSessionDuration: number;
  topPages: Array<{ page: string; sessions: number; bounceRate: number }>;
  topChannels: Array<{ channel: string; sessions: number; percentage: number }>;
}

export interface GSCReport {
  period: string;
  totalClicks: number;
  totalImpressions: number;
  avgCtr: number;
  avgPosition: number;
  topQueries: Array<{
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }>;
  topPages: Array<{
    page: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }>;
}

export interface GTMReport {
  containerId: string;
  tagCount: number;
  triggerCount: number;
  variableCount: number;
  tags: Array<{ name: string; type: string; status: string }>;
  issues: string[];
}

export interface ClarityReport {
  projectId: string;
  period: string;
  sessions?: number;
  pagesPerSession?: number;
  engagementRate?: number;
  topScrollDepth?: number;
  note: string;
}

export interface AnalyticsBundle {
  ga4?: GA4Report;
  gsc?: GSCReport;
  gtm?: GTMReport;
  clarity?: ClarityReport;
}

// ── Competitor ──────────────────────────────────────────────────────────────────

export interface CompetitorAudit {
  url: string;
  reachable: boolean;
  scores: PageSpeedScores;
  seoSnapshot: {
    title: string;
    metaDescription: string;
    h1: string;
    hasSchema: boolean;
    hasOpenGraph: boolean;
  };
  strengths: string[];
  opportunities: string[];
}

// ── Recommendations ─────────────────────────────────────────────────────────────

export interface Recommendation {
  /** Stable identifier (Lighthouse audit id or internal slug) used to look up detailed fix guides. */
  id?: string;
  priority: "high" | "medium" | "low";
  category: "performance" | "seo" | "accessibility" | "ux" | "analytics" | "technical";
  issue: string;
  impact: string;
  fix: string;
  effort: "easy" | "medium" | "hard";
}

// ── Weekly diff ─────────────────────────────────────────────────────────────────

export interface WeeklyDiff {
  previousDate: string;
  currentDate: string;
  scoreChanges: {
    mobile: Partial<PageSpeedScores>;
    desktop: Partial<PageSpeedScores>;
  };
  improved: string[];
  declined: string[];
  newIssues: string[];
  resolvedIssues: string[];
}

// ── Full audit report ───────────────────────────────────────────────────────────

export interface AuditReport {
  auditId: string;
  timestamp: string;
  url: string;
  mobile: PageSpeedResult;
  desktop: PageSpeedResult;
  seo: SeoAnalysis;
  analytics?: AnalyticsBundle;
  competitors?: CompetitorAudit[];
  weeklyDiff?: WeeklyDiff;
  recommendations: Recommendation[];
}

// ── Stored history record (lightweight, for weekly diffs) ───────────────────────

export interface StoredAuditSnapshot {
  auditId: string;
  timestamp: string;
  url: string;
  mobileScores: PageSpeedScores;
  desktopScores: PageSpeedScores;
  issueIds: string[];
}
