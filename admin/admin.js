// Subtle Sway admin panel.
// Runs entirely in the browser. Reads and writes two GitHub repositories with
// the admin's fine-grained token:
//   saidjaxon1/Subtle-Sway         public site: data/*.json and media/products/
//   saidjaxon1/Subtle-Sway-drafts  private drafts: drafts/<slug>/draft.json + media, import-log/
// Without a valid token nothing can be read from the drafts repo or written anywhere.

import { GitHubRepo } from "/assets/js/lib/github.js";
import { esc, slugify, markdown, fill } from "/assets/js/lib/text.js";
import { normalizeListingUrl, normalizeSectionUrl, normalizeShopUrl, cleanShopName } from "/assets/js/lib/etsy-url.js";
import { checkPublish, planPublish, planUnpublish, mediaFileNames, draftHealth } from "/assets/js/lib/publish.js";
import { createRenderer } from "/assets/js/lib/render.js";

const PUBLIC_REPO = "saidjaxon1/Subtle-Sway";
const DRAFTS_REPO = "saidjaxon1/Subtle-Sway-drafts";
const TOKEN_KEY = "ss-admin-token";
const LANG_KEY = "ss-admin-lang";
const IMPORT_FIELDS = ["name", "etsyTitle", "description", "tags", "rooms", "styles", "subjects", "colors", "orientation", "catalogs", "price", "pins", "aiDisclosure"];
const app = document.getElementById("app");

// ---------------------------------------------------------------- i18n
const STR = {
  uz: {
    dashboard: "Bosh panel", products: "Mahsulotlar", catalogs: "Kataloglar", pages: "Sahifalar", settings: "Sozlamalar", history: "Tarix",
    logout: "Chiqish", openSite: "Saytni ochish", save: "Saqlash", saving: "Saqlanmoqda…", saved: "Saqlandi.", cancel: "Bekor qilish",
    draft: "Draft", published: "Saytda", incomplete: "To'liq emas", missing: "Manba topilmadi", archived: "Arxiv",
    search: "Qidirish…", all: "Hammasi", name: "Nomi", folder: "Papka", status: "Holat", etsy: "Etsy", warnings: "Ogohlantirishlar",
    publish: "Publish", unpublish: "Saytdan olish", preview: "Ko'rib chiqish", rebuildNote: "Sayt taxminan 1–2 daqiqada yangilanadi (GitHub Actions).",
    resync: "folderdagi versiyani olish", editedMark: "admin'da tahrirlangan",
  },
  en: {
    dashboard: "Dashboard", products: "Products", catalogs: "Catalogues", pages: "Pages", settings: "Settings", history: "History",
    logout: "Log out", openSite: "Open site", save: "Save", saving: "Saving…", saved: "Saved.", cancel: "Cancel",
    draft: "Draft", published: "Published", incomplete: "Incomplete", missing: "Source missing", archived: "Archived",
    search: "Search…", all: "All", name: "Name", folder: "Folder", status: "Status", etsy: "Etsy", warnings: "Warnings",
    publish: "Publish", unpublish: "Unpublish", preview: "Preview", rebuildNote: "The site updates in about 1–2 minutes (GitHub Actions).",
    resync: "use folder version", editedMark: "edited in admin",
  },
};
let lang = safeGet(localStorage, LANG_KEY) || "uz";
const t = (k) => STR[lang][k] || STR.uz[k] || k;

function safeGet(store, key) {
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(store, key, value) {
  try {
    if (value === null) store.removeItem(key);
    else store.setItem(key, value);
  } catch {}
}

// ---------------------------------------------------------------- state
const S = {
  pub: null,
  drafts: null,
  settings: {},
  catalogs: [],
  pages: [],
  products: [],
  draftList: [],
  importLog: null,
  thumbs: new Map(),
};

function toast(text, isError = false) {
  const el = document.getElementById("toast");
  el.textContent = text;
  el.className = isError ? "err" : "";
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.hidden = true), isError ? 9000 : 4000);
}

const today = () => new Date().toISOString().slice(0, 10);
const shopName = () => {
  const s = normalizeShopUrl(S.settings.etsyShopUrl || "");
  return s.ok ? s.shop : cleanShopName(S.settings.etsyShopName);
};

function statusOf(d) {
  if (d.sourceMissing) return "missing";
  if (d.status === "published") return "published";
  if (d.status === "archived") return "archived";
  return "draft";
}
const badge = (st) => `<span class="badge b-${st}">${esc(t(st))}</span>`;

// ---------------------------------------------------------------- data
async function loadAll() {
  const [settings, catalogs, pages, products] = await Promise.all([
    S.pub.json("data/settings.json", {}),
    S.pub.json("data/catalogs.json", []),
    S.pub.json("data/pages.json", []),
    S.pub.json("data/products.json", []),
  ]);
  Object.assign(S, { settings, catalogs, pages, products });
  await loadDrafts();
}

async function loadDrafts() {
  const tree = await S.drafts.tree();
  S.draftTree = tree;
  const paths = [...tree.keys()].filter((p) => /^drafts\/[^/]+\/draft\.json$/.test(p));
  S.draftList = await Promise.all(paths.map((p) => S.drafts.json(p)));
  S.draftList.sort((a, b) => String(a.source?.id || a.slug).localeCompare(String(b.source?.id || b.slug), undefined, { numeric: true }));
  S.importLog = tree.has("import-log/last.json") ? await S.drafts.json("import-log/last.json", null) : null;
}

async function draftBlobUrl(slug, name) {
  const key = `${slug}/${name}`;
  if (S.thumbs.has(key)) return S.thumbs.get(key);
  const p = S.drafts.blob(`drafts/${slug}/media/${name}`).then((b) => URL.createObjectURL(b));
  S.thumbs.set(key, p);
  return p;
}

function hydrateImages(root = document) {
  root.querySelectorAll("img[data-draft]").forEach(async (img) => {
    const [slug, name] = img.dataset.draft.split("|");
    img.removeAttribute("data-draft");
    try {
      img.src = await draftBlobUrl(slug, name);
    } catch {
      img.alt = "—";
    }
  });
}

const coverName = (d) => {
  const c = (d.media || []).find((m) => m.file === d.cover && m.type === "image") || (d.media || []).find((m) => m.type === "image");
  return c ? `${c.file}-640.webp` : "";
};
const thumb = (d) => (coverName(d) ? `<img class="thumb" alt="" data-draft="${esc(d.slug)}|${esc(coverName(d))}">` : `<span class="thumb"></span>`);

