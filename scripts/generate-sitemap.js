/* ============================================================
   Subtle Sway — sitemap generator
   Rebuilds sitemap.xml from posts.json and products.json so the
   sitemap never goes stale when articles or products change.
   Run locally with:  node scripts/generate-sitemap.js
   Also runs automatically via .github/workflows/sitemap.yml
   ============================================================ */

var fs = require("fs");
var path = require("path");

var BASE = "https://subtlesway.com/";
var root = path.join(__dirname, "..");

var posts = JSON.parse(fs.readFileSync(path.join(root, "posts.json"), "utf8"));
var products = JSON.parse(fs.readFileSync(path.join(root, "products.json"), "utf8"));
var today = new Date().toISOString().slice(0, 10);

// XML-escape a URL or value.
function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

var urls = [];
function add(loc, lastmod, priority) {
  urls.push({ loc: loc, lastmod: lastmod, priority: priority });
}

// Public pages. admin.html, go.html and 404.html are left out on purpose —
// they are disallowed in robots.txt.
add(BASE, today, "1.0");
add(BASE + "shop.html", today, "0.9");
add(BASE + "blog.html", today, "0.9");
add(BASE + "about.html", today, "0.5");
add(BASE + "contact.html", today, "0.4");
add(BASE + "disclosure.html", today, "0.3");
add(BASE + "privacy.html", today, "0.3");

// Articles, newest first; each keeps its own publish date as lastmod.
posts
  .slice()
  .sort(function (a, b) { return a.date < b.date ? 1 : -1; })
  .forEach(function (post) {
    if (!post.slug) return;
    add(BASE + "post.html?slug=" + encodeURIComponent(post.slug), post.date || today, "0.8");
  });

// Products.
products.forEach(function (product) {
  if (!product.slug) return;
  add(BASE + "product.html?slug=" + encodeURIComponent(product.slug), today, "0.7");
});

var xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
urls.forEach(function (u) {
  xml += "  <url>\n";
  xml += "    <loc>" + esc(u.loc) + "</loc>\n";
  xml += "    <lastmod>" + u.lastmod + "</lastmod>\n";
  xml += "    <priority>" + u.priority + "</priority>\n";
  xml += "  </url>\n";
});
xml += "</urlset>\n";

fs.writeFileSync(path.join(root, "sitemap.xml"), xml);
console.log(
  "sitemap.xml written — " + urls.length + " URLs " +
  "(7 pages + " + posts.length + " articles + " + products.length + " products)"
);
