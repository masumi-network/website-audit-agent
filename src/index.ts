import { startSokosumiAgentWorker } from "@masumi-network/pi-sokosumi/worker";
import { runFullAudit } from "./orchestrator.js";
import { buildMarkdownReport } from "./report/builder.js";
import { buildPlainEnglishHtml } from "./report/plainEnglish.js";
import { htmlToPdfLocally } from "./report/pdf.js";
import { writeFileSync, unlinkSync } from "fs";
import { resolve } from "path";
import type { AuditReport, AuditRequest } from "./types.js";

// The pi-sokosumi worker's published .d.ts omits most of its runtime options
// (apiUrl, apiKey, enabled, createTaskHandler, …), so we type the handler
// inputs ourselves and cast the options object below.
interface SokosumiEvent {
  id: string;
  status?: string;
  comment?: string;
  coworkerId?: string;
}

interface SokosumiTask {
  id: string;
  title?: string;
  name?: string;
  description?: string;
  events?: SokosumiEvent[];
}

interface SokosumiClient {
  createTaskEvent(taskId: string, body: Record<string, unknown>): Promise<unknown>;
}

interface SokosumiTaskEvent {
  status: "COMPLETED" | "FAILED";
  origin: "SOKOSUMI";
  comment: string;
  credits?: number;
}

const BANNER = `
╔══════════════════════════════════════════════════════════╗
║          Website Audit Agent  —  powered by Pi           ║
║  Submit tasks at your Sokosumi coworker task board       ║
╚══════════════════════════════════════════════════════════╝
`.trim();

console.log(BANNER);

