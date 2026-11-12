// Proves the importer refuses every path outside "Mock ups/" and ETSY_LISTING.md,
// above all the paid print-file folders.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkSource, readAllowed, hashAllowed, listDir, ForbiddenPathError } from "../scripts/importer/allow-list.mjs";
import { discover } from "../scripts/importer/discover.mjs";

const ROOT = "/x/Wall Art";
const p = (rel) => path.join(ROOT, rel);

test("allowed: numbered mockups and the listing file", () => {
  for (const rel of [
    "part 5/03_Moody_Floral_Still_Life/Mock ups/1.jpg",
    "part 5/03_Moody_Floral_Still_Life/Mock ups/2.mp4",
    "part 5/03_Moody_Floral_Still_Life/Mock ups/11.jpg",
    "part 5/03_Moody_Floral_Still_Life/ETSY_LISTING.md",
    "part 2/Mock ups/3.jpg",
    "part 1/Mock Ups/Mock ups/4.jpg",
  ]) {
    assert.equal(checkSource(ROOT, p(rel)).ok, true, rel);
  }
});

test("REFUSED: every paid print-file folder", () => {
  for (const folder of ["A1, A2, A3, A4, A5", "Aspect Ratio 2x3", "Aspect Ratio 3x4", "Aspect Ratio 4x5", "Aspect Ratio 11x14", "JPG", "PNG"]) {
    for (const file of ["1.jpg", "A4.jpg", "Moody_Floral_2x3_24x36.jpg", "ETSY_LISTING.md"]) {
      const rel = `part 5/03_Moody_Floral_Still_Life/${folder}/${file}`;
      assert.equal(checkSource(ROOT, p(rel)).ok, false, rel);
    }
  }
  // even if someone puts a "Mock ups" folder inside a print folder
  assert.equal(checkSource(ROOT, p("part 5/03_X/Aspect Ratio 2x3/Mock ups/1.jpg")).ok, false);
});

test("REFUSED: work folders starting with _ and other files", () => {
  for (const rel of [
    "part 5/03_X/_old_mockups/1.jpg",
    "part 5/03_X/_v2_mockups/Mock ups/1.jpg",
    "part 5/_removed/Mock ups/1.jpg",
    "part 6/_gen/1.jpg",
    "part 5/_mockup_work/1.jpg",
    "part 5/_seo_work/ETSY_LISTING.md",
    "part 5/03_X/Mock ups/mockup_provenance.json",
    "part 5/03_X/Mock ups/cover.jpg",
    "part 5/03_X/Mock ups/1.psd",
    "part 5/03_X/README.md",
    "part 5/03_X/1.jpg",
    "part 1/Fern_Wall_Art_Download_Guide.pdf",
    "part 5/03_X/Mock ups/extra/1.jpg",
    "notes/Mock ups/1.jpg",
    "../outside/Mock ups/1.jpg",
  ]) {
    assert.equal(checkSource(ROOT, p(rel)).ok, false, rel);
  }
  assert.equal(checkSource(ROOT, "/etc/passwd").ok, false);
});

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ss-allow-"));
  const prod = path.join(root, "part 5", "01_Test_Print");
  fs.mkdirSync(path.join(prod, "Mock ups"), { recursive: true });
  fs.mkdirSync(path.join(prod, "Aspect Ratio 2x3"), { recursive: true });
  fs.mkdirSync(path.join(prod, "_old_mockups"), { recursive: true });
  fs.writeFileSync(path.join(prod, "Mock ups", "1.jpg"), "mock");
  fs.writeFileSync(path.join(prod, "Aspect Ratio 2x3", "1.jpg"), "PAID-PRINT-FILE");
  fs.writeFileSync(path.join(prod, "_old_mockups", "1.jpg"), "old");
  fs.writeFileSync(path.join(prod, "ETSY_LISTING.md"), "# x");
  return { root, prod };
}

test("readAllowed/hashAllowed throw on a real print file", () => {
  const { root, prod } = fixture();
  assert.throws(() => readAllowed(root, path.join(prod, "Aspect Ratio 2x3", "1.jpg")), ForbiddenPathError);
  assert.throws(() => hashAllowed(root, path.join(prod, "Aspect Ratio 2x3", "1.jpg")), ForbiddenPathError);
  assert.throws(() => readAllowed(root, path.join(prod, "_old_mockups", "1.jpg")), ForbiddenPathError);
  assert.throws(() => listDir(path.join(prod, "Aspect Ratio 2x3")), ForbiddenPathError);
  assert.equal(readAllowed(root, path.join(prod, "Mock ups", "1.jpg"), "utf8"), "mock");
});

test("a symlink in Mock ups that points into a print folder is refused", () => {
  const { root, prod } = fixture();
  const link = path.join(prod, "Mock ups", "2.jpg");
  fs.symlinkSync(path.join(prod, "Aspect Ratio 2x3", "1.jpg"), link);
  assert.throws(() => readAllowed(root, link), ForbiddenPathError);
});

test("discover() never returns a print-folder file", () => {
  const { root } = fixture();
  const found = discover(root);
  assert.equal(found.length, 1);
  assert.deepEqual(
    found[0].mockups.map((m) => path.relative(root, m.abs)),
    [path.join("part 5", "01_Test_Print", "Mock ups", "1.jpg")]
  );
});
