// Publish rules, shared by the admin panel and the tests. Pure functions.
//
// A draft can become public only when:
//   • it has a valid Etsy listing link on our own shop,
//   • it has at least one mockup image and a description,
//   • it has at least one catalogue,
//   • its source folder still exists.
// Only whitelisted fields are copied to the public repository: internal folder
// paths, prices, Pinterest copy, hashes and edit flags never leave the drafts repo.

import { normalizeListingUrl } from "./etsy-url.js";

export const PUBLIC_FIELDS = [
  "slug",
  "name",
  "etsyTitle",
  "seoTitle",
  "metaDescription",
  "description",
  "tags",
  "catalogs",
  "rooms",
  "styles",
  "subjects",
  "colors",
  "orientation",
  "cover",
  "featured",
  "etsyUrl",
  "publishedAt",
  "updatedAt",
];

const MEDIA_FIELDS = ["type", "file", "alt", "width", "height", "hidden"];

/** Files that belong to one media entry. */
export function mediaFileNames(m) {
  if (m.type === "video") return [`${m.file}.mp4`, `${m.file}.webm`, `${m.file}-poster.jpg`];
  return [`${m.file}-640.webp`, `${m.file}-1080.webp`, `${m.file}-1600.webp`, `${m.file}-1600.jpg`];
}

/** Returns { ok, url, errors: [uzbek messages] } */
export function checkPublish(draft, etsyInput, shopName) {
  const errors = [];
  const link = normalizeListingUrl(etsyInput, shopName);
  if (!link.ok) errors.push(link.error);
  if (!draft) errors.push("Draft topilmadi.");
  else {
    if (!(draft.media || []).some((m) => m.type === "image" && !m.hidden)) errors.push("Kamida bitta ko'rinadigan mockup rasmi kerak.");
    if (!String(draft.description || "").trim()) errors.push("Tavsif bo'sh.");
    if (!String(draft.name || "").trim()) errors.push("Nomi bo'sh.");
    if (!(draft.catalogs || []).length) errors.push("Kamida bitta katalog tanlang.");
    if (draft.sourceMissing) errors.push("Manba papka topilmadi — avval papkani tekshiring.");
  }
  return { ok: errors.length === 0, url: link.ok ? link.url : "", errors };
}

/** The public product object, built from a draft through the whitelist. */
export function toPublicProduct(draft, etsyUrl, today) {
  const out = { status: "published" };
  for (const f of PUBLIC_FIELDS) if (draft[f] !== undefined) out[f] = draft[f];
  out.etsyUrl = etsyUrl;
  out.publishedAt = draft.publishedAt || today;
  out.updatedAt = today;
  out.media = (draft.media || []).map((m) => {
    const o = {};
    for (const f of MEDIA_FIELDS) if (m[f] !== undefined) o[f] = m[f];
    return o;
  });
  return out;
}

/**
 * Plan the public-repo commit for publishing (or re-publishing) a draft.
 * products: current data/products.json array. publicMediaPaths: paths already in media/products/<slug>/.
 * Returns { products, copy: [{ from, to }], remove: [paths] }.
 */
export function planPublish(draft, etsyUrl, products, publicMediaPaths, today) {
  const product = toPublicProduct(draft, etsyUrl, today);
  const list = products.filter((p) => p.slug !== draft.slug);
  list.push(product);
  const wanted = new Set();
  const copy = [];
  for (const m of product.media) {
    if (m.hidden) continue;
    for (const name of mediaFileNames(m)) {
      const to = `media/products/${draft.slug}/${name}`;
      wanted.add(to);
      copy.push({ from: `drafts/${draft.slug}/media/${name}`, to });
    }
  }
  const remove = publicMediaPaths.filter((p) => p.startsWith(`media/products/${draft.slug}/`) && !wanted.has(p));
  return { products: list, product, copy, remove };
}

/** Plan the public-repo commit for unpublishing. */
export function planUnpublish(slug, products, publicMediaPaths) {
  return {
    products: products.filter((p) => p.slug !== slug),
    remove: publicMediaPaths.filter((p) => p.startsWith(`media/products/${slug}/`)),
  };
}
