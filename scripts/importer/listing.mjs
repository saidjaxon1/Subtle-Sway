// Parse ETSY_LISTING.md into product fields.
// The "Seller notes" section is cut off before anything else is parsed, so
// nothing in it can ever reach a draft or the site.

const SELLER_NOTES = /^##\s+Seller notes\b/im;

/** Split markdown into { "Heading text": "body" } for level-2 headings. */
function sections(md) {
  const out = {};
  const re = /^##\s+(.+?)\s*$/gm;
  const marks = [];
  let m;
  while ((m = re.exec(md))) marks.push({ title: m[1], start: m.index, bodyStart: re.lastIndex });
  marks.forEach((s, i) => {
    out[s.title] = md.slice(s.bodyStart, i + 1 < marks.length ? marks[i + 1].start : md.length);
  });
  return out;
}

function find(secs, prefix) {
  const key = Object.keys(secs).find((k) => k.toLowerCase().startsWith(prefix.toLowerCase()));
  return key ? secs[key] : "";
}

function firstFence(body) {
  const m = body.match(/```(?:text)?\s*\n([\s\S]*?)```/);
  return m ? m[1].trim() : "";
}

function table(body) {
  const rows = [];
  for (const line of body.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("|") || /^\|\s*-/.test(t)) continue;
    rows.push(
      t
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((c) => c.trim())
    );
  }
  return rows.slice(1); // drop header row
}

const list = (v) =>
  String(v || "")
    .split(/;/)
    .map((s) => s.trim())
    .filter(Boolean);

function orientation(v) {
  const s = String(v || "").toLowerCase();
  if (s.includes("portrait") || s.includes("vertical")) return "Portrait";
  if (s.includes("landscape") || s.includes("horizontal")) return "Landscape";
  if (s.includes("square")) return "Square";
  return "";
}

const CATALOG_RULES = [
  // Order matters: the first rule that matches wins.
  ["kitchen-food", /food|drink|coffee|kitchen|fruit|lemon|orange|tea\b|bakery/i],
  ["landscapes-seascapes", /landscape|seascape|ocean|beach|mountain|countryside|river|coast|hills/i],
  ["abstract-modern", /abstract|geometric|bauhaus|shapes|arches/i],
  ["botanical-floral", /flower|floral|botanical|mushroom|fern|plant|leaf|leaves|tulip|rose/i],
  ["signs-typography", /typograph|sign\b|lettering|quote|laundry/i],
];

/** Suggest catalogue slugs from subjects (first match wins; admin can change it). */
export function guessCatalogs(subjects, name = "") {
  const text = [...subjects, name].join(" ");
  for (const [slug, re] of CATALOG_RULES) if (re.test(subjects.join(" "))) return [slug];
  for (const [slug, re] of CATALOG_RULES) if (re.test(text)) return [slug];
  return [];
}

/**
 * Returns { title, tags, description, attributes, rooms, styles, subjects, colors,
 *           orientation, price, alts: { "1": "..." }, pins: [{ title, description }], aiDisclosure }
 */
export function parseListing(markdown) {
  const md = String(markdown || "").replace(/\r\n?/g, "\n");
  const cut = md.search(SELLER_NOTES);
  const safe = cut >= 0 ? md.slice(0, cut) : md;
  const secs = sections(safe);

  const title = firstFence(find(secs, "Title"));
  const tagsLine = firstFence(find(secs, "Tags"));
  const tags = tagsLine
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const description = firstFence(find(secs, "Description"));

  const attributes = {};
  for (const [k, v] of table(find(secs, "Category"))) if (k) attributes[k] = v;
  const attr = (...names) => {
    for (const n of names) {
      const key = Object.keys(attributes).find((k) => k.toLowerCase() === n.toLowerCase());
      if (key) return attributes[key];
    }
    return "";
  };

  const priceMatch = find(secs, "Recommended price").match(/regular price:\s*\$?\s*([\d.,]+)/i);
  const price = priceMatch ? priceMatch[1].replace(/[.,]$/, "") : "";

  const alts = {};
  for (const [img, alt] of table(find(secs, "Main mockup alt text"))) {
    const m = img.match(/(\d{1,3})\.(?:jpe?g|png)/i);
    if (m && alt) alts[String(Number(m[1]))] = alt;
  }

  const pins = [];
  const pinBody = find(secs, "Pinterest");
  for (const chunk of pinBody.split(/^###\s+/m).slice(1)) {
    const t = chunk.match(/\*\*Title:\*\*\s*(.+)/);
    const d = chunk.match(/\*\*Description:\*\*\s*(.+)/);
    if (t || d) pins.push({ title: t ? t[1].trim() : "", description: d ? d[1].trim() : "" });
  }

  const subjects = list(attr("Subject(s)", "Subjects", "Subject"));
  return {
    title,
    tags,
    description,
    attributes,
    rooms: list(attr("Room(s)", "Rooms", "Room")),
    styles: list(attr("Style(s)", "Styles", "Style")),
    subjects,
    colors: [attr("Primary colour", "Primary color"), attr("Secondary colour", "Secondary color")].filter(Boolean),
    orientation: orientation(attr("Orientation")),
    price,
    alts,
    pins,
    aiDisclosure: /AI-assisted|AI generator/i.test(description + attr("AI disclosure")),
  };
}
