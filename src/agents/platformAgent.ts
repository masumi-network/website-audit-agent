import type { Platform } from "../types.js";

/**
 * Best-effort platform fingerprinting from the live site.
 *
 * We fetch the page once (capturing response headers AND body) and match it
 * against a library of platform signatures: generator meta tags, tell-tale
 * response headers, CDN/asset hostnames, and builder-specific markup hooks.
 *
 * IMPORTANT: this is a *guess*. Reverse proxies (Cloudflare), headless setups,
 * and embedded widgets can hide or fake these signals. So detection is only
 * ever trusted when `confidence === "high"` (a strong, platform-exclusive
 * signal was found). Anything weaker leaves the platform unset and the report
 * stays platform-neutral. The caller must respect this gate.
 */
export interface PlatformDetection {
  platform: Platform | null;
  confidence: "high" | "low" | "none";
  /** Human-readable signals that fired, for logging / report transparency. */
  signals: string[];
}

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

// A signature is `strong` when it is effectively exclusive to one platform
// (a single hit is enough to trust the guess). `weak` signals only corroborate.
interface Signature {
  label: string;
  strong: boolean;
  test: (ctx: FingerprintContext) => boolean;
}

interface FingerprintContext {
  html: string;
  /** Lowercased header name → value. */
  headers: Record<string, string>;
  /** Lowercased `<meta name="generator">` content, or "". */
  generator: string;
}

const SIGNATURES: Record<Platform, Signature[]> = {
  shopify: [
    { label: "x-shopify response header", strong: true, test: c => "x-shopify-stage" in c.headers || "x-shopid" in c.headers || "x-shardid" in c.headers },
    { label: "cdn.shopify.com assets", strong: true, test: c => /cdn\.shopify\.com|\/cdn\/shop\//i.test(c.html) },
    { label: "myshopify.com domain", strong: true, test: c => /[a-z0-9-]+\.myshopify\.com/i.test(c.html) },
    { label: "Shopify JS global", strong: true, test: c => /\bShopify\.(theme|shop|routes)\b|window\.Shopify/i.test(c.html) },
  ],
  wordpress: [
    { label: "generator meta: WordPress", strong: true, test: c => c.generator.includes("wordpress") },
    { label: "/wp-content/ or /wp-includes/ paths", strong: true, test: c => /\/wp-(content|includes)\//i.test(c.html) },
    { label: "wp-json REST API link", strong: true, test: c => /\/wp-json\b/i.test(c.html) || /rel=["']https:\/\/api\.w\.org\//i.test(c.headers["link"] ?? "") },
    { label: "WooCommerce markup", strong: false, test: c => /woocommerce/i.test(c.html) },
  ],
  wix: [
    { label: "x-wix response header", strong: true, test: c => Object.keys(c.headers).some(h => h.startsWith("x-wix")) },
    { label: "wixstatic.com / parastorage.com assets", strong: true, test: c => /static\.wixstatic\.com|parastorage\.com/i.test(c.html) },
    { label: "wix generator meta", strong: true, test: c => c.generator.includes("wix") },
    { label: "Pepyaka server header", strong: false, test: c => /pepyaka/i.test(c.headers["server"] ?? "") },
  ],
  squarespace: [
    { label: "generator meta: Squarespace", strong: true, test: c => c.generator.includes("squarespace") },
    { label: "static1.squarespace.com assets", strong: true, test: c => /static1\.squarespace\.com|squarespace-cdn\.com/i.test(c.html) },
    { label: "Squarespace server header", strong: false, test: c => /squarespace/i.test(c.headers["server"] ?? "") },
    { label: "Static.squarespace config", strong: false, test: c => /Static\.SQUARESPACE_CONTEXT/i.test(c.html) },
  ],
  webflow: [
    { label: "generator meta: Webflow", strong: true, test: c => c.generator.includes("webflow") },
    { label: "website-files.com assets", strong: true, test: c => /assets(-global)?\.website-files\.com/i.test(c.html) },
    { label: "data-wf-page / data-wf-site attributes", strong: true, test: c => /data-wf-(page|site)=/i.test(c.html) },
    { label: ".webflow.io domain", strong: false, test: c => /[a-z0-9-]+\.webflow\.io/i.test(c.html) },
  ],
};

export async function detectPlatform(url: string): Promise<PlatformDetection> {
  let ctx: FingerprintContext;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      signal: AbortSignal.timeout(20_000),
      redirect: "follow",
    });
    const headers: Record<string, string> = {};
    res.headers.forEach((value, key) => { headers[key.toLowerCase()] = value; });
    const html = (await res.text()).slice(0, 500_000); // cap to keep regex cheap
    const genMatch = html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']*)["']/i);
    ctx = { html, headers, generator: (genMatch?.[1] ?? "").toLowerCase() };
  } catch {
    // Network/timeout failure — detection is simply unavailable, never fatal.
    return { platform: null, confidence: "none", signals: [] };
  }

  // Score every platform; a strong signal makes the guess trustworthy.
  let best: { platform: Platform; strong: boolean; signals: string[] } | null = null;
  for (const platform of Object.keys(SIGNATURES) as Platform[]) {
    const hits = SIGNATURES[platform].filter(s => {
      try { return s.test(ctx); } catch { return false; }
    });
    if (hits.length === 0) continue;
    const strong = hits.some(h => h.strong);
    const signals = hits.map(h => h.label);
    // Prefer the platform with a strong signal; break ties on signal count.
    const better =
      !best ||
      (strong && !best.strong) ||
      (strong === best.strong && signals.length > best.signals.length);
    if (better) best = { platform, strong, signals };
  }

  if (!best) return { platform: null, confidence: "none", signals: [] };
  return {
    platform: best.platform,
    confidence: best.strong ? "high" : "low",
    signals: best.signals,
  };
}
