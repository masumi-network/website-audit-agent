import { mkdirSync, readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";
import type { StoredAuditSnapshot, AuditReport } from "../types.js";

const DEFAULT_DIR = "./audit-history";

function getDir(): string {
  return process.env.AUDIT_HISTORY_PATH ?? DEFAULT_DIR;
}

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

function slugify(url: string): string {
  return url.replace(/https?:\/\//, "").replace(/[^a-zA-Z0-9]/g, "_").slice(0, 80);
}

export function saveAuditSnapshot(report: AuditReport): void {
  const dir = getDir();
  ensureDir(dir);

  const snapshot: StoredAuditSnapshot = {
    auditId: report.auditId,
    timestamp: report.timestamp,
    url: report.url,
    mobileScores: report.mobile.scores,
    desktopScores: report.desktop.scores,
    issueIds: [
      ...report.mobile.failedAudits.map(a => a.id),
      ...report.seo.issues.map(i => i.message.slice(0, 60)),
    ],
  };

  const filename = `${slugify(report.url)}_${report.timestamp.replace(/[:T]/g, "-").slice(0, 19)}.json`;
  writeFileSync(join(dir, filename), JSON.stringify(snapshot, null, 2), "utf-8");
}

export function loadPreviousSnapshot(url: string, withinDays = 14): StoredAuditSnapshot | null {
  const dir = getDir();
  ensureDir(dir);

  const slug = slugify(url);
  const cutoff = Date.now() - withinDays * 24 * 60 * 60 * 1000;

  let files: string[];
  try {
    files = readdirSync(dir).filter(f => f.startsWith(slug) && f.endsWith(".json"));
  } catch {
    return null;
  }

  const matching: Array<{ file: string; ts: number }> = [];
  for (const file of files) {
    try {
      const raw = readFileSync(join(dir, file), "utf-8");
      const snap = JSON.parse(raw) as StoredAuditSnapshot;
      const ts = new Date(snap.timestamp).getTime();
      if (ts >= cutoff && snap.url === url) {
        matching.push({ file, ts });
      }
    } catch {}
  }

  if (matching.length === 0) return null;

  // Return the oldest matching snapshot within the window (best baseline for weekly diff)
  matching.sort((a, b) => a.ts - b.ts);
  try {
    const raw = readFileSync(join(dir, matching[0].file), "utf-8");
    return JSON.parse(raw) as StoredAuditSnapshot;
  } catch {
    return null;
  }
}
