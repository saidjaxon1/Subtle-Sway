import { test } from "node:test";
import assert from "node:assert/strict";
import { esc, markdown, parseEtsyDescription, slugify, summary } from "../assets/js/lib/text.js";

test("esc escapes HTML", () => {
  assert.equal(esc(`<a href="x">'&`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;");
});

test("slugify", () => {
  assert.equal(slugify("Landscapes & Seascapes"), "landscapes-and-seascapes");
  assert.equal(slugify("  Moody Floral Still Life! "), "moody-floral-still-life");
});

test("markdown: headings, lists, bold, safe links only", () => {
  const html = markdown("## Title\n\nHello **world** [a](/x) [b](https://e.com) [c](javascript:alert(1))\n\n- one\n- two");
  assert.match(html, /<h2>Title<\/h2>/);
  assert.match(html, /<strong>world<\/strong>/);
  assert.match(html, /<a href="\/x">a<\/a>/);
  assert.match(html, /<a href="https:\/\/e.com" rel="noopener" target="_blank">b<\/a>/);
  assert.doesNotMatch(html, /javascript/);
  assert.match(html, /<ul><li>one<\/li><li>two<\/li><\/ul>/);
});

test("markdown escapes raw HTML", () => {
  assert.doesNotMatch(markdown("<script>alert(1)</script>"), /<script>/);
});

test("Etsy description splits into intro and emoji sections", () => {
  const d = parseEtsyDescription(
    "Intro line.\n\nSecond para.\n\n✨ WHY YOU'LL LOVE IT\n\n- a\n- b\n\n📥 WHAT YOU GET\n\nText\n- x\n\n❤️ Thank you for visiting."
  );
  assert.equal(d.intro.length, 2);
  assert.equal(d.sections.length, 2);
  assert.equal(d.sections[0].title, "Why you'll love it");
  assert.deepEqual(d.sections[0].blocks[0], { type: "ul", items: ["a", "b"] });
  assert.equal(d.sections[1].title, "What you get");
  // the closing "❤️ Thank you…" line is a normal paragraph, not a header
  assert.equal(d.sections[1].blocks.at(-1).text, "❤️ Thank you for visiting.");
});

test("summary trims to a sentence", () => {
  const s = summary("A ".repeat(100) + "end.", 158);
  assert.ok(s.length <= 159);
});
