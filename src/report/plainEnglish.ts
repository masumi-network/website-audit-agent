/**
 * Plain-English report builder.
 *
 * Produces an HTML document written for someone with zero technical knowledge:
 * every problem is explained in everyday words, and every fix is a full
 * step-by-step guide so the reader never has to google anything.
 *
 * Platform handling: fix steps are platform-neutral by default. Steps tagged with
 * `only: [...]` are shown ONLY when the user told us the site's platform
 * (report.platform) and it matches. We never guess the platform from the site —
 * so an audit with no stated platform reads generically for any builder.
 *
 * The HTML is designed to convert cleanly to .docx (via macOS `textutil`)
 * and also opens directly in Word, Pages, or Google Docs.
 */

import type { AuditReport, Platform, Recommendation } from "../types.js";

// ── Detailed fix guides, keyed by Recommendation.id ───────────────────────────

/** A fix step. A plain string shows always; a tagged step shows only for its platform(s). */
type Step = string | { only: Platform[]; text: string };

interface FixGuide {
  plainTitle: string;
  whatIsWrong: string;
  whyCare: string;
  steps: Step[];
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
      { only: ["webflow"], text: "In Webflow: Site Settings → Publishing and check which domain is set as the default. Make sure your links point to that default domain." },
      { only: ["wordpress"], text: "In WordPress: log into your hosting/domain provider (like GoDaddy or Namecheap) and check the domain forwarding settings — there should be at most one redirect (from the non-preferred version to the preferred one), not a chain." },
      { only: ["shopify"], text: "In Shopify: Settings → Domains. Make sure one domain is set as primary and \"Redirect all traffic to this domain\" is ON — that gives a single clean redirect instead of a chain." },
      { only: ["squarespace", "wix"], text: "In Squarespace/Wix: open your domain settings and make sure there is a single primary domain with all other versions pointing straight to it, not through a chain." },
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
      "In your editor, make sure images have a set width and height (or a fixed aspect ratio) rather than being left fully automatic — that reserves their space up front.",
      { only: ["webflow"], text: "In Webflow: select each image and set an explicit width and height in the Element Settings panel, then re-publish." },
      { only: ["wordpress"], text: "In WordPress: modern themes handle this automatically — keep your theme and plugins updated. If it persists, an image plugin like Smush can add the missing size information." },
      { only: ["shopify"], text: "In Shopify: this is controlled by your theme. Most modern themes reserve image space correctly — update to the latest theme version, or ask your theme developer to add width/height (or an aspect-ratio) to image elements." },
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
      "Make sure images below the fold are set to \"lazy load\" EXCEPT the very first/top one — that one should load immediately so it appears as fast as possible.",
      { only: ["webflow"], text: "In Webflow: set below-the-fold images to Load: Lazy, and the top/hero image to Load: Eager (Image settings)." },
      { only: ["shopify"], text: "In Shopify: your theme usually lazy-loads images automatically and serves WebP for you — just upload a reasonably sized hero image, and make sure the hero/first image is NOT lazy-loaded (check the theme editor, or ask your theme developer)." },
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
      { only: ["shopify"], text: "In Shopify: go to Settings → Apps and sales channels and remove apps you no longer use — each app injects its own code that runs on every page." },
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
      "In your site editor or CMS, open each image and fill in its \"Alt text\" (sometimes called \"Alternative text\" or \"Description\") field with a short description of what the image shows.",
      { only: ["webflow"], text: "In Webflow: click each image → the gear/settings icon → \"Alt Text\" field. Choose \"Decorative\" only for purely decorative shapes and background flourishes." },
      { only: ["wordpress"], text: "In WordPress: open Media Library → click each image → fill in the \"Alternative Text\" box on the right." },
      { only: ["shopify"], text: "In Shopify: Products → open a product → click an image → \"Add alt text\". For banner/theme images, use the theme editor (Online Store → Themes → Customize) — each image block has an alt-text field." },
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
      "Most website builders and SEO plugins can create this file for you — look in your platform's SEO settings for a robots.txt option.",
      { only: ["webflow"], text: "In Webflow: Site Settings → SEO tab → scroll to \"robots.txt\" → paste in these two lines:  User-agent: *  (new line)  Allow: /   — then save and publish." },
      { only: ["wordpress"], text: "In WordPress: install the free Yoast SEO plugin — it creates this file for you automatically." },
      { only: ["shopify"], text: "In Shopify: this file is generated automatically at yoursite.com/robots.txt — you usually don't need to do anything. To customise it, add a robots.txt.liquid template to your theme (Online Store → Themes → Edit code)." },
      { only: ["squarespace", "wix"], text: "In Squarespace/Wix: this file is created automatically — if it's genuinely missing, contact their support." },
      "That's it — a one-time setup.",
    ],
  },
  "sitemap": {
    plainTitle: "Your site has no map for search engines",
    whatIsWrong:
      "A sitemap is a machine-readable list of all your pages. Search engines use it to make sure they find everything. Your site doesn't have one.",
    whyCare:
      "Without it, Google discovers your pages more slowly and might miss some entirely — meaning they never show up in search results.",
    steps: [
      "Most platforms can generate a sitemap automatically — check your SEO settings for a \"sitemap\" option and make sure it's turned on.",
      { only: ["webflow"], text: "In Webflow: Site Settings → SEO tab → turn ON \"Auto-generate sitemap\" → publish the site. Webflow maintains it for you from then on." },
      { only: ["wordpress"], text: "In WordPress: the free Yoast SEO plugin generates one automatically at yoursite.com/sitemap_index.xml." },
      { only: ["shopify"], text: "In Shopify: a sitemap is generated automatically at yoursite.com/sitemap.xml — no action needed beyond submitting it to Google (next step)." },
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
      "Look for a \"canonical URL\" or \"duplicate content\" option in your platform's SEO settings — most modern platforms can set canonicals for you.",
      { only: ["webflow"], text: "In Webflow: Site Settings → SEO tab → \"Global canonical tag URL\" → enter your site's main address (e.g. https://yourdomain.com) → publish." },
      { only: ["wordpress"], text: "In WordPress: the Yoast SEO plugin handles canonical tags automatically once installed." },
      { only: ["shopify"], text: "In Shopify: canonical tags are added automatically by the theme — no action needed. If a custom theme removed them, ask your theme developer to restore the <link rel=\"canonical\"> tag in theme.liquid." },
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
      "In your platform, find the \"Meta description\" or \"Search engine listing\" field for each page and paste it in.",
      { only: ["webflow"], text: "In Webflow: open each page's settings (gear icon next to the page name) → \"Meta Description\" field → paste it in → publish." },
      { only: ["wordpress"], text: "In WordPress: with Yoast SEO installed, the field appears below the page editor." },
      { only: ["shopify"], text: "In Shopify: open the page/product/collection → scroll to \"Search engine listing\" → Edit → fill in the \"Description\". For the homepage, use Online Store → Preferences → \"Homepage meta description\"." },
    ],
  },
  "title-tag": {
    plainTitle: "Your page title needs attention",
    whatIsWrong:
      "The page title is the text shown in the browser tab and as the blue clickable headline in Google results. Yours is missing, too short, or too long.",
    whyCare: "It's the single most important piece of text Google reads on your page, and it's what searchers see first.",
    steps: [
      "Write a title of roughly 50–60 characters: what the page is about + your brand, most important words first (for example: \"Handmade Leather Bags — YourBrand\").",
      { only: ["webflow"], text: "In Webflow: page settings (gear icon) → \"Title Tag\" field → publish." },
      { only: ["wordpress"], text: "In WordPress: Yoast SEO shows a title field with a green/orange/red length indicator below the editor." },
      { only: ["shopify"], text: "In Shopify: open the page/product → \"Search engine listing\" → Edit → \"Page title\". For the homepage, use Online Store → Preferences → \"Homepage title\"." },
      "In any other platform, look for a \"Title tag\" or \"SEO title\" field in each page's settings.",
    ],
  },
  "h1": {
    plainTitle: "Your page's main headline is missing or duplicated",
    whatIsWrong:
      "Every page should have exactly one main headline (called an H1). Yours has none, or has several, which confuses search engines about what the page is about.",
    whyCare: "The main headline is a strong signal to Google about your page's topic.",
    steps: [
      "Decide on one clear main headline per page — usually the big text at the top.",
      { only: ["webflow"], text: "In Webflow: click your main heading → in the element settings, set its tag to \"H1\". Check other big text on the page isn't also set to H1 — use H2 or H3 for those." },
      { only: ["wordpress"], text: "In WordPress: your page title is usually the H1 automatically — just avoid adding another \"Heading 1\" block inside the content." },
      { only: ["shopify"], text: "In Shopify: the H1 is set by your theme (usually the product/collection/page title). Avoid adding extra \"Heading 1\" text blocks; if a page has no H1 at all, ask your theme developer." },
      "In any other platform, make sure the main headline uses the \"Heading 1\" style and nothing else on the page does.",
    ],
  },
  "https": {
    plainTitle: "Your site isn't using a secure connection",
    whatIsWrong:
      "Your site loads over an insecure connection (http instead of https). Browsers show a \"Not secure\" warning next to your address.",
    whyCare: "The warning scares visitors away, and Google actively ranks insecure sites lower.",
    steps: [
      "Log into your hosting provider and look for \"SSL certificate\" — nearly all providers offer one for free and enable it with one click.",
      { only: ["shopify"], text: "In Shopify: SSL is included and enabled automatically. If you still see \"Not secure\", go to Settings → Domains and make sure your domain's SSL status shows \"Active\" (it can take up to 48 hours after connecting a new domain)." },
      "If you can't find it, contact your hosting provider's support and say: \"Please enable SSL/HTTPS on my site\" — it's a standard request they handle daily.",
    ],
  },
  "structured-data": {
    plainTitle: "Google can't read the 'business card' version of your site",
    whatIsWrong:
      "Structured data is invisible labelling that tells Google plainly what a page is: a product, a business, a person, an article. Your site doesn't have any.",
    whyCare:
      "Sites with it can get richer search results (photos, ratings, links to sections) which get noticeably more clicks. It's a nice-to-have, not urgent.",
    steps: [
      "Identify what each page is really about — a product, a local business, a person, or an article — that determines the right type of markup.",
      "The free tool at technicalseo.com/tools/schema-markup-generator can generate it: pick the matching type, fill the form, and copy the code it produces.",
      { only: ["webflow"], text: "In Webflow: paste that code into Site Settings → Custom Code → \"Head Code\" and publish (or per-page custom code for page-specific markup)." },
      { only: ["shopify"], text: "In Shopify: many themes already output Product and Organization structured data — check first (search your theme for \"application/ld+json\"). To add or extend it, edit theme.liquid or use an SEO app such as \"JSON-LD for SEO\"." },
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
      { only: ["webflow"], text: "In Webflow: each page's settings has an \"Open Graph Settings\" section — set the image, title and description there, then publish." },
      { only: ["shopify"], text: "In Shopify: most themes generate these tags from your page content plus a \"social sharing image\" setting — set it under Online Store → Themes → Customize → Theme settings." },
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
      { only: ["webflow"], text: "In Webflow: check Site Settings → Custom Code and each page's custom code for old scripts from tools you stopped using — delete them." },
      { only: ["shopify"], text: "In Shopify: go to Settings → Apps and sales channels and remove apps you no longer use — each injects its own JavaScript. Also check Online Store → Themes → Edit code for leftover tracking snippets." },
      "For what remains, this becomes a developer task (\"reduce and defer unused JavaScript\") — worth sending this section to your web person.",
    ],
  },
  "unused-css-rules": {
    plainTitle: "Your site downloads styling rules it never uses",
    whatIsWrong:
      "Styling code (colours, fonts, layouts) is being downloaded for page elements that don't exist on the page.",
    whyCare: "Smaller waste than unused program code, but it still slows every single visit a little.",
    steps: [
      "Unused styling is normally produced by your theme, template, or page-builder rather than added by hand — so the lever is usually a cleanup setting or a leaner theme.",
      { only: ["webflow"], text: "In Webflow: open the Style Manager panel and use the \"Clean up\" button — it finds and removes unused styles safely with one click." },
      { only: ["wordpress"], text: "In WordPress: this usually comes from the theme or page-builder; a caching plugin like WP Rocket has a \"Remove Unused CSS\" option." },
      { only: ["shopify"], text: "In Shopify: unused CSS usually comes from your theme or installed apps — remove apps you don't use, keep your theme updated, and for a deep cleanup ask a theme developer." },
      "Otherwise it's a small developer task — low priority.",
    ],
  },
  "unminified-css": {
    plainTitle: "Your styling files are shipped in 'draft' form",
    whatIsWrong:
      "The styling files are sent to visitors with all their extra spacing and notes intact, making them bigger than necessary. \"Minifying\" strips that out automatically.",
    whyCare: "A small, free win — a few KB shaved off every visit.",
    steps: [
      "\"Minifying\" is almost always a one-click setting in your platform or a caching/optimisation plugin.",
      { only: ["webflow"], text: "In Webflow: Site Settings → Publishing → Advanced publishing options → turn ON \"Minify CSS\" (and \"Minify JS\" while you're there) → publish." },
      { only: ["wordpress"], text: "In WordPress: any caching plugin (WP Rocket, W3 Total Cache, LiteSpeed) has minification as a checkbox." },
      { only: ["shopify"], text: "In Shopify: theme CSS is served minified automatically — leftover unminified CSS usually comes from apps or custom code, so remove unused apps or ask a developer." },
    ],
  },
  "unminified-javascript": {
    plainTitle: "Your program code is shipped in 'draft' form",
    whatIsWrong: "Same story as the styling files: code is sent with unnecessary bulk that a \"minify\" setting removes automatically.",
    whyCare: "Free speed, one checkbox.",
    steps: [
      "Same one-click \"minify\" setting as for CSS.",
      { only: ["webflow"], text: "In Webflow: Site Settings → Publishing → Advanced publishing options → turn ON \"Minify JS\" → publish." },
      { only: ["wordpress"], text: "In WordPress: enable minification in your caching plugin." },
      { only: ["shopify"], text: "In Shopify: theme JavaScript is minified automatically — unminified code usually comes from apps or custom snippets, so remove what you don't need." },
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
      { only: ["webflow"], text: "In Webflow: newer plans can convert images to WebP for you — select an image asset in the Assets panel and look for the WebP conversion option." },
      { only: ["shopify"], text: "In Shopify: images are automatically served as WebP to supported browsers — you usually don't need to convert manually. Just upload reasonably sized files (see the next item)." },
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
      "The fix is called \"lazy loading\": images load only when the visitor scrolls near them. Keep the very first/top image eager.",
      { only: ["webflow"], text: "In Webflow: select each image below the top of the page → Image Settings → set \"Load\" to \"Lazy\". (Keep the very first/top image on \"Eager\".)" },
      { only: ["wordpress"], text: "In WordPress: this is automatic since 2020 — just keep WordPress updated." },
      { only: ["shopify"], text: "In Shopify: most modern themes lazy-load below-the-fold images automatically — make sure your theme is up to date, and keep the hero image eager." },
    ],
  },
  "uses-text-compression": {
    plainTitle: "Your site's files are sent uncompressed",
    whatIsWrong:
      "Web servers can \"zip\" files before sending them and browsers unzip them instantly — yours isn't doing this.",
    whyCare: "Compression typically shrinks the transferred data by 60–80%, completely free.",
    steps: [
      "Most managed platforms (Webflow, Squarespace, Wix, Shopify, Netlify, Vercel) do this automatically — if you're on one of those, this finding usually points at an external resource instead.",
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
      "If you're on a managed platform (Webflow, Squarespace, Wix, Shopify), the core infrastructure is normally fast — a slow reading may be temporary or caused by heavy apps/embeds; re-run the audit to confirm.",
    ],
  },
  "prioritize-lcp-image": {
    plainTitle: "Your main image isn't given priority",
    whatIsWrong:
      "The browser treats your most important image (the big one at the top) the same as every other image instead of loading it first.",
    whyCare: "Loading it first would make the page feel dramatically faster.",
    steps: [
      "Make sure your biggest top-of-page image loads first, not lazily.",
      { only: ["webflow"], text: "In Webflow: select the top/hero image → Image Settings → set \"Load\" to \"Eager\"." },
      { only: ["shopify"], text: "In Shopify: make sure the hero image in your theme isn't set to lazy-load (check the theme editor, or ask your theme developer to add fetchpriority=\"high\" to it)." },
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
      { only: ["webflow"], text: "In Webflow: fonts added via Site Settings → Fonts are handled correctly — prefer that over pasting custom font code." },
      { only: ["shopify"], text: "In Shopify: fonts loaded through the theme's font picker (Online Store → Themes → Customize → Typography) are handled correctly — prefer that over custom @font-face code." },
      "Otherwise, ask your web person to \"add font-display: swap to the @font-face rules\".",
    ],
  },
  "uses-long-cache-ttl": {
    plainTitle: "Returning visitors re-download everything",
    whatIsWrong:
      "Browsers can remember your images and files so returning visitors don't download them again — but your site tells them to forget quickly.",
    whyCare: "Repeat visitors (your most interested audience!) get a slower experience than they should.",
    steps: [
      "On managed platforms (Webflow, Squarespace, Wix, Shopify) this is handled for you — this finding usually points at external add-ons/apps, which you can't fix directly (consider removing the add-on if it's not valuable).",
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
      "If your site is on a managed platform (Webflow, Squarespace, Wix, Shopify), this usually comes from a third-party add-on/app — removing unneeded ones is your lever here.",
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
      { only: ["webflow"], text: "In Webflow: use a Background Video element for this." },
      { only: ["shopify"], text: "In Shopify: add the video through your theme's video block/section (or a video app), set to autoplay, loop, and muted." },
    ],
  },
  "duplicated-javascript": {
    plainTitle: "The same code is included twice",
    whatIsWrong: "Your page downloads two copies of the same program code — often two versions of one tool.",
    whyCare: "Visitors pay the download cost twice for no benefit.",
    steps: [
      "This usually happens when two add-ons each bring their own copy of the same library, or old code was never removed.",
      "Check your site's custom code areas for duplicate or outdated snippets and remove them.",
      { only: ["shopify"], text: "In Shopify: two apps loading the same library is a common cause — review Settings → Apps and sales channels and remove duplicates." },
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
      { only: ["shopify"], text: "In Shopify: review Settings → Apps and sales channels — each app is a third-party script; remove the ones that don't earn their keep." },
      "For keepers, ask your web person to make them \"load lazily after the page is interactive\".",
    ],
  },
};

