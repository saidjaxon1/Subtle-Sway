// Page templates for subtlesway.com, shared by the build script (Node) and the
// admin panel's live preview (browser). Pure functions, no I/O.
// (Body is intentionally not indented: template literals must keep exact whitespace.)

import { esc, fill, markdown, parseEtsyDescription, renderBlocks, summary } from "./text.js";
import { normalizeListingUrl, normalizeSectionUrl, normalizeShopUrl } from "./etsy-url.js";

/**
 * createRenderer({ settings, catalogs, pages, products, assetVersion, mediaUrl })
 * mediaUrl(product, fileName) optionally overrides media URLs (the admin preview uses blob: URLs).
 * Only products with status "published" and a valid Etsy link are rendered.
 */
export function createRenderer({ settings = {}, catalogs: catalogsIn = [], pages = [], products: allProducts = [], retired = [], assetVersion = "1", mediaUrl = null }) {
const catalogs = catalogsIn.map((c) => ({ ...c }));
const SITE = (settings.siteUrl || "").replace(/\/+$/, "");
const SITE_NAME = settings.siteName || "Subtle Sway";
const shopCheck = settings.etsyShopUrl ? normalizeShopUrl(settings.etsyShopUrl) : { ok: false };
const SHOP_URL = shopCheck.ok ? shopCheck.url : "";
const SHOP_NAME = shopCheck.ok ? shopCheck.shop : settings.etsyShopName || "";

// ---------- data preparation ----------

const warnings = [];
const products = allProducts
  .map((p) => ({ ...p }))
  .filter((p) => {
    if (p.status && p.status !== "published") return false;
    const link = normalizeListingUrl(p.etsyUrl, SHOP_NAME);
    if (!link.ok) {
      warnings.push(`skipped "${p.slug}": ${link.error}`);
      return false;
    }
    p.etsyUrl = link.url;
    return true;
  })
  .map((p) => ({
    ...p,
    media: (p.media || []).filter((m) => !m.hidden),
  }))
  .sort((a, b) => String(b.publishedAt || "").localeCompare(String(a.publishedAt || "")));

for (const c of catalogs) {
  if (c.etsySectionUrl) {
    const s = normalizeSectionUrl(c.etsySectionUrl, SHOP_NAME);
    c.etsySectionUrl = s.ok ? s.url : "";
    if (!s.ok) warnings.push(`catalog "${c.slug}" Etsy link ignored: ${s.error}`);
  }
  c.products = products.filter((p) => (p.catalogs || []).includes(c.slug));
}
const activeCatalogs = catalogs.filter((c) => c.products.length);
const catalogBySlug = Object.fromEntries(catalogs.map((c) => [c.slug, c]));

const vars = {
  siteName: SITE_NAME,
  etsyShopUrl: SHOP_URL || "/products/",
  contactEmail: settings.contactEmail || "",
};

// ---------- media helpers ----------

const mediaBase = (p) => `/media/products/${p.slug}`;
const mediaFile = (p, name) => (mediaUrl ? mediaUrl(p, name) : `${mediaBase(p)}/${name}`);
const imgSrc = (p, file, w, ext = "webp") => mediaFile(p, `${file}-${w}.${ext}`);
const WIDTHS = [640, 1080, 1600];

function imageTag(p, m, { sizes, loading = "lazy", fetchpriority, cls = "" }) {
  const srcset = WIDTHS.map((w) => `${imgSrc(p, m.file, w)} ${w}w`).join(", ");
  const w = m.width || 1600;
  const h = m.height || 1600;
  return `<img${cls ? ` class="${cls}"` : ""} src="${imgSrc(p, m.file, 1080)}" srcset="${srcset}" sizes="${sizes}" width="${w}" height="${h}" alt="${esc(m.alt || p.name)}" loading="${loading}" decoding="async"${fetchpriority ? ` fetchpriority="${fetchpriority}"` : ""}>`;
}

const images = (p) => p.media.filter((m) => m.type === "image");
const cover = (p) => {
  const list = images(p);
  return list.find((m) => m.file === p.cover) || list[0];
};
const absolute = (u) => (u.startsWith("http") ? u : SITE + u);

// ---------- layout ----------

function etsyLabel() {
  return `Etsy shop <span aria-hidden="true">↗</span>`;
}

function layout({ title, description, canonical, body, pageClass = "", ogImage, ogType = "website", jsonLd = [], noindex = false, head = "" }) {
  const fullTitle = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} — ${settings.tagline || ""}`;
  const og = ogImage ? absolute(ogImage) : "";
  const footerPages = pages.filter((pg) => pg.inFooter);
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description || settings.metaDescription || "")}">
${noindex ? '<meta name="robots" content="noindex">\n' : ""}${canonical ? `<link rel="canonical" href="${esc(SITE + canonical)}">\n` : ""}<meta name="theme-color" content="#1B1713">
<meta property="og:site_name" content="${esc(SITE_NAME)}">
<meta property="og:type" content="${ogType}">
<meta property="og:title" content="${esc(title || SITE_NAME)}">
<meta property="og:description" content="${esc(description || settings.metaDescription || "")}">
${canonical ? `<meta property="og:url" content="${esc(SITE + canonical)}">\n` : ""}${og ? `<meta property="og:image" content="${esc(og)}">\n<meta name="twitter:image" content="${esc(og)}">\n` : ""}<meta name="twitter:card" content="${og ? "summary_large_image" : "summary"}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preload" href="/assets/fonts/fraunces-latin-full-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/inter-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/site.css?v=${assetVersion}">
<script>document.documentElement.classList.add("js")</script>
<script src="/assets/js/site.js?v=${assetVersion}" defer></script>
${head}${jsonLd.map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, "\\u003c")}</script>`).join("\n")}
</head>
<body class="${pageClass}">
<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
  <div class="wrap header-row">
    <a class="site-name" href="/">${esc(SITE_NAME)}</a>
    <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav"><span class="sr-only">Menu</span><span aria-hidden="true"></span></button>
    <nav class="site-nav" id="site-nav" aria-label="Main">
      <a href="/"${pageClass === "page-home" ? ' aria-current="page"' : ""}>Home</a>
      <a href="/products/"${pageClass.startsWith("page-products") || pageClass === "page-product" ? ' aria-current="page"' : ""}>Products</a>
      <a href="/about/"${pageClass === "page-about" ? ' aria-current="page"' : ""}>About</a>
      <a href="/faq/"${pageClass === "page-faq" ? ' aria-current="page"' : ""}>FAQ</a>
      ${SHOP_URL ? `<a class="nav-etsy" href="${esc(SHOP_URL)}" target="_blank" rel="noopener">${etsyLabel()}</a>` : ""}
    </nav>
  </div>
