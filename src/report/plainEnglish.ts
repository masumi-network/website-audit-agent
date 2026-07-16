/**
 * Plain-English report builder.
 *
 * Produces an HTML document written for someone with zero technical knowledge:
 * every problem is explained in everyday words, and every fix is a full
 * step-by-step guide (with platform-specific hints for Webflow, WordPress,
 * Squarespace, Wix) so the reader never has to google anything.
 *
 * The HTML is designed to convert cleanly to .docx (via macOS `textutil`)
 * and also opens directly in Word, Pages, or Google Docs.
 */

import type { AuditReport, Recommendation } from "../types.js";

// ── Detailed fix guides, keyed by Recommendation.id ───────────────────────────

interface FixGuide {
  plainTitle: string;
  whatIsWrong: string;
  whyCare: string;
  steps: string[];
}

const FIX_GUIDES: Record<string, FixGuide> = {
  "redirects": {
    plainTitle: "Your website takes a detour before it opens",
    whatIsWrong:
      "When someone types your web address, their browser is first sent to a different address, and then to the real one — like being given a forwarding address at the post office. Each hop adds waiting time before your visitor sees anything.",
    whyCare: "This detour alone is adding almost a second of waiting time on phones.",
    steps: [
      "Figure out which address is your \"real\" one. Type your site address into a browser and look at the address bar once it finishes loading — that final address (for example, with or without \"www\") is the real one.",
      "Wherever you share your website (Instagram bio, LinkedIn, business cards, email signature), use that exact final address so visitors skip the detour.",
      "If you use Webflow: go to Site Settings → Publishing and check which domain is set as the default. Make sure your links point to that default domain.",
      "If you use WordPress or another host: log into your hosting/domain provider (like GoDaddy or Namecheap) and check the domain forwarding settings — there should be at most one redirect (from the non-preferred version to the preferred one), not a chain.",
      "If this feels out of reach, copy this section and send it to whoever manages your website or domain — it is a 10-minute fix for them.",
    ],
  },
  "cls-poor": {
    plainTitle: "Your page jumps around while it loads",
    whatIsWrong:
      "As your page loads, pictures and sections pop in and push other content around. You have probably experienced this on other sites: you go to tap a button and it moves at the last second.",
    whyCare:
      "It feels broken and frustrating to visitors, and Google measures this \"jumpiness\" and ranks jumpy sites lower in search results.",
    steps: [
      "The usual cause is images that load without a reserved space, so the page makes room for them only once they arrive.",
      "If you use Webflow: select each image and make sure it has a set width and height (in the Element Settings panel), rather than being left completely automatic. Re-publish and check if the loading feels more stable.",
      "If you use WordPress: modern themes handle this automatically — make sure your theme and plugins are updated. If the problem persists, an image-optimisation plugin like Smush can add the missing size information.",
      "Also check anything that appears at the top of the page after loading (announcement bars, cookie banners) — these push everything down. Ask for them to be \"overlaid\" instead of \"inserted\".",
      "If you're not editing the site yourself, send this section to your web person and ask them to \"add explicit width and height to all images and reserve space for banners\" — they will know what to do.",
    ],
  },
  "lcp-slow": {
    plainTitle: "The main content takes too long to appear on phones",
    whatIsWrong:
      "When someone opens your site on a phone, the biggest thing on the screen (usually your main photo or headline) takes several seconds to show up. Until it does, visitors are staring at a blank or half-empty screen.",
    whyCare:
      "More than half of mobile visitors give up on a site that takes over 3 seconds to show its content. Google also uses this exact measurement when deciding how high to rank you in search results.",
    steps: [
      "The most common cause is a large photo at the top of the page. Find the main image on your homepage.",
      "Go to squoosh.app (a free tool by Google — nothing to install). Drag your image in, choose \"WebP\" as the format on the right side, and download the smaller version. A photo that was 2 MB often becomes 150 KB with no visible quality loss.",
      "Replace the image on your site with this smaller version.",
      "Repeat for the other big images on the page (anything that looks like a photo rather than an icon).",
      "If you use Webflow: also make sure images are set to \"lazy load\" EXCEPT the very first one at the top — that first one should be set to load \"eagerly\" (Image settings → Load: Eager) so it appears as fast as possible.",
      "Re-run this audit afterwards — this one change usually moves the speed score more than anything else.",
    ],
  },
  "inp-poor": {
    plainTitle: "The page is slow to react when people tap or click",
    whatIsWrong:
      "When a visitor taps a button or a menu on your site, there is a noticeable delay before anything happens. The page is busy doing background work and can't respond right away.",
    whyCare: "A page that doesn't react to taps feels broken. Visitors tap again, get confused, and leave.",
    steps: [
      "This is usually caused by too many third-party add-ons: chat widgets, pop-ups, analytics tools, social feeds, video embeds.",
      "Make a list of every widget or embed on your site, and honestly ask which ones bring you value. Remove the ones that don't.",
      "For the ones you keep, ask your web person to \"lazy-load third-party scripts\" — meaning they only start working after the page has finished loading.",
      "This one is genuinely technical to fix properly — if it stays a problem, it is worth an hour of a developer's time.",
    ],
  },
  "perf-low": {
    plainTitle: "Your site is slower than it should be overall",
    whatIsWrong: "Several smaller issues add up to a page that loads slower than visitors expect, especially on phones.",
    whyCare: "Slow sites lose visitors before they even see the content, and Google ranks slower sites lower.",
    steps: [
      "Work through the other items in this report from the top — they are the specific causes, listed with the biggest impact first.",
      "Focus on images first (they are usually 80% of the problem and need no coding — see the image-related items in this report).",
      "After each round of fixes, re-run the audit to see the score move.",
    ],
  },
  "a11y-low": {
    plainTitle: "Your site is hard to use for people with disabilities",
    whatIsWrong:
      "Some visitors use screen readers (software that reads pages out loud), keyboard-only navigation, or have low vision. Parts of your site don't work well for them — for example missing image descriptions or text that is hard to read against its background.",
    whyCare:
      "Roughly 1 in 7 people has some form of disability. An inaccessible site turns those visitors away, and accessibility problems also lower your Google ranking.",
    steps: [
      "Start with image descriptions (\"alt text\") — covered in its own section of this report.",
      "Check your text colours: light grey text on white background is stylish but genuinely hard to read for many people. Use a free checker like webaim.org/resources/contrastchecker to test your main text and background colours.",
      "Make sure every form field (like a contact form) has a visible label, not just grey placeholder text inside the box.",
      "If you want a full picture, the free \"WAVE\" browser extension (wave.webaim.org) shows accessibility problems directly on your page, marked with icons.",
    ],
  },
  "alt-text": {
    plainTitle: "Some of your images have no description",
    whatIsWrong:
      "Every image on a website can carry a short hidden description called \"alt text\". Screen-reader software reads it out loud to blind visitors, and Google reads it to understand what your images show. Some of your images are missing it.",
    whyCare:
      "Without descriptions, blind visitors hear \"image, image, image\" instead of your content, and Google can't include your images in search results.",
    steps: [
      "If you use Webflow: click on each image → the gear/settings icon → find the \"Alt Text\" field → write a short description of what the image shows (e.g. \"Shivangi presenting a design portfolio\"). Choose \"Decorative\" only for purely decorative shapes and background flourishes.",
      "If you use WordPress: open Media Library → click each image → fill in the \"Alternative Text\" box on the right.",
      "Write descriptions like you're describing the photo to a friend on the phone — short and specific. Don't stuff in keywords.",
      "Re-publish the site when done. This costs nothing and helps both accessibility and Google.",
    ],
  },
  "robots-txt": {
    plainTitle: "Your site is missing its \"instructions file\" for Google",
    whatIsWrong:
      "Websites normally have a small file called robots.txt that tells search engines which pages they may look at. Yours doesn't have one.",
    whyCare:
      "It's not an emergency — Google still finds your site — but having it is a basic housekeeping signal, and it's where your sitemap (next item) gets announced to search engines.",
    steps: [
      "If you use Webflow: go to Site Settings → SEO tab → scroll to \"robots.txt\" → paste in these two lines:  User-agent: *  (new line)  Allow: /   — then save and publish.",
      "If you use WordPress: install the free Yoast SEO plugin — it creates this file for you automatically.",
      "If you use Squarespace or Wix: these platforms create the file automatically — if it's missing, contact their support.",
      "That's it — two lines, one-time setup.",
    ],
  },
  "sitemap": {
    plainTitle: "Your site has no map for search engines",
    whatIsWrong:
      "A sitemap is a machine-readable list of all your pages. Search engines use it to make sure they find everything. Your site doesn't have one.",
    whyCare:
      "Without it, Google discovers your pages more slowly and might miss some entirely — meaning they never show up in search results.",
    steps: [
      "If you use Webflow: go to Site Settings → SEO tab → turn ON \"Auto-generate sitemap\" → publish the site. Done — Webflow maintains it for you from then on.",
      "If you use WordPress: the free Yoast SEO plugin generates one automatically at yoursite.com/sitemap_index.xml.",
      "Optional but worthwhile: tell Google about it directly. Go to search.google.com/search-console, add your website (it walks you through verifying you own it), then under \"Sitemaps\" paste your sitemap address. This also unlocks free reports about how people find you on Google.",
    ],
  },
  "canonical": {
    plainTitle: "Your pages don't declare their \"official\" address",
    whatIsWrong:
      "The same page can sometimes be reached via slightly different addresses. A \"canonical\" tag tells Google which one is the official version. Your pages don't have this tag.",
    whyCare:
      "Google may treat address variations as duplicate pages, splitting your search ranking power between them.",
    steps: [
      "If you use Webflow: Webflow can set this globally — go to Site Settings → SEO tab → \"Global canonical tag URL\" and enter your site's main address (e.g. https://theshivangigupta.in). Publish.",
      "If you use WordPress: the Yoast SEO plugin handles canonical tags automatically once installed.",
      "This is a set-once-and-forget fix.",
    ],
  },
  "meta-description": {
    plainTitle: "Your page is missing its search-result description",
    whatIsWrong:
      "The meta description is the short paragraph that appears under your site name in Google search results. Yours is missing or poorly sized, so Google picks random text from your page instead.",
    whyCare: "A good description is your one chance to convince searchers to click your result instead of someone else's.",
    steps: [
      "Write 1–2 sentences (up to ~155 characters) that describe what you offer and why someone should visit. Think of it as your shop-window sign.",
      "If you use Webflow: open each page's settings (gear icon next to the page name) → \"Meta Description\" field → paste it in → publish.",
      "If you use WordPress: with Yoast SEO installed, the field appears below the page editor.",
    ],
  },
  "title-tag": {
    plainTitle: "Your page title needs attention",
    whatIsWrong:
      "The page title is the text shown in the browser tab and as the blue clickable headline in Google results. Yours is missing, too short, or too long.",
    whyCare: "It's the single most important piece of text Google reads on your page, and it's what searchers see first.",
    steps: [
      "Write a title of roughly 50–60 characters: what you do + who you are, most important words first. Example: \"Freelance Product Designer & Webflow Expert — Shivangi Gupta\".",
      "If you use Webflow: page settings (gear icon) → \"Title Tag\" field → publish.",
      "If you use WordPress: Yoast SEO shows a title field with a green/orange/red length indicator below the editor.",
    ],
  },
  "h1": {
    plainTitle: "Your page's main headline is missing or duplicated",
    whatIsWrong:
      "Every page should have exactly one main headline (called an H1). Yours has none, or has several, which confuses search engines about what the page is about.",
    whyCare: "The main headline is a strong signal to Google about your page's topic.",
    steps: [
      "Decide on one clear main headline per page — usually the big text at the top.",
      "If you use Webflow: click your main heading → in the element settings, make sure its tag is set to \"H1\". Check other big text on the page isn't also set to H1 — use H2 or H3 for those.",
      "If you use WordPress: your page title is usually the H1 automatically — just avoid adding another \"Heading 1\" block inside the content.",
    ],
  },
  "https": {
    plainTitle: "Your site isn't using a secure connection",
    whatIsWrong:
      "Your site loads over an insecure connection (http instead of https). Browsers show a \"Not secure\" warning next to your address.",
    whyCare: "The warning scares visitors away, and Google actively ranks insecure sites lower.",
    steps: [
      "Log into your hosting provider and look for \"SSL certificate\" — nearly all providers (Webflow, WordPress hosts, Squarespace, Wix) offer one for free and enable it with one click.",
      "If you can't find it, contact your hosting provider's support and say: \"Please enable SSL/HTTPS on my site\" — it's a standard request they handle daily.",
    ],
  },
  "structured-data": {
    plainTitle: "Google can't read the 'business card' version of your site",
    whatIsWrong:
      "Structured data is invisible labelling that tells Google plainly: this is a person, this is their job, this is a portfolio piece. Your site doesn't have any.",
    whyCare:
      "Sites with it can get richer search results (photos, ratings, links to sections) which get noticeably more clicks. It's a nice-to-have, not urgent.",
    steps: [
      "For a personal/portfolio site, \"Person\" markup is the relevant kind: your name, job title, photo, and social profiles.",
      "The free tool at technicalseo.com/tools/schema-markup-generator can generate it: choose \"Person\", fill the form, copy the code it produces.",
      "If you use Webflow: paste that code into Site Settings → Custom Code → \"Head Code\" and publish.",
      "This one is fine to leave for later or hand to your web person.",
    ],
  },
  "open-graph": {
    plainTitle: "Your links look plain when shared on social media",
    whatIsWrong:
      "When someone shares your site on WhatsApp, LinkedIn or Instagram, the preview card (image + title + description) is incomplete because the hidden \"Open Graph\" tags are missing.",
    whyCare: "Links with a proper preview image get far more clicks than bare links.",
    steps: [
      "Choose an attractive image that represents your site (1200×630 pixels works everywhere).",
      "If you use Webflow: each page's settings has an \"Open Graph Settings\" section — set the image, title and description there, then publish.",
      "Test it: paste your link into opengraph.xyz to preview exactly what WhatsApp/LinkedIn will show.",
    ],
  },
  "unused-javascript": {
    plainTitle: "Your site downloads code it never uses",
    whatIsWrong:
      "Your page makes every visitor download a large amount of program code, but much of it is never actually used — like shipping a whole toolbox when only a screwdriver was needed.",
    whyCare: "It's pure wasted download time, and it's one of the bigger drags on your mobile speed score.",
    steps: [
      "The usual culprits are add-ons and embeds: sliders, animations, chat widgets, social feeds, video players, tracking tools.",
      "List every add-on/widget on your site and remove the ones you don't truly need — each removal directly speeds up the site.",
      "If you use Webflow: check Site Settings → Custom Code and each page's custom code for old scripts from tools you stopped using — delete them.",
      "For what remains, this becomes a developer task (\"reduce and defer unused JavaScript\") — worth sending this section to your web person.",
    ],
  },
  "unused-css-rules": {
    plainTitle: "Your site downloads styling rules it never uses",
    whatIsWrong:
      "Styling code (colours, fonts, layouts) is being downloaded for page elements that don't exist on the page.",
    whyCare: "Smaller waste than unused program code, but it still slows every single visit a little.",
    steps: [
      "If you use Webflow: open the Style Manager panel and use the \"Clean up\" button — it finds and removes unused styles safely with one click.",
      "If you use WordPress: this usually comes from the theme or page-builder; a caching plugin like WP Rocket has a \"Remove Unused CSS\" option.",
      "Otherwise it's a small developer task — low priority.",
    ],
  },
  "unminified-css": {
    plainTitle: "Your styling files are shipped in 'draft' form",
    whatIsWrong:
      "The styling files are sent to visitors with all their extra spacing and notes intact, making them bigger than necessary. \"Minifying\" strips that out automatically.",
    whyCare: "A small, free win — a few KB shaved off every visit.",
    steps: [
      "If you use Webflow: Site Settings → Publishing → scroll to \"Advanced publishing options\" → turn ON \"Minify CSS\" (and \"Minify JS\" while you're there) → publish.",
      "If you use WordPress: any caching plugin (WP Rocket, W3 Total Cache, LiteSpeed) has minification as a checkbox.",
    ],
  },
  "unminified-javascript": {
    plainTitle: "Your program code is shipped in 'draft' form",
    whatIsWrong: "Same story as the styling files: code is sent with unnecessary bulk that a \"minify\" setting removes automatically.",
    whyCare: "Free speed, one checkbox.",
    steps: [
      "If you use Webflow: Site Settings → Publishing → Advanced publishing options → turn ON \"Minify JS\" → publish.",
      "If you use WordPress: enable minification in your caching plugin.",
    ],
  },
  "modern-image-formats": {
    plainTitle: "Your images use old, heavy file formats",
    whatIsWrong:
      "Your photos are saved as JPEG/PNG. Newer formats (WebP, AVIF) look identical but are 25–50% smaller.",
    whyCare: "Images are usually the heaviest part of a page — smaller images mean a faster site, especially on phones.",
    steps: [
      "Go to squoosh.app (free, made by Google, works in the browser).",
      "Drag each large image in, pick \"WebP\" on the right, and download the result.",
      "Replace the images on your site with the WebP versions.",
      "If you use Webflow: newer Webflow plans can convert images to WebP for you — select an image asset in the Assets panel and look for the WebP conversion option.",
    ],
  },
  "uses-optimized-images": {
    plainTitle: "Your images are heavier than they need to be",
    whatIsWrong: "Some images are uploaded at much larger file sizes than necessary — often straight from a camera or design tool.",
    whyCare: "Every extra megabyte is extra waiting time for your visitors, especially on mobile data.",
    steps: [
      "Run your images through squoosh.app or tinypng.com (both free, drag & drop) and re-upload the smaller versions.",
      "Rule of thumb: a full-width photo should be under 200 KB; smaller images under 100 KB.",
      "Also check dimensions: don't upload a 4000-pixel-wide photo for a spot that displays it 800 pixels wide.",
    ],
  },
  "offscreen-images": {
    plainTitle: "Images at the bottom of the page load immediately",
    whatIsWrong:
      "All images load the moment someone opens the page — including ones far down that the visitor may never scroll to.",
    whyCare: "Loading them upfront delays the content the visitor actually sees first.",
    steps: [
      "The fix is called \"lazy loading\": images load only when the visitor scrolls near them.",
      "If you use Webflow: select each image below the top of the page → Image Settings → set \"Load\" to \"Lazy\". (Keep the very first/top image on \"Eager\".)",
      "If you use WordPress: this is automatic since 2020 — just keep WordPress updated.",
    ],
  },
  "uses-text-compression": {
    plainTitle: "Your site's files are sent uncompressed",
    whatIsWrong:
      "Web servers can \"zip\" files before sending them and browsers unzip them instantly — yours isn't doing this.",
    whyCare: "Compression typically shrinks the transferred data by 60–80%, completely free.",
    steps: [
      "This is a hosting setting, not a site setting. Webflow, Squarespace, Wix, Netlify and Vercel all do it automatically — if you're on one of those, this finding usually points at some external resource instead.",
      "If you have your own hosting: message their support with \"Please enable gzip or Brotli compression\" — a standard request.",
    ],
  },
  "server-response-time": {
    plainTitle: "Your web server is slow to answer",
    whatIsWrong:
      "Before your page can even start loading, the server hosting it takes too long to respond — like a shop assistant who takes ages to answer the phone.",
    whyCare: "Every page view starts with this delay; nothing else can begin until it's over.",
    steps: [
      "If you're on cheap shared hosting, this is usually the cause — consider upgrading your plan or moving to a better host.",
      "A free Cloudflare account (cloudflare.com) in front of your site can dramatically improve response times worldwide — their setup wizard guides you through it.",
      "If you're on Webflow/Squarespace/Wix, their infrastructure is normally fast — a slow reading here may be temporary; re-run the audit to confirm.",
    ],
  },
  "prioritize-lcp-image": {
    plainTitle: "Your main image isn't given priority",
    whatIsWrong:
      "The browser treats your most important image (the big one at the top) the same as every other image instead of loading it first.",
    whyCare: "Loading it first would make the page feel dramatically faster.",
    steps: [
      "If you use Webflow: select the top/hero image → Image Settings → set \"Load\" to \"Eager\".",
      "The full fix (a \"preload\" instruction with high priority) is one line of code for a developer — send them this section.",
    ],
  },
  "font-display": {
    plainTitle: "Text is invisible while your fonts load",
    whatIsWrong:
      "Your custom fonts take a moment to download, and until they arrive the text is invisible instead of showing a temporary standard font.",
    whyCare: "Visitors stare at blank spaces where your words should be.",
    steps: [
      "If you use Google Fonts via a link: add \"&display=swap\" to the end of the font link in your site's custom code.",
      "If you use Webflow with uploaded fonts: Webflow handles this correctly for fonts added via Site Settings → Fonts — prefer that over custom code.",
      "Otherwise, ask your web person to \"add font-display: swap to the @font-face rules\".",
    ],
  },
  "uses-long-cache-ttl": {
    plainTitle: "Returning visitors re-download everything",
    whatIsWrong:
      "Browsers can remember your images and files so returning visitors don't download them again — but your site tells them to forget quickly.",
    whyCare: "Repeat visitors (your most interested audience!) get a slower experience than they should.",
    steps: [
      "On Webflow/Squarespace/Wix this is managed for you — this finding usually points at external add-ons, which you can't fix directly (consider removing the add-on if it's not valuable).",
      "On your own hosting: ask support or your developer to \"set long Cache-Control headers for static assets\".",
    ],
  },
  "total-byte-weight": {
    plainTitle: "Your page is very heavy overall",
    whatIsWrong: "Adding up all the images, code and fonts, your page makes visitors download an unusually large amount of data.",
    whyCare: "Heavy pages are slow on mobile data and can even cost your visitors real money on metered connections.",
    steps: [
      "Images first: compress everything through squoosh.app or tinypng.com (see the image sections of this report).",
      "Remove add-ons, embeds and fonts you don't truly need — each one adds weight.",
      "Target: a page under 1.5 MB total. Re-run this audit to track your progress.",
    ],
  },
  "legacy-javascript": {
    plainTitle: "Your site ships code for ancient browsers",
    whatIsWrong:
      "Your page includes extra compatibility code for very old browsers (like Internet Explorer) that almost nobody uses anymore.",
    whyCare: "Everyone pays the download cost; almost nobody benefits.",
    steps: [
      "This is a developer setting in the site's build tools — send this section to your web person and ask them to \"target modern browsers in the build config\".",
      "If your site is on Webflow/Squarespace/Wix, this finding usually comes from a third-party add-on — removing unneeded add-ons is your lever here.",
    ],
  },
  "dom-size": {
    plainTitle: "Your page has too many building blocks",
    whatIsWrong:
      "Web pages are made of building blocks (elements). Your page has an unusually high number, which makes the browser work harder.",
    whyCare: "It slows down loading and makes the page feel sluggish, especially on cheaper phones.",
    steps: [
      "Long pages with many sections, huge menus, or hidden duplicate content for mobile/desktop are the usual causes.",
      "Consider splitting very long pages into several shorter ones.",
      "The detailed cleanup is developer work — pass this section along.",
    ],
  },
  "efficient-animated-content": {
    plainTitle: "You're using GIFs where videos would be lighter",
    whatIsWrong: "Animated GIFs are an old format — a short video file showing the same thing is often 10× smaller.",
    whyCare: "GIFs can be enormous (several MB each) and drag your whole page down.",
    steps: [
      "Convert each GIF to MP4 with a free tool like cloudconvert.com (GIF → MP4).",
      "Replace the GIF on your site with the video, set to autoplay, loop, and muted — it will look identical to visitors.",
      "In Webflow: use a Background Video element for this.",
    ],
  },
  "duplicated-javascript": {
    plainTitle: "The same code is included twice",
    whatIsWrong: "Your page downloads two copies of the same program code — often two versions of one tool.",
    whyCare: "Visitors pay the download cost twice for no benefit.",
    steps: [
      "This usually happens when two add-ons each bring their own copy of the same library, or old code was never removed.",
      "Check your site's custom code areas for duplicate or outdated snippets and remove them.",
      "Otherwise, it's a quick find-and-fix for a developer — send this section along.",
    ],
  },
  "third-party-summary": {
    plainTitle: "Other companies' add-ons are slowing you down",
    whatIsWrong:
      "Widgets and tools from other companies (chat bubbles, analytics, social feeds, embeds) load their own code on your page, and it's adding real delay.",
    whyCare: "You're paying a speed price for every add-on — some earn their keep, many don't.",
    steps: [
      "List every third-party widget on your site. For each, ask: has this brought me actual value in the last 3 months?",
      "Remove the ones that haven't. This is the single easiest speed win available to non-technical site owners.",
      "For keepers, ask your web person to make them \"load lazily after the page is interactive\".",
    ],
  },
};

