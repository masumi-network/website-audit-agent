import type { SeoAnalysis, SeoIssue, CheckStatus, SeoCheck } from "../types.js";

export async function runSeoAudit(url: string): Promise<SeoAnalysis> {
  const html = await fetchHtml(url);
  const baseUrl = new URL(url);

  const title = extractTitle(html);
  const metaDescription = extractMetaDescription(html);
  const h1Tags = extractH1(html);
  const canonical = extractCanonical(html, url);
  const openGraph = extractOpenGraph(html);
  const twitterCard = /<meta[^>]+name=["']twitter:card["']/i.test(html);
  const schemaTypes = extractSchemaTypes(html);
  const { total: totalImages, withoutAlt: imagesWithoutAlt } = countImages(html);
  const { internal: internalLinks, external: externalLinks } = countLinks(html, baseUrl.hostname);

  const robotsTxt = await checkRobotsTxt(baseUrl.origin);
  const sitemap = await findSitemap(baseUrl.origin);

  const issues: SeoIssue[] = [
    ...titleIssues(title.value),
    ...metaIssues(metaDescription.value),
    ...h1Issues(h1Tags.value),
    ...imageIssues(imagesWithoutAlt, totalImages),
    ...robotsIssues(robotsTxt),
    ...sitemapIssues(sitemap),
    ...httpsIssues(url),
  ];

  return {
    url,
    title,
    metaDescription,
    h1: h1Tags,
    canonical,
    robotsTxt,
    sitemap,
    openGraph,
    twitterCard,
    schemaTypes,
    imagesWithoutAlt,
    totalImages,
    internalLinks,
    externalLinks,
    httpsEnabled: url.startsWith("https://"),
    issues: issues.sort((a, b) => severityOrder(a.severity) - severityOrder(b.severity)),
  };
}

// ── Fetching ─────────────────────────────────────────────────────────────────

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "WebsiteAuditAgent/1.0" },
    signal: AbortSignal.timeout(30_000),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("text/html")) throw new Error(`Unexpected content-type: ${ct}`);
  return res.text();
}

