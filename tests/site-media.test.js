// Site rule: no videos, at most 3 images (first 3 visible, in admin order).
import { test } from "node:test";
import assert from "node:assert/strict";
import { siteMedia, forSite } from "../assets/js/lib/site-media.js";
import { planPublish } from "../assets/js/lib/publish.js";
import { createRenderer } from "../assets/js/lib/render.js";

const media = [
  { type: "image", file: "11" },
  { type: "video", file: "2" },
  { type: "image", file: "1" },
  { type: "image", file: "5", hidden: true },
  { type: "image", file: "3" },
  { type: "image", file: "4" },
];

test("site shows the first 3 visible images and never a video", () => {
  assert.deepEqual(siteMedia(media).map((m) => m.file), ["11", "1", "3"]);
});

test("publishing copies only those 3 images", () => {
  const d = forSite({ slug: "f", name: "F", description: "x", catalogs: ["c"], cover: "4", media });
  assert.equal(d.cover, "11", "cover falls back to a shown image");
  const plan = planPublish(d, "https://subtleswaystore.etsy.com/listing/4584329707/f", [], [], "2026-11-12");
  const files = plan.copy.map((c) => c.to.split("/").pop());
  assert.ok(files.every((f) => /^(11|1|3)-/.test(f)), files.join());
  assert.ok(!files.some((f) => /mp4|webm|poster/.test(f)));
  assert.equal(plan.product.media.length, 3);
});

test("the page never renders a video, even from older data", () => {
  const r = createRenderer({
    settings: { siteUrl: "https://x.test", etsyShopUrl: "https://subtleswaystore.etsy.com" },
    products: [{ slug: "f", name: "F", status: "published", etsyUrl: "https://subtleswaystore.etsy.com/listing/4584329707/f", description: "x", media }],
  });
  const html = r.product(r.products[0]);
  assert.doesNotMatch(html, /<video|\.mp4|\.webm/);
  assert.equal((html.match(/class="slide"/g) || []).length, 3);
});
