// Parser tests. Uses Said's real ETSY_LISTING.md files READ-ONLY when they
// exist on this machine (they are never copied into the repo); skipped in CI.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parseListing, guessCatalogs } from "../scripts/importer/listing.mjs";

const SAMPLE = `# Test — Etsy listing

## Title

\`\`\`text
Fern Wall Art Printable, Botanical Print, Digital Download
\`\`\`

## Tags — copy-paste line

\`\`\`text
fern print, botanical art, digital download
\`\`\`

## Description — copy-paste

\`\`\`text
Intro.

✨ WHY YOU'LL LOVE IT

- one
\`\`\`

## Category, attributes and listing settings

| Field | Value |
|---|---|
| Orientation | Vertical / portrait |
| Room(s) | Kitchen; Living room |
| Subject(s) | Botanical; Ferns |
| Style(s) | Vintage inspired |
| Primary colour | Green |
| Secondary colour | Beige |

## Recommended price and sale

- Recommended regular price: $6.99.

## Main mockup alt text

| Image | Alt text — one sentence |
|---|---|
| Mock ups/1.jpg | A fern print. |
| Mock ups/3.jpg | Another fern print. |

## Pinterest copy

### Pin 1

**Title:** Fern idea

**Description:** A pin.

## Seller notes — do not paste into the description

- SECRET-SELLER-NOTE keyword focus
`;

test("parses every section and never includes seller notes", () => {
  const r = parseListing(SAMPLE);
  assert.equal(r.title, "Fern Wall Art Printable, Botanical Print, Digital Download");
  assert.deepEqual(r.tags, ["fern print", "botanical art", "digital download"]);
  assert.match(r.description, /^Intro\./);
  assert.deepEqual(r.rooms, ["Kitchen", "Living room"]);
  assert.equal(r.orientation, "Portrait");
  assert.deepEqual(r.colors, ["Green", "Beige"]);
  assert.equal(r.price, "6.99");
  assert.deepEqual(r.alts, { 1: "A fern print.", 3: "Another fern print." });
  assert.deepEqual(r.pins, [{ title: "Fern idea", description: "A pin." }]);
  assert.doesNotMatch(JSON.stringify(r), /SECRET-SELLER-NOTE/);
});

test("catalogue guesses", () => {
  assert.deepEqual(guessCatalogs(["Still life", "Food & drink", "Fruit", "Lemons"]), ["kitchen-food"]);
  assert.deepEqual(guessCatalogs(["Flowers", "Tulips", "Typography", "Botanical bouquet"]), ["botanical-floral"]);
  assert.deepEqual(guessCatalogs(["Typography", "Household objects", "Laundry"]), ["signs-typography"]);
  assert.deepEqual(guessCatalogs(["Landscape", "Mountains", "Sun", "Abstract nature"]), ["landscapes-seascapes"]);
  assert.deepEqual(guessCatalogs(["Abstract", "Geometric shapes", "Arches"]), ["abstract-modern"]);
});

const REAL = "/mnt/F2540508856C9A8C/SAIDJAXON/Etsy/Wall Art/part 5";
const real = fs.existsSync(REAL)
  ? fs
      .readdirSync(REAL)
      .filter((d) => !d.startsWith("_") && fs.existsSync(path.join(REAL, d, "ETSY_LISTING.md")))
  : [];

test("real listings parse completely (read-only)", { skip: real.length ? false : "real Wall Art folder not on this machine" }, () => {
  for (const d of real) {
    const md = fs.readFileSync(path.join(REAL, d, "ETSY_LISTING.md"), "utf8");
    const r = parseListing(md);
    assert.ok(r.title.length > 20 && r.title.length <= 140, `${d} title`);
    assert.ok(r.tags.length >= 10 && r.tags.length <= 13, `${d} tags`);
    assert.ok(r.description.length > 300, `${d} description`);
    assert.ok(r.rooms.length && r.styles.length && r.subjects.length, `${d} attributes`);
    assert.ok(r.orientation, `${d} orientation`);
    assert.match(r.price, /^\d+\.\d{2}$/, `${d} price`);
    assert.ok(Object.keys(r.alts).length >= 1, `${d} alts`);
    assert.ok(r.pins.length >= 1, `${d} pins`);
    assert.ok(guessCatalogs(r.subjects).length === 1, `${d} catalogue`);
    const notes = md.slice(md.search(/^##\s+Seller notes/m));
    const firstNote = notes.split("\n").find((l) => l.startsWith("- "));
    if (firstNote) assert.ok(!JSON.stringify(r).includes(firstNote.slice(2, 60)), `${d} leaked seller notes`);
  }
});
