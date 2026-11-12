// Publish rules: no valid Etsy link → no publish; private fields never go public.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkPublish, planPublish, planUnpublish, toPublicProduct } from "../assets/js/lib/publish.js";
import { GitHubTarget } from "../scripts/importer/targets.mjs";

const SHOP = "subtleswaystore";
const draft = () => ({
  id: "part 5/03_Moody_Floral_Still_Life",
  slug: "moody-floral-still-life-printable",
  status: "draft",
  name: "Moody Floral Still Life",
  description: "Dark floral printable wall art.",
  catalogs: ["botanical-floral"],
  price: "7.49",
  pins: [{ title: "pin", description: "pin" }],
  source: { id: "part 5/03_Moody_Floral_Still_Life", folder: "03_Moody_Floral_Still_Life", part: 5 },
  sourceHashes: { "1.jpg": "abc" },
  imported: { name: "x" },
  edited: { name: true },
  warnings: ["x"],
  media: [
    { type: "image", file: "1", alt: "a", width: 2000, height: 2000, hidden: false },
    { type: "video", file: "2", width: 1080, height: 1080, hidden: false },
    { type: "image", file: "3", alt: "b", width: 2000, height: 2000, hidden: true },
  ],
});
const LINK = "https://subtleswaystore.etsy.com/listing/4584329707/moody-floral";

test("no Etsy link → cannot publish", () => {
  for (const bad of ["", "https://www.etsy.com/shop/subtleswaystore", "http://www.etsy.com/listing/4584329707/x", "https://othershop.etsy.com/listing/4584329707/x", "https://example.com/listing/4584329707"]) {
    assert.equal(checkPublish(draft(), bad, SHOP).ok, false, bad);
  }
});

test("valid link + complete draft → can publish", () => {
  const r = checkPublish(draft(), LINK, SHOP);
  assert.equal(r.ok, true, r.errors.join("; "));
  assert.equal(r.url, LINK);
});

test("incomplete drafts cannot be published even with a link", () => {
  const noImg = draft();
  noImg.media = noImg.media.map((m) => ({ ...m, hidden: true }));
  assert.equal(checkPublish(noImg, LINK, SHOP).ok, false);
  assert.equal(checkPublish({ ...draft(), description: " " }, LINK, SHOP).ok, false);
  assert.equal(checkPublish({ ...draft(), catalogs: [] }, LINK, SHOP).ok, false);
  assert.equal(checkPublish({ ...draft(), sourceMissing: true }, LINK, SHOP).ok, false);
});

test("public product never carries folder paths, price, pins, hashes or edit flags", () => {
  const p = toPublicProduct(draft(), LINK, "2026-11-12");
  const text = JSON.stringify(p);
  for (const secret of ["part 5", "03_Moody", "7.49", "sourceHashes", "imported", "edited", "warnings", "pins", "price"]) {
    assert.ok(!text.includes(secret), `leaked ${secret}`);
  }
  assert.equal(p.status, "published");
  assert.equal(p.etsyUrl, LINK);
});

test("publish plan copies only visible media and replaces the old entry", () => {
  const old = [{ slug: "moody-floral-still-life-printable", name: "old" }, { slug: "other" }];
  const existing = ["media/products/moody-floral-still-life-printable/3-640.webp", "media/products/other/1-640.webp"];
  const plan = planPublish(draft(), LINK, old, existing, "2026-11-12");
  assert.equal(plan.products.length, 2);
  assert.equal(plan.products.find((p) => p.slug === "moody-floral-still-life-printable").name, "Moody Floral Still Life");
  const targets = plan.copy.map((c) => c.to);
  assert.ok(targets.includes("media/products/moody-floral-still-life-printable/1-1600.jpg"));
  assert.ok(targets.includes("media/products/moody-floral-still-life-printable/2.webm"));
  assert.ok(!targets.some((t) => t.includes("/3-")), "hidden image not copied");
  assert.deepEqual(plan.remove, ["media/products/moody-floral-still-life-printable/3-640.webp"]);
});

test("unpublish removes the product and only its media", () => {
  const plan = planUnpublish("a", [{ slug: "a" }, { slug: "b" }], ["media/products/a/1-640.webp", "media/products/b/1-640.webp", "media/products/ab/1.webp"]);
  assert.deepEqual(plan.products, [{ slug: "b" }]);
  assert.deepEqual(plan.remove, ["media/products/a/1-640.webp"]);
});

test("import token cannot publish: the importer refuses a public repository", async () => {
  const t = new GitHubTarget("saidjaxon1/Subtle-Sway", "dummy");
  t.api = async (method, url) => {
    if (method === "GET" && url === "") return { private: false, default_branch: "main" };
    throw new Error("no other call expected");
  };
  await assert.rejects(() => t.commit([{ path: "data/products.json", content: "[]" }], "x"), /PUBLIC/);
});