startSokosumiAgentWorker({
  enabled: true,
  apiUrl: process.env.SOKOSUMI_API_URL,
  apiKey: process.env.SOKOSUMI_COWORKER_API_KEY!,

  createTaskHandler: async ({ task, client, event }: { task: SokosumiTask; client: SokosumiClient; event?: SokosumiEvent }): Promise<SokosumiTaskEvent> => {
    // ── 0. Detect follow-up replies on a completed audit ──────────────────────
    const replyText = event?.comment?.trim() ?? "";
    const previousReport = findPreviousCompletedReport(task);
    if (previousReport && replyText && !replyText.match(/https?:\/\//)) {
      console.log(`[worker] Follow-up reply detected: "${replyText.slice(0, 80)}"`);
      return {
        status: "COMPLETED",
        origin: "SOKOSUMI",
        comment: buildFollowUpResponse(replyText, previousReport),
        credits: Number(process.env.SOKOSUMI_TASK_CREDITS ?? 5),
      };
    }

    // ── 1. Parse the task request ─────────────────────────────────────────────
    let request: AuditRequest;
    try {
      request = parseRequest(task.description ?? "", task.title ?? "");
    } catch (err) {
      return {
        status: "FAILED",
        origin: "SOKOSUMI",
        comment: [
          "❌ Could not parse audit request.",
          "",
          "Please provide a valid URL in the task description. You can also provide a JSON body like:",
          "```json",
          JSON.stringify({
            url: "https://example.com",
            competitors: ["https://competitor.com"],
            includeAnalytics: true,
            ga4PropertyId: "123456789",
          }, null, 2),
          "```",
        ].join("\n"),
      };
    }

    console.log(`[worker] Starting audit for: ${request.url}`);

    // ── 2. Post a "running" update ────────────────────────────────────────────
    await client.createTaskEvent(task.id, {
      status: "RUNNING",
      comment: `🔍 Audit started for **${request.url}**\n\nRunning: PageSpeed (mobile + desktop), SEO, ${request.includeAnalytics ? "Analytics (GA4, GSC, GTM, Clarity), " : ""}${request.competitors?.length ? `Competitor analysis (${request.competitors.length} sites), ` : ""}recommendations.\n\nThis usually takes 30–90 seconds.`,
    }).catch(() => {});

    // ── 3. Run the full audit ─────────────────────────────────────────────────
    let report;
    try {
      report = await runFullAudit(request, async (msg) => {
        // Post progress updates to Sokosumi
        await client.createTaskEvent(task.id, {
          status: "RUNNING",
          comment: `⏳ ${msg}`,
        }).catch(() => {});
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        status: "FAILED",
        origin: "SOKOSUMI",
        comment: `❌ Audit failed: ${message}\n\nPlease check that the URL is publicly reachable and try again.`,
      };
    }

    // ── 4. Build the Markdown report ──────────────────────────────────────────
    const markdown = buildMarkdownReport(report);

    // ── 5. Save a local PDF, but only when the task asked for one ─────────────
    let pdfPath: string | undefined;
    if (request.pdf) {
      try {
        const host = new URL(request.url).hostname.replace(/\./g, "-");
        const baseName = `audit-report-${host}-${new Date(report.timestamp).toISOString().split("T")[0]}`;
        const htmlPath = `${baseName}.html`;
        writeFileSync(htmlPath, buildPlainEnglishHtml(report));
        if (htmlToPdfLocally(htmlPath, `${baseName}.pdf`)) {
          pdfPath = resolve(`${baseName}.pdf`);
          console.log(`[worker] PDF saved: ${pdfPath}`);
        }
        unlinkSync(htmlPath);
      } catch (err) {
        console.warn("[worker] PDF generation failed:", err);
      }
    }

    // ── 6. Build the completion message: summary + full written report ────────
    const summary = buildSummaryMessage(report, pdfPath);
    const comment = `${summary}\n\n---\n\n${markdown}`;

    return {
      status: "COMPLETED",
      origin: "SOKOSUMI",
      comment,
      credits: Number(process.env.SOKOSUMI_TASK_CREDITS ?? 5),
    };
  },
} as Parameters<typeof startSokosumiAgentWorker>[0]);

// ── Helpers ─────────────────────────────────────────────────────────────────

function parseRequest(description: string, title: string): AuditRequest {
  // Try JSON first
  const jsonMatch = description.match(/```json\s*([\s\S]*?)```/) ?? description.match(/(\{[\s\S]*\})/);
  if (jsonMatch) {
    const parsed = JSON.parse(jsonMatch[1]) as Partial<AuditRequest>;
    if (!parsed.url) throw new Error("JSON body must include a 'url' field.");
    return {
      url: normalizeUrl(parsed.url),
      competitors: parsed.competitors,
      shareEmail: parsed.shareEmail ?? extractEmail(description),
      includeAnalytics: parsed.includeAnalytics ?? false,
      ga4PropertyId: parsed.ga4PropertyId,
      gscSiteUrl: parsed.gscSiteUrl,
      gtmContainerId: parsed.gtmContainerId,
      weeklyComparison: parsed.weeklyComparison ?? true,
      pdf: parsed.pdf ?? false,
    };
  }

  // Fall back to extracting URL from plain text
  const text = `${title} ${description}`;
  const urlMatch = text.match(/https?:\/\/[^\s,)>\]"']+/);
  if (!urlMatch) throw new Error("No URL found in task description.");

  const competitors = [...text.matchAll(/competitor[s]?[:\s]+(https?:\/\/[^\s,)>\]"']+)/gi)].map(m => normalizeUrl(m[1]));

  return {
    url: normalizeUrl(urlMatch[0]),
    competitors: competitors.length > 0 ? competitors : undefined,
    shareEmail: extractEmail(text),
    includeAnalytics: /analytics|ga4|search console/i.test(text),
    weeklyComparison: true,
    pdf: /\bpdf\b/i.test(text),
  };
}

function extractEmail(text: string): string | undefined {
  return text.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0];
}

function normalizeUrl(url: string): string {
  url = url.trim().replace(/[.,;!]+$/, "");
  if (!url.startsWith("http")) url = `https://${url}`;
  // Strip tracking params added by browsers/ChatGPT
  try {
    const u = new URL(url);
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].forEach(p => u.searchParams.delete(p));
    return u.toString();
  } catch {
    return url;
  }
}

// ── Follow-up helpers ────────────────────────────────────────────────────────

function findPreviousCompletedReport(task: SokosumiTask): string | null {
  const events = task.events ?? [];
  // Find the most recent COMPLETED event posted by our coworker that has a full report
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.coworkerId && e.status === "COMPLETED" && e.comment && e.comment.length > 500) {
      return e.comment;
    }
  }
  return null;
}