</header>
<main id="main" class="wrap">
${body}
</main>
<footer class="site-footer">
  <div class="wrap footer-grid">
    <div>
      <a class="site-name" href="/">${esc(SITE_NAME)}</a>
      <p class="footer-tag">${esc(settings.tagline || "")}</p>
      ${SHOP_URL ? `<a class="btn btn-quiet" href="${esc(SHOP_URL)}" target="_blank" rel="noopener">Visit our Etsy shop <span aria-hidden="true">↗</span></a>` : ""}
    </div>
    ${
      activeCatalogs.length
        ? `<nav aria-label="Catalogues"><h2 class="footer-head">Catalogues</h2><ul>${activeCatalogs
            .map((c) => `<li><a href="/products/?collection=${esc(c.slug)}">${esc(c.name)}</a></li>`)
            .join("")}<li><a href="/products/">All products</a></li></ul></nav>`
        : ""
    }
    <nav aria-label="Information"><h2 class="footer-head">Information</h2><ul>${footerPages
      .map((pg) => `<li><a href="/${esc(pg.slug)}/">${esc(pg.navLabel || pg.title)}</a></li>`)
      .join("")}</ul></nav>
  </div>
  <div class="wrap footer-legal">
    <p>&copy; ${year} ${esc(SITE_NAME)}. All artwork is sold as digital downloads; no physical items are shipped.</p>
    <p>${esc(SITE_NAME)} is an independent shop. This site is not operated, sponsored or endorsed by Etsy, Inc.</p>
  </div>
