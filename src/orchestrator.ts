import { randomUUID } from "crypto";
import { runPerformanceAudit } from "./agents/performanceAgent.js";
import { runSeoAudit } from "./agents/seoAgent.js";
import { runAnalyticsAudit } from "./agents/analyticsAgent.js";
import { runCompetitorAudit } from "./agents/competitorAgent.js";
import { buildWeeklyDiff } from "./report/diff.js";
import { saveAuditSnapshot, loadPreviousSnapshot } from "./store/history.js";
import type { AuditRequest, AuditReport, Recommendation } from "./types.js";

export async function runFullAudit(request: AuditRequest, onProgress?: (msg: string) => void): Promise<AuditReport> {
  const log = (msg: string) => {
    console.log(`[audit] ${msg}`);
    onProgress?.(msg);
  };

  const auditId = randomUUID();
  const timestamp = new Date().toISOString();
  const { url } = request;

  log(`Starting audit for ${url}`);

  // ── Phase 1: Parallel data gathering ──────────────────────────────────────

  log("Running PageSpeed (mobile + desktop)...");
  log("Running SEO analysis...");

  let perfError: string | undefined;
  let seoError: string | undefined;

  const [perfResult, seoResult] = await Promise.all([
    runPerformanceAudit(url, process.env.PAGESPEED_API_KEY).catch(err => {
      perfError = (err as Error).message;
      log(`PageSpeed error: ${perfError}`);
      return null;
    }),
    runSeoAudit(url).catch(err => {
      seoError = (err as Error).message;
      log(`SEO analysis error: ${seoError}`);
      return null;
    }),
  ]);

  if (!perfResult) throw new Error(`PageSpeed audit failed: ${perfError ?? "unknown error"}`);
  if (!seoResult) throw new Error(`SEO analysis failed: ${seoError ?? "unknown error"}`);

  // ── Phase 2: Analytics (only if requested and configured) ─────────────────

  let analytics = undefined;
  if (request.includeAnalytics && process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH) {
    log("Fetching analytics data (GA4, GSC, GTM, Clarity)...");
    analytics = await runAnalyticsAudit({
      serviceAccountKeyPath: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH,
      ga4PropertyId: request.ga4PropertyId ?? process.env.GA4_PROPERTY_ID,
      ga4LookbackDays: Number(process.env.GA4_LOOKBACK_DAYS ?? 30),
      gscSiteUrl: request.gscSiteUrl ?? process.env.GSC_SITE_URL,
      gscLookbackDays: Number(process.env.GSC_LOOKBACK_DAYS ?? 28),
      gtmAccountId: process.env.GTM_ACCOUNT_ID,
      gtmContainerId: request.gtmContainerId ?? process.env.GTM_CONTAINER_ID,
      clarityProjectId: request.clarityProjectId ?? process.env.CLARITY_PROJECT_ID,
      clarityApiToken: process.env.CLARITY_API_TOKEN,
    }).catch(err => {
      log(`Analytics error: ${err.message}`);
      return undefined;
    });
  }

  // ── Phase 3: Competitor analysis ──────────────────────────────────────────

  let competitors = undefined;
  if (request.competitors && request.competitors.length > 0) {
    log(`Auditing ${request.competitors.length} competitor(s)...`);
    competitors = await runCompetitorAudit(request.competitors, process.env.PAGESPEED_API_KEY).catch(err => {
      log(`Competitor audit error: ${err.message}`);
      return undefined;
    });
  }

  // ── Phase 4: Weekly diff ──────────────────────────────────────────────────

  let weeklyDiff = undefined;
  if (request.weeklyComparison !== false) {
    const previous = loadPreviousSnapshot(url, 14);
    if (previous) {
      log("Previous audit found — generating weekly comparison...");
      const partialReport = { auditId, timestamp, url, mobile: perfResult.mobile, desktop: perfResult.desktop, seo: seoResult, recommendations: [] };
      weeklyDiff = buildWeeklyDiff(partialReport as AuditReport, previous);
    } else {
      log("No previous audit found — this will be the baseline for future weekly diffs.");
    }
  }

  // ── Phase 5: Generate recommendations ────────────────────────────────────

  log("Generating recommendations...");
  const recommendations = buildRecommendations(perfResult.mobile, seoResult, analytics);

  const report: AuditReport = {
    auditId,
    timestamp,
    url,
    mobile: perfResult.mobile,
    desktop: perfResult.desktop,
    seo: seoResult,
    analytics,
    competitors,
    weeklyDiff,
    recommendations,
  };

  // ── Phase 6: Save snapshot for future diffs ───────────────────────────────

  saveAuditSnapshot(report);
  log("Audit complete.");

  return report;
}