// ---------------------------------------------------------------- login
function renderLogin(error = "") {
  app.innerHTML = `<div class="login card">
  <h1>Subtle Sway admin</h1>
  <p class="sub">Kirish uchun GitHub tokeningizni kiriting. Token faqat shu brauzerda saqlanadi.</p>
  ${error ? `<p class="bad">${esc(error)}</p>` : ""}
  <label class="f"><span>GitHub token (github_pat_…)</span><input type="password" id="tok" autocomplete="off" spellcheck="false"></label>
  <label class="row" style="margin-bottom:1rem"><input type="checkbox" id="remember"> Shu kompyuterda eslab qolish</label>
  <button class="btn primary" id="go">Kirish</button>
  <details style="margin-top:1.5rem"><summary class="muted">Token qanday yaratiladi?</summary>
  <ol>
    <li>github.com → Settings → Developer settings → Fine-grained tokens → Generate new token.</li>
    <li>Repository access: <b>Only select repositories</b> → <b>Subtle-Sway</b> va <b>Subtle-Sway-drafts</b>.</li>
    <li>Permissions → Contents: <b>Read and write</b>.</li>
    <li>Token faqat sizda turadi. Uni hech kimga yubormang.</li>
  </ol></details>
</div>`;
  const go = async () => {
    const token = document.getElementById("tok").value.trim();
    if (!token) return;
    const remember = document.getElementById("remember").checked;
    await connect(token, remember);
  };
  document.getElementById("go").onclick = go;
  document.getElementById("tok").onkeydown = (e) => e.key === "Enter" && go();
}

async function connect(token, remember) {
  app.innerHTML = `<p class="boot">Ulanmoqda…</p>`;
  try {
    S.pub = window.__ssRepoFactory ? window.__ssRepoFactory(PUBLIC_REPO) : new GitHubRepo(PUBLIC_REPO, token);
    S.drafts = window.__ssRepoFactory ? window.__ssRepoFactory(DRAFTS_REPO) : new GitHubRepo(DRAFTS_REPO, token);
    await Promise.all([S.pub.info(), S.drafts.info()]);
    if (!S.drafts.private) throw new Error("Drafts repozitoriyasi ochiq (Public). Uni Private qiling.");
    await loadAll();
    if (!window.__ssRepoFactory) safeSet(remember ? localStorage : sessionStorage, TOKEN_KEY, token);
    route();
  } catch (e) {
    safeSet(localStorage, TOKEN_KEY, null);
    safeSet(sessionStorage, TOKEN_KEY, null);
    const msg = e.status === 401 ? "Token noto'g'ri yoki muddati tugagan." : e.status === 404 ? "Repozitoriyaga ruxsat yo'q. Token ikkala repoga ham berilganini tekshiring." : e.message;
    renderLogin(msg);
  }
}

function logout() {
  safeSet(localStorage, TOKEN_KEY, null);
  safeSet(sessionStorage, TOKEN_KEY, null);
  location.hash = "";
  location.reload();
}

// ---------------------------------------------------------------- shell
function shell(active, inner) {
  const nav = [
    ["dashboard", "#/"],
    ["products", "#/products"],
    ["catalogs", "#/catalogs"],
    ["pages", "#/pages"],
    ["settings", "#/settings"],
    ["history", "#/history"],
  ];
  app.innerHTML = `<div class="shell">
  <aside class="side">
    <div class="brand">${esc(S.settings.siteName || "Subtle Sway")}<small>Admin</small></div>
    ${nav.map(([k, h]) => `<a class="nav${k === active ? " on" : ""}" href="${h}">${esc(t(k))}</a>`).join("")}
    <div class="grow"></div>
    <div class="foot">
      <a href="/" target="_blank" rel="noopener">${esc(t("openSite"))} ↗</a>
      <button class="linkbtn" id="lang">${lang === "uz" ? "English" : "O'zbekcha"}</button>
      <button class="linkbtn" id="logout">${esc(t("logout"))}</button>
    </div>
  </aside>
  <main class="main">${inner}</main>
</div>`;
  document.getElementById("logout").onclick = logout;
  document.getElementById("lang").onclick = () => {
    lang = lang === "uz" ? "en" : "uz";
    safeSet(localStorage, LANG_KEY, lang);
    route();
  };
  hydrateImages();
}

// ---------------------------------------------------------------- dashboard
function dashboard() {
  const counts = { draft: 0, published: 0, missing: 0, archived: 0 };
  for (const d of S.draftList) counts[statusOf(d)]++;
  const warn = [];
  for (const d of S.draftList) {
    if (statusOf(d) === "archived") continue;
    for (const w of d.warnings || []) warn.push(`<li><a href="#/product/${esc(d.slug)}">${esc(d.name)}</a> — <span class="warn">${esc(w)}</span></li>`);
    if (d.status === "published" && !d.etsyUrl) warn.push(`<li><a href="#/product/${esc(d.slug)}">${esc(d.name)}</a> — <span class="bad">Etsy havolasi yo'q</span></li>`);
  }
  const log = S.importLog;
  const logHtml = log
    ? `<p>Oxirgi import: <b>${esc(new Date(log.at).toLocaleString())}</b></p>
       <p class="muted">Yangi: ${log.created.length} · Yangilangan: ${log.updated.length} · O'zgarmagan: ${log.unchanged.length} · O'tkazib yuborilgan: ${log.skipped.length} · Manba topilmadi: ${log.missing.length}</p>
       ${log.skipped.length ? `<ul class="plain">${log.skipped.map((s) => `<li class="bad">${esc(s.id)}: ${esc(s.reason)}</li>`).join("")}</ul>` : ""}`
    : `<p class="muted">Hali import qilinmagan.</p>`;
  shell(
    "dashboard",
    `<h1>${esc(t("dashboard"))}</h1><p class="sub">Draftlar faqat yopiq repoda turadi. Saytga faqat siz Publish qilgan mahsulotlar chiqadi.</p>
  <div class="stats">
    <a class="stat" href="#/products?s=draft"><b>${counts.draft}</b><span>${t("draft")}</span></a>
    <a class="stat" href="#/products?s=published"><b>${counts.published}</b><span>${t("published")}</span></a>
    <a class="stat" href="#/products?s=missing"><b>${counts.missing}</b><span>${t("missing")}</span></a>
    <a class="stat" href="#/products?s=archived"><b>${counts.archived}</b><span>${t("archived")}</span></a>
  </div>
  <div class="card">
    <div class="spread"><h2 style="margin:0">Import</h2><button class="btn" id="scan">Skanerlash natijasini yangilash</button></div>
    ${logHtml}
    <p class="muted" style="margin-top:.75rem">Yangi papkalarni import qilish kompyuteringizda bajariladi: <code>npm run import -- --only "part 5/…"</code></p>
  </div>
  <div class="card"><h2 style="margin-top:0">${esc(t("warnings"))} (${warn.length})</h2>${warn.length ? `<ul class="plain">${warn.join("")}</ul>` : `<p class="ok">Ogohlantirish yo'q.</p>`}</div>`
  );
  document.getElementById("scan").onclick = async (e) => {
    e.target.disabled = true;
    await loadDrafts();
    dashboard();
    toast("Import natijasi yangilandi.");
  };
}

