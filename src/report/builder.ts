import type { AuditReport, Recommendation, CompetitorAudit, CoreWebVital } from "../types.js";

export function buildMarkdownReport(report: AuditReport): string {
  const parts: string[] = [];

  parts.push(header(report));
  parts.push(executiveSummary(report));
  parts.push(quickFixesSection(report));
  parts.push(scoresSection(report));
  parts.push(coreWebVitalsSection(report));
  if (report.weeklyDiff) parts.push(weeklyDiffSection(report));
  parts.push(performanceOpportunities(report));
  parts.push(seoSection(report));
  if (report.analytics) parts.push(analyticsSection(report));
  if (report.competitors?.length) parts.push(competitorSection(report));
  parts.push(recommendationsSection(report));
  parts.push(footer(report));

  return parts.filter(Boolean).join("\n\n---\n\n");
}

// ── Sections ─────────────────────────────────────────────────────────────────

function header(r: AuditReport): string {
  return [
    `# Website Audit Report`,
    `**URL:** ${r.url}`,
    `**Date:** ${new Date(r.timestamp).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`,
    `**Audit ID:** \`${r.auditId}\``,
  ].join("\n");
}

function executiveSummary(r: AuditReport): string {
  const mPerf = r.mobile.scores.performance;
  const dPerf = r.desktop.scores.performance;
  const highPriority = r.recommendations.filter(x => x.priority === "high").length;
  const medPriority = r.recommendations.filter(x => x.priority === "medium").length;

  const overallHealth = overallScore(r);
  const healthEmoji = overallHealth >= 80 ? "✅" : overallHealth >= 60 ? "⚠️" : "🔴";

  return [
    `## Executive Summary`,
    `${healthEmoji} **Overall Health: ${overallHealth}/100**`,
    ``,
    `Your website scores **${mPerf}/100 on mobile** and **${dPerf}/100 on desktop** for performance. ` +
    `There are **${highPriority} high-priority** and **${medPriority} medium-priority** issues to address.`,
    ``,
    `| Area | Mobile | Desktop |`,
    `|------|--------|---------|`,
    `| Performance | ${scoreEmoji(r.mobile.scores.performance)} ${r.mobile.scores.performance} | ${scoreEmoji(r.desktop.scores.performance)} ${r.desktop.scores.performance} |`,
    `| Accessibility | ${scoreEmoji(r.mobile.scores.accessibility)} ${r.mobile.scores.accessibility} | ${scoreEmoji(r.desktop.scores.accessibility)} ${r.desktop.scores.accessibility} |`,
    `| SEO | ${scoreEmoji(r.mobile.scores.seo)} ${r.mobile.scores.seo} | ${scoreEmoji(r.desktop.scores.seo)} ${r.desktop.scores.seo} |`,
    `| Best Practices | ${scoreEmoji(r.mobile.scores.bestPractices)} ${r.mobile.scores.bestPractices} | ${scoreEmoji(r.desktop.scores.bestPractices)} ${r.desktop.scores.bestPractices} |`,
  ].join("\n");
}

function quickFixesSection(r: AuditReport): string {
  const quickFixes = r.recommendations.filter(rec => rec.effort === "easy");
  if (quickFixes.length === 0) return "";

  const lines = [
    `## ⚡ Quick Fixes — Start Here`,
    ``,
    `These are the easiest wins: low effort, real impact. Most take under an hour each.`,
    ``,
  ];

  quickFixes.forEach((rec, i) => {
    lines.push(`**${i + 1}. ${priorityTag(rec.priority)} ${rec.issue}**`);
    lines.push(`> ${rec.fix}`);
    lines.push("");
  });

  return lines.join("\n");
}