const CONCEPT_EXPLANATIONS: Record<string, string> = {
  cls: `**CLS (Cumulative Layout Shift)** measures visual stability — how much the page unexpectedly moves around while loading.\n\n- **Good:** under 0.1\n- **Needs improvement:** 0.1 – 0.25\n- **Poor:** above 0.25\n\n**Why it matters:** Layout shifts frustrate users — text jumps, buttons move, people accidentally click the wrong thing. Google uses CLS as a ranking signal.\n\n**Common causes:** Images without width/height attributes, ads or embeds without reserved space, web fonts loading late and shifting text.\n\n**Quick fix:** Add explicit \`width\` and \`height\` to all \`<img>\` tags, and reserve space for ads/embeds with CSS.`,
  lcp: `**LCP (Largest Contentful Paint)** measures how long it takes for the biggest visible element (hero image, heading) to load.\n\n- **Good:** under 2.5s\n- **Needs improvement:** 2.5s – 4s\n- **Poor:** above 4s\n\n**Why it matters:** LCP is what users perceive as "the page loaded". A slow LCP means visitors stare at a blank or partial page. It's a direct Google ranking factor.\n\n**Quick fix:** Compress and convert your hero image to WebP, add \`fetchpriority="high"\` to it, and preload it with \`<link rel="preload" as="image">\`.`,
  inp: `**INP (Interaction to Next Paint)** measures how quickly the page responds to user actions like clicks, taps, and key presses.\n\n- **Good:** under 200ms\n- **Needs improvement:** 200ms – 500ms\n- **Poor:** above 500ms\n\n**Why it matters:** A slow INP makes the page feel broken or frozen. It replaced FID as a Core Web Vital in 2024 and affects Google rankings.\n\n**Quick fix:** Reduce JavaScript execution time, break up long tasks, and avoid heavy third-party scripts loading synchronously.`,
  fcp: `**FCP (First Contentful Paint)** measures how long until the user sees the first piece of content (text, image, or anything).\n\n- **Good:** under 1.8s\n- **Needs improvement:** 1.8s – 3s\n- **Poor:** above 3s\n\n**Why it matters:** FCP is the first signal to the user that the page is actually loading. A slow FCP feels like nothing is happening.\n\n**Quick fix:** Eliminate render-blocking resources (add \`defer\` to scripts), inline critical CSS, and ensure fast server response time.`,
  ttfb: `**TTFB (Time to First Byte)** measures how long the browser waits before receiving the first byte of data from the server.\n\n- **Good:** under 800ms\n- **Needs improvement:** 800ms – 1800ms\n- **Poor:** above 1800ms\n\n**Why it matters:** TTFB is the foundation of everything — if the server is slow, every other metric suffers.\n\n**Quick fix:** Use a CDN (Cloudflare's free plan), enable server-side caching, or upgrade to faster hosting.`,
  tbt: `**TBT (Total Blocking Time)** measures how long the main thread is blocked by JavaScript, preventing user interaction.\n\n- **Good:** under 200ms\n- **Needs improvement:** 200ms – 600ms\n- **Poor:** above 600ms\n\n**Why it matters:** High TBT means the page looks loaded but doesn't respond to clicks. Strongly correlated with INP.\n\n**Quick fix:** Audit your JavaScript bundles — remove unused code, split large bundles, and lazy-load scripts that aren't needed on page load.`,
  "speed index": `**Speed Index** measures how quickly content visually fills in during page load — it considers the whole painting process, not just a single moment.\n\n- **Good:** under 3.4s\n- **Needs improvement:** 3.4s – 5.8s\n- **Poor:** above 5.8s\n\n**Why it matters:** A high Speed Index means the page feels slow to render even if technical metrics look okay.\n\n**Quick fix:** Prioritise above-the-fold content loading first — reduce render-blocking resources and optimise images.`,
  "core web vitals": `**Core Web Vitals** are Google's three key metrics for measuring real-world user experience:\n\n| Metric | What it measures | Good threshold |\n|--------|-----------------|----------------|\n| **LCP** | Loading — when the biggest element appears | < 2.5s |\n| **INP** | Interactivity — how fast the page responds to clicks | < 200ms |\n| **CLS** | Visual stability — how much the layout shifts | < 0.1 |\n\n**Why they matter:** Google uses Core Web Vitals as a direct ranking factor in search results. Improving them improves both user experience and SEO.`,
};