// ── Report assembly ───────────────────────────────────────────────────────────

export function buildPlainEnglishHtml(report: AuditReport): string {
  const date = new Date(report.timestamp).toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const overall = Math.round(
    (report.mobile.scores.performance + report.mobile.scores.accessibility +
     report.mobile.scores.seo + report.mobile.scores.bestPractices) / 4
  );

  const high = report.recommendations.filter(r => r.priority === "high");
  const medium = report.recommendations.filter(r => r.priority === "medium");
  const low = report.recommendations.filter(r => r.priority === "low");
  const quick = report.recommendations.filter(r => r.effort === "easy");

  const body = [
    `<h1>Website Health Report</h1>`,
    `<p class="meta"><strong>Website:</strong> ${esc(report.url)}<br/><strong>Checked on:</strong> ${date}</p>`,

    `<h2>The short version</h2>`,
    `<p>${verdictParagraph(overall, report)}</p>`,
    `<p>We found <strong>${high.length} thing${plural(high.length)} that need${high.length === 1 ? "s" : ""} attention soon</strong>, ` +
    `${medium.length} that should be fixed when you get a chance, and ${low.length} nice-to-have${plural(low.length)}. ` +
    `<strong>${quick.length} of them are quick fixes</strong> — most take under an hour, and none of them require you to be technical.</p>`,

    `<h2>Your scores at a glance</h2>`,
    scoresTable(report),
    `<p class="note">Scores are out of 100, measured by Google's own testing tools. Phone scores matter most — that's how most people will visit your site, and it's what Google uses for ranking.</p>`,

    `<h2>How fast does your site feel?</h2>`,
    speedTable(report),

    `<h2>What to fix, in order</h2>`,
    `<p>Everything below is written so you can do it yourself, even without technical knowledge. Where a step really does need a developer, we say so — you can copy that section and send it to them as-is.</p>`,

    recsHtml(high, "Fix these first", "These have the biggest impact on your visitors and your Google ranking."),
    recsHtml(medium, "Fix these soon", "Not emergencies, but each one is costing you a little speed or visibility."),
    recsHtml(low, "Nice to have", "Polish for when everything above is done."),

    `<h2>Word list (in case anything was unclear)</h2>`,
    glossary(),

    `<hr/>`,
    `<p class="note">This report was generated automatically by the Website Audit Agent on ${date}, using Google PageSpeed Insights (the same tool Google itself uses to measure websites) plus a direct review of the page's content. Re-run the audit after making changes to see your scores improve.</p>`,
  ].join("\n");

  return htmlShell(`Website Health Report — ${report.url}`, body);
}

