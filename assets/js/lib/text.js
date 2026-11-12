// Text helpers shared by the build script and the admin preview.
// Dependency-free ES module.

export function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function slugify(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

/** Replace {{key}} placeholders with values from settings. */
export function fill(text, vars) {
  return String(text || "").replace(/\{\{(\w+)\}\}/g, (_, key) => (vars && vars[key] != null ? String(vars[key]) : ""));
}

function safeHref(href) {
  const h = href.trim();
  if (/^(https:\/\/|mailto:|\/)/i.test(h) && !/^\/\//.test(h)) return h;
  return "";
}

/** Inline markup on already-escaped text: **bold** and [label](href). */
function inline(escaped) {
  return escaped
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (all, label, href) => {
      const decoded = href.replace(/&amp;/g, "&");
      const ok = safeHref(decoded);
      if (!ok) return label;
      const external = /^https:\/\//i.test(ok);
      return `<a href="${esc(ok)}"${external ? ' rel="noopener" target="_blank"' : ""}>${label}</a>`;
    });
}

/**
 * Tiny markdown subset for the editable pages:
 * "## Heading", "- list item", blank-line paragraphs, **bold**, [link](url).
 */
export function markdown(src) {
  const lines = String(src || "").replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let para = [];
  let list = [];
  const flushPara = () => {
    if (para.length) out.push(`<p>${inline(esc(para.join(" ")))}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list.length) out.push(`<ul>${list.map((li) => `<li>${inline(esc(li))}</li>`).join("")}</ul>`);
    list = [];
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushPara();
      flushList();
    } else if (/^#{2,3}\s+/.test(line)) {
      flushPara();
      flushList();
      out.push(`<h2>${inline(esc(line.replace(/^#{2,3}\s+/, "")))}</h2>`);
    } else if (/^[-*]\s+/.test(line)) {
      flushPara();
      list.push(line.replace(/^[-*]\s+/, ""));
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return out.join("\n");
}

const HEADER = /^(\p{Extended_Pictographic}️?)\s+([^a-z]{3,60})$/u;

function sentenceCase(text) {
  const lower = text.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * Split an Etsy description (plain text with emoji section headers such as
 * "✨ WHY YOU'LL LOVE IT") into an intro and titled sections.
 * Returns { intro: Block[], sections: [{ icon, title, blocks: Block[] }] },
 * where Block is { type: "p", text } or { type: "ul", items }.
 */
export function parseEtsyDescription(text) {
  const result = { intro: [], sections: [] };
  let target = result.intro;
  let para = [];
  let list = [];
  const flush = () => {
    if (para.length) target.push({ type: "p", text: para.join(" ") });
    if (list.length) target.push({ type: "ul", items: list });
    para = [];
    list = [];
  };
  for (const raw of String(text || "").replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const h = line.match(HEADER);
    if (h) {
      flush();
      const section = { icon: h[1], title: sentenceCase(h[2].trim()), blocks: [] };
      result.sections.push(section);
      target = section.blocks;
      continue;
    }
    if (/^[-•*]\s+/.test(line)) {
      if (para.length) {
        target.push({ type: "p", text: para.join(" ") });
        para = [];
      }
      list.push(line.replace(/^[-•*]\s+/, ""));
    } else {
      if (list.length) {
        target.push({ type: "ul", items: list });
        list = [];
      }
      para.push(line);
    }
  }
  flush();
  return result;
}

export function renderBlocks(blocks) {
  return blocks
    .map((b) => (b.type === "ul" ? `<ul>${b.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : `<p>${esc(b.text)}</p>`))
    .join("\n");
}

/** Plain-text summary for meta descriptions: first sentence(s) up to `max` characters. */
export function summary(text, max = 158) {
  const first = String(text || "").replace(/\s+/g, " ").trim();
  if (first.length <= max) return first;
  const cut = first.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "));
  if (stop >= max * 0.75) return cut.slice(0, stop + 1);
  return cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:]$/, "") + "…";
}