// ---------------------------------------------------------------- products list
function productsList(params) {
  const filter = params.get("s") || "";
  shell(
    "products",
    `<div class="spread"><div><h1>${esc(t("products"))}</h1><p class="sub">${S.draftList.length} ta mahsulot</p></div></div>
  <div class="row" style="margin-bottom:1rem">
    <input type="search" id="q" placeholder="${esc(t("search"))}" style="max-width:280px">
    <select id="st" style="max-width:200px">
      <option value="">${t("all")}</option>
      ${["draft", "published", "missing", "archived"].map((s) => `<option value="${s}"${s === filter ? " selected" : ""}>${t(s)}</option>`).join("")}
    </select>
    <span class="grow"></span>
    <button class="btn small" id="bulk-unpub" disabled>${t("unpublish")}</button>
    <button class="btn small" id="bulk-arch" disabled>Arxivlash</button>
  </div>
  <div class="card" style="padding:0;overflow-x:auto"><table>
    <thead><tr><th><input type="checkbox" id="all" aria-label="Hammasini tanlash"></th><th></th><th>${t("name")}</th><th class="hide-sm">${t("folder")}</th><th>${t("status")}</th><th>${t("etsy")}</th><th class="hide-sm">⚠</th></tr></thead>
    <tbody id="rows"></tbody>
  </table></div>`
  );
  const rows = document.getElementById("rows");
  const draw = () => {
    const q = document.getElementById("q").value.trim().toLowerCase();
    const st = document.getElementById("st").value;
    const list = S.draftList.filter((d) => (!st || statusOf(d) === st) && (!q || `${d.name} ${d.source?.id} ${d.slug}`.toLowerCase().includes(q)) && (st === "archived" || statusOf(d) !== "archived"));
    rows.innerHTML = list
      .map(
        (d) => `<tr class="click" data-slug="${esc(d.slug)}">
      <td><input type="checkbox" class="sel" value="${esc(d.slug)}" aria-label="Tanlash"></td>
      <td>${thumb(d)}</td>
      <td><b>${esc(d.name)}</b><div class="muted">/products/${esc(d.slug)}/</div></td>
      <td class="hide-sm muted">${esc(d.source?.id || "")}</td>
      <td>${badge(statusOf(d))}</td>
      <td>${d.etsyUrl ? '<span class="ok">✓</span>' : '<span class="muted">—</span>'}</td>
      <td class="hide-sm">${(d.warnings || []).length ? `<span class="warn">${d.warnings.length}</span>` : ""}</td>
    </tr>`
      )
      .join("") || `<tr><td colspan="7" class="muted" style="padding:1.5rem">Hech narsa topilmadi.</td></tr>`;
    hydrateImages(rows);
    sync();
  };
  const selected = () => [...rows.querySelectorAll(".sel:checked")].map((c) => c.value);
  const sync = () => {
    const n = selected().length;
    document.getElementById("bulk-unpub").disabled = !n;
    document.getElementById("bulk-arch").disabled = !n;
  };
  rows.onclick = (e) => {
    if (e.target.closest("input")) return sync();
    const tr = e.target.closest("tr[data-slug]");
    if (tr) location.hash = `#/product/${tr.dataset.slug}`;
  };
  document.getElementById("all").onchange = (e) => {
    rows.querySelectorAll(".sel").forEach((c) => (c.checked = e.target.checked));
    sync();
  };
  document.getElementById("q").oninput = draw;
  document.getElementById("st").onchange = draw;
  document.getElementById("bulk-unpub").onclick = async () => {
    const slugs = selected().filter((s) => S.draftList.find((d) => d.slug === s)?.status === "published");
    if (!slugs.length) return toast("Tanlanganlar orasida saytdagi mahsulot yo'q.");
    if (!confirm(`${slugs.length} ta mahsulot saytdan olinadi (draft bo'lib qoladi). Davom etilsinmi?`)) return;
    for (const s of slugs) await unpublish(S.draftList.find((d) => d.slug === s), true);
    toast(`${slugs.length} ta mahsulot saytdan olindi. ${t("rebuildNote")}`);
    productsList(params);
  };
  document.getElementById("bulk-arch").onclick = async () => {
    const list = selected().map((s) => S.draftList.find((d) => d.slug === s)).filter((d) => d && d.status !== "published");
    if (!list.length) return toast("Saytdagi mahsulotni arxivlash uchun avval uni saytdan oling.");
    const changes = list.map((d) => ({ path: `drafts/${d.slug}/draft.json`, text: JSON.stringify({ ...d, status: "archived", updatedAt: new Date().toISOString() }, null, 2) + "\n" }));
    await S.drafts.commit(changes, `Archive ${list.length} draft(s)`);
    await loadDrafts();
    toast(`${list.length} ta draft arxivlandi.`);
    productsList(params);
  };
  draw();
}

