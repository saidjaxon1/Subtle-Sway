// Import product folders as DRAFTS. Never publishes.

import path from "node:path";
import { discover } from "./discover.mjs";
import { hashAllowed, readAllowed } from "./allow-list.mjs";
import { parseListing, guessCatalogs } from "./listing.mjs";
import { convert } from "./media.mjs";
import { slugify } from "../../assets/js/lib/text.js";

/** Fields filled from the folder. If edited in admin, the importer leaves them alone. */
export const IMPORT_FIELDS = ["name", "etsyTitle", "description", "tags", "rooms", "styles", "subjects", "colors", "orientation", "catalogs", "price", "pins", "aiDisclosure"];

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const now = () => new Date().toISOString();

function warningsFor(d) {
  const w = [];
  if (!d.hasListing) w.push("ETSY_LISTING.md topilmadi — tavsif, teglar va atributlarni admin panelda kiriting");
  if (!d.media.some((m) => m.type === "image")) w.push("Mockup rasmlari topilmadi");
  if (!d.media.some((m) => m.type === "video")) w.push("Mockup video yo'q");
  const noAlt = d.media.filter((m) => m.type === "image" && !m.alt).length;
  if (noAlt) w.push(`${noAlt} ta rasmda alt matn yo'q`);
  if ((d.etsyTitle || "").length > 140) w.push("Etsy sarlavhasi 140 belgidan uzun");
  if (!d.catalogs?.length) w.push("Katalog tanlanmagan");
  if (!d.description) w.push("Tavsif bo'sh");
  return w;
}

function uniqueSlug(base, taken) {
  let slug = base || "print";
  let i = 2;
  while (taken.has(slug)) slug = `${base}-${i++}`;
  taken.add(slug);
  return slug;
}

/**
 * options: { root, target, dryRun, only, watermark, log }
 * Returns a summary object.
 */
