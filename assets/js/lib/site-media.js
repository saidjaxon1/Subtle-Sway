// What the public site shows of a product's media.
// Decision (Said, 2026-11-12): no videos on the site (they stay in the private
// drafts only), and at most 3 images per product — the first 3 visible images
// in the order set in admin. The importer puts the listing's chosen main
// mockups first, and the admin can reorder them.

export const SITE_MAX_IMAGES = 3;

/** The media entries that go on the public site, in order. */
export function siteMedia(media) {
  return (media || []).filter((m) => m.type === "image" && !m.hidden).slice(0, SITE_MAX_IMAGES);
}

/** Same draft, with media reduced to what the site shows (used before publishing). */
export function forSite(draft) {
  const keep = siteMedia(draft.media);
  const cover = keep.some((m) => m.file === draft.cover) ? draft.cover : keep[0]?.file || "";
  return { ...draft, media: keep, cover };
}