// ── Recommendation builder ────────────────────────────────────────────────────

// Concrete fixes for common PageSpeed opportunity audits, keyed by Lighthouse audit id.
const PSI_FIX_LIBRARY: Record<string, { fix: string; effort: Recommendation["effort"] }> = {
  "render-blocking-resources": {
    fix: "Add `defer` or `async` to <script> tags, and inline critical CSS so the page can render before stylesheets finish loading.",
    effort: "easy",
  },
  "uses-text-compression": {
    fix: "Enable gzip or Brotli compression on your server/hosting. Most hosts (Netlify, Vercel, Cloudflare) have this as a one-click setting.",
    effort: "easy",
  },
  "modern-image-formats": {
    fix: "Convert your images to WebP or AVIF (use squoosh.app — free, drag & drop). They're 25–50% smaller than JPEG/PNG at the same quality.",
    effort: "easy",
  },
  "uses-optimized-images": {
    fix: "Compress your images with squoosh.app or tinypng.com before uploading. Aim for under 200KB per image.",
    effort: "easy",
  },
  "uses-responsive-images": {
    fix: "Use `srcset` on <img> tags to serve smaller images to phones instead of sending desktop-size images to every device.",
    effort: "medium",
  },
  "offscreen-images": {
    fix: "Add `loading=\"lazy\"` to all <img> tags below the fold so they only load when the user scrolls to them.",
    effort: "easy",
  },
  "unused-javascript": {
    fix: "Remove unused scripts and split large bundles so pages only load the code they need. Check the report's file list to see the biggest offenders.",
    effort: "medium",
  },
  "unused-css-rules": {
    fix: "Remove unused CSS with a tool like PurgeCSS, or manually delete stylesheets/frameworks you no longer use.",
    effort: "medium",
  },
  "unminified-javascript": {
    fix: "Enable JavaScript minification in your build tool (it's on by default in production builds of Vite/Next/etc — check you're deploying a production build).",
    effort: "easy",
  },
  "unminified-css": {
    fix: "Enable CSS minification in your build tool, or run stylesheets through a minifier before deploying.",
    effort: "easy",
  },
  "server-response-time": {
    fix: "Put your site behind a CDN (Cloudflare's free plan works), enable caching, or upgrade slow hosting.",
    effort: "medium",
  },
  "redirects": {
    fix: "Update links to point directly to the final URL instead of going through redirects (e.g. link to https://www... directly if that's where the site lives).",
    effort: "easy",
  },
  "uses-rel-preconnect": {
    fix: "Add `<link rel=\"preconnect\">` for third-party origins you load from (fonts, analytics), e.g. `<link rel=\"preconnect\" href=\"https://fonts.gstatic.com\">`.",
    effort: "easy",
  },
  "font-display": {
    fix: "Add `font-display: swap` to your @font-face rules (or `&display=swap` to Google Fonts URLs) so text shows immediately with a fallback font.",
    effort: "easy",
  },
  "uses-long-cache-ttl": {
    fix: "Set long cache headers (e.g. `Cache-Control: max-age=31536000`) for images, fonts, CSS and JS so repeat visitors don't re-download them.",
    effort: "easy",
  },
  "prioritize-lcp-image": {
    fix: "Add `fetchpriority=\"high\"` to your hero image and preload it with `<link rel=\"preload\" as=\"image\">` so it loads before anything else.",
    effort: "easy",
  },
  "efficient-animated-content": {
    fix: "Replace animated GIFs with <video> elements (MP4/WebM) — they're often 10x smaller.",
    effort: "easy",
  },
  "total-byte-weight": {
    fix: "Reduce total page size: compress images, remove unused scripts and fonts, and lazy-load below-the-fold content. Aim for under 1.5MB total.",
    effort: "medium",
  },
  "legacy-javascript": {
    fix: "Update your build target to modern browsers (e.g. `target: 'es2020'`) so you stop shipping unnecessary polyfills.",
    effort: "medium",
  },
  "duplicated-javascript": {
    fix: "Check your bundle for the same library included twice (often two versions of one dependency) and deduplicate it.",
    effort: "medium",
  },
  "dom-size": {
    fix: "Reduce the number of HTML elements on the page — remove hidden/unused markup and paginate or virtualise long lists.",
    effort: "hard",
  },
  "third-party-summary": {
    fix: "Audit your third-party scripts (chat widgets, analytics, embeds) — remove ones you don't need and lazy-load the rest.",
    effort: "medium",
  },
};

