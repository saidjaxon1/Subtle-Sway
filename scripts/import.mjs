#!/usr/bin/env node
// Importer CLI — runs on Said's PC, reads the Wall Art folders READ-ONLY and
// uploads DRAFTS to the private drafts repository. It cannot publish.
//
//   npm run import -- --root "/mnt/F2540508856C9A8C/SAIDJAXON/Etsy/Wall Art"
//   npm run import -- --dry-run
//   npm run import -- --only "part 5/03_Moody_Floral_Still_Life"
//   npm run import -- --local ./drafts-preview        (write drafts to a folder instead of GitHub)
//   npm run import:watch                               (re-import when a folder changes)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runImport, formatSummary } from "./importer/run.mjs";
import { GitHubTarget, LocalTarget } from "./importer/targets.mjs";
import { hasFfmpeg } from "./importer/media.mjs";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Minimal .env loader (no dependency). Values in the real environment win.
const envFile = path.join(ROOT_DIR, ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};

const root = opt("--root") || process.env.WALL_ART_ROOT || "/mnt/F2540508856C9A8C/SAIDJAXON/Etsy/Wall Art";
const dryRun = flag("--dry-run");
const only = opt("--only") || "";
const local = opt("--local");
const watch = flag("--watch");

if (!fs.existsSync(root)) {
  console.error(`Papka topilmadi: ${root}`);
  process.exit(1);
}
if (!dryRun && !hasFfmpeg()) {
  console.error("ffmpeg topilmadi. O'rnatish: sudo apt install ffmpeg");
  process.exit(1);
}

let target = null;
if (local) target = new LocalTarget(local);
else if (process.env.IMPORT_TOKEN && process.env.DRAFTS_REPO) target = new GitHubTarget(process.env.DRAFTS_REPO, process.env.IMPORT_TOKEN);
else if (!dryRun) {
  console.error("IMPORT_TOKEN yoki DRAFTS_REPO yo'q. .env.example faylini .env deb nusxalab, qiymatlarni kiriting (docs/QOLLANMA_UZ.md).");
  process.exit(1);
}

let watermark = "";
try {
  const s = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "data", "settings.json"), "utf8"));
  if (s.watermark) watermark = s.siteName || "Subtle Sway";
} catch {}

async function once(onlyId = only) {
  console.log(`Manba:  ${root} (faqat o'qish)`);
  console.log(`Manzil: ${target ? target.label : "yo'q (faqat sinov)"}${dryRun ? "  [--dry-run]" : ""}\n`);
  const summary = await runImport({ root, target, dryRun, only: onlyId, watermark });
  console.log(formatSummary(summary));
  return summary;
}

if (!watch) {
  once().catch((e) => {
    console.error("\nXato: " + e.message);
    process.exit(1);
  });
} else {
  // Watch mode: re-run the import for a product a few seconds after its folder changes.
  await once();
  console.log("\nKuzatish rejimi: papkalardagi o'zgarishlarni kutyapman (to'xtatish: Ctrl+C)…");
  const pending = new Set();
  let timer = null;
  fs.watch(root, { recursive: true }, (_event, file) => {
    if (!file) return;
    const segs = String(file).split(path.sep);
    if (segs.some((s) => s.startsWith("_"))) return;
    const isMock = segs.some((s) => /^mock ?ups?$/i.test(s));
    if (!isMock && segs.at(-1) !== "ETSY_LISTING.md") return;
    const idx = segs.findIndex((s) => /^mock ?ups?$/i.test(s));
    const productSegs = isMock ? segs.slice(0, idx) : segs.slice(0, -1);
    pending.add(productSegs.join("/"));
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const ids = [...pending];
      pending.clear();
      for (const id of ids) await once(id).catch((e) => console.error("Xato: " + e.message));
    }, 5000);
  });
}
