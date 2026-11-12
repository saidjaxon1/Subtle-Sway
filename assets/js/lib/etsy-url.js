// Etsy link validation and normalisation.
// Shared by the build script (Node) and the admin panel (browser), so it must
// stay dependency-free. Error messages are in Uzbek because only the admin
// panel shows them.

const LISTING_PATH = /^\/listing\/(\d{6,15})(?:\/([a-z0-9-]{1,200}))?\/?$/i;
const SHOP_PATH = /^\/shop\/([A-Za-z0-9]{4,40})\/?$/;
const SUBDOMAIN = /^([a-z0-9]{4,40})\.etsy\.com$/i;

function parse(input) {
  if (typeof input !== "string" || !input.trim()) {
    return { error: "Havola bo'sh." };
  }
  let url;
  try {
    url = new URL(input.trim());
  } catch {
    return { error: "Bu to'g'ri havola emas." };
  }
  if (url.protocol !== "https:") {
    return { error: "Havola https:// bilan boshlanishi kerak." };
  }
  if (url.username || url.password || url.port) {
    return { error: "Havolada ortiqcha qismlar bor." };
  }
  const host = url.hostname.toLowerCase();
  const sub = host.match(SUBDOMAIN);
  if (host !== "etsy.com" && host !== "www.etsy.com" && !(sub && sub[1] !== "www")) {
    return { error: "Havola etsy.com saytiga tegishli emas." };
  }
  return { url, host, shopFromHost: sub && sub[1] !== "www" ? sub[1].toLowerCase() : "" };
}

/** Shop name as used in the Share & Save subdomain: lowercase letters and digits. */
export function cleanShopName(name) {
  return String(name || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Validate a listing link and return the Share & Save form:
 * https://<shop>.etsy.com/listing/<id>/<slug>, with every query parameter removed.
 */
export function normalizeListingUrl(input, shopName) {
  const p = parse(input);
  if (p.error) return { ok: false, error: p.error };
  const m = p.url.pathname.match(LISTING_PATH);
  if (!m) {
    return { ok: false, error: "Bu Etsy listing havolasi emas (/listing/<raqam>/... bo'lishi kerak)." };
  }
  const shop = cleanShopName(shopName);
  if (p.shopFromHost && shop && p.shopFromHost !== shop) {
    return { ok: false, error: `Bu havola boshqa do'konga tegishli (${p.shopFromHost}).` };
  }
  const id = m[1];
  const slug = m[2] ? m[2].toLowerCase() : "";
  const base = shop ? `https://${shop}.etsy.com` : p.shopFromHost ? `https://${p.shopFromHost}.etsy.com` : "https://www.etsy.com";
  return { ok: true, id, url: `${base}/listing/${id}${slug ? "/" + slug : ""}` };
}

/** Validate a shop link (www.etsy.com/shop/Name or name.etsy.com) and return https://<shop>.etsy.com */
export function normalizeShopUrl(input) {
  const p = parse(input);
  if (p.error) return { ok: false, error: p.error };
  let shop = p.shopFromHost;
  if (!shop) {
    const m = p.url.pathname.match(SHOP_PATH);
    if (!m) return { ok: false, error: "Bu Etsy do'kon havolasi emas (etsy.com/shop/<nom>)." };
    shop = m[1].toLowerCase();
  } else if (p.url.pathname !== "/" && p.url.pathname !== "") {
    return { ok: false, error: "Do'kon havolasida ortiqcha yo'l bor." };
  }
  return { ok: true, shop, url: `https://${shop}.etsy.com` };
}

/**
 * Validate a shop section link: https://www.etsy.com/shop/<Name>?section_id=<digits>
 * (or the same on the shop subdomain). Returns the www form, which Etsy
 * always resolves, with every other query parameter removed.
 */
export function normalizeSectionUrl(input, shopName) {
  const p = parse(input);
  if (p.error) return { ok: false, error: p.error };
  let shop = p.shopFromHost;
  if (!shop) {
    const m = p.url.pathname.match(SHOP_PATH);
    if (!m) return { ok: false, error: "Bu Etsy bo'lim havolasi emas (etsy.com/shop/<nom>?section_id=...)." };
    shop = m[1].toLowerCase();
  }
  const own = cleanShopName(shopName);
  if (own && shop !== own) {
    return { ok: false, error: `Bu havola boshqa do'konga tegishli (${shop}).` };
  }
  const section = p.url.searchParams.get("section_id") || "";
  if (!/^\d{3,15}$/.test(section)) {
    return { ok: false, error: "Havolada section_id raqami yo'q. Etsy'da bo'limni ochib, havolani o'shandan nusxalang." };
  }
  return { ok: true, url: `https://www.etsy.com/shop/${shop}?section_id=${section}` };
}
