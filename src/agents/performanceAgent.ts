import type { PageSpeedResult, PageSpeedScores, CoreWebVital, PageSpeedAuditItem } from "../types.js";

const API_BASE = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const CATEGORIES = ["performance", "accessibility", "best-practices", "seo"];

export async function runPerformanceAudit(
  url: string,
  apiKey?: string
): Promise<{ mobile: PageSpeedResult; desktop: PageSpeedResult }> {
  const [mobile, desktop] = await Promise.all([
    fetchPageSpeed(url, "mobile", apiKey),
    fetchPageSpeed(url, "desktop", apiKey),
  ]);
  return { mobile, desktop };
}

async function fetchPageSpeed(
  url: string,
  strategy: "mobile" | "desktop",
  apiKey?: string
): Promise<PageSpeedResult> {
  const params = new URLSearchParams({ url, strategy });
  if (apiKey) params.set("key", apiKey);
  const categoryQuery = CATEGORIES.map(c => `category=${encodeURIComponent(c)}`).join("&");
  const endpoint = `${API_BASE}?${params.toString()}&${categoryQuery}`;

  // Allow 3 min per attempt; retry once on timeout or 5xx (transient Lighthouse errors)
  let res: Response;
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      res = await fetch(endpoint, { signal: AbortSignal.timeout(180_000) });
      if (res.ok) break;
      lastError = await res.text().catch(() => "");
      // Retry on 500 (transient Lighthouse failure) but not on 4xx
      if (res.status < 500 || attempt === 1) {
        throw new Error(`PageSpeed API ${strategy} failed (${res.status}): ${lastError.slice(0, 200)}`);
      }
      await new Promise(r => setTimeout(r, 5000)); // wait 5s before retry
    } catch (err) {
      if ((err as Error).name !== "TimeoutError" || attempt === 1) throw err;
    }
  }
  res = res!;

  const data = (await res.json()) as Record<string, unknown>;
  return parseResponse(data, url, strategy);
}

function parseResponse(
  data: Record<string, unknown>,
  url: string,
  strategy: "mobile" | "desktop"
): PageSpeedResult {
  const lr = (data.lighthouseResult ?? {}) as Record<string, unknown>;
  const cats = (lr.categories ?? {}) as Record<string, { score: number }>;
  const audits = (lr.audits ?? {}) as Record<string, RawAudit>;

  const score = (key: string) => Math.round((cats[key]?.score ?? 0) * 100);

  const scores: PageSpeedScores = {
    performance: score("performance"),
    accessibility: score("accessibility"),
    seo: score("seo"),
    bestPractices: score("best-practices"),
  };

  return {
    url,
    strategy,
    scores,
    coreWebVitals: {
      lcp: vitalize(audits["largest-contentful-paint"], [[2500, 4000]]),
      inp: vitalize(audits["interaction-to-next-paint"], [[200, 500]]),
      cls: vitalizeRaw(audits["cumulative-layout-shift"], [[0.1, 0.25]], ""),
      fcp: vitalize(audits["first-contentful-paint"], [[1800, 3000]]),
      ttfb: vitalize(audits["server-response-time"], [[800, 1800]]),
      tbt: vitalize(audits["total-blocking-time"], [[200, 600]]),
      speedIndex: vitalize(audits["speed-index"], [[3400, 5800]]),
    },
    opportunities: extractAudits(audits, "opportunity"),
    failedAudits: extractFailedBinary(audits),
  };
}

interface RawAudit {
  id: string;
  title: string;
  description: string;
  score: number | null;
  numericValue?: number;
  displayValue?: string;
  scoreDisplayMode?: string;
  details?: { type?: string };
}

function vitalize(audit: RawAudit | undefined, thresholds: [[number, number]]): CoreWebVital {
  const ms = audit?.numericValue ?? 0;
  return {
    value: ms,
    unit: "ms",
    displayValue: audit?.displayValue ?? "-",
    rating: rate(ms, thresholds[0]),
  };
}

function vitalizeRaw(audit: RawAudit | undefined, thresholds: [[number, number]], _unit: string): CoreWebVital {
  const v = audit?.numericValue ?? 0;
  return {
    value: v,
    unit: "",
    displayValue: audit?.displayValue ?? "-",
    rating: rate(v, thresholds[0]),
  };
}

function rate(value: number, [good, poor]: [number, number]): "good" | "needs-improvement" | "poor" {
  if (value <= good) return "good";
  if (value <= poor) return "needs-improvement";
  return "poor";
}

function extractAudits(audits: Record<string, RawAudit>, type: string): PageSpeedAuditItem[] {
  return Object.values(audits)
    .filter(a => a.details?.type === type && a.score !== null && (a.score ?? 1) < 1)
    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
    .map(a => ({
      id: a.id,
      title: a.title,
      description: a.description,
      score: Math.round((a.score ?? 0) * 100),
      displayValue: a.displayValue,
      savings: a.displayValue,
    }));
}

function extractFailedBinary(audits: Record<string, RawAudit>): PageSpeedAuditItem[] {
  return Object.values(audits)
    .filter(
      a =>
        a.scoreDisplayMode === "binary" &&
        a.score !== null &&
        (a.score ?? 1) < 0.9 &&
        a.details?.type !== "opportunity"
    )
    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
    .map(a => ({
      id: a.id,
      title: a.title,
      description: a.description,
      score: Math.round((a.score ?? 0) * 100),
      displayValue: a.displayValue,
    }));
}
