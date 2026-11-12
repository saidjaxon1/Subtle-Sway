// Find product folders under the Wall Art root.
//
// Layouts seen so far:
//   part 5/01_Vintage_Winter_Landscape/{Mock ups/, ETSY_LISTING.md, print folders}
//   part 2/{Mock ups/, 01_Golden_Lemons_.../(print folders only)}   → part-level mockups belong to its single product
//   part 1/{Mock Ups/Mock ups/, JPG/, PNG/, Fern_Wall_Art_Download_Guide.pdf}  → the part itself is the product

import path from "node:path";
import { listDir, isForbiddenDirName, MOCKUP_DIR, MOCKUP_FILE, LISTING_FILE } from "./allow-list.mjs";

const PART_DIR = /^part (\d+)$/i;

/** Mockup files (absolute paths) in display order, following one nested "Mock ups" level. */
export function findMockups(mockDir) {
  let entries = listDir(mockDir);
  let dir = mockDir;
  const media = entries.filter((e) => e.isFile() && MOCKUP_FILE.test(e.name));
  if (!media.length) {
    const nested = entries.find((e) => e.isDirectory() && MOCKUP_DIR.test(e.name));
    if (nested) {
      dir = path.join(mockDir, nested.name);
      entries = listDir(dir);
    }
  }
  return entries
    .filter((e) => e.isFile() && MOCKUP_FILE.test(e.name))
    .map((e) => ({ n: Number(e.name.match(MOCKUP_FILE)[1]), abs: path.join(dir, e.name), name: e.name }))
    .sort((a, b) => a.n - b.n);
}

function mockDirOf(dirAbs) {
  const e = listDir(dirAbs).find((x) => x.isDirectory() && MOCKUP_DIR.test(x.name));
  return e ? path.join(dirAbs, e.name) : null;
}

const hasListing = (dirAbs) => listDir(dirAbs).some((e) => e.isFile() && e.name === LISTING_FILE);

/** "03_Moody_Floral_Still_Life" → "Moody Floral Still Life" */
export function nameFromFolder(folder) {
  return folder
    .replace(/^\d+[_\s-]+/, "")
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Name hint for a part-level product, from file NAMES only (e.g. "Fern_Wall_Art_Download_Guide.pdf"). */
function nameFromPartFiles(partAbs) {
  for (const e of listDir(partAbs)) {
    if (!e.isFile()) continue;
    const m = e.name.match(/^(.+?)_(?:wall_art_)?download_guide\.pdf$/i);
    if (m) return m[1].replace(/_/g, " ").trim();
  }
  return "";
}

/**
 * Returns [{ id, folder, partNo, dir, listingPath|null, mockups: [...], name }]
 * id is the folder path relative to the root, e.g. "part 5/03_Moody_Floral_Still_Life".
 */
export function discover(root) {
  const products = [];
  const parts = listDir(root)
    .filter((e) => e.isDirectory() && PART_DIR.test(e.name))
    .sort((a, b) => Number(a.name.match(PART_DIR)[1]) - Number(b.name.match(PART_DIR)[1]));

  for (const part of parts) {
    const partAbs = path.join(root, part.name);
    const partNo = Number(part.name.match(PART_DIR)[1]);
    const subs = listDir(partAbs).filter((e) => e.isDirectory() && !isForbiddenDirName(e.name) && !MOCKUP_DIR.test(e.name));
    const partMock = mockDirOf(partAbs);

    if (!subs.length) {
      if (!partMock && !hasListing(partAbs)) continue; // empty or work-only part
      products.push({
        id: part.name,
        folder: part.name,
        partNo,
        dir: partAbs,
        listingPath: hasListing(partAbs) ? path.join(partAbs, LISTING_FILE) : null,
        mockups: partMock ? findMockups(partMock) : [],
        name: nameFromPartFiles(partAbs) || part.name,
      });
      continue;
    }

    for (const sub of subs) {
      const dir = path.join(partAbs, sub.name);
      let mock = mockDirOf(dir);
      if (!mock && partMock && subs.length === 1) mock = partMock;
      products.push({
        id: `${part.name}/${sub.name}`,
        folder: sub.name,
        partNo,
        dir,
        listingPath: hasListing(dir) ? path.join(dir, LISTING_FILE) : null,
        mockups: mock ? findMockups(mock) : [],
        name: nameFromFolder(sub.name),
      });
    }
  }
  return products;
}