</footer>
</body>
</html>
`;
}

// ---------- components ----------

function productCard(p, { eager = false } = {}) {
  const c = cover(p);
  const cat = catalogBySlug[(p.catalogs || [])[0]];
  const data = {
    collections: (p.catalogs || []).join("|"),
    rooms: (p.rooms || []).join("|"),
    styles: (p.styles || []).join("|"),
    colors: (p.colors || []).join("|"),
    orientation: p.orientation || "",
    search: [p.name, p.etsyTitle, ...(p.tags || []), ...(p.subjects || [])].join(" ").toLowerCase(),
  };
  const attrs = Object.entries(data)
    .map(([k, v]) => `data-${k}="${esc(v)}"`)
    .join(" ");
  return `<li class="product-card" ${attrs}>
  <a href="/products/${esc(p.slug)}/">
    <div class="card-media">${c ? imageTag(p, c, { sizes: "(max-width: 640px) 50vw, (max-width: 1100px) 33vw, 360px", loading: eager ? "eager" : "lazy" }) : ""}</div>
    ${cat ? `<span class="card-eyebrow">${esc(cat.name)}</span>` : ""}
    <h3 class="card-title">${esc(p.name)}</h3>
    <span class="card-note">Digital download</span>
  </a>
</li>`;
}

const grid = (list, opts) => `<ul class="product-grid">${list.map((p, i) => productCard(p, { eager: opts?.eagerFirst && i < 2 })).join("\n")}</ul>`;

function etsyButton(href, label, cls = "btn") {
  if (!href) return "";
  return `<a class="${cls}" href="${esc(href)}" target="_blank" rel="noopener">${label} <span aria-hidden="true">↗</span></a>`;
}

// ---------- pages ----------

function homePage() {
  const per = Number(settings.homeProductsPerCatalog) || 4;
  const heroProduct = products.find((p) => p.featured) || products[0];
  const heroImg = heroProduct ? cover(heroProduct) : null;
  const sections = activeCatalogs
    .map(
      (c) => `<section class="home-section reveal" aria-labelledby="cat-${esc(c.slug)}">
  <div class="section-head">
    <div>
      <span class="eyebrow">Catalogue</span>
      <h2 id="cat-${esc(c.slug)}">${esc(c.name)}</h2>
      ${c.description ? `<p class="section-lede">${esc(c.description)}</p>` : ""}
    </div>
    <div class="section-actions">
      <a class="text-link" href="/products/?collection=${esc(c.slug)}">More <span aria-hidden="true">→</span></a>
      ${etsyButton(c.etsySectionUrl, "View on Etsy", "text-link text-link-etsy")}
    </div>
  </div>
  ${grid(c.products.slice(0, per))}
</section>`
    )
    .join("\n");

  const empty = !products.length
    ? `<section class="home-section empty-state"><h2>New prints are on the way</h2><p>Our first designs are being prepared for this site.${SHOP_URL ? " In the meantime, you can browse the full collection on Etsy." : ""}</p>${etsyButton(SHOP_URL, "Visit our Etsy shop")}</section>`
    : "";

  const body = `<section class="hero${heroImg ? "" : " hero-text-only"}">
  <div class="hero-copy">
    <span class="eyebrow">${esc(settings.heroEyebrow || "Printable wall art")}</span>
    <h1>${esc(settings.heroTitle || SITE_NAME)}</h1>
    <p>${esc(settings.heroText || "")}</p>
    <div class="hero-actions">
      <a class="btn" href="/products/">Browse all products</a>
      ${etsyButton(SHOP_URL, "Visit our Etsy shop", "text-link")}
    </div>
  </div>
  ${
    heroImg
      ? `<a class="hero-image" href="/products/${esc(heroProduct.slug)}/">${imageTag(heroProduct, heroImg, { sizes: "(max-width: 860px) 100vw, 520px", loading: "eager", fetchpriority: "high" })}</a>`
      : ""
  }