async function checkRobotsTxt(origin: string): Promise<{ reachable: boolean; disallowsIndexing: boolean }> {
  try {
    const res = await fetch(`${origin}/robots.txt`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return { reachable: false, disallowsIndexing: false };
    const text = await res.text();
    const blocks = /Disallow:\s*\/\s*$/m.test(text);
    return { reachable: true, disallowsIndexing: blocks };
  } catch {
    return { reachable: false, disallowsIndexing: false };
  }
}

async function findSitemap(origin: string): Promise<{ found: boolean; url: string | null }> {
  const candidates = ["/sitemap.xml", "/sitemap_index.xml", "/sitemap.html"];
  for (const path of candidates) {
    try {
      const res = await fetch(`${origin}${path}`, { method: "HEAD", signal: AbortSignal.timeout(8_000) });
      if (res.ok) return { found: true, url: `${origin}${path}` };
    } catch {}
  }
  return { found: false, url: null };
}

// ── Extraction helpers ────────────────────────────────────────────────────────

function extractTitle(html: string): SeoCheck<string> {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const value = match ? match[1].trim() : "";
  const len = value.length;
  let status: CheckStatus = "good";
  let message = `Title is ${len} characters — good length.`;
  if (!value) { status = "error"; message = "No <title> tag found."; }
  else if (len < 30) { status = "warning"; message = `Title is short (${len} chars). Aim for 50–60.`; }
  else if (len > 60) { status = "warning"; message = `Title is long (${len} chars). Keep under 60 to avoid truncation in search results.`; }
  return { value, status, message };
}

function extractMetaDescription(html: string): SeoCheck<string> {
  const match = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
  const value = match ? match[1].trim() : "";
  const len = value.length;
  let status: CheckStatus = "good";
  let message = `Meta description is ${len} characters — good.`;
  if (!value) { status = "error"; message = "No meta description found. This is shown in Google search results."; }
  else if (len < 70) { status = "warning"; message = `Meta description is short (${len} chars). Aim for 120–160.`; }
  else if (len > 160) { status = "warning"; message = `Meta description is too long (${len} chars). Keep under 160 characters.`; }
  return { value, status, message };
}

function extractH1(html: string): SeoCheck<string[]> {
  const matches = [...html.matchAll(/<h1[^>]*>([^<]*(?:<[^>]+>[^<]*)*)<\/h1>/gi)];
  const values = matches.map(m => m[1].replace(/<[^>]+>/g, "").trim()).filter(Boolean);
  let status: CheckStatus = "good";
  let message = `Found ${values.length} H1 tag — good.`;
  if (values.length === 0) { status = "error"; message = "No H1 tag found. Every page needs exactly one H1."; }
  else if (values.length > 1) { status = "warning"; message = `Found ${values.length} H1 tags. Use only one H1 per page.`; }
  return { value: values, status, message };
}

function extractCanonical(html: string, pageUrl: string): SeoCheck<string | null> {
  const match = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i)
    ?? html.match(/<link[^>]+href=["']([^"']*)["'][^>]+rel=["']canonical["']/i);
  const value = match ? match[1].trim() : null;
  if (!value) return { value: null, status: "warning", message: "No canonical tag found. Add one to prevent duplicate content issues." };
  if (value !== pageUrl && value !== pageUrl.replace(/\/$/, "")) {
    return { value, status: "warning", message: `Canonical points to a different URL: ${value}` };
  }
  return { value, status: "good", message: "Canonical tag is correctly set." };
}

function extractOpenGraph(html: string): { title: boolean; description: boolean; image: boolean } {
  return {
    title: /<meta[^>]+property=["']og:title["']/i.test(html),
    description: /<meta[^>]+property=["']og:description["']/i.test(html),
    image: /<meta[^>]+property=["']og:image["']/i.test(html),
  };
}

function extractSchemaTypes(html: string): string[] {
  const matches = [...html.matchAll(/"@type"\s*:\s*"([^"]+)"/g)];
  return [...new Set(matches.map(m => m[1]))];
}

function countImages(html: string): { total: number; withoutAlt: number } {
  const allImgs = [...html.matchAll(/<img[^>]*>/gi)];
  const total = allImgs.length;
  const withoutAlt = allImgs.filter(m => {
    const tag = m[0];
    return !(/alt=["'][^"']+["']/i.test(tag));
  }).length;
  return { total, withoutAlt };
}

function countLinks(html: string, hostname: string): { internal: number; external: number } {
  const hrefs = [...html.matchAll(/href=["']([^"'#?]+)/gi)].map(m => m[1]);
  let internal = 0, external = 0;
  for (const href of hrefs) {
    if (href.startsWith("/") || href.includes(hostname)) internal++;
    else if (href.startsWith("http")) external++;
  }
  return { internal, external };
}

// ── Issue generators ──────────────────────────────────────────────────────────

function titleIssues(title: string): SeoIssue[] {
  if (!title) return [{ severity: "high", category: "SEO", message: "Missing <title> tag", fix: "Add a unique, descriptive title tag between 50–60 characters to every page." }];
  if (title.length < 30) return [{ severity: "medium", category: "SEO", message: `Title tag too short (${title.length} chars)`, fix: "Expand your title to 50–60 characters. Include your primary keyword near the start." }];
  if (title.length > 60) return [{ severity: "low", category: "SEO", message: `Title tag too long (${title.length} chars)`, fix: "Shorten your title to under 60 characters to prevent truncation in search results." }];
  return [];
}

function metaIssues(desc: string): SeoIssue[] {
  if (!desc) return [{ severity: "high", category: "SEO", message: "Missing meta description", fix: "Add a meta description of 120–160 characters summarising the page content. Google often shows this in search results." }];
  if (desc.length < 70) return [{ severity: "medium", category: "SEO", message: `Meta description too short (${desc.length} chars)`, fix: "Expand the meta description to 120–160 characters and include a clear call to action." }];
  if (desc.length > 160) return [{ severity: "low", category: "SEO", message: `Meta description too long (${desc.length} chars)`, fix: "Keep meta description under 160 characters to avoid truncation in search results." }];
  return [];
}

function h1Issues(h1s: string[]): SeoIssue[] {
  if (h1s.length === 0) return [{ severity: "high", category: "SEO", message: "No H1 heading found", fix: "Add exactly one H1 tag containing your primary keyword. It signals to search engines what the page is about." }];
  if (h1s.length > 1) return [{ severity: "medium", category: "SEO", message: `Multiple H1 tags (${h1s.length})`, fix: "Keep only one H1 per page. Convert extra H1s to H2 or H3." }];
  return [];
}

function imageIssues(withoutAlt: number, total: number): SeoIssue[] {
  if (withoutAlt === 0) return [];
  return [{ severity: withoutAlt > 5 ? "high" : "medium", category: "Accessibility/SEO", message: `${withoutAlt} of ${total} images missing alt text`, fix: `Add descriptive alt attributes to all images. Alt text helps visually impaired users and gives search engines context about your images.` }];
}

function robotsIssues(robots: { reachable: boolean; disallowsIndexing: boolean }): SeoIssue[] {
  const issues: SeoIssue[] = [];
  if (!robots.reachable) issues.push({ severity: "medium", category: "Technical SEO", message: "robots.txt not found", fix: "Create a /robots.txt file. Even a permissive one (User-agent: * / Allow: /) is better than missing." });
  if (robots.disallowsIndexing) issues.push({ severity: "high", category: "Technical SEO", message: "robots.txt blocks all crawlers (Disallow: /)", fix: "Check robots.txt — 'Disallow: /' blocks search engines from indexing your site. Remove or adjust it for pages you want indexed." });
  return issues;
}

function sitemapIssues(sitemap: { found: boolean }): SeoIssue[] {
  if (!sitemap.found) return [{ severity: "medium", category: "Technical SEO", message: "XML sitemap not found", fix: "Create an XML sitemap at /sitemap.xml and submit it to Google Search Console. This helps Google discover all your pages." }];
  return [];
}

function httpsIssues(url: string): SeoIssue[] {
  if (!url.startsWith("https://")) return [{ severity: "high", category: "Security/SEO", message: "Site is not using HTTPS", fix: "Install an SSL certificate and redirect all HTTP traffic to HTTPS. Google penalises non-HTTPS sites." }];
  return [];
}

function severityOrder(s: "high" | "medium" | "low"): number {
  return s === "high" ? 0 : s === "medium" ? 1 : 2;
}