function scoresSection(r: AuditReport): string {
  return [
    `## Score Breakdown`,
    ``,
    `> 🟢 90–100 = Good &nbsp; 🟡 50–89 = Needs Improvement &nbsp; 🔴 0–49 = Poor`,
    ``,
    `### Mobile`,
    scoreBar("Performance", r.mobile.scores.performance),
    scoreBar("Accessibility", r.mobile.scores.accessibility),
    scoreBar("SEO", r.mobile.scores.seo),
    scoreBar("Best Practices", r.mobile.scores.bestPractices),
    ``,
    `### Desktop`,
    scoreBar("Performance", r.desktop.scores.performance),
    scoreBar("Accessibility", r.desktop.scores.accessibility),
    scoreBar("SEO", r.desktop.scores.seo),
    scoreBar("Best Practices", r.desktop.scores.bestPractices),
  ].join("\n");
}

function coreWebVitalsSection(r: AuditReport): string {
  const cwv = r.mobile.coreWebVitals;
  return [
    `## Core Web Vitals (Mobile)`,
    ``,
    `These are Google's official metrics for measuring user experience. They directly affect your Google search ranking.`,
    ``,
    `| Metric | Value | Status | What it means |`,
    `|--------|-------|--------|---------------|`,
    vitalRow("LCP (Largest Contentful Paint)", cwv.lcp, "How fast the main content loads. Target: under 2.5s"),
    vitalRow("INP (Interaction to Next Paint)", cwv.inp, "How quickly the page responds to clicks. Target: under 200ms"),
    vitalRow("CLS (Cumulative Layout Shift)", cwv.cls, "How much the page jumps around while loading. Target: under 0.1"),
    vitalRow("FCP (First Contentful Paint)", cwv.fcp, "When the first content appears on screen. Target: under 1.8s"),
    vitalRow("TTFB (Time to First Byte)", cwv.ttfb, "How fast the server responds. Target: under 800ms"),
    vitalRow("TBT (Total Blocking Time)", cwv.tbt, "How long the page is unresponsive. Target: under 200ms"),
    vitalRow("Speed Index", cwv.speedIndex, "How quickly content is visually displayed. Target: under 3.4s"),
  ].join("\n");
}

function weeklyDiffSection(r: AuditReport): string {
  const diff = r.weeklyDiff!;
  const prevDate = new Date(diff.previousDate).toLocaleDateString();
  const lines = [
    `## Weekly Changes`,
    ``,
    `*Compared to last audit on ${prevDate}*`,
    ``,
  ];

  if (diff.improved.length > 0) {
    lines.push(`### ✅ Improved`);
    diff.improved.forEach(i => lines.push(`- ${i}`));
    lines.push("");
  }
  if (diff.declined.length > 0) {
    lines.push(`### 📉 Declined`);
    diff.declined.forEach(i => lines.push(`- ${i}`));
    lines.push("");
  }
  if (diff.newIssues.length > 0) {
    lines.push(`### 🆕 New Issues`);
    diff.newIssues.forEach(i => lines.push(`- ${i}`));
    lines.push("");
  }
  if (diff.resolvedIssues.length > 0) {
    lines.push(`### ✔️ Resolved Issues`);
    diff.resolvedIssues.forEach(i => lines.push(`- ${i}`));
    lines.push("");
  }
  if (diff.improved.length === 0 && diff.declined.length === 0 && diff.newIssues.length === 0) {
    lines.push(`*No significant changes detected since last audit.*`);
  }

  return lines.join("\n");
}

function performanceOpportunities(r: AuditReport): string {
  const opps = r.mobile.opportunities.slice(0, 8);
  if (opps.length === 0) return `## Performance Opportunities\n\n✅ No major performance opportunities detected — great work!`;

  return [
    `## Performance Opportunities`,
    ``,
    `These fixes could significantly speed up your website:`,
    ``,
    ...opps.map(o => [
      `### ${severityTag(o.score)} ${o.title}`,
      o.savings ? `*Potential saving: ${o.savings}*` : "",
      o.description,
    ].filter(Boolean).join("\n")),
  ].join("\n");
}