// Keep only steps that apply: plain strings always, tagged steps only for the stated platform.
function stepsFor(steps: Step[], platform?: Platform): string[] {
  return steps
    .filter((s): s is string | { only: Platform[]; text: string } =>
      typeof s === "string" || (platform !== undefined && s.only.includes(platform)))
    .map(s => (typeof s === "string" ? s : s.text));
}

// ── Report assembly ───────────────────────────────────────────────────────────

const PLATFORM_LABELS: Record<Platform, string> = {
  webflow: "Webflow",
  wordpress: "WordPress",
  shopify: "Shopify",
  squarespace: "Squarespace",
  wix: "Wix",
};

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

  const platform = report.platform;
  const fixIntro = platform
    ? `Everything below is written so you can do it yourself, even without technical knowledge. ` +
      `You told us your site is built on <strong>${PLATFORM_LABELS[platform]}</strong>, so the steps are tailored for it. ` +
      `Where a step really does need a developer, we say so — you can copy that section and send it to them as-is.`
    : `Everything below is written so you can do it yourself, even without technical knowledge. ` +
      `The steps are kept general so they apply whatever your site is built with — if you tell us your platform ` +
      `(e.g. "my site is on Shopify"), we'll tailor every step to it. ` +
      `Where a step really does need a developer, we say so — you can copy that section and send it to them as-is.`;

  const body = [
    `<h1>Website Health Report</h1>`,
    `<p class="meta"><strong>Website:</strong> ${esc(report.url)}<br/><strong>Checked on:</strong> ${date}` +
    `${platform ? `<br/><strong>Platform:</strong> ${PLATFORM_LABELS[platform]}` : ""}</p>`,

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
    `<p>${fixIntro}</p>`,

    recsHtml(high, "Fix these first", "These have the biggest impact on your visitors and your Google ranking.", platform),
    recsHtml(medium, "Fix these soon", "Not emergencies, but each one is costing you a little speed or visibility.", platform),
    recsHtml(low, "Nice to have", "Polish for when everything above is done.", platform),

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

function recsHtml(recs: Recommendation[], title: string, subtitle: string, platform?: Platform): string {
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
      ? `<ol>${stepsFor(guide.steps, platform).map(s => `<li>${s}</li>`).join("\n")}</ol>`
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
