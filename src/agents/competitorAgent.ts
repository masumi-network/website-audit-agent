import type { CompetitorAudit, PageSpeedScores } from "../types.js";

export async function runCompetitorAudit(
  competitorUrls: string[],
  pagespeedApiKey?: string
): Promise<CompetitorAudit[]> {
  const results = await Promise.allSettled(
    competitorUrls.map(url => auditOne(url, pagespeedApiKey))
  );

  return results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    console.warn(`[competitor] Failed to audit ${competitorUrls[i]}:`, (r as PromiseRejectedResult).reason);
    return {
      url: competitorUrls[i],
      reachable: false,
      scores: { performance: 0, accessibility: 0, seo: 0, bestPractices: 0 },
      seoSnapshot: { title: "", metaDescription: "", h1: "", hasSchema: false, hasOpenGraph: false },
      strengths: [],
      opportunities: [],
    };
  });
}

async function auditOne(url: string, apiKey?: string): Promise<CompetitorAudit> {
  const [psResult, seoSnapshot] = await Promise.allSettled([
    fetchCompetitorPageSpeed(url, apiKey),
    fetchCompetitorSeo(url),
  ]);

  const scores: PageSpeedScores = psResult.status === "fulfilled"
    ? psResult.value
    : { performance: 0, accessibility: 0, seo: 0, bestPractices: 0 };

  const seo = seoSnapshot.status === "fulfilled"
    ? seoSnapshot.value
    : { title: "N/A", metaDescription: "N/A", h1: "N/A", hasSchema: false, hasOpenGraph: false };

  return {
    url,
    reachable: psResult.status === "fulfilled",
    scores,
    seoSnapshot: seo,
    strengths: deriveStrengths(scores, seo),
    opportunities: deriveOpportunities(scores, seo),
  };
}

async function fetchCompetitorPageSpeed(url: string, apiKey?: string): Promise<PageSpeedScores> {
  const API_BASE = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
  const params = new URLSearchParams({ url, strategy: "mobile" });
  if (apiKey) params.set("key", apiKey);
  const categoryQuery = ["performance", "accessibility", "best-practices", "seo"]
    .map(c => `category=${encodeURIComponent(c)}`).join("&");
  const endpoint = `${API_BASE}?${params.toString()}&${categoryQuery}`;

  const res = await fetch(endpoint, { signal: AbortSignal.timeout(90_000) });
  if (!res.ok) throw new Error(`PageSpeed failed for ${url}: ${res.status}`);

  const data = (await res.json()) as Record<string, unknown>;
  const lr = (data.lighthouseResult ?? {}) as Record<string, unknown>;
  const cats = (lr.categories ?? {}) as Record<string, { score: number }>;
  const score = (key: string) => Math.round((cats[key]?.score ?? 0) * 100);

  return {
    performance: score("performance"),
    accessibility: score("accessibility"),
    seo: score("seo"),
    bestPractices: score("best-practices"),
  };
}

async function fetchCompetitorSeo(url: string): Promise<{
  title: string;
  metaDescription: string;
  h1: string;
  hasSchema: boolean;
  hasOpenGraph: boolean;
}> {
  const res = await fetch(url, {
    headers: { "User-Agent": "WebsiteAuditAgent/1.0" },
    signal: AbortSignal.timeout(20_000),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  const html = await res.text();

  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const metaMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
  const h1Match = html.match(/<h1[^>]*>([^<]*)<\/h1>/i);

  return {
    title: titleMatch ? titleMatch[1].trim().slice(0, 80) : "",
    metaDescription: metaMatch ? metaMatch[1].trim().slice(0, 160) : "",
    h1: h1Match ? h1Match[1].replace(/<[^>]+>/g, "").trim().slice(0, 100) : "",
    hasSchema: /"@type"\s*:/.test(html),
    hasOpenGraph: /<meta[^>]+property=["']og:/i.test(html),
  };
}

function deriveStrengths(
  scores: PageSpeedScores,
  seo: { hasSchema: boolean; hasOpenGraph: boolean }
): string[] {
  const strengths: string[] = [];
  if (scores.performance >= 90) strengths.push("Excellent page speed — very fast loading");
  else if (scores.performance >= 75) strengths.push("Good page performance score");
  if (scores.accessibility >= 90) strengths.push("Strong accessibility compliance");
  if (scores.seo >= 90) strengths.push("Well-optimised for search engines (SEO score 90+)");
  if (seo.hasSchema) strengths.push("Using structured data (Schema.org markup)");
  if (seo.hasOpenGraph) strengths.push("Open Graph tags set up for social sharing");
  if (strengths.length === 0) strengths.push("No standout strengths detected in this audit");
  return strengths;
}

function deriveOpportunities(
  scores: PageSpeedScores,
  _seo: { hasSchema: boolean; hasOpenGraph: boolean }
): string[] {
  const opps: string[] = [];
  if (scores.performance < 75) opps.push("Page speed is below average — an opportunity for you to win on performance");
  if (scores.accessibility < 80) opps.push("Accessibility score is low — users with disabilities may be underserved");
  if (scores.seo < 80) opps.push("SEO score is weak — you can rank better with proper on-page optimisation");
  if (scores.bestPractices < 80) opps.push("Best practices score is low — technical quality issues present");
  if (opps.length === 0) opps.push("Competitor performs well across the board — focus on content and brand differentiation");
  return opps;
}