</section>
<ol class="steps reveal" aria-label="How it works">
  <li><span class="step-n">1</span><h2>Buy on Etsy</h2><p>Instant digital download, no shipping and no waiting.</p></li>
  <li><span class="step-n">2</span><h2>Print your size</h2><p>High-resolution 300 DPI files in common frame ratios.</p></li>
  <li><span class="step-n">3</span><h2>Frame &amp; enjoy</h2><p>Print at home or at a local print shop, then frame it.</p></li>
</ol>
${empty}
${sections}
${
  products.length
    ? `<section class="home-section reveal" aria-labelledby="all-products">
  <div class="section-head">
    <div><span class="eyebrow">Everything</span><h2 id="all-products">All products</h2></div>
    <div class="section-actions"><a class="text-link" href="/products/">More <span aria-hidden="true">→</span></a>${etsyButton(SHOP_URL, "View on Etsy", "text-link text-link-etsy")}</div>
  </div>
  ${grid(products.slice(0, 8))}
</section>`
    : ""
}`;

  const org = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE + "/",
    logo: SITE + "/favicon.svg",
    ...(SHOP_URL ? { sameAs: [SHOP_URL, settings.social?.pinterest, settings.social?.instagram].filter(Boolean) } : {}),
  };
  const website = { "@context": "https://schema.org", "@type": "WebSite", name: SITE_NAME, url: SITE + "/" };
  return layout({
    title: "",
    description: settings.metaDescription,
    canonical: "/",
    body,
    pageClass: "page-home",
    ogImage: heroProduct && heroImg ? imgSrc(heroProduct, heroImg.file, 1600, "jpg") : "",
    jsonLd: [org, website],
  });
}

function uniqueValues(key) {
  const set = new Set();
  for (const p of products) for (const v of [].concat(p[key] || [])) if (v) set.add(v);
  return [...set].sort((a, b) => a.localeCompare(b));
}

function selectFilter(id, label, values) {
  if (values.length < 2) return "";
  return `<label class="filter-select"><span>${label}</span><select id="${id}" data-filter="${id.replace("filter-", "")}"><option value="">All</option>${values
    .map((v) => `<option value="${esc(v)}">${esc(v)}</option>`)
    .join("")}</select></label>`;
}

function productsPage() {
  const chips = activeCatalogs.length
    ? `<div class="chip-row" role="group" aria-label="Catalogues">
  <a class="chip" href="/products/" data-collection="" aria-current="true">All</a>
  ${activeCatalogs
    .map(
      (c) =>
        `<a class="chip" href="/products/?collection=${esc(c.slug)}" data-collection="${esc(c.slug)}" data-name="${esc(c.name)}" data-description="${esc(c.description || "")}" data-etsy="${esc(c.etsySectionUrl || "")}">${esc(c.name)}</a>`
    )
    .join("\n  ")}
</div>`
    : "";

  const filters = products.length
    ? `<div class="filter-bar">
  <label class="filter-search"><span class="sr-only">Search products</span><input type="search" id="product-search" placeholder="Search prints…" autocomplete="off"></label>
  ${selectFilter("filter-rooms", "Room", uniqueValues("rooms"))}
  ${selectFilter("filter-styles", "Style", uniqueValues("styles"))}
  ${selectFilter("filter-colors", "Colour", uniqueValues("colors"))}
  ${selectFilter("filter-orientation", "Orientation", uniqueValues("orientation"))}
