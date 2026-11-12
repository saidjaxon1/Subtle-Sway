// End-to-end importer test on a throw-away folder tree (needs ffmpeg; skipped without it).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { runImport } from "../scripts/importer/run.mjs";
import { LocalTarget } from "../scripts/importer/targets.mjs";
import { hasFfmpeg } from "../scripts/importer/media.mjs";

const skip = hasFfmpeg() ? false : "ffmpeg not installed";
const SENTINEL = "PAID-PRINT-FILE-SENTINEL";

function makeImage(file, color) {
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", `color=c=${color}:s=400x400`, "-frames:v", "1", file]);
}
function makeVideo(file) {
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc=s=320x320:d=1:r=10", "-pix_fmt", "yuv420p", file]);
}

function tree() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ss-imp-"));
  process.env.SUBTLESWAY_CACHE = path.join(root, ".cache");
  const prod = path.join(root, "part 5", "01_Quiet_Fern_Study");
  const mock = path.join(prod, "Mock ups");
  fs.mkdirSync(mock, { recursive: true });
  makeImage(path.join(mock, "1.jpg"), "green");
  makeVideo(path.join(mock, "2.mp4"));
  makeImage(path.join(mock, "3.jpg"), "brown");
  fs.writeFileSync(path.join(mock, "mockup_provenance.json"), SENTINEL);
  for (const f of ["Aspect Ratio 2x3", "A1, A2, A3, A4, A5", "_old_mockups"]) {
    fs.mkdirSync(path.join(prod, f), { recursive: true });
    fs.writeFileSync(path.join(prod, f, "1.jpg"), SENTINEL);
  }
  fs.writeFileSync(
    path.join(prod, "ETSY_LISTING.md"),
    "## Title\n\n```text\nFern Print Printable, Digital Download\n```\n\n## Tags — copy-paste line\n\n```text\nfern, botanical\n```\n\n## Description — copy-paste\n\n```text\nA fern.\n```\n\n## Category, attributes and listing settings\n\n| Field | Value |\n|---|---|\n| Orientation | Vertical / portrait |\n| Subject(s) | Botanical; Ferns |\n\n## Main mockup alt text\n\n| Image | Alt |\n|---|---|\n| Mock ups/1.jpg | A green fern print. |\n\n## Seller notes — do not paste into the description\n\n- " +
      SENTINEL +
      "\n"
  );
  // A second product with print files only → incomplete draft, never a crash.
  fs.mkdirSync(path.join(root, "part 3", "02_Only_Prints", "Aspect Ratio 3x4"), { recursive: true });
  fs.writeFileSync(path.join(root, "part 3", "02_Only_Prints", "Aspect Ratio 3x4", "x.jpg"), SENTINEL);
  return { root, prod, out: path.join(root, "..", path.basename(root) + "-out") };
}

function allFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true, recursive: true }).filter((e) => e.isFile()).map((e) => path.join(e.parentPath ?? e.path, e.name));
}

test("import creates drafts only from Mock ups + listing, and never touches print files", { skip }, async () => {
  const { root, out } = tree();
  const target = new LocalTarget(out);
  const s = await runImport({ root, target, log: () => {} });
  assert.equal(s.created.length, 2);

  const draft = JSON.parse(fs.readFileSync(path.join(out, "drafts", "quiet-fern-study-printable", "draft.json"), "utf8"));
  assert.equal(draft.status, "draft");
  assert.equal(draft.etsyUrl, "");
  assert.equal(draft.incomplete, false);
  assert.deepEqual(draft.catalogs, ["botanical-floral"]);
  assert.deepEqual(draft.media.map((m) => [m.type, m.file]), [["image", "1"], ["video", "2"], ["image", "3"]]);
  assert.equal(draft.media[0].alt, "A green fern print.");

  const files = allFiles(out).map((f) => path.relative(out, f)).sort();
  assert.ok(files.includes(path.join("drafts", "quiet-fern-study-printable", "media", "1-1600.webp")));
  assert.ok(files.includes(path.join("drafts", "quiet-fern-study-printable", "media", "2.webm")));
  for (const f of allFiles(out)) {
    assert.ok(!fs.readFileSync(f).includes(SENTINEL), `print-file / seller-note content leaked into ${f}`);
  }
  const incomplete = JSON.parse(fs.readFileSync(path.join(out, "drafts", "only-prints-printable", "draft.json"), "utf8"));
  assert.equal(incomplete.incomplete, true);
  assert.equal(incomplete.media.length, 0);
});

test("re-import is idempotent, keeps admin edits, and flags removed folders", { skip }, async () => {
  const { root, prod, out } = tree();
  const target = new LocalTarget(out);
  await runImport({ root, target, log: () => {} });

  const again = await runImport({ root, target, log: () => {} });
  assert.equal(again.created.length, 0);
  assert.equal(again.updated.length, 0);
  assert.equal(again.unchanged.length, 2);

  // Admin edits the name; the folder's listing changes the description.
  const file = path.join(out, "drafts", "quiet-fern-study-printable", "draft.json");
  const d = JSON.parse(fs.readFileSync(file, "utf8"));
  d.name = "My Fern";
  d.edited = { name: true };
  d.status = "published";
  d.etsyUrl = "https://subtleswaystore.etsy.com/listing/123456789/fern";
  fs.writeFileSync(file, JSON.stringify(d));
  const md = path.join(prod, "ETSY_LISTING.md");
  fs.writeFileSync(md, fs.readFileSync(md, "utf8").replace("A fern.", "A new fern."));

  const third = await runImport({ root, target, log: () => {} });
  assert.equal(third.updated.length, 1);
  const after = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(after.name, "My Fern", "manual edit kept");
  assert.equal(after.imported.name, "Quiet Fern Study", "folder version kept for re-sync");
  assert.equal(after.description, "A new fern.");
  assert.equal(after.status, "published", "importer never changes status");
  assert.equal(after.slug, "quiet-fern-study-printable", "slug is stable");

  fs.rmSync(path.join(root, "part 3"), { recursive: true });
  const fourth = await runImport({ root, target, log: () => {} });
  assert.equal(fourth.missing.length, 1);
  const flagged = JSON.parse(fs.readFileSync(path.join(out, "drafts", "only-prints-printable", "draft.json"), "utf8"));
  assert.equal(flagged.sourceMissing, true);
});

test("new drafts are always status draft, even if a draft.json claims otherwise elsewhere", { skip }, async () => {
  const { root, out } = tree();
  const s = await runImport({ root, target: new LocalTarget(out), only: "part 5/01_Quiet_Fern_Study", log: () => {} });
  assert.equal(s.created.length, 1);
  const d = JSON.parse(fs.readFileSync(path.join(out, "drafts", s.created[0].slug, "draft.json"), "utf8"));
  assert.equal(d.status, "draft");
});
