import { getModel, completeSimple, getEnvApiKey } from "@earendil-works/pi-ai";
import type { AuditReport, Recommendation } from "../types.js";

// The audit already produces solid, deterministic rule-based recommendations. This
// module runs those (plus the raw findings) through Claude to produce a synthesized,
// deduped, business-aware action plan. It is strictly optional: if no Anthropic
// credentials are configured, or the call fails, the caller keeps the rule-based recs.

// pi-ai's registry tops out at these ids; override with AUDIT_AI_MODEL if newer ones land.
const DEFAULT_MODEL = "claude-sonnet-4-6";
const MODEL_TIMEOUT_MS = 60_000;
const MAX_RECS = 20;

const PRIORITIES = new Set<Recommendation["priority"]>(["high", "medium", "low"]);
const CATEGORIES = new Set<Recommendation["category"]>([
  "performance", "seo", "accessibility", "ux", "analytics", "technical",
]);
const EFFORTS = new Set<Recommendation["effort"]>(["easy", "medium", "hard"]);

/** True when Anthropic credentials (API key or OAuth token) are available to pi-ai. */
export function aiRecommendationsEnabled(): boolean {
  return Boolean(getEnvApiKey("anthropic"));
}

/**
 * Refine the deterministic recommendations into a prioritized, deduped action plan.
 * Returns null (never throws) when AI is unavailable or the response can't be trusted,
 * so the orchestrator can fall back to the rule-based list.
 */