// ── Sections ──────────────────────────────────────────────────────────────────

function verdictParagraph(overall: number, r: AuditReport): string {
  const mobilePerf = r.mobile.scores.performance;
  if (overall >= 85 && mobilePerf >= 80) {
    return `Good news: your website is in <strong>great shape overall (${overall}/100)</strong>. The items below are fine-tuning, not fire-fighting.`;
  }
  if (overall >= 70) {
    return `Your website is in <strong>decent shape overall (${overall}/100)</strong>, with one main weak spot: ` +
      `it is <strong>slower on phones than it should be (${mobilePerf}/100)</strong>. The good news is that the causes are known and most of the fixes are simple — they are all listed below, starting with the most important.`;
  }
  return `Your website needs some care: it scores <strong>${overall}/100 overall</strong>, and visitors are likely noticing the problems — especially on phones (${mobilePerf}/100 for speed). Don't worry: every problem we found comes with a full fix guide below, starting with what matters most.`;
}

function scoresTable(r: AuditReport): string {
  const row = (label: string, plain: string, m: number, d: number) =>
    `<tr><td><strong>${label}</strong><br/><span class="small">${plain}</span></td>` +
    `<td class="score">${grade(m)} ${m}</td><td class="score">${grade(d)} ${d}</td></tr>`;

  return `<table>
<tr><th>What we measured</th><th>On phones</th><th>On computers</th></tr>
${row("Speed", "How fast pages load and respond", r.mobile.scores.performance, r.desktop.scores.performance)}
${row("Ease of use for everyone", "Whether people with disabilities can use the site", r.mobile.scores.accessibility, r.desktop.scores.accessibility)}
${row("Findability on Google", "How well the site is set up for search engines", r.mobile.scores.seo, r.desktop.scores.seo)}
${row("Technical housekeeping", "Following current web standards and security practices", r.mobile.scores.bestPractices, r.desktop.scores.bestPractices)}
</table>`;
}

