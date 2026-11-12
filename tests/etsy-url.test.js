import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeListingUrl, normalizeSectionUrl, normalizeShopUrl } from "../assets/js/lib/etsy-url.js";

const SHOP = "subtleswaystore";

test("accepts the Share & Save listing link as is", () => {
  const r = normalizeListingUrl("https://subtleswaystore.etsy.com/listing/4584329707/fern-wall-art-printable-botanical", SHOP);
  assert.equal(r.ok, true);
  assert.equal(r.url, "https://subtleswaystore.etsy.com/listing/4584329707/fern-wall-art-printable-botanical");
});

test("converts a www listing link to the shop subdomain and strips tracking", () => {
  const r = normalizeListingUrl("https://www.etsy.com/listing/4584329707/fern-wall-art?ref=shop_home&utm_source=x&click_key=abc", SHOP);
  assert.equal(r.ok, true);
  assert.equal(r.url, "https://subtleswaystore.etsy.com/listing/4584329707/fern-wall-art");
  assert.equal(r.id, "4584329707");
});

test("rejects http, other hosts, look-alike hosts and non-listing paths", () => {
  for (const bad of [
    "http://www.etsy.com/listing/4584329707/x",
    "https://etsy.com.evil.example/listing/4584329707/x",
    "https://evil-etsy.com/listing/4584329707/x",
    "https://www.etsy.com/shop/subtleswaystore",
    "https://www.etsy.com/listing/abc/x",
    "javascript:alert(1)",
    "",
    "not a url",
  ]) {
    assert.equal(normalizeListingUrl(bad, SHOP).ok, false, bad);
  }
});

test("rejects a listing on another shop's subdomain", () => {
  assert.equal(normalizeListingUrl("https://othershop.etsy.com/listing/4584329707/x", SHOP).ok, false);
});

test("shop link normalises to the subdomain", () => {
  assert.equal(normalizeShopUrl("https://www.etsy.com/shop/SubtleSwayStore?ref=x").url, "https://subtleswaystore.etsy.com");
  assert.equal(normalizeShopUrl("https://subtleswaystore.etsy.com").url, "https://subtleswaystore.etsy.com");
  assert.equal(normalizeShopUrl("https://www.etsy.com/listing/1234567/x").ok, false);
});

test("section link needs a numeric section_id and the own shop", () => {
  assert.equal(
    normalizeSectionUrl("https://www.etsy.com/shop/SubtleSwayStore?ref=seller-platform-mcnav&section_id=51234567", SHOP).url,
    "https://www.etsy.com/shop/subtleswaystore?section_id=51234567"
  );
  assert.equal(normalizeSectionUrl("https://www.etsy.com/shop/SubtleSwayStore", SHOP).ok, false);
  assert.equal(normalizeSectionUrl("https://www.etsy.com/shop/Other?section_id=51234567", SHOP).ok, false);
});
