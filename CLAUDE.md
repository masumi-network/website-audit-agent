# Website Audit Agent — Claude Context

## What this project is

A TypeScript AI agent that runs comprehensive website audits (performance, SEO, accessibility, analytics, competitor comparison) and posts results back to a Sokosumi task board. It runs as a long-lived worker process that polls the Sokosumi API every 15 seconds for new tasks.

## Environment

- **Sokosumi env:** preprod (`https://api.preprod.sokosumi.com`)
- **Coworker ID:** `019f5f4f-497b-768d-8a8b-eb57a327b963`
- **Credentials:** stored in `.env` (gitignored — never commit)
- **Node:** v22+, uses `tsx` for dev, `tsc` for production build

## Commands

```bash
npm run dev          # Start the worker (connects to preprod, polls every 15s)
npm run test:run https://example.com   # Run a local audit without Sokosumi
npm run test:run https://example.com --competitors https://comp.com
npm run build        # Compile TypeScript
npm run typecheck    # Type-check without emitting
```

## Project structure

```
src/
├── index.ts              # Sokosumi worker entry point — parses tasks, posts results
├── orchestrator.ts       # Runs all 4 agents in parallel, builds recommendations
├── types.ts              # All TypeScript types
├── agents/
│   ├── performanceAgent.ts   # PageSpeed Insights API (mobile + desktop)
│   ├── seoAgent.ts           # HTML fetch + technical SEO checks
│   ├── analyticsAgent.ts     # GA4, GSC, GTM, Microsoft Clarity
│   ├── competitorAgent.ts    # Competitor PageSpeed + SEO snapshot
│   └── aiRecommendations.ts  # Optional Claude synthesis of the final action plan
├── report/
│   ├── builder.ts            # Markdown report builder
│   ├── plainEnglish.ts       # HTML report for PDF/DOCX export
│   ├── googleDoc.ts          # Google Docs creation via Drive API
│   ├── pdf.ts                # PDF export via headless Chrome
│   └── diff.ts               # Weekly comparison logic
└── store/
    └── history.ts            # JSON snapshots in audit-history/ for weekly diffs
```

## How tasks are triggered

Tasks are submitted by users on `preprod.sokosumi.com`. The worker picks them up and processes them. I (Claude) cannot create tasks — only the user can via the Sokosumi UI.

Supported task formats:
- Plain text: `Audit https://example.com`
- With competitors: `Audit https://example.com and compare with competitor https://comp.com`
- JSON body with full options (url, competitors, includeAnalytics, ga4PropertyId, etc.)

## Key known issues / fixes applied

- **SEO agent user-agent:** All fetches in `seoAgent.ts` use a browser-like User-Agent (`BROWSER_UA` constant). Do NOT revert to `WebsiteAuditAgent/1.0` — many sites block it and the audit times out.
- **Sitemap checks:** Run in parallel (not sequentially) in `seoAgent.ts`.
- **Competitor agent:** `fetchCompetitorSeo` in `competitorAgent.ts` still uses the old bot UA — known issue, fix pending.

## What's gitignored (never commit these)

- `.env` — API keys and credentials
- `audit-history/` — local JSON snapshots
- `audit-report-*` — generated reports (.md, .pdf, .docx, .html)
- `*.json` except package.json, package-lock.json, tsconfig.json

## AI-synthesized recommendations (optional)

The orchestrator always builds deterministic, rule-based recommendations (`buildRecommendations` in `orchestrator.ts`). When Anthropic credentials are present, it additionally runs those plus the raw findings through Claude (`src/agents/aiRecommendations.ts`) to produce a merged, deduped, business-prioritized action plan that replaces the rule-based list.

- **Enable it:** set `ANTHROPIC_API_KEY` (or `ANTHROPIC_OAUTH_TOKEN`) in `.env`.
- **Model:** defaults to `claude-sonnet-4-6`; override with `AUDIT_AI_MODEL`. Uses the project's existing `@earendil-works/pi-ai` SDK — no separate Anthropic SDK dependency.
- **Fully optional & non-fatal:** with no credentials the step is skipped and the audit uses the rule-based recommendations. Any model/parse failure also falls back silently — the AI path never fails an audit.
- **Weekly diffs are unaffected:** snapshot `issueIds` come from `failedAudits` + `seo.issues`, not from the recommendations list.

## Google integrations (optional)

Set `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` in `.env` to enable GA4, GSC, GTM, and Google Docs report creation. The service account needs Viewer access to GA4/GSC/GTM and Editor access to the target Drive folder.

## Deployment

No auto-deploy. Worker runs locally via `npm run dev`. To update preprod:
1. Push changes to `github.com/masumi-network/website-audit-agent`
2. Pull on the target machine and restart the worker
