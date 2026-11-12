#!/usr/bin/env node
// Static site generator for subtlesway.com.
// Reads data/*.json and writes plain HTML pages, sitemap.xml and robots.txt.
// The templates live in assets/js/lib/render.js (also used by the admin preview).
//
//   node scripts/build.mjs                 build into the repo root (what GitHub Pages serves)
//   node scripts/build.mjs --data DIR      read the JSON files from another folder (preview)
//   node scripts/build.mjs --out DIR       write the site into another folder (preview)
//
// Only published products (with a valid Etsy link) are ever written.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { createRenderer } from "../assets/js/lib/render.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? path.resolve(args[i + 1]) : fallback;
};
const DATA = arg("--data", path.join(ROOT, "data"));
const OUT = arg("--out", ROOT);

const readJson = (file, fallback) => {
  const p = path.join(DATA, file);
  if (!fs.existsSync(p)) return fallback;
  return JSON.parse(fs.readFileSync(p, "utf8"));
};

const pages = readJson("pages.json", []);
const r = createRenderer({
  settings: readJson("settings.json", {}),
  catalogs: readJson("catalogs.json", []),
  pages,
  products: readJson("products.json", []),
  // Cache-busting version = hash of the stylesheet and script, so unchanged assets keep their URLs.
  assetVersion: crypto
    .createHash("sha1")
    .update(fs.readFileSync(path.join(ROOT, "assets/site.css")))
    .update(fs.readFileSync(path.join(ROOT, "assets/js/site.js")))
    .digest("hex")
    .slice(0, 10),
});

function write(rel, content) {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

// products/ is fully generated: clear it so unpublished products disappear.
fs.rmSync(path.join(OUT, "products"), { recursive: true, force: true });

write("index.html", r.home());
write("products/index.html", r.productsPage());
for (const p of r.products) write(`products/${p.slug}/index.html`, r.product(p));
for (const pg of pages) write(`${pg.slug}/index.html`, r.textPage(pg));
write("404.html", r.notFound());
for (const [from, to] of Object.entries(r.legacy)) write(from, r.redirect(to));
write("sitemap.xml", r.sitemap);
write("robots.txt", r.robots);

console.log(`Built ${r.products.length} product page(s), ${r.activeCatalogs.length} catalogue(s), ${pages.length} text page(s) → ${path.relative(process.cwd(), OUT) || "."}`);
for (const w of r.warnings) console.warn("warning: " + w);