export async function synthesizeRecommendations(
  report: AuditReport,
  draft: Recommendation[],
): Promise<Recommendation[] | null> {
  if (!aiRecommendationsEnabled()) return null;
  if (draft.length === 0) return null;

  let model;
  try {
    model = getModel("anthropic", (process.env.AUDIT_AI_MODEL ?? DEFAULT_MODEL) as never);
  } catch {
    return null;
  }

  const systemPrompt =
    "You are a senior web performance and SEO consultant. You turn raw audit findings into a " +
    "clear, prioritized action plan for a website owner who is smart but not deeply technical. " +
    "You merge overlapping issues, drop noise, order by real business impact (traffic, conversions, " +
    "search ranking), and keep every fix concrete and actionable. You never invent findings that " +
    "aren't supported by the data provided.\n\n" +
    "Respond with ONLY a JSON object of the form:\n" +
    '{ "recommendations": [ { "priority": "high|medium|low", "category": ' +
    '"performance|seo|accessibility|ux|analytics|technical", "issue": "...", "impact": "why it ' +
    'matters, in plain business terms", "fix": "specific steps to fix it", "effort": ' +
    '"easy|medium|hard" } ] }\n' +
    "No prose, no markdown fences — just the JSON object.";

  const platformLine = report.platform
    ? `The site owner has told us the site is built on ${report.platform}. Where a fix has a ` +
      `platform-specific path, write the "fix" steps for ${report.platform} specifically (exact ` +
      `menu/setting names). Do NOT mention other platforms.\n\n`
    : `The platform is unknown. Keep every "fix" platform-neutral — describe what to change in ` +
      `plain terms, and do NOT assume Webflow, WordPress, Shopify, or any specific builder.\n\n`;

  const userPrompt =
    `Here are the audit findings for ${report.url}.\n\n` +
    platformLine +
    `${buildFindingsSummary(report)}\n\n` +
    `Draft (rule-based) recommendations to refine and prioritize:\n` +
    `${JSON.stringify(draft, null, 2)}\n\n` +
    `Produce the final prioritized action plan. Merge duplicates, keep the most impactful items ` +
    `first, and preserve the concrete technical fixes from the draft where they're good. ` +
    `Return at most ${MAX_RECS} recommendations.`;

  let text: string;
  try {
    const res = await completeSimple(
      model,
      { systemPrompt, messages: [{ role: "user", content: userPrompt, timestamp: Date.now() }] },
      { maxTokens: 4096, temperature: 0.3, signal: AbortSignal.timeout(MODEL_TIMEOUT_MS) },
    );
    if (res.stopReason === "error" || res.stopReason === "aborted") return null;
    text = res.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map(c => c.text)
      .join("")
      .trim();
  } catch {
    return null;
  }

  const parsed = parseRecommendations(text);
  return parsed && parsed.length > 0 ? parsed : null;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function buildFindingsSummary(report: AuditReport): string {
  const m = report.mobile;
  const d = report.desktop;
  const lines: string[] = [];

  lines.push(`Scores (mobile / desktop):`);
  lines.push(`- Performance: ${m.scores.performance} / ${d.scores.performance}`);
  lines.push(`- Accessibility: ${m.scores.accessibility} / ${d.scores.accessibility}`);
  lines.push(`- SEO: ${m.scores.seo} / ${d.scores.seo}`);
  lines.push(`- Best Practices: ${m.scores.bestPractices} / ${d.scores.bestPractices}`);

  const cwv = m.coreWebVitals;
  lines.push(`\nCore Web Vitals (mobile): LCP ${cwv.lcp.displayValue} (${cwv.lcp.rating}), ` +
    `INP ${cwv.inp.displayValue} (${cwv.inp.rating}), CLS ${cwv.cls.displayValue} (${cwv.cls.rating}), ` +
    `TBT ${cwv.tbt.displayValue} (${cwv.tbt.rating}).`);

  if (m.opportunities.length > 0) {
    lines.push(`\nTop performance opportunities: ` +
      m.opportunities.slice(0, 8).map(o => o.savings ? `${o.title} (saves ${o.savings})` : o.title).join("; ") + ".");
  }

  const seo = report.seo;
  lines.push(`\nSEO: title ${seo.title.status}, meta description ${seo.metaDescription.status}, ` +
    `${seo.h1.value.length} H1(s), canonical ${seo.canonical.value ? "set" : "missing"}, ` +
    `HTTPS ${seo.httpsEnabled ? "yes" : "no"}, sitemap ${seo.sitemap.found ? "found" : "missing"}, ` +
    `robots.txt ${seo.robotsTxt.reachable ? (seo.robotsTxt.disallowsIndexing ? "blocks crawlers" : "ok") : "missing"}, ` +
    `structured data ${seo.schemaTypes.length > 0 ? seo.schemaTypes.join("/") : "none"}, ` +
    `${seo.imagesWithoutAlt}/${seo.totalImages} images missing alt.`);
  if (seo.issues.length > 0) {
    lines.push(`SEO issues: ` + seo.issues.map(i => `[${i.severity}] ${i.message}`).join("; ") + ".");
  }

  const a = report.analytics;
  if (a?.gsc) {
    lines.push(`\nSearch Console: avg position ${a.gsc.avgPosition}, CTR ${a.gsc.avgCtr}%, ` +
      `${a.gsc.totalClicks} clicks / ${a.gsc.totalImpressions} impressions.`);
  }
  if (a?.ga4) {
    lines.push(`GA4: ${a.ga4.sessions} sessions, bounce rate ${a.ga4.bounceRate}%.`);
  }

  if (report.competitors?.length) {
    lines.push(`\nCompetitors (performance / SEO): ` + report.competitors
      .filter(c => c.reachable)
      .map(c => `${c.url}: perf ${c.scores.performance}, seo ${c.scores.seo}`)
      .join("; ") + ".");
  }

  return lines.join("\n");
}

function parseRecommendations(text: string): Recommendation[] | null {
  // Tolerate stray prose or markdown fences around the JSON.
  let raw = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  raw = raw.slice(start, end + 1);

  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }

  const list = (obj as { recommendations?: unknown }).recommendations;
  if (!Array.isArray(list)) return null;

  const recs: Recommendation[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const issue = typeof r.issue === "string" ? r.issue.trim() : "";
    const fix = typeof r.fix === "string" ? r.fix.trim() : "";
    const impact = typeof r.impact === "string" ? r.impact.trim() : "";
    if (!issue || !fix) continue;

    recs.push({
      priority: PRIORITIES.has(r.priority as Recommendation["priority"]) ? (r.priority as Recommendation["priority"]) : "medium",
      category: CATEGORIES.has(r.category as Recommendation["category"]) ? (r.category as Recommendation["category"]) : "technical",
      issue,
      impact: impact || "Affects user experience and search visibility.",
      fix,
      effort: EFFORTS.has(r.effort as Recommendation["effort"]) ? (r.effort as Recommendation["effort"]) : "medium",
    });
    if (recs.length >= MAX_RECS) break;
  }

  return recs.length > 0 ? recs : null;
}