function buildFollowUpResponse(question: string, report: string): string {
  const q = question.toLowerCase();

  // Check for concept explanation requests first
  for (const [term, explanation] of Object.entries(CONCEPT_EXPLANATIONS)) {
    if (q.includes(term)) {
      return `${explanation}\n\n---\n\n> To re-audit with the latest data, submit a new task with your URL.`;
    }
  }

  // Extract a named markdown section from the report
  const section = (heading: RegExp): string | null => {
    const match = report.match(new RegExp(`(#{1,3}\\s*${heading.source}[\\s\\S]*?)(?=\\n#{1,3}\\s|$)`, "i"));
    return match ? match[1].trim() : null;
  };

  const lines: string[] = [];

  if (/mobile|core web vital|cwv|lcp|cls|inp|fcp|ttfb|tbt|speed/i.test(q)) {
    lines.push("## 📱 Mobile Performance");
    const perf = section(/performance|core web vital/);
    const cwv = section(/core web vital/);
    const recs = section(/recommendation/);
    if (cwv) lines.push(cwv);
    else if (perf) lines.push(perf);
    if (recs) {
      lines.push("\n### Priority Fixes");
      // Only include high/medium recs
      const highMed = recs.split("\n").filter(l =>
        l.includes("🔴") || l.includes("🟠") || l.includes("High") || l.includes("Medium") || l.startsWith("#") || l.startsWith("|")
      ).join("\n");
      lines.push(highMed || recs);
    }
    lines.push("\n> Submit a new audit task to get a fresh measurement after making changes.");

  } else if (/seo|search|keyword|meta|title|heading|h1|canonical|sitemap|robots/i.test(q)) {
    lines.push("## 🔍 SEO Analysis");
    const seo = section(/seo/);
    if (seo) lines.push(seo);
    else lines.push("No SEO section found in the previous report.");

  } else if (/access|wcag|aria|contrast|label|keyboard/i.test(q)) {
    lines.push("## ♿ Accessibility");
    const a11y = section(/accessib/);
    if (a11y) lines.push(a11y);
    else lines.push("No accessibility section found in the previous report.");

  } else if (/fix|quick|priority|recommend|action|improve|next step/i.test(q)) {
    lines.push("## 🎯 Prioritised Recommendations");
    const recs = section(/recommendation/);
    if (recs) lines.push(recs);
    else lines.push("No recommendations section found in the previous report.");

  } else if (/analytic|ga4|search console|gsc|gtm|clarity/i.test(q)) {
    lines.push("## 📊 Analytics");
    const analytics = section(/analytic/);
    if (analytics) lines.push(analytics);
    else lines.push("Analytics data was not included in the previous audit. To include it, add `\"includeAnalytics\": true` to your next task.");

  } else if (/competitor|compare|vs\.|versus/i.test(q)) {
    lines.push("## 🏁 Competitor Comparison");
    const comp = section(/competitor/);
    if (comp) lines.push(comp);
    else lines.push("No competitor data in the previous audit. Add competitor URLs to your next task to include a comparison.");

  } else {
    // Generic — return executive summary + recommendations
    lines.push("Here's a summary from the most recent audit:\n");
    const exec = section(/executive summary/);
    if (exec) lines.push(exec);
    const recs = section(/recommendation/);
    if (recs) { lines.push("\n### Recommendations"); lines.push(recs); }
    lines.push("\n> To run a fresh audit or focus on a specific area, submit a new task.");
  }

  return lines.join("\n");
}

function buildSummaryMessage(report: AuditReport, pdfPath?: string): string {
  const m = report.mobile.scores;
  const highCount = report.recommendations.filter(r => r.priority === "high").length;
  const medCount = report.recommendations.filter(r => r.priority === "medium").length;

  const lines = [
    `✅ **Audit complete for ${report.url}**`,
    ``,
    `| Score | Mobile |`,
    `|-------|--------|`,
    `| Performance | ${m["performance"]}/100 |`,
    `| Accessibility | ${m["accessibility"]}/100 |`,
    `| SEO | ${m["seo"]}/100 |`,
    `| Best Practices | ${m["bestPractices"]}/100 |`,
    ``,
    `**${highCount} high-priority** and **${medCount} medium-priority** issues found.`,
  ];

  lines.push(``, `The full written report is below.`);
  if (pdfPath) {
    lines.push(`📕 A PDF copy was saved to: \`${pdfPath}\``);
  }

  return lines.join("\n");
}
