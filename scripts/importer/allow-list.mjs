// SECURITY: the paid 300 DPI print files must never be read, copied,
// thumbnailed, uploaded or referenced by the importer.
//
// The importer may read exactly two kinds of file:
//   1. <product>/ETSY_LISTING.md
//   2. <product>/Mock ups/<number>.(jpg|jpeg|png|mp4)   (one extra nested "Mock ups" level is allowed)
// Everything else is refused. Every file read in the importer goes through
// readAllowed()/hashAllowed()/assertAllowed(), so this file is the only gate.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/** Folder names that hold paid print files or work-in-progress material. */
export const FORBIDDEN_DIR = [
  /^a\d/i, // "A1, A2, A3, A4, A5"
  /^aspect ratio/i, // "Aspect Ratio 2x3", "Aspect Ratio 11x14", ...
  /^(jpg|jpeg|png|pdf|tiff?|print|prints|print files?|originals?|upscaled?|high ?res)$/i,
  /^_/, // "_old_mockups", "_v2_mockups", "_removed", "_gen", "_mockup_work", "_seo_work", ...
  /^\./, // hidden folders
];

export const MOCKUP_DIR = /^mock ?ups?$/i;
export const MOCKUP_FILE = /^(\d{1,3})\.(jpe?g|png|mp4)$/i;
export const LISTING_FILE = "ETSY_LISTING.md";
const PART_DIR = /^part \d+$/i;

export const isForbiddenDirName = (name) => FORBIDDEN_DIR.some((re) => re.test(name));

/**
 * Decide whether a file (absolute path) may be read.
 * Returns { ok: true } or { ok: false, reason }.
 */
export function checkSource(root, absPath) {
  const rootAbs = path.resolve(root);
  const abs = path.resolve(absPath);
  const rel = path.relative(rootAbs, abs);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return { ok: false, reason: "outside the Wall Art folder" };
  const segs = rel.split(path.sep);
  const file = segs.pop();
  if (!segs.length || !PART_DIR.test(segs[0])) return { ok: false, reason: "not inside a 'part N' folder" };
  for (const s of segs) {
    if (isForbiddenDirName(s)) return { ok: false, reason: `forbidden folder "${s}"` };
  }
  // segs = ["part N", maybe product folder, maybe mock-up folder(s)]
  const rest = segs.slice(1);
  const mockIdx = rest.findIndex((s) => MOCKUP_DIR.test(s));
  if (file === LISTING_FILE) {
    if (mockIdx !== -1 || rest.length > 1) return { ok: false, reason: "listing file in an unexpected place" };
    return { ok: true, kind: "listing" };
  }
  if (!MOCKUP_FILE.test(file)) return { ok: false, reason: `file "${file}" is not a numbered mockup` };
  if (mockIdx === -1) return { ok: false, reason: "mockup file outside a 'Mock ups' folder" };
  if (mockIdx > 1) return { ok: false, reason: "mockup folder nested too deep" };
  const after = rest.slice(mockIdx);
  if (after.length > 2 || !after.every((s) => MOCKUP_DIR.test(s))) return { ok: false, reason: "unexpected folder inside 'Mock ups'" };
  return { ok: true, kind: "mockup" };
}

export class ForbiddenPathError extends Error {}

export function assertAllowed(root, absPath) {
  const r = checkSource(root, absPath);
  if (!r.ok) throw new ForbiddenPathError(`Refused to read ${absPath}: ${r.reason}`);
  // Symlinks could point anywhere, including the print folders.
  const real = fs.realpathSync(absPath);
  if (path.resolve(real) !== path.resolve(absPath)) {
    const again = checkSource(root, real);
    if (!again.ok) throw new ForbiddenPathError(`Refused to follow link ${absPath} → ${real}: ${again.reason}`);
  }
  return r;
}

export function readAllowed(root, absPath, encoding) {
  assertAllowed(root, absPath);
  return fs.readFileSync(absPath, encoding);
}

export function hashAllowed(root, absPath) {
  assertAllowed(root, absPath);
  return crypto.createHash("sha256").update(fs.readFileSync(absPath)).digest("hex");
}

/**
 * List entry NAMES of a folder (no file content is read). Used only on the
 * Wall Art root, "part N" folders, product folders and "Mock ups" folders;
 * the importer never descends into a forbidden folder.
 */
export function listDir(absDir) {
  const name = path.basename(absDir);
  if (isForbiddenDirName(name)) throw new ForbiddenPathError(`Refused to list forbidden folder ${absDir}`);
  return fs.readdirSync(absDir, { withFileTypes: true });
}
