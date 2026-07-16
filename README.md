# Website Audit Agent

An AI agent built on [pi-sokosumi](https://github.com/masumi-network/pi-sokosumi) that delivers comprehensive website audits — covering performance, SEO, accessibility, Core Web Vitals, analytics, and competitor comparison — directly from your Sokosumi task board, with reports auto-created in Google Docs.

## What it audits

| Area | What's checked |
|------|---------------|
| **Performance** | PageSpeed score, Core Web Vitals (LCP, INP, CLS, FCP, TTFB, TBT), speed opportunities |
| **SEO** | Title, meta description, H1, canonical, robots.txt, sitemap, Open Graph, Schema, alt text |
| **Accessibility** | WCAG compliance via Lighthouse (colour contrast, labels, ARIA, keyboard navigation) |
| **Best Practices** | HTTPS, modern APIs, security headers, console errors |
| **Google Analytics 4** | Sessions, users, bounce rate, top pages, traffic channels |
| **Google Search Console** | Clicks, impressions, CTR, average position, top queries |
| **Google Tag Manager** | Tag count, paused tags, missing GA tag detection |
| **Microsoft Clarity** | Sessions, engagement rate, pages per session |
| **Competitor Analysis** | PageSpeed comparison, SEO snapshot, strengths, opportunities |
| **Weekly Diff** | Score changes, new issues, resolved issues vs previous audit |

---

## Setup

### 1. Install dependencies

```bash
cd website-audit-agent
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in `.env`:

```bash
# Required
SOKOSUMI_API_URL=https://api.preprod.sokosumi.com
SOKOSUMI_COWORKER_API_KEY=your_key_here

# Recommended (free — higher rate limits for PageSpeed)
PAGESPEED_API_KEY=your_google_api_key

# Google integrations (all use the same service account)
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=/path/to/service-account.json
GA4_PROPERTY_ID=123456789
GSC_SITE_URL=https://yoursite.com
GTM_ACCOUNT_ID=1234567
GTM_CONTAINER_ID=GTM-XXXXXXX

# Google Drive folder for reports (get ID from the URL of the folder)
GOOGLE_DRIVE_FOLDER_ID=your_folder_id

# Microsoft Clarity (optional)
CLARITY_PROJECT_ID=your_project_id
CLARITY_API_TOKEN=your_token
```

### 3. Set up Google Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project → Enable these APIs:
   - Google Analytics Data API
   - Search Console API
   - Tag Manager API
   - Google Drive API
   - Google Docs API
3. Create a Service Account → Download JSON key
4. Share your GA4 property, Search Console, and GTM container with the service account email (Viewer access)
5. Share your Google Drive folder with the service account email (Editor access)

### 4. Start the agent

```bash
# Development
pnpm dev

# Production
pnpm build && pnpm start
```

---

## How to submit an audit task

Submit a task on your Sokosumi coworker task board with any of these formats:

### Simple (plain text)
```
Audit https://mysite.com
```

### With competitors
```
Audit https://mysite.com and compare with competitor https://competitor1.com, competitor https://competitor2.com
```

### Full options (JSON)
```json
{
  "url": "https://mysite.com",
  "competitors": ["https://competitor1.com", "https://competitor2.com"],
  "includeAnalytics": true,
  "ga4PropertyId": "123456789",
  "gscSiteUrl": "https://mysite.com",
  "weeklyComparison": true,
  "pdf": true
}
```

The agent will:
1. Post a "running" update immediately so you know it started
2. Send progress updates as each phase completes
3. Post a summary with scores, followed by the full written report

If the task asks for a PDF (mention "pdf" in the text, or set `"pdf": true` in the JSON body), a PDF copy is also saved locally on the machine running the worker, using headless Chrome (set `CHROME_PATH` if Chrome isn't in a standard location). Local test runs (`pnpm test:run <url>`) always save a PDF next to the Markdown report.

---

## What the report looks like

Each report includes:

- **Executive Summary** — overall health score, score table
- **Score Breakdown** — visual bars for all 4 Lighthouse categories (mobile + desktop)
- **Core Web Vitals** — each metric with value, rating, and plain-English explanation
- **Weekly Changes** *(if a previous audit exists)* — what improved, what declined, new issues, resolved issues
- **Performance Opportunities** — specific things to fix with estimated savings
- **SEO Analysis** — full checklist with status icons and fix instructions
- **Analytics Overview** — GA4, GSC, GTM, Clarity data
- **Competitor Comparison** — score table + strengths/opportunities per competitor
- **Prioritised Recommendations** — High/Medium/Low with impact + step-by-step fix instructions

---

## Project structure

```
src/
├── index.ts              # Sokosumi worker entry point
├── types.ts              # All TypeScript types
├── orchestrator.ts       # Coordinates all 4 audit agents
├── agents/
│   ├── performanceAgent.ts   # PageSpeed Insights API (mobile + desktop)
│   ├── seoAgent.ts           # Technical SEO via HTML analysis
│   ├── analyticsAgent.ts     # GA4, GSC, GTM, Clarity
│   └── competitorAgent.ts    # Competitor PageSpeed + SEO
├── report/
│   ├── builder.ts            # Markdown report builder
│   ├── googleDoc.ts          # Google Docs creation
│   ├── pdf.ts                # PDF export (Drive API + headless Chrome)
│   └── diff.ts               # Weekly comparison logic
└── store/
    └── history.ts            # JSON file persistence for weekly diffs
```

---

## Weekly reports

The agent automatically compares each new audit against the most recent previous audit (within 14 days) for the same URL. To get a proper weekly report, either:

- Submit an audit task manually each week, or
- Set up a cron job to POST a task to Sokosumi every Monday

Audit snapshots are saved to `./audit-history/` by default (configurable via `AUDIT_HISTORY_PATH`).

---

## Extending the agent

To add a new audit check:
1. Add types to `src/types.ts`
2. Create a new agent in `src/agents/`
3. Call it in `src/orchestrator.ts` in the parallel gather phase
4. Add a section to `src/report/builder.ts`

The agent is deliberately structured so each specialisation is independent — easy to expand or swap out.