export async function runImport({ root, target, dryRun = false, only = "", watermark = "", log = console.log }) {
  root = path.resolve(root);
  const found = discover(root).filter((p) => !only || p.id === only || p.id.toLowerCase() === only.toLowerCase());
  if (only && !found.length) throw new Error(`--only "${only}" papkasi topilmadi`);

  const existing = target ? await target.listDrafts() : [];
  const byId = new Map(existing.map((d) => [d.source?.id, d]));
  const taken = new Set(existing.map((d) => d.slug));
  const summary = { at: now(), dryRun, created: [], updated: [], unchanged: [], skipped: [], missing: [] };

  for (const src of found) {
    try {
      const prev = byId.get(src.id);
      const listing = src.listingPath ? parseListing(readAllowed(root, src.listingPath, "utf8")) : null;
      const hashes = {};
      for (const m of src.mockups) hashes[m.name] = hashAllowed(root, m.abs);
      if (src.listingPath) hashes["ETSY_LISTING.md"] = hashAllowed(root, src.listingPath);

      const imported = {
        name: src.name,
        etsyTitle: listing?.title || "",
        description: listing?.description || "",
        tags: listing?.tags || [],
        rooms: listing?.rooms || [],
        styles: listing?.styles || [],
        subjects: listing?.subjects || [],
        colors: listing?.colors || [],
        orientation: listing?.orientation || "",
        catalogs: guessCatalogs(listing?.subjects || [], src.name),
        price: listing?.price || "",
        pins: listing?.pins || [],
        aiDisclosure: listing ? listing.aiDisclosure : false,
      };

      const slug = prev ? prev.slug : uniqueSlug(`${slugify(src.name)}-printable`.replace(/^-/, ""), taken);
      const draft = prev ? structuredClone(prev) : { schema: 1, id: src.id, slug, status: "draft", etsyUrl: "", edited: {}, createdAt: now() };
      draft.source = { id: src.id, folder: src.folder, part: src.partNo };
      draft.sourceMissing = false;
      draft.hasListing = Boolean(listing);
      draft.imported = imported;
      for (const f of IMPORT_FIELDS) if (!draft.edited?.[f]) draft[f] = imported[f];

      // Media: convert only files whose content changed.
      const changedFiles = src.mockups.filter((m) => !prev || prev.sourceHashes?.[m.name] !== hashes[m.name]);
      const uploads = [];
      const freshMedia = [];
      for (const m of src.mockups) {
        const isVideo = /\.mp4$/i.test(m.name);
        const old = prev?.media?.find((x) => x.file === String(m.n));
        let entry = old ? { ...old } : { type: isVideo ? "video" : "image", file: String(m.n), alt: "", hidden: false };
        if (!isVideo && !(draft.edited?.media && old)) entry.alt = listing?.alts?.[String(m.n)] || old?.alt || "";
        if (changedFiles.includes(m) && !dryRun) {
          const out = convert(root, m, hashes[m.name], { watermark });
          entry.width = out.width;
          entry.height = out.height;
          for (const [name, file] of Object.entries(out.files)) uploads.push({ path: `drafts/${slug}/media/${name}`, sourceFile: file });
        }
        freshMedia.push(entry);
      }
      if (draft.edited?.media && prev?.media) {
        // Keep the admin's order, alt texts and hidden flags; add new files at the end; drop vanished ones.
        const names = new Set(freshMedia.map((m) => m.file));
        const kept = prev.media.filter((m) => names.has(m.file)).map((m) => ({ ...m, ...pick(freshMedia.find((f) => f.file === m.file), ["width", "height", "type"]) }));
        const added = freshMedia.filter((m) => !prev.media.some((p) => p.file === m.file));
        draft.media = [...kept, ...added];
      } else {
        draft.media = freshMedia;
      }
      if (!draft.edited?.cover || !draft.media.some((m) => m.file === draft.cover)) draft.cover = draft.media.find((m) => m.type === "image")?.file || "";
      draft.sourceHashes = hashes;
      draft.incomplete = !listing || !draft.media.some((m) => m.type === "image");
      draft.warnings = warningsFor(draft);

      const before = prev ? JSON.stringify({ ...prev, importedAt: 0, updatedAt: 0 }) : "";
      const after = JSON.stringify({ ...draft, importedAt: 0, updatedAt: 0 });
      if (prev && before === after && !uploads.length) {
        summary.unchanged.push({ id: src.id, slug });
        continue;
      }
      draft.importedAt = now();
      draft.updatedAt = now();
      const changedFields = prev ? IMPORT_FIELDS.filter((f) => !same(prev[f], draft[f])) : [];
      const item = { id: src.id, slug, incomplete: draft.incomplete, files: changedFiles.map((m) => m.name), fields: changedFields, warnings: draft.warnings };
      (prev ? summary.updated : summary.created).push(item);
      if (!dryRun) {
        uploads.push({ path: `drafts/${slug}/draft.json`, content: JSON.stringify(draft, null, 2) + "\n" });
        await target.commit(uploads, `${prev ? "Update" : "Import"} draft ${slug} from ${src.id}`);
      }
      log(`${prev ? "↻" : "+"} ${src.id} → ${slug}${draft.incomplete ? " (to'liq emas)" : ""}${changedFiles.length ? `, ${changedFiles.length} ta fayl` : ""}`);
    } catch (e) {
      summary.skipped.push({ id: src.id, reason: e.message });
      log(`✗ ${src.id}: ${e.message}`);
    }
  }

  // Folders that disappeared: flag, never delete.
  if (!only) {
    const ids = new Set(found.map((p) => p.id));
    for (const d of existing) {
      if (ids.has(d.source?.id)) continue;
      summary.missing.push({ id: d.source?.id, slug: d.slug });
      if (!dryRun && !d.sourceMissing) {
        const flagged = { ...d, sourceMissing: true, updatedAt: now() };
        await target.commit([{ path: `drafts/${d.slug}/draft.json`, content: JSON.stringify(flagged, null, 2) + "\n" }], `Mark ${d.slug}: source folder not found`);
      }
    }
  }

  if (!dryRun && target) {
    await target.commit([{ path: "import-log/last.json", content: JSON.stringify(summary, null, 2) + "\n" }], "Import log");
  }
  return summary;
}

function pick(obj, keys) {
  const out = {};
  if (obj) for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

export function formatSummary(s) {
  const lines = [];
  lines.push("");
  lines.push(s.dryRun ? "SINOV REJIMI (--dry-run): hech narsa yuklanmadi." : "Import tugadi.");
  lines.push(`  Yangi draftlar:     ${s.created.length}`);
  lines.push(`  Yangilanganlar:     ${s.updated.length}`);
  lines.push(`  O'zgarmaganlar:     ${s.unchanged.length}`);
  lines.push(`  O'tkazib yuborildi: ${s.skipped.length}`);
  lines.push(`  Manba topilmadi:    ${s.missing.length}`);
  for (const i of [...s.created, ...s.updated]) {
    lines.push("");
    lines.push(`• ${i.id} → /products/${i.slug}/${i.incomplete ? "  [TO'LIQ EMAS]" : ""}`);
    if (i.fields?.length) lines.push(`    o'zgargan maydonlar: ${i.fields.join(", ")}`);
    if (i.files?.length) lines.push(`    fayllar: ${i.files.join(", ")}`);
    for (const w of i.warnings || []) lines.push(`    ⚠ ${w}`);
  }
  for (const i of s.skipped) lines.push(`✗ ${i.id}: ${i.reason}`);
  for (const i of s.missing) lines.push(`? ${i.id} (${i.slug}): papka topilmadi — admin panelda "manba topilmadi" deb belgilandi`);
  return lines.join("\n");
}