// ---------------------------------------------------------------- product editor
const counter = (id, max) => `<span class="count" data-for="${id}" data-max="${max}"></span>`;
const listText = (v) => (v || []).join(", ");
const parseList = (s) =>
  String(s || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

function editedHint(d, field) {
  if (!d.edited?.[field] || !d.imported || d.imported[field] === undefined) return "";
  return `<span class="edited">✎ ${esc(t("editedMark"))} · <button type="button" class="linkbtn" data-resync="${field}">${esc(t("resync"))}</button></span>`;
}

function productEditor(slug) {
  const original = S.draftList.find((d) => d.slug === slug);
  if (!original) {
    shell("products", `<h1>Topilmadi</h1><p><a href="#/products">← ${t("products")}</a></p>`);
    return;
  }
  const d = structuredClone(original);
  d.edited = d.edited || {};
  const st = statusOf(d);
  const liveUrl = `${(S.settings.siteUrl || "").replace(/\/$/, "")}/products/${d.slug}/`;

  shell(
    "products",
    `<p><a href="#/products">← ${t("products")}</a></p>
  <div class="spread"><div><h1>${esc(d.name || d.slug)}</h1><p class="sub">${badge(st)} <span class="muted">${esc(d.source?.id || "")}</span>${d.status === "published" ? ` · <a href="${esc(liveUrl)}" target="_blank" rel="noopener">saytda ko'rish ↗</a>` : ""}</p></div>
  <div class="row"><button class="btn" id="preview">${t("preview")}</button><button class="btn primary" id="save">${t("save")}</button></div></div>
  ${(d.warnings || []).length ? `<div class="card"><ul class="plain">${d.warnings.map((w) => `<li class="warn">⚠ ${esc(w)}</li>`).join("")}</ul></div>` : ""}
  <div class="editor">
   <div>
    <div class="card">
      <h2 style="margin-top:0">Asosiy</h2>
      <label class="f"><span>Saytdagi nomi ${editedHint(d, "name")}</span><input type="text" data-f="name" value="${esc(d.name)}"></label>
      <label class="f"><span>Etsy sarlavhasi (mahsulot sahifasida kichik matn) ${editedHint(d, "etsyTitle")} ${counter("etsyTitle", 140)}</span><input type="text" data-f="etsyTitle" id="etsyTitle" value="${esc(d.etsyTitle)}"></label>
      <div class="grid2">
        <label class="f"><span>SEO sarlavha (bo'sh bo'lsa nomidan) ${counter("seoTitle", 60)}</span><input type="text" data-f="seoTitle" id="seoTitle" value="${esc(d.seoTitle || "")}" placeholder="${esc(`${d.name} — Printable Wall Art`)}"></label>
        <label class="f"><span>Meta tavsif (bo'sh bo'lsa avtomatik) ${counter("metaDescription", 160)}</span><input type="text" data-f="metaDescription" id="metaDescription" value="${esc(d.metaDescription || "")}"></label>
      </div>
      <label class="f"><span>Tavsif (Etsy'dagi matn) ${editedHint(d, "description")}</span><textarea class="tall" data-f="description">${esc(d.description)}</textarea></label>
      <label class="f"><span>Teglar (vergul bilan) ${editedHint(d, "tags")}</span><input type="text" data-f="tags" data-list value="${esc(listText(d.tags))}"></label>
    </div>
    <div class="card">
      <h2 style="margin-top:0">Rasmlar va video</h2>
      <p class="muted" style="margin-bottom:.75rem">Tartibni sudrab yoki ↑↓ bilan o'zgartiring. Muqova — katalog va Pinterest uchun asosiy rasm.</p>
      <ul class="media-list" id="media"></ul>
    </div>
    <div class="card">
      <h2 style="margin-top:0">Pinterest (faqat ko'rish uchun)</h2>
      ${(d.pins || []).length ? d.pins.map((p, i) => `<div class="pin"><b>Pin ${i + 1}: ${esc(p.title)}</b><p class="muted">${esc(p.description)}</p></div>`).join("") : `<p class="muted">Pinterest matni yo'q.</p>`}
      <p class="muted" style="margin:.5rem 0 .25rem">Rasm havolalari (Publish qilingandan keyin ishlaydi):</p>
      ${(d.media || []).filter((m) => m.type === "image" && !m.hidden).map((m) => `<div><code class="u">${esc(`${(S.settings.siteUrl || "").replace(/\/$/, "")}/media/products/${d.slug}/${m.file}-1600.jpg`)}</code></div>`).join("")}
      <p class="muted" style="margin-top:.5rem">Sahifa: <code class="u">${esc(liveUrl)}</code></p>
    </div>
   </div>
   <div class="sticky">
    <div class="card">
      <h2 style="margin-top:0">Etsy havolasi va Publish</h2>
      <label class="f"><span>Etsy listing havolasi</span><input type="url" id="etsy" value="${esc(d.etsyUrl || "")}" placeholder="https://${esc(shopName() || "shop")}.etsy.com/listing/…"></label>
      <div id="etsy-msg" class="msg"></div>
      <div class="row" style="margin-top:.75rem">
        <button class="btn primary" id="publish">${d.status === "published" ? "Saytni yangilash" : t("publish")}</button>
        ${d.status === "published" ? `<button class="btn danger" id="unpublish">${t("unpublish")}</button>` : ""}
      </div>
      <p class="progress" id="progress"></p>
      <p class="muted" style="margin-top:.5rem;font-size:.8rem">Publish tugmasi faqat havola to'g'ri va mahsulot to'liq bo'lganda ishlaydi. ${esc(t("rebuildNote"))}</p>
    </div>
    <div class="card">
      <h2 style="margin-top:0">Katalog va atributlar</h2>
      <div class="f"><span class="muted" style="font-size:.82rem">Kataloglar ${editedHint(d, "catalogs")}</span>
        <div class="checks" style="margin-top:.35rem">${S.catalogs.map((c) => `<label><input type="checkbox" class="cat" value="${esc(c.slug)}"${(d.catalogs || []).includes(c.slug) ? " checked" : ""}> ${esc(c.name)}</label>`).join("") || '<span class="muted">Avval katalog yarating.</span>'}</div>
      </div>
      <label class="f" style="margin-top:1rem"><span>Xonalar ${editedHint(d, "rooms")}</span><input type="text" data-f="rooms" data-list value="${esc(listText(d.rooms))}"></label>
      <label class="f"><span>Uslublar ${editedHint(d, "styles")}</span><input type="text" data-f="styles" data-list value="${esc(listText(d.styles))}"></label>
      <label class="f"><span>Ranglar ${editedHint(d, "colors")}</span><input type="text" data-f="colors" data-list value="${esc(listText(d.colors))}"></label>
      <label class="f"><span>Mavzular ${editedHint(d, "subjects")}</span><input type="text" data-f="subjects" data-list value="${esc(listText(d.subjects))}"></label>
      <label class="f"><span>Orientatsiya ${editedHint(d, "orientation")}</span><select data-f="orientation">${["", "Portrait", "Landscape", "Square"].map((o) => `<option${o === d.orientation ? " selected" : ""}>${o}</option>`).join("")}</select></label>
      <label class="row"><input type="checkbox" id="featured"${d.featured ? " checked" : ""}> Bosh sahifada asosiy rasm (featured)</label>
      ${d.price ? `<p class="muted" style="margin-top:.75rem;font-size:.8rem">Tavsiya narx: $${esc(d.price)} — saytda ko'rsatilmaydi.</p>` : ""}
    </div>
   </div>
  </div>`
  );

  // counters
  const updateCounters = () =>
    document.querySelectorAll(".count").forEach((c) => {
      const el = document.getElementById(c.dataset.for);
      const n = el.value.length;
      c.textContent = `${n}/${c.dataset.max}`;
      c.classList.toggle("over", n > Number(c.dataset.max));
    });
  document.querySelectorAll("#etsyTitle,#seoTitle,#metaDescription").forEach((el) => (el.oninput = updateCounters));
  updateCounters();

  // collect form → d
  const collect = () => {
    document.querySelectorAll("[data-f]").forEach((el) => {
      d[el.dataset.f] = el.hasAttribute("data-list") ? parseList(el.value) : el.value.trim();
    });
    d.catalogs = [...document.querySelectorAll(".cat:checked")].map((c) => c.value);
    d.featured = document.getElementById("featured").checked;
    for (const f of IMPORT_FIELDS) {
      if (!d.imported || d.imported[f] === undefined) continue;
      if (JSON.stringify(d[f]) !== JSON.stringify(d.imported[f])) d.edited[f] = true;
      else delete d.edited[f];
    }
  };

  // resync buttons
  document.querySelectorAll("[data-resync]").forEach((b) => {
    b.onclick = () => {
      const f = b.dataset.resync;
      d[f] = structuredClone(d.imported[f]);
      delete d.edited[f];
      if (f === "catalogs") document.querySelectorAll(".cat").forEach((c) => (c.checked = d.catalogs.includes(c.value)));
      else {
        const el = document.querySelector(`[data-f="${f}"]`);
        if (el) el.value = Array.isArray(d[f]) ? listText(d[f]) : d[f];
      }
      b.closest(".edited").remove();
      toast("Folderdagi versiya qo'yildi. Saqlashni unutmang.");
    };
  });

  // media editor
  const mediaEl = document.getElementById("media");
  const drawMedia = () => {
    mediaEl.innerHTML = (d.media || [])
      .map((m, i) => {
        const img = m.type === "video" ? `${m.file}-poster.jpg` : `${m.file}-640.webp`;
        return `<li class="media-item${m.hidden ? " is-hidden" : ""}" draggable="true" data-i="${i}">
        <span class="handle" title="Sudrang">⋮⋮</span>
        <img alt="" data-draft="${esc(d.slug)}|${esc(img)}">
        <div>${
          m.type === "video"
            ? `<b>Video</b> <span class="muted">(${esc(m.file)}.mp4)</span>`
            : `<input type="text" class="alt" data-i="${i}" value="${esc(m.alt || "")}" placeholder="Alt matn — rasmda nima ko'rinadi (ingliz tilida)">`
        }</div>
        <div class="tools">
          ${m.type === "image" ? `<label><input type="radio" name="cover" value="${esc(m.file)}"${d.cover === m.file ? " checked" : ""}> muqova</label>` : ""}
          <label><input type="checkbox" class="hide" data-i="${i}"${m.hidden ? " checked" : ""}> yashirish</label>
          <span><button type="button" class="btn small" data-mv="-1" data-i="${i}" aria-label="Yuqoriga">↑</button> <button type="button" class="btn small" data-mv="1" data-i="${i}" aria-label="Pastga">↓</button></span>
        </div>
      </li>`;
      })
      .join("");
    hydrateImages(mediaEl);
  };
  const touchMedia = () => (d.edited.media = true);
  mediaEl.addEventListener("input", (e) => {
    if (e.target.classList.contains("alt")) {
      d.media[e.target.dataset.i].alt = e.target.value;
      touchMedia();
    }
  });
  mediaEl.addEventListener("change", (e) => {
    if (e.target.classList.contains("hide")) {
      d.media[e.target.dataset.i].hidden = e.target.checked;
      touchMedia();
      drawMedia();
    } else if (e.target.name === "cover") {
      d.cover = e.target.value;
      d.edited.cover = true;
    }
  });
  mediaEl.addEventListener("click", (e) => {
    const b = e.target.closest("[data-mv]");
    if (!b) return;
    const i = Number(b.dataset.i);
    const j = i + Number(b.dataset.mv);
    if (j < 0 || j >= d.media.length) return;
    [d.media[i], d.media[j]] = [d.media[j], d.media[i]];
    touchMedia();
    drawMedia();
  });
  let dragFrom = null;
  mediaEl.addEventListener("dragstart", (e) => {
    const li = e.target.closest(".media-item");
    if (!li) return;
    dragFrom = Number(li.dataset.i);
    li.classList.add("dragging");
  });
  mediaEl.addEventListener("dragover", (e) => e.preventDefault());
  mediaEl.addEventListener("drop", (e) => {
    e.preventDefault();
    const li = e.target.closest(".media-item");
    if (!li || dragFrom === null) return;
    const to = Number(li.dataset.i);
    const [m] = d.media.splice(dragFrom, 1);
    d.media.splice(to, 0, m);
    dragFrom = null;
    touchMedia();
    drawMedia();
  });
  mediaEl.addEventListener("dragend", () => mediaEl.querySelectorAll(".dragging").forEach((x) => x.classList.remove("dragging")));
  drawMedia();

  // Etsy link validation → Publish button state
  const etsyIn = document.getElementById("etsy");
  const msg = document.getElementById("etsy-msg");
  const pubBtn = document.getElementById("publish");
  const validate = () => {
    collect();
    const r = checkPublish(d, etsyIn.value, shopName());
    etsyIn.classList.toggle("invalid", Boolean(etsyIn.value) && !normalizeListingUrl(etsyIn.value, shopName()).ok);
    msg.innerHTML = r.ok ? `<span class="ok">✓ Tayyor: ${esc(r.url)}</span>` : r.errors.map((e) => `<div class="${etsyIn.value ? "bad" : "muted"}">• ${esc(e)}</div>`).join("");
    pubBtn.disabled = !r.ok;
    return r;
  };
  etsyIn.oninput = validate;
  document.querySelector(".editor").addEventListener("change", validate);
  validate();

  // save
  const saveDraft = async (extra = {}) => {
    collect();
    Object.assign(d, extra);
    Object.assign(d, draftHealth(d));
    d.updatedAt = new Date().toISOString();
    if (!extra.etsyUrl) {
      const link = normalizeListingUrl(etsyIn.value, shopName());
      d.etsyUrl = link.ok ? link.url : etsyIn.value.trim() ? d.etsyUrl : "";
    }
    await S.drafts.commit([{ path: `drafts/${d.slug}/draft.json`, text: JSON.stringify(d, null, 2) + "\n" }], `Admin: update ${d.slug}`);
    Object.assign(original, structuredClone(d));
  };

  document.getElementById("save").onclick = async (e) => {
    e.target.disabled = true;
    e.target.textContent = t("saving");
    try {
      await saveDraft();
      if (d.status === "published") {
        const r = checkPublish(d, d.etsyUrl, shopName());
        if (r.ok) await publish(d, r.url, document.getElementById("progress"));
        toast(`${t("saved")} ${t("rebuildNote")}`);
      } else toast(t("saved"));
      productEditor(slug);
    } catch (err) {
      toast("Xato: " + err.message, true);
      e.target.disabled = false;
      e.target.textContent = t("save");
    }
  };

  pubBtn.onclick = async () => {
    const r = validate();
    if (!r.ok) return;
    const verb = d.status === "published" ? "yangilansinmi" : "saytga chiqarilsinmi";
    if (!confirm(`"${d.name}" ${verb}?\n\nEtsy: ${r.url}`)) return;
    pubBtn.disabled = true;
    try {
      const prog = document.getElementById("progress");
      await publish(d, r.url, prog);
      await saveDraft({ status: "published", etsyUrl: r.url, publishedAt: d.publishedAt || today() });
      toast(`Publish qilindi. ${t("rebuildNote")}`);
      productEditor(slug);
    } catch (err) {
      toast("Publish xatosi: " + err.message, true);
      pubBtn.disabled = false;
    }
  };

  const unpubBtn = document.getElementById("unpublish");
  if (unpubBtn)
    unpubBtn.onclick = async () => {
      if (!confirm(`"${d.name}" saytdan olinsinmi? Draft va Etsy havolasi saqlanib qoladi.`)) return;
      unpubBtn.disabled = true;
      try {
        collect();
        await unpublish(d);
        toast(`Saytdan olindi. ${t("rebuildNote")}`);
        productEditor(slug);
      } catch (err) {
        toast("Xato: " + err.message, true);
        unpubBtn.disabled = false;
      }
    };

  document.getElementById("preview").onclick = () => {
    collect();
    openPreview(d, etsyIn.value);
  };
}

// ---------------------------------------------------------------- publish / unpublish
async function publish(d, etsyUrl, progressEl) {
  const say = (s) => progressEl && (progressEl.textContent = s);
  say("Fayllar ro'yxati olinmoqda…");
  const [draftTree, pubTree, freshProducts] = await Promise.all([S.drafts.tree(), S.pub.tree(), S.pub.json("data/products.json", [])]);
  const draftForPlan = { ...d, publishedAt: d.publishedAt || today() };
  const plan = planPublish(draftForPlan, etsyUrl, freshProducts, [...pubTree.keys()], today());
  const changes = [];
  let i = 0;
  for (const c of plan.copy) {
    i++;
    const srcSha = draftTree.get(c.from);
    if (!srcSha) throw new Error(`Draft faylida yo'q: ${c.from}. Importni qayta ishga tushiring.`);
    if (pubTree.get(c.to) === srcSha) continue; // identical file already public
    say(`Rasmlar ko'chirilmoqda: ${i}/${plan.copy.length}`);
    changes.push({ path: c.to, base64: await S.drafts.blobBase64BySha(srcSha) });
  }
  for (const p of plan.remove) changes.push({ path: p, delete: true });
  changes.push({ path: "data/products.json", text: JSON.stringify(plan.products, null, 2) + "\n" });
  say("Saytga yozilmoqda…");
  await S.pub.commit(changes, `Publish ${d.slug}`);
  S.products = plan.products;
  say("Tayyor.");
}

async function unpublish(d, quiet = false) {
  const [pubTree, freshProducts] = await Promise.all([S.pub.tree(), S.pub.json("data/products.json", [])]);
  const plan = planUnpublish(d.slug, freshProducts, [...pubTree.keys()]);
  const changes = plan.remove.map((p) => ({ path: p, delete: true }));
  changes.push({ path: "data/products.json", text: JSON.stringify(plan.products, null, 2) + "\n" });
  await S.pub.commit(changes, `Unpublish ${d.slug}`);
  S.products = plan.products;
  const updated = { ...d, status: "draft", updatedAt: new Date().toISOString() };
  await S.drafts.commit([{ path: `drafts/${d.slug}/draft.json`, text: JSON.stringify(updated, null, 2) + "\n" }], `Admin: unpublish ${d.slug}`);
  const idx = S.draftList.findIndex((x) => x.slug === d.slug);
  if (idx >= 0) S.draftList[idx] = updated;
  if (!quiet) return updated;
}

// ---------------------------------------------------------------- preview
async function openPreview(d, etsyInput) {
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.innerHTML = `<div class="modal-box" role="dialog" aria-modal="true" aria-label="${esc(t("preview"))}">
    <div class="modal-head"><b>${esc(t("preview"))}: ${esc(d.name)}</b><span class="progress" id="pv-prog">Rasmlar yuklanmoqda…</span><button class="btn small" id="pv-close">✕</button></div>
    <iframe title="${esc(t("preview"))}"></iframe></div>`;
  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.querySelector("#pv-close").onclick = close;
  modal.onclick = (e) => e.target === modal && close();
  const link = normalizeListingUrl(etsyInput, shopName());
  const product = { ...d, status: "published", etsyUrl: link.ok ? link.url : `https://${shopName() || "shop"}.etsy.com/listing/1000000000/preview` };
  const urls = {};
  const need = (d.media || []).filter((m) => !m.hidden).flatMap(mediaFileNames);
  let n = 0;
  await Promise.all(
    need.map(async (name) => {
      try {
        urls[name] = await draftBlobUrl(d.slug, name);
      } catch {}
      modal.querySelector("#pv-prog").textContent = `Rasmlar: ${++n}/${need.length}`;
    })
  );
  const others = S.products.filter((p) => p.slug !== d.slug);
  const r = createRenderer({
    settings: S.settings,
    catalogs: S.catalogs,
    pages: S.pages,
    products: [...others, product],
    mediaUrl: (p, name) => (p.slug === d.slug ? urls[name] || "" : `/media/products/${p.slug}/${name}`),
  });
  // A blob: document cannot resolve "/assets/…" on its own (and <base> is blocked by our CSP),
  // so make every root-relative URL absolute.
  const html = r.product(r.products.find((p) => p.slug === d.slug)).replace(/(href|src)="\/(?!\/)/g, `$1="${location.origin}/`);
  modal.querySelector("#pv-prog").textContent = link.ok ? "" : "Etsy havolasi hali yo'q — tugma namunaviy havolaga olib boradi.";
  const blob = new Blob([html], { type: "text/html" });
  modal.querySelector("iframe").src = URL.createObjectURL(blob);
}

// ---------------------------------------------------------------- catalogs
function catalogsView() {
  const list = structuredClone(S.catalogs);
  const used = (slug) => S.draftList.filter((d) => (d.catalogs || []).includes(slug) && d.status !== "archived").length;
  const draw = () => {
    shell(
      "catalogs",
      `<div class="spread"><div><h1>${esc(t("catalogs"))}</h1><p class="sub">Etsy do'konidagi bo'limlar (shop sections) bilan bir xil bo'lsin. Etsy bo'lim havolasi qo'yilsa, saytda "View on Etsy" tugmasi chiqadi.</p></div>
      <button class="btn primary" id="save">${t("save")}</button></div>
      ${list
        .map(
          (c, i) => `<div class="card" data-i="${i}">
        <div class="spread"><b>${esc(c.name || "Yangi katalog")}</b><span class="row"><span class="muted">${used(c.slug)} ta mahsulot</span>
          <button class="btn small" data-mv="-1" data-i="${i}">↑</button><button class="btn small" data-mv="1" data-i="${i}">↓</button>
          <button class="btn small danger" data-del="${i}"${used(c.slug) ? " disabled title='Avval mahsulotlardan olib tashlang'" : ""}>O'chirish</button></span></div>
        <div class="grid2" style="margin-top:.75rem">
          <label class="f"><span>Nomi</span><input type="text" data-k="name" data-i="${i}" value="${esc(c.name)}"></label>
          <label class="f"><span>Manzil (o'zgarmaydi)</span><input type="text" value="/products/?collection=${esc(c.slug)}" disabled></label>
        </div>
        <label class="f"><span>Qisqa tavsif (ingliz tilida)</span><input type="text" data-k="description" data-i="${i}" value="${esc(c.description || "")}"></label>
        <label class="f"><span>Etsy bo'lim havolasi (ixtiyoriy)</span><input type="url" data-k="etsySectionUrl" data-i="${i}" value="${esc(c.etsySectionUrl || "")}" placeholder="https://www.etsy.com/shop/${esc(shopName() || "shop")}?section_id=…"></label>
        <div class="msg" data-msg="${i}"></div>
      </div>`
        )
        .join("")}
      <div class="card"><div class="row"><input type="text" id="newname" placeholder="Yangi katalog nomi (masalan: Nursery)" style="max-width:320px"><button class="btn" id="add">+ Qo'shish</button></div></div>`
    );
    const check = (i) => {
      const c = list[i];
      const m = document.querySelector(`[data-msg="${i}"]`);
      if (!c.etsySectionUrl) return (m.innerHTML = "");
      const r = normalizeSectionUrl(c.etsySectionUrl, shopName());
      m.innerHTML = r.ok ? `<span class="ok">✓ ${esc(r.url)}</span>` : `<span class="bad">${esc(r.error)}</span>`;
    };
    list.forEach((_, i) => check(i));
    app.querySelectorAll("[data-k]").forEach((el) => {
      el.oninput = () => {
        list[el.dataset.i][el.dataset.k] = el.value.trim();
        if (el.dataset.k === "etsySectionUrl") check(Number(el.dataset.i));
      };
    });
    app.querySelectorAll("[data-mv]").forEach((b) => {
      b.onclick = () => {
        const i = Number(b.dataset.i);
        const j = i + Number(b.dataset.mv);
        if (j < 0 || j >= list.length) return;
        [list[i], list[j]] = [list[j], list[i]];
        draw();
      };
    });
    app.querySelectorAll("[data-del]").forEach((b) => {
      b.onclick = () => {
        if (!confirm(`"${list[b.dataset.del].name}" o'chirilsinmi?`)) return;
        list.splice(Number(b.dataset.del), 1);
        draw();
      };
    });
    document.getElementById("add").onclick = () => {
      const name = document.getElementById("newname").value.trim();
      if (!name) return;
      let slug = slugify(name) || "catalogue";
      while (list.some((c) => c.slug === slug)) slug += "-2";
      list.push({ slug, name, description: "", etsySectionUrl: "" });
      draw();
    };
    document.getElementById("save").onclick = async (e) => {
      for (const c of list) {
        if (!c.name) return toast("Har bir katalogga nom bering.", true);
        if (c.etsySectionUrl) {
          const r = normalizeSectionUrl(c.etsySectionUrl, shopName());
          if (!r.ok) return toast(`${c.name}: ${r.error}`, true);
          c.etsySectionUrl = r.url;
        }
      }
      e.target.disabled = true;
      try {
        await S.pub.commit([{ path: "data/catalogs.json", text: JSON.stringify(list, null, 2) + "\n" }], "Admin: update catalogues");
        S.catalogs = structuredClone(list);
        toast(`${t("saved")} ${t("rebuildNote")}`);
        catalogsView();
      } catch (err) {
        toast("Xato: " + err.message, true);
        e.target.disabled = false;
      }
    };
  };
  draw();
}

// ---------------------------------------------------------------- pages
function pagesView() {
  shell(
    "pages",
    `<h1>${esc(t("pages"))}</h1><p class="sub">Matnlar ingliz tilida. Oddiy belgilash: <code>## Sarlavha</code>, <code>- ro'yxat</code>, <code>**qalin**</code>, <code>[matn](https://…)</code>. <code>{{etsyShopUrl}}</code> va <code>{{contactEmail}}</code> avtomatik qo'yiladi.</p>
    <div class="card" style="padding:0"><table><thead><tr><th>Sahifa</th><th>Manzil</th><th>Yangilangan</th></tr></thead><tbody>
    ${S.pages.map((p) => `<tr class="click" data-slug="${esc(p.slug)}"><td><b>${esc(p.title)}</b></td><td class="muted">/${esc(p.slug)}/</td><td class="muted">${esc(p.updated || "—")}</td></tr>`).join("")}
    </tbody></table></div>`
  );
  app.querySelector("tbody").onclick = (e) => {
    const tr = e.target.closest("tr[data-slug]");
    if (tr) location.hash = `#/page/${tr.dataset.slug}`;
  };
}

function pageEditor(slug) {
  const pg = structuredClone(S.pages.find((p) => p.slug === slug));
  if (!pg) return pagesView();
  const vars = { siteName: S.settings.siteName, etsyShopUrl: S.settings.etsyShopUrl || "/products/", contactEmail: S.settings.contactEmail };
  shell(
    "pages",
    `<p><a href="#/pages">← ${t("pages")}</a></p>
    <div class="spread"><h1>${esc(pg.title)}</h1><div class="row"><a class="btn" href="/${esc(pg.slug)}/" target="_blank" rel="noopener">Saytda ↗</a><button class="btn primary" id="save">${t("save")}</button></div></div>
    <div class="editor">
      <div class="card">
        <div class="grid2">
          <label class="f"><span>Sarlavha</span><input type="text" id="title" value="${esc(pg.title)}"></label>
          <label class="f"><span>Menyu nomi</span><input type="text" id="nav" value="${esc(pg.navLabel || "")}"></label>
        </div>
        <label class="f"><span>Meta tavsif ${counter("meta", 160)}</span><input type="text" id="meta" value="${esc(pg.metaDescription || "")}"></label>
        <label class="f"><span>Matn</span><textarea class="tall" id="body">${esc(pg.body)}</textarea></label>
        <div class="row"><label class="row"><input type="checkbox" id="footer"${pg.inFooter ? " checked" : ""}> Footer'da ko'rsatish</label>
        <label class="row">Yangilangan sana <input type="date" id="updated" value="${esc(pg.updated || "")}" style="width:auto"></label>
        <button class="btn small" id="todaybtn">Bugun</button></div>
      </div>
      <div class="card sticky"><h2 style="margin-top:0">Ko'rinishi</h2><div id="pv" class="prose" style="max-height:70vh;overflow:auto"></div></div>
    </div>`
  );
  const pv = document.getElementById("pv");
  const body = document.getElementById("body");
  const meta = document.getElementById("meta");
  const draw = () => {
    pv.innerHTML = markdown(fill(body.value, vars));
    const c = document.querySelector('[data-for="meta"]');
    c.textContent = `${meta.value.length}/160`;
    c.classList.toggle("over", meta.value.length > 160);
  };
  body.oninput = draw;
  meta.oninput = draw;
  document.getElementById("todaybtn").onclick = () => (document.getElementById("updated").value = today());
  draw();
  document.getElementById("save").onclick = async (e) => {
    Object.assign(pg, {
      title: document.getElementById("title").value.trim(),
      navLabel: document.getElementById("nav").value.trim(),
      metaDescription: meta.value.trim(),
      body: body.value,
      inFooter: document.getElementById("footer").checked,
      updated: document.getElementById("updated").value,
    });
    if (!pg.title) return toast("Sarlavha bo'sh bo'lmasin.", true);
    e.target.disabled = true;
    try {
      const fresh = await S.pub.json("data/pages.json", []);
      const next = fresh.map((p) => (p.slug === pg.slug ? pg : p));
      await S.pub.commit([{ path: "data/pages.json", text: JSON.stringify(next, null, 2) + "\n" }], `Admin: update page ${pg.slug}`);
      S.pages = next;
      toast(`${t("saved")} ${t("rebuildNote")}`);
    } catch (err) {
      toast("Xato: " + err.message, true);
    }
    e.target.disabled = false;
  };
}

// ---------------------------------------------------------------- settings
function settingsView() {
  const s = structuredClone(S.settings);
  const field = (k, label, type = "text", hint = "") => `<label class="f"><span>${label}${hint ? ` <span class="muted">${hint}</span>` : ""}</span><input type="${type}" data-k="${k}" value="${esc(s[k] ?? "")}"></label>`;
  shell(
    "settings",
    `<div class="spread"><div><h1>${esc(t("settings"))}</h1><p class="sub">Sayt matnlari ingliz tilida.</p></div><button class="btn primary" id="save">${t("save")}</button></div>
    <div class="card"><h2 style="margin-top:0">Do'kon</h2>
      <div class="grid2">${field("siteName", "Sayt nomi")}${field("siteUrl", "Sayt manzili", "url")}</div>
      ${field("etsyShopUrl", "Etsy do'kon havolasi", "url")}<div class="msg" id="shopmsg"></div>
      ${field("contactEmail", "Aloqa email", "email")}
      <div class="grid2"><label class="f"><span>Pinterest</span><input type="url" data-social="pinterest" value="${esc(s.social?.pinterest || "")}"></label><label class="f"><span>Instagram</span><input type="url" data-social="instagram" value="${esc(s.social?.instagram || "")}"></label></div>
    </div>
    <div class="card"><h2 style="margin-top:0">Bosh sahifa</h2>
      ${field("tagline", "Qisqa shior (footer)")}
      ${field("heroEyebrow", "Kichik yozuv")}
      ${field("heroTitle", "Katta sarlavha")}
      <label class="f"><span>Kirish matni</span><textarea data-k="heroText">${esc(s.heroText || "")}</textarea></label>
      <label class="f"><span>Meta tavsif ${counter("metaD", 160)}</span><input type="text" id="metaD" data-k="metaDescription" value="${esc(s.metaDescription || "")}"></label>
      <label class="f"><span>Har bir katalogdan bosh sahifada nechta mahsulot</span><input type="number" min="2" max="12" data-k="homeProductsPerCatalog" value="${esc(s.homeProductsPerCatalog || 4)}" style="max-width:120px"></label>
    </div>
    <div class="card"><h2 style="margin-top:0">Rasmlar</h2>
      <label class="row"><input type="checkbox" id="wm"${s.watermark ? " checked" : ""}> Eng katta (1600 px) rasmlarga kichik do'kon nomi yozilsin (watermark)</label>
      <p class="muted" style="margin-top:.4rem;font-size:.8rem">Faqat keyingi importlarda yangi rasmlarga ta'sir qiladi.</p>
    </div>`
  );
  const shopIn = app.querySelector('[data-k="etsyShopUrl"]');
  const metaIn = document.getElementById("metaD");
  const check = () => {
    const r = normalizeShopUrl(shopIn.value);
    document.getElementById("shopmsg").innerHTML = shopIn.value ? (r.ok ? `<span class="ok">✓ ${esc(r.url)}</span>` : `<span class="bad">${esc(r.error)}</span>`) : "";
    const c = document.querySelector('[data-for="metaD"]');
    c.textContent = `${metaIn.value.length}/160`;
    c.classList.toggle("over", metaIn.value.length > 160);
  };
  shopIn.oninput = check;
  metaIn.oninput = check;
  check();
  document.getElementById("save").onclick = async (e) => {
    app.querySelectorAll("[data-k]").forEach((el) => (s[el.dataset.k] = el.type === "number" ? Number(el.value) : el.value.trim()));
    s.social = s.social || {};
    app.querySelectorAll("[data-social]").forEach((el) => (s.social[el.dataset.social] = el.value.trim()));
    s.watermark = document.getElementById("wm").checked;
    if (s.etsyShopUrl) {
      const r = normalizeShopUrl(s.etsyShopUrl);
      if (!r.ok) return toast(r.error, true);
      s.etsyShopUrl = r.url;
      s.etsyShopName = r.shop;
    }
    e.target.disabled = true;
    try {
      await S.pub.commit([{ path: "data/settings.json", text: JSON.stringify(s, null, 2) + "\n" }], "Admin: update settings");
      S.settings = s;
      toast(`${t("saved")} ${t("rebuildNote")}`);
    } catch (err) {
      toast("Xato: " + err.message, true);
    }
    e.target.disabled = false;
  };
}

// ---------------------------------------------------------------- history (audit log)
async function historyView() {
  shell("history", `<h1>${esc(t("history"))}</h1><p class="sub">Har bir o'zgarish GitHub'da kim, qachon va nima qilgani bilan saqlanadi.</p><div class="card" id="h">Yuklanmoqda…</div>`);
  try {
    const [a, b] = await Promise.all([S.pub.commits(25), S.drafts.commits(25)]);
    const rows = [...a.map((c) => ({ ...c, repo: "Sayt" })), ...b.map((c) => ({ ...c, repo: "Draftlar" }))]
      .sort((x, y) => new Date(y.commit.author.date) - new Date(x.commit.author.date))
      .slice(0, 40);
    document.getElementById("h").innerHTML = `<table><thead><tr><th>Sana</th><th>Joy</th><th>O'zgarish</th><th class="hide-sm">Kim</th></tr></thead><tbody>${rows
      .map((c) => `<tr><td class="muted">${esc(new Date(c.commit.author.date).toLocaleString())}</td><td>${esc(c.repo)}</td><td>${esc(c.commit.message.split("\n")[0])}</td><td class="hide-sm muted">${esc(c.commit.author.name)}</td></tr>`)
      .join("")}</tbody></table>`;
  } catch (e) {
    document.getElementById("h").innerHTML = `<p class="bad">${esc(e.message)}</p>`;
  }
}

// ---------------------------------------------------------------- router
function route() {
  if (!S.pub) return;
  const [path, query] = location.hash.replace(/^#/, "").split("?");
  const params = new URLSearchParams(query || "");
  const seg = (path || "/").split("/").filter(Boolean);
  if (!seg.length) return dashboard();
  if (seg[0] === "products") return productsList(params);
  if (seg[0] === "product" && seg[1]) return productEditor(decodeURIComponent(seg[1]));
  if (seg[0] === "catalogs") return catalogsView();
  if (seg[0] === "pages") return pagesView();
  if (seg[0] === "page" && seg[1]) return pageEditor(decodeURIComponent(seg[1]));
  if (seg[0] === "settings") return settingsView();
  if (seg[0] === "history") return historyView();
  dashboard();
}
window.addEventListener("hashchange", route);

// ---------------------------------------------------------------- boot
(async () => {
  // Local test mode: only on localhost with ?demo, never on the real site.
  if (["localhost", "127.0.0.1"].includes(location.hostname) && new URLSearchParams(location.search).has("demo")) {
    try {
      const mod = await import("/admin/dev/fake-repo.js");
      window.__ssRepoFactory = await mod.setup();
      return connect("demo", false);
    } catch (e) {
      console.warn("demo mode unavailable", e);
    }
  }
  const saved = safeGet(sessionStorage, TOKEN_KEY) || safeGet(localStorage, TOKEN_KEY);
  if (saved) connect(saved, Boolean(safeGet(localStorage, TOKEN_KEY)));
  else renderLogin();
})();