function seoSection(r: AuditReport): string {
  const seo = r.seo;
  const lines = [
    `## SEO Analysis`,
    ``,
    `| Check | Result | Status |`,
    `|-------|--------|--------|`,
    `| Title Tag | ${seo.title.value ? `"${seo.title.value.slice(0, 50)}${seo.title.value.length > 50 ? "…" : ""}"` : "Missing"} | ${statusIcon(seo.title.status)} |`,
    `| Meta Description | ${seo.metaDescription.value ? `${seo.metaDescription.value.length} chars` : "Missing"} | ${statusIcon(seo.metaDescription.status)} |`,
    `| H1 Tag | ${seo.h1.value.length} found | ${statusIcon(seo.h1.status)} |`,
    `| Canonical URL | ${seo.canonical.value ?? "Not set"} | ${statusIcon(seo.canonical.status)} |`,
    `| HTTPS | ${seo.httpsEnabled ? "Enabled" : "Not enabled"} | ${seo.httpsEnabled ? "✅" : "🔴"} |`,
    `| robots.txt | ${seo.robotsTxt.reachable ? (seo.robotsTxt.disallowsIndexing ? "⚠️ Blocking crawlers" : "Found") : "Not found"} | ${seo.robotsTxt.reachable && !seo.robotsTxt.disallowsIndexing ? "✅" : "🔴"} |`,
    `| XML Sitemap | ${seo.sitemap.found ? seo.sitemap.url : "Not found"} | ${seo.sitemap.found ? "✅" : "🟡"} |`,
    `| Open Graph | Title: ${seo.openGraph.title ? "✅" : "❌"}, Desc: ${seo.openGraph.description ? "✅" : "❌"}, Image: ${seo.openGraph.image ? "✅" : "❌"} | ${seo.openGraph.title && seo.openGraph.description && seo.openGraph.image ? "✅" : "🟡"} |`,
    `| Twitter Card | ${seo.twitterCard ? "Present" : "Missing"} | ${seo.twitterCard ? "✅" : "🟡"} |`,
    `| Structured Data | ${seo.schemaTypes.length > 0 ? seo.schemaTypes.join(", ") : "None found"} | ${seo.schemaTypes.length > 0 ? "✅" : "🟡"} |`,
    `| Images without Alt | ${seo.imagesWithoutAlt} of ${seo.totalImages} | ${seo.imagesWithoutAlt === 0 ? "✅" : seo.imagesWithoutAlt < 5 ? "🟡" : "🔴"} |`,
    `| Internal Links | ${seo.internalLinks} | — |`,
    `| External Links | ${seo.externalLinks} | — |`,
  ];

  if (seo.issues.length > 0) {
    lines.push("", "### SEO Issues to Fix", "");
    for (const issue of seo.issues) {
      lines.push(`**${priorityTag(issue.severity)} ${issue.message}**`);
      lines.push(`> Fix: ${issue.fix}`);
      lines.push("");
    }
  }

  return lines.join("\n");
}

