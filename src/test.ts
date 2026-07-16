/**
 * Local test runner — no Sokosumi needed.
 *
 * Usage:
 *   pnpm test:run https://example.com
 *   pnpm test:run https://example.com --competitors https://comp1.com https://comp2.com
 *   pnpm test:run https://example.com --analytics
 */

import { writeFileSync, unlinkSync } from "fs";
import { execSync } from "child_process";
import { runFullAudit } from "./orchestrator.js";
import { buildMarkdownReport } from "./report/builder.js";
import { buildPlainEnglishHtml } from "./report/plainEnglish.js";
import { createAuditGoogleDoc } from "./report/googleDoc.js";
import { htmlToPdfLocally } from "./report/pdf.js";

// ── Parse CLI args ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const url = args.find(a => a.startsWith("http"));

if (!url) {
  console.error("Usage: pnpm test:run <url> [--analytics] [--competitors <url1> <url2>]");
  console.error("Example: pnpm test:run https://example.com --competitors https://google.com");
  process.exit(1);
}

const includeAnalytics = args.includes("--analytics");

const competitorFlagIndex = args.indexOf("--competitors");
const competitors: string[] = [];
if (competitorFlagIndex !== -1) {
  for (let i = competitorFlagIndex + 1; i < args.length; i++) {
    if (args[i].startsWith("--")) break;
    competitors.push(args[i]);
  }
}

// ── Run ───────────────────────────────────────────────────────────────────────

console.log(`\n🔍 Auditing: ${url}`);
if (competitors.length) console.log(`🏁 Competitors: ${competitors.join(", ")}`);
if (includeAnalytics) console.log(`📊 Analytics: enabled`);
console.log("");

const report = await runFullAudit(
  { url, competitors, includeAnalytics, weeklyComparison: true },
  (msg) => console.log(`  ↳ ${msg}`)
);

const markdown = buildMarkdownReport(report);

// ── Print report to terminal ──────────────────────────────────────────────────

console.log("\n" + "═".repeat(70));
console.log(markdown);
console.log("═".repeat(70) + "\n");

// ── Save report to a file ─────────────────────────────────────────────────────

const host = new URL(url).hostname.replace(/\./g, "-");
const baseName = `audit-report-${host}-${new Date().toISOString().split("T")[0]}`;
writeFileSync(`${baseName}.md`, markdown);
console.log(`💾 Report saved to: ${baseName}.md`);

// ── Plain-English Word document ───────────────────────────────────────────────

const html = buildPlainEnglishHtml(report);
const htmlPath = `${baseName}.html`;
writeFileSync(htmlPath, html);

// ── PDF via headless Chrome ───────────────────────────────────────────────────

if (htmlToPdfLocally(htmlPath, `${baseName}.pdf`)) {
  console.log(`📕 PDF report saved to: ${baseName}.pdf`);
} else {
  console.log(`ℹ️  PDF skipped — no Chrome/Chromium found (set CHROME_PATH to enable).`);
}

try {
  // macOS built-in converter produces a real .docx that opens in Word/Pages/Google Docs
  execSync(`textutil -convert docx "${htmlPath}" -o "${baseName}.docx"`, { stdio: "pipe" });
  unlinkSync(htmlPath);
  console.log(`📄 Plain-English report saved to: ${baseName}.docx (open with Word, Pages, or Google Docs)`);
} catch {
  console.log(`📄 Plain-English report saved to: ${htmlPath} (open in any browser, or upload to Google Docs)`);
}

// ── Optionally create Google Doc ──────────────────────────────────────────────

const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
if (keyPath) {
  console.log("📄 Creating Google Doc...");
  try {
    const doc = await createAuditGoogleDoc(
      `Website Audit — ${url} — ${new Date().toLocaleDateString()}`,
      markdown,
      keyPath,
      process.env.GOOGLE_DRIVE_FOLDER_ID
    );
    console.log(`✅ Google Doc created: ${doc.url}`);
  } catch (err) {
    console.warn("⚠️  Google Doc creation failed:", (err as Error).message);
  }
} else {
  console.log("ℹ️  GOOGLE_SERVICE_ACCOUNT_KEY_PATH not set — skipping Google Doc.");
}