// PSI descriptions contain markdown links like [Learn more](url) — strip them for clean report output.
function cleanPsiDescription(text: string): string {
  return text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").trim();
}

function buildRecommendations(
  mobile: AuditReport["mobile"],
  seo: AuditReport["seo"],
  analytics: AuditReport["analytics"]
): Recommendation[] {
  const recs: Recommendation[] = [];

  // Per-problem recommendations from PageSpeed opportunities
  for (const opp of mobile.opportunities) {
    const known = PSI_FIX_LIBRARY[opp.id];
    recs.push({
      id: opp.id,
      priority: opp.score < 50 ? "high" : opp.score < 80 ? "medium" : "low",
      category: "performance",
      issue: opp.savings ? `${opp.title} (potential saving: ${opp.savings})` : opp.title,
      impact: cleanPsiDescription(opp.description),
      fix: known?.fix ?? cleanPsiDescription(opp.description),
      effort: known?.effort ?? "medium",
    });
  }

  // Performance
  if (mobile.scores.performance < 50) {
    recs.push({
      id: "perf-low",
      priority: "high",
      category: "performance",
      issue: "Very low performance score",
      impact: "Slow pages lose 53% of mobile visitors before they even see your content.",
      fix: "Start with the top opportunities listed in the Performance section. Focus on reducing unused JavaScript, compressing images, and enabling browser caching.",
      effort: "medium",
    });
  } else if (mobile.scores.performance < 75) {
    recs.push({
      id: "perf-low",
      priority: "medium",
      category: "performance",
      issue: "Performance score needs improvement",
      impact: "Users may experience slow loading, increasing bounce rate.",
      fix: "Implement the performance opportunities in this report, especially image optimisation and JavaScript reduction.",
      effort: "medium",
    });
  }

  // LCP
  if (mobile.coreWebVitals.lcp.rating === "poor") {
    recs.push({
      id: "lcp-slow",
      priority: "high",
      category: "performance",
      issue: `LCP is ${mobile.coreWebVitals.lcp.displayValue} — poor (target: under 2.5s)`,
      impact: "LCP is a Core Web Vital. Google uses it in search ranking. Poor LCP directly reduces your visibility.",
      fix: "Optimise the largest element on your page (usually a hero image or heading). Use next-gen image formats (WebP/AVIF), preload the LCP element, and ensure your server responds quickly.",
      effort: "medium",
    });
  } else if (mobile.coreWebVitals.lcp.rating === "needs-improvement") {
    recs.push({
      id: "lcp-slow",
      priority: "medium",
      category: "performance",
      issue: `LCP is ${mobile.coreWebVitals.lcp.displayValue} — needs improvement (target: under 2.5s)`,
      impact: "Borderline LCP may affect your search ranking and user experience.",
      fix: "Optimise your hero image: compress it, serve in WebP format, and use the `loading='eager'` attribute on it.",
      effort: "easy",
    });
  }

  // CLS
  if (mobile.coreWebVitals.cls.rating === "poor") {
    recs.push({
      id: "cls-poor",
      priority: "high",
      category: "ux",
      issue: `CLS is ${mobile.coreWebVitals.cls.displayValue} — poor (target: under 0.1)`,
      impact: "Layout shifts frustrate users (content jumps while reading). This is also a Google ranking signal.",
      fix: "Add explicit `width` and `height` attributes to all images and video embeds. Avoid injecting content above existing content. Reserve space for ads and embeds.",
      effort: "easy",
    });
  }

  // INP
  if (mobile.coreWebVitals.inp.rating === "poor") {
    recs.push({
      id: "inp-poor",
      priority: "high",
      category: "performance",
      issue: `INP is ${mobile.coreWebVitals.inp.displayValue} — poor (target: under 200ms)`,
      impact: "Slow interaction response makes the page feel broken. Google uses INP as a ranking factor.",
      fix: "Reduce JavaScript execution time. Break up long tasks into smaller chunks. Use Web Workers for heavy processing. Avoid large third-party scripts loading synchronously.",
      effort: "hard",
    });
  }

  // Accessibility
  if (mobile.scores.accessibility < 70) {
    recs.push({
      id: "a11y-low",
      priority: "high",
      category: "accessibility",
      issue: "Low accessibility score",
      impact: "Up to 15% of your potential users have disabilities. Poor accessibility also affects SEO.",
      fix: "Fix the accessibility issues reported above. Start with image alt text, form labels, and colour contrast. Use axe DevTools browser extension for detailed guidance.",
      effort: "medium",
    });
  }

  // SEO from seo module
  for (const issue of seo.issues) {
    recs.push({
      id: seoIssueId(issue.message),
      priority: issue.severity === "high" ? "high" : issue.severity === "medium" ? "medium" : "low",
      category: "seo",
      issue: issue.message,
      impact: `${issue.category} issue affecting search visibility and rankings.`,
      fix: issue.fix,
      effort: "easy",
    });
  }

  // Analytics gaps
  if (analytics && !analytics.ga4) {
    recs.push({
      priority: "medium",
      category: "analytics",
      issue: "Google Analytics 4 data unavailable",
      impact: "Without GA4 data, you're flying blind on who visits your site and what they do.",
      fix: "Ensure the service account has 'Viewer' access to the GA4 property, or install GA4 if not already set up.",
      effort: "easy",
    });
  }

  if (analytics?.gsc && analytics.gsc.avgPosition > 20) {
    recs.push({
      priority: "medium",
      category: "seo",
      issue: `Average search position is ${analytics.gsc.avgPosition} — too low`,
      impact: "Pages beyond position 10 get very few clicks. You need to improve rankings to drive organic traffic.",
      fix: "Focus on improving on-page SEO for your top queries. Create better content targeting those keywords, add internal links, and acquire backlinks from relevant sites.",
      effort: "hard",
    });
  }

  // Remove duplicates by issue text, sort by priority
  const seen = new Set<string>();
  return recs
    .filter(r => { if (seen.has(r.issue)) return false; seen.add(r.issue); return true; })
    .sort((a, b) => priorityOrder(a.priority) - priorityOrder(b.priority));
}

function priorityOrder(p: "high" | "medium" | "low"): number {
  return p === "high" ? 0 : p === "medium" ? 1 : 2;
}

// Derive a stable guide id from an SEO issue message (seoAgent doesn't emit ids).
function seoIssueId(message: string): string | undefined {
  const m = message.toLowerCase();
  if (m.includes("alt text")) return "alt-text";
  if (m.includes("robots.txt")) return "robots-txt";
  if (m.includes("sitemap")) return "sitemap";
  if (m.includes("canonical")) return "canonical";
  if (m.includes("meta description")) return "meta-description";
  if (m.includes("title")) return "title-tag";
  if (m.includes("h1")) return "h1";
  if (m.includes("https")) return "https";
  if (m.includes("structured data") || m.includes("schema")) return "structured-data";
  if (m.includes("open graph")) return "open-graph";
  return undefined;
}