function analyticsSection(r: AuditReport): string {
  const a = r.analytics!;
  const lines = [`## Analytics Overview`];

  if (a.ga4) {
    lines.push("", "### Google Analytics 4", `*${a.ga4.period}*`, "");
    lines.push(
      `| Metric | Value |`,
      `|--------|-------|`,
      `| Sessions | ${a.ga4.sessions.toLocaleString()} |`,
      `| Users | ${a.ga4.users.toLocaleString()} |`,
      `| New Users | ${a.ga4.newUsers.toLocaleString()} (${a.ga4.users > 0 ? Math.round(a.ga4.newUsers / a.ga4.users * 100) : 0}%) |`,
      `| Bounce Rate | ${a.ga4.bounceRate}% |`,
      `| Avg Session Duration | ${formatDuration(a.ga4.avgSessionDuration)} |`,
    );
    if (a.ga4.topPages.length > 0) {
      lines.push("", "**Top Pages:**", "");
      lines.push(`| Page | Sessions | Bounce Rate |`, `|------|----------|-------------|`);
      a.ga4.topPages.slice(0, 5).forEach(p =>
        lines.push(`| ${p.page} | ${p.sessions} | ${p.bounceRate}% |`)
      );
    }
    if (a.ga4.topChannels.length > 0) {
      lines.push("", "**Traffic Channels:**", "");
      lines.push(`| Channel | Sessions | Share |`, `|---------|----------|-------|`);
      a.ga4.topChannels.slice(0, 5).forEach(c =>
        lines.push(`| ${c.channel} | ${c.sessions} | ${c.percentage}% |`)
      );
    }
  }

  if (a.gsc) {
    lines.push("", "### Google Search Console", `*${a.gsc.period}*`, "");
    lines.push(
      `| Metric | Value |`,
      `|--------|-------|`,
      `| Total Clicks | ${a.gsc.totalClicks.toLocaleString()} |`,
      `| Total Impressions | ${a.gsc.totalImpressions.toLocaleString()} |`,
      `| Average CTR | ${a.gsc.avgCtr}% |`,
      `| Average Position | ${a.gsc.avgPosition} |`,
    );
    if (a.gsc.topQueries.length > 0) {
      lines.push("", "**Top Search Queries:**", "");
      lines.push(`| Query | Clicks | Impressions | CTR | Position |`, `|-------|--------|-------------|-----|----------|`);
      a.gsc.topQueries.slice(0, 10).forEach(q =>
        lines.push(`| ${q.query} | ${q.clicks} | ${q.impressions} | ${q.ctr}% | ${q.position} |`)
      );
    }
  }

  if (a.gtm) {
    lines.push("", "### Google Tag Manager", "");
    lines.push(
      `- **Container:** ${a.gtm.containerId}`,
      `- **Tags:** ${a.gtm.tagCount} (${a.gtm.tags.filter(t => t.status === "paused").length} paused)`,
      `- **Triggers:** ${a.gtm.triggerCount}`,
      `- **Variables:** ${a.gtm.variableCount}`,
    );
    if (a.gtm.issues.length > 0) {
      lines.push("", "**GTM Issues:**");
      a.gtm.issues.forEach(i => lines.push(`- ⚠️ ${i}`));
    }
  }

  if (a.clarity) {
    lines.push("", "### Microsoft Clarity", `*${a.clarity.period}*`, "");
    if (a.clarity.sessions !== undefined) lines.push(`- **Sessions:** ${a.clarity.sessions}`);
    if (a.clarity.pagesPerSession !== undefined) lines.push(`- **Pages per Session:** ${a.clarity.pagesPerSession}`);
    if (a.clarity.engagementRate !== undefined) lines.push(`- **Engagement Rate:** ${a.clarity.engagementRate}%`);
    lines.push(`> ${a.clarity.note}`);
  }

  return lines.join("\n");
}

function competitorSection(r: AuditReport): string {
  const competitors = r.competitors!;
  const lines = [
    `## Competitor Analysis`,
    "",
    "Here's how your website compares to competitors on key metrics:",
    "",
  ];

  // Score comparison table
  const headers = ["Metric", "Your Site", ...competitors.map((_, i) => `Competitor ${i + 1}`)];
  lines.push(`| ${headers.join(" | ")} |`);
  lines.push(`|${headers.map(() => "---").join("|")}|`);

  const yourMobile = r.mobile.scores;
  for (const key of ["performance", "accessibility", "seo", "bestPractices"] as const) {
    const label = { performance: "Performance", accessibility: "Accessibility", seo: "SEO", bestPractices: "Best Practices" }[key];
    const yourVal = `${scoreEmoji(yourMobile[key])} ${yourMobile[key]}`;
    const compVals = competitors.map(c => c.reachable ? `${scoreEmoji(c.scores[key])} ${c.scores[key]}` : "N/A");
    lines.push(`| ${label} | ${yourVal} | ${compVals.join(" | ")} |`);
  }

  lines.push("");

  for (const [i, comp] of competitors.entries()) {
    lines.push(`### Competitor ${i + 1}: ${comp.url}`);
    if (!comp.reachable) { lines.push("*Could not reach this URL during audit.*"); continue; }

    lines.push("");
    if (comp.seoSnapshot.title) lines.push(`**Their Title:** "${comp.seoSnapshot.title}"`);
    if (comp.seoSnapshot.h1) lines.push(`**Their H1:** "${comp.seoSnapshot.h1}"`);
    lines.push("");

    if (comp.strengths.length > 0) {
      lines.push("**What they're doing well (learn from this):**");
      comp.strengths.forEach(s => lines.push(`- ${s}`));
      lines.push("");
    }
    if (comp.opportunities.length > 0) {
      lines.push("**Where you can beat them:**");
      comp.opportunities.forEach(o => lines.push(`- ${o}`));
      lines.push("");
    }
  }

  return lines.join("\n");
}