</div>`
    : "";

  const body = `<div class="page-head products-head">
  <div>
    <span class="eyebrow" id="collection-eyebrow">All catalogues</span>
    <h1 class="page-title" id="collection-title">All products</h1>
    <p class="page-lede" id="collection-lede">Every printable in the Subtle Sway collection. Each one is an instant digital download, sold on Etsy.</p>
  </div>
  <div class="etsy-box">
    <p>Prices and checkout are on Etsy.</p>
    ${SHOP_URL ? `<a class="btn" id="collection-etsy" href="${esc(SHOP_URL)}" data-shop="${esc(SHOP_URL)}" target="_blank" rel="noopener"><span id="collection-etsy-label">Visit our Etsy shop</span> <span aria-hidden="true">↗</span></a>` : ""}
  </div>
</div>
${chips}
${filters}
${products.length ? `<section aria-label="Products">${grid(products, { eagerFirst: true })}</section><p class="no-results" id="no-results" hidden>No prints match these filters.</p>` : `<section class="empty-state"><h2>New prints are on the way</h2><p>Our first designs are being prepared for this site.</p>${etsyButton(SHOP_URL, "Visit our Etsy shop")}</section>`}`;

  return layout({
    title: "All products — printable wall art",
    description: "Browse every Subtle Sway printable: landscapes, botanical and floral prints, kitchen art and more. Instant digital downloads sold on Etsy.",
    canonical: "/products/",
    body,
    pageClass: "page-products",
  });
}

function attrRow(label, value) {
  const v = [].concat(value || []).filter(Boolean);
  if (!v.length) return "";
  return `<div><dt>${label}</dt><dd>${esc(v.join(", "))}</dd></div>`;
}

function productPage(p) {
  const desc = parseEtsyDescription(p.description);
// Some Etsy descriptions open straight with an emoji header ("🌿 BOTANICAL …").
// Then the first section is the introduction: show it next to the gallery.
if (!desc.intro.length && desc.sections.length) desc.intro = desc.sections.shift().blocks;
  const cats = (p.catalogs || []).map((s) => catalogBySlug[s]).filter(Boolean);
  const primary = cats[0];
  const metaDesc = p.metaDescription || summary(desc.intro[0]?.text || p.description || p.name);
  const items = p.media;

  const slides = items
    .map((m, i) => {
      if (m.type === "video") {
        return `<figure class="slide" data-index="${i}"${i ? " hidden" : ""}><video controls muted playsinline loop preload="none" poster="${mediaFile(p, `${m.file}-poster.jpg`)}" width="${m.width || 1080}" height="${m.height || 1080}" aria-label="${esc(m.alt || `${p.name} mockup video`)}"><source src="${mediaFile(p, `${m.file}.webm`)}" type="video/webm"><source src="${mediaFile(p, `${m.file}.mp4`)}" type="video/mp4"></video></figure>`;
      }
      return `<figure class="slide" data-index="${i}"${i ? " hidden" : ""}><button class="zoom" type="button" data-full="${imgSrc(p, m.file, 1600)}" aria-label="Enlarge image ${i + 1}">${imageTag(p, m, { sizes: "(max-width: 860px) 100vw, 600px", loading: i ? "lazy" : "eager", fetchpriority: i ? undefined : "high" })}</button></figure>`;
    })
    .join("\n");

  const thumbs =
    items.length > 1
      ? `<div class="thumbs" role="tablist" aria-label="Product images">${items
          .map((m, i) => {
            const poster = m.type === "video" ? `${mediaFile(p, `${m.file}-poster.jpg`)}` : imgSrc(p, m.file, 640);
            return `<button type="button" role="tab" class="thumb${m.type === "video" ? " is-video" : ""}" data-go="${i}" aria-selected="${i === 0}" aria-label="${m.type === "video" ? "Play video" : `Show image ${i + 1}`}"><img src="${poster}" alt="" width="120" height="120" loading="lazy" decoding="async"></button>`;
          })
          .join("")}</div>`
      : "";

  const sections = desc.sections
    .map((s, i) => {
      const inner = renderBlocks(s.blocks);
      if (i === 0) return `<section class="desc-section"><h2><span aria-hidden="true">${esc(s.icon)}</span> ${esc(s.title)}</h2>${inner}</section>`;
      return `<details class="desc-acc"><summary><span aria-hidden="true">${esc(s.icon)}</span> ${esc(s.title)}</summary><div class="acc-body">${inner}</div></details>`;
    })
    .join("\n");

  const related = products
    .filter((o) => o.slug !== p.slug && (o.catalogs || []).some((c) => (p.catalogs || []).includes(c)))
    .slice(0, 4);
  const more = related.length < 4 ? products.filter((o) => o.slug !== p.slug && !related.includes(o)).slice(0, 4 - related.length) : [];

  const body = `<nav class="breadcrumb" aria-label="Breadcrumb"><ol>
  <li><a href="/">Home</a></li>
  <li><a href="/products/">Products</a></li>
  ${primary ? `<li><a href="/products/?collection=${esc(primary.slug)}">${esc(primary.name)}</a></li>` : ""}
  <li aria-current="page">${esc(p.name)}</li>