function speedTable(r: AuditReport): string {
  const cwv = r.mobile.coreWebVitals;
  const row = (q: string, v: string, rating: "good" | "needs-improvement" | "poor", target: string) => {
    const label = rating === "good" ? "✓ Good" : rating === "needs-improvement" ? "△ Could be better" : "✗ Too slow";
    return `<tr><td>${q}</td><td>${esc(v)}</td><td class="${rating}">${label}</td><td class="small">${target}</td></tr>`;
  };

  return `<p>Measured on a typical phone, the way Google measures it:</p>
<table>
<tr><th>Question</th><th>Your site</th><th>Verdict</th><th>Goal</th></tr>
${row("How long until the main content appears?", cwv.lcp.displayValue, cwv.lcp.rating, "Under 2.5 seconds")}
${row("How long until anything appears?", cwv.fcp.displayValue, cwv.fcp.rating, "Under 1.8 seconds")}
${row("Does the page jump around while loading?", cwv.cls.displayValue, cwv.cls.rating, "Steady (under 0.1)")}
${row("Does it react quickly when tapped?", cwv.tbt.displayValue, cwv.tbt.rating, "Under 0.2 seconds")}
</table>`;
}

function recsHtml(recs: Recommendation[], title: string, subtitle: string): string {
  if (recs.length === 0) return "";

  const items = recs.map((rec, i) => {
    const guide = rec.id ? FIX_GUIDES[rec.id] : undefined;
    const heading = guide?.plainTitle ?? rec.issue;
    const whatIsWrong = guide?.whatIsWrong ?? rec.impact;
    const whyCare = guide?.whyCare ?? "";
    const effortLabel = rec.effort === "easy" ? "⚡ Quick fix — usually under an hour"
      : rec.effort === "medium" ? "🕐 Takes a bit longer — an afternoon, or a small job for your web person"
      : "🔧 Bigger job — best handled by a developer";

    const steps = guide
      ? `<ol>${guide.steps.map(s => `<li>${s}</li>`).join("\n")}</ol>`
      : `<p>${esc(rec.fix)}</p>`;

    return `<div class="issue">
<h4>${i + 1}. ${esc(heading)}</h4>
<p class="effort">${effortLabel}</p>
<p><strong>What's wrong:</strong> ${whatIsWrong}</p>
${whyCare ? `<p><strong>Why you should care:</strong> ${whyCare}</p>` : ""}
<p><strong>How to fix it:</strong></p>
${steps}
</div>`;
  });

  return `<h3>${title}</h3>\n<p class="small">${subtitle}</p>\n${items.join("\n")}`;
}

