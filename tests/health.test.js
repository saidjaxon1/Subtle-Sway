import { test } from "node:test";
import assert from "node:assert/strict";
import { draftHealth } from "../assets/js/lib/publish.js";

const img = { type: "image", file: "1", alt: "x" };

test("a draft without a description is incomplete; adding one makes it a normal draft", () => {
  const d = { hasListing: false, description: "", media: [img], catalogs: ["botanical-floral"] };
  assert.equal(draftHealth(d).incomplete, true);
  assert.match(draftHealth(d).warnings.join(), /ETSY_LISTING\.md topilmadi/);
  d.description = "A fern print.";
  const h = draftHealth(d);
  assert.equal(h.incomplete, false);
  assert.ok(!h.warnings.some((w) => /tavsif/i.test(w)));
});

test("hidden images do not count", () => {
  assert.equal(draftHealth({ description: "x", media: [{ ...img, hidden: true }] }).incomplete, true);
});