function recommendationsSection(r: AuditReport): string {
  const recs = r.recommendations;
  if (recs.length === 0) return `## Recommendations\n\n✅ No critical recommendations — your site is in great shape!`;

  const high = recs.filter(x => x.priority === "high");
  const medium = recs.filter(x => x.priority === "medium");
  const low = recs.filter(x => x.priority === "low");

  const lines = [
    `## Recommendations`,
    "",
    `Here are your prioritised action items, ordered by impact:`,
    "",
  ];

  if (high.length > 0) {
    lines.push(`### 🔴 High Priority — Fix These First`);
    lines.push(`*These have the biggest impact on users and search rankings.*`);
    lines.push("");
    high.forEach((rec, i) => lines.push(...recBlock(rec, i + 1)));
  }
  if (medium.length > 0) {
    lines.push(`### 🟡 Medium Priority — Fix Soon`);
    lines.push("");
    medium.forEach((rec, i) => lines.push(...recBlock(rec, i + 1)));
  }
  if (low.length > 0) {
    lines.push(`### 🟢 Low Priority — Nice to Have`);
    lines.push("");
    low.forEach((rec, i) => lines.push(...recBlock(rec, i + 1)));
  }

  return lines.join("\n");
}

function footer(r: AuditReport): string {
  return [
    `## About This Report`,
    ``,
    `This report was generated automatically by the Website Audit Agent on ${new Date(r.timestamp).toUTCString()}.`,
    ``,
    `**Data sources:** Google PageSpeed Insights (Lighthouse), HTML analysis` +
    (r.analytics?.ga4 ? ", Google Analytics 4" : "") +
    (r.analytics?.gsc ? ", Google Search Console" : "") +
    (r.analytics?.gtm ? ", Google Tag Manager" : "") +
    (r.analytics?.clarity ? ", Microsoft Clarity" : "") + ".",
    ``,
    `**Next audit:** This URL can be re-audited at any time by submitting a new task on Sokosumi. ` +
    `Weekly comparisons are generated automatically when a previous audit exists.`,
  ].join("\n");
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function overallScore(r: AuditReport): number {
  const s = r.mobile.scores;
  return Math.round((s.performance + s.accessibility + s.seo + s.bestPractices) / 4);
}

function scoreEmoji(score: number): string {
  if (score >= 90) return "🟢";
  if (score >= 50) return "🟡";
  return "🔴";
}

function scoreBar(label: string, score: number): string {
  const filled = Math.round(score / 10);
  const bar = "█".repeat(filled) + "░".repeat(10 - filled);
  return `**${label}:** ${scoreEmoji(score)} ${score}/100 \`${bar}\``;
}

function statusIcon(status: "good" | "warning" | "error"): string {
  return status === "good" ? "✅" : status === "warning" ? "⚠️" : "🔴";
}

function priorityTag(s: "high" | "medium" | "low"): string {
  return s === "high" ? "🔴" : s === "medium" ? "🟡" : "🟢";
}

function severityTag(score: number): string {
  return score < 50 ? "🔴" : score < 80 ? "🟡" : "🟢";
}

function vitalRow(label: string, vital: CoreWebVital, description: string): string {
  const icon = vital.rating === "good" ? "✅ Good" : vital.rating === "needs-improvement" ? "⚠️ Needs Work" : "🔴 Poor";
  return `| ${label} | ${vital.displayValue} | ${icon} | ${description} |`;
}

function recBlock(rec: Recommendation, num: number): string[] {
  return [
    `**${num}. ${rec.issue}** *(${rec.category}, ${rec.effort} effort)*`,
    `- **Why it matters:** ${rec.impact}`,
    `- **How to fix it:** ${rec.fix}`,
    "",
  ];
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
