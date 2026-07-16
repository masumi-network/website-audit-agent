import type { AuditReport, StoredAuditSnapshot, WeeklyDiff } from "../types.js";

export function buildWeeklyDiff(current: AuditReport, previous: StoredAuditSnapshot): WeeklyDiff {
  const mDelta = (key: keyof typeof current.mobile.scores) =>
    current.mobile.scores[key] - previous.mobileScores[key];
  const dDelta = (key: keyof typeof current.desktop.scores) =>
    current.desktop.scores[key] - previous.desktopScores[key];

  const improved: string[] = [];
  const declined: string[] = [];

  for (const key of ["performance", "accessibility", "seo", "bestPractices"] as const) {
    const label = scoreLabel(key);
    const md = mDelta(key);
    const dd = dDelta(key);
    if (md >= 3 || dd >= 3) improved.push(`${label} score improved (+${Math.max(md, dd)} pts)`);
    if (md <= -3 || dd <= -3) declined.push(`${label} score dropped (${Math.min(md, dd)} pts)`);
  }

  const currentIssueSet = new Set(current.seo.issues.map(i => i.message.slice(0, 60)));
  const previousIssueSet = new Set(previous.issueIds);

  const newIssues = current.seo.issues
    .filter(i => !previousIssueSet.has(i.message.slice(0, 60)))
    .map(i => i.message);

  const resolvedIssues = previous.issueIds
    .filter(id => !currentIssueSet.has(id))
    .slice(0, 10);

  return {
    previousDate: previous.timestamp,
    currentDate: current.timestamp,
    scoreChanges: {
      mobile: {
        performance: mDelta("performance"),
        accessibility: mDelta("accessibility"),
        seo: mDelta("seo"),
        bestPractices: mDelta("bestPractices"),
      },
      desktop: {
        performance: dDelta("performance"),
        accessibility: dDelta("accessibility"),
        seo: dDelta("seo"),
        bestPractices: dDelta("bestPractices"),
      },
    },
    improved,
    declined,
    newIssues,
    resolvedIssues,
  };
}

function scoreLabel(key: string): string {
  const labels: Record<string, string> = {
    performance: "Performance",
    accessibility: "Accessibility",
    seo: "SEO",
    bestPractices: "Best Practices",
  };
  return labels[key] ?? key;
}