</ol></nav>
<article class="product">
  <div class="gallery" data-gallery>
    <div class="stage">
      ${slides}
      ${items.length > 1 ? `<button class="nav-btn prev" type="button" data-step="-1" aria-label="Previous image">‹</button><button class="nav-btn next" type="button" data-step="1" aria-label="Next image">›</button>` : ""}
    </div>
    ${thumbs}
  </div>
  <div class="product-info">
    ${primary ? `<a class="eyebrow" href="/products/?collection=${esc(primary.slug)}">${esc(primary.name)}</a>` : ""}
    <h1>${esc(p.name)}</h1>
    ${p.etsyTitle ? `<p class="product-sub">${esc(p.etsyTitle)}</p>` : ""}
    <div class="buy">
      ${etsyButton(p.etsyUrl, "View price &amp; buy on Etsy", "btn btn-buy")}
      <p class="buy-note">Instant digital download. No physical item is shipped.</p>
    </div>
    <dl class="attrs">
      ${attrRow("Format", "Digital download · 300 DPI JPG")}
      ${attrRow("Orientation", p.orientation)}
      ${attrRow("Rooms", p.rooms)}
      ${attrRow("Style", p.styles)}
      ${attrRow("Colours", p.colors)}
    </dl>
    <div class="desc-intro">${renderBlocks(desc.intro)}</div>
  </div>
</article>
<div class="product-desc">
  ${sections}
  <div class="desc-cta">${etsyButton(p.etsyUrl, "View price &amp; buy on Etsy", "btn btn-buy")}</div>
</div>
${
  related.length + more.length
    ? `<section class="home-section" aria-labelledby="related"><div class="section-head"><div><span class="eyebrow">${primary ? esc(primary.name) : "More prints"}</span><h2 id="related">You may also like</h2></div>${primary ? `<div class="section-actions"><a class="text-link" href="/products/?collection=${esc(primary.slug)}">More <span aria-hidden="true">→</span></a></div>` : ""}</div>${grid([...related, ...more])}</section>`
    : ""
}`;

  const imgs = images(p);
  const c = cover(p);
  const productLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    description: metaDesc,
    image: imgs.slice(0, 5).map((m) => SITE + imgSrc(p, m.file, 1600, "jpg")),
    url: `${SITE}/products/${p.slug}/`,
    brand: { "@type": "Brand", name: SITE_NAME },
    category: "Digital Prints",
    ...(p.tags?.length ? { keywords: p.tags.join(", ") } : {}),
  };
  const crumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE + "/" },
      { "@type": "ListItem", position: 2, name: "Products", item: SITE + "/products/" },
      { "@type": "ListItem", position: 3, name: p.name, item: `${SITE}/products/${p.slug}/` },
    ],
  };

  return layout({
    title: p.seoTitle || `${p.name} — Printable Wall Art`,
    description: metaDesc,
    canonical: `/products/${p.slug}/`,
    body,
    pageClass: "page-product",
    ogType: "product",
    ogImage: c ? imgSrc(p, c.file, 1600, "jpg") : "",
    jsonLd: [productLd, crumbs],
    head: c ? `<link rel="preload" as="image" href="${imgSrc(p, c.file, 1080)}" imagesrcset="${WIDTHS.map((w) => `${imgSrc(p, c.file, w)} ${w}w`).join(", ")}" imagesizes="(max-width: 860px) 100vw, 600px">\n` : "",
  });
}

function textPage(pg) {
  const body = `<article class="text-page">
  <span class="eyebrow">${esc(pg.navLabel || "")}</span>
  <h1 class="page-title">${esc(pg.title)}</h1>
  ${pg.updated ? `<p class="updated">Last updated: ${esc(pg.updated)}</p>` : ""}
  <div class="prose">${markdown(fill(pg.body, vars))}</div>