function glossary(): string {
  const terms: Array<[string, string]> = [
    ["Alt text", "A short hidden description attached to an image, read out loud by software for blind visitors and read by Google."],
    ["Lazy loading", "Loading images only when the visitor scrolls near them, instead of all at once at the start."],
    ["Minify", "Automatically removing unnecessary spacing from code files to make them smaller. Purely a settings toggle."],
    ["Redirect", "An automatic forward from one web address to another. Each one adds waiting time."],
    ["SEO", "Search Engine Optimisation — everything that affects how easily people find your site on Google."],
    ["Sitemap", "A machine-readable list of all your pages that helps Google find everything."],
    ["WebP", "A modern image format that looks the same as JPEG/PNG but is much smaller. Free converters: squoosh.app, tinypng.com."],
  ];
  return `<table>${terms.map(([t, d]) => `<tr><td><strong>${t}</strong></td><td>${d}</td></tr>`).join("\n")}</table>`;
}

// ── HTML plumbing ─────────────────────────────────────────────────────────────

function grade(score: number): string {
  return score >= 90 ? "🟢" : score >= 50 ? "🟡" : "🔴";
}

function plural(n: number): string {
  return n === 1 ? "" : "s";
}

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function htmlShell(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${esc(title)}</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; font-size: 12pt; line-height: 1.55; color: #1a1a1a; max-width: 46em; margin: 2em auto; padding: 0 1em; }
  h1 { font-size: 22pt; border-bottom: 3px solid #1a1a1a; padding-bottom: 8px; }
  h2 { font-size: 16pt; margin-top: 1.6em; border-bottom: 1px solid #999; padding-bottom: 4px; }
  h3 { font-size: 14pt; margin-top: 1.4em; }
  h4 { font-size: 12pt; margin-bottom: 4px; }
  table { border-collapse: collapse; width: 100%; margin: 0.8em 0; }
  th, td { border: 1px solid #bbb; padding: 7px 10px; text-align: left; vertical-align: top; font-size: 11pt; }
  th { background: #f0f0f0; }
  .score { font-size: 13pt; white-space: nowrap; }
  .small, .note { font-size: 10pt; color: #555; }
  .meta { color: #444; }
  .effort { font-size: 10.5pt; color: #555; font-style: italic; margin-top: 0; }
  .issue { margin-bottom: 1.6em; }
  .good { color: #167a2c; } .needs-improvement { color: #a05a00; } .poor { color: #b00020; }
  ol li { margin-bottom: 6px; }
  hr { border: none; border-top: 1px solid #ccc; margin: 2em 0; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}