</article>`;
  return layout({
    title: pg.title,
    description: pg.metaDescription || summary(pg.body),
    canonical: `/${pg.slug}/`,
    body,
    pageClass: `page-${pg.slug}`,
  });
}

function notFoundPage() {
  const body = `<section class="empty-state not-found"><span class="eyebrow">404</span><h1 class="page-title">This page has moved or no longer exists.</h1><p>The print you are looking for may have a new home.</p><div class="hero-actions"><a class="btn" href="/products/">Browse all products</a><a class="text-link" href="/">Go to the home page</a></div></section>`;
  return layout({ title: "Page not found", description: "", body, pageClass: "page-404", noindex: true });
}

// Old affiliate-era addresses keep working for anyone who saved or pinned them.
const LEGACY = {
  "shop.html": "/products/",
  "product.html": "/products/",
  "blog.html": "/",
  "post.html": "/",
  "go.html": "/",
  "about.html": "/about/",
  "contact.html": "/contact/",
  "privacy.html": "/privacy/",
  "disclosure.html": "/disclaimer/",
  "admin.html": "/admin/",
};

function redirectPage(to) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Moved</title><meta name="robots" content="noindex"><link rel="canonical" href="${esc(SITE + to)}"><meta http-equiv="refresh" content="0; url=${esc(to)}"><script>location.replace(${JSON.stringify(to)});</script></head>
<body><p>This page has moved to <a href="${esc(to)}">${esc(SITE + to)}</a>.</p></body></html>
`;
}

const today = new Date().toISOString().slice(0, 10);
const urls = [
  { loc: "/", lastmod: products[0]?.updatedAt || today },
  { loc: "/products/", lastmod: products[0]?.updatedAt || today },
  ...products.map((p) => ({ loc: `/products/${p.slug}/`, lastmod: p.updatedAt || p.publishedAt || today, images: images(p).map((m) => imgSrc(p, m.file, 1600, "jpg")) })),
  ...pages.map((pg) => ({ loc: `/${pg.slug}/`, lastmod: pg.updated || undefined })),
];
const sitemapXml = (
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls
  .map(
    (u) =>
      `  <url><loc>${esc(SITE + u.loc)}</loc>${u.lastmod ? `<lastmod>${esc(String(u.lastmod).slice(0, 10))}</lastmod>` : ""}${(u.images || [])
        .map((i) => `<image:image><image:loc>${esc(SITE + i)}</image:loc></image:image>`)
        .join("")}</url>`
  )
  .join("\n")}
</urlset>
`
);
const robotsTxt = `User-agent: *\nDisallow: /admin/\n\nSitemap: ${SITE}/sitemap.xml\n`;

// Product pages that were once public keep their address forever: if a product is
// unpublished, its old URL redirects to the catalogue instead of returning 404.
const retiredSlugs = [...new Set(retired)].filter((s) => /^[a-z0-9-]+$/.test(s) && !products.some((p) => p.slug === s));

return {
  products,
  retiredSlugs,
  activeCatalogs,
  warnings,
  home: homePage,
  productsPage,
  product: productPage,
  textPage,
  notFound: notFoundPage,
  redirect: redirectPage,
  legacy: LEGACY,
  sitemap: sitemapXml,
  robots: robotsTxt,
};
}
