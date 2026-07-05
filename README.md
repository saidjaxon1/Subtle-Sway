# Subtle Sway

A static website for Pinterest affiliate marketing with a blog. Pure HTML/CSS/vanilla JS — no build step, no frameworks. Hosted on GitHub Pages.

**You never need to touch HTML.** All content lives in two files:

- `products.json` — all products
- `posts.json` — all blog posts

---

## How to add a new product

1. Open `products.json`.
2. Copy one existing product object — everything from one `{` to its matching `},` — and paste it after the last product (add a comma after the previous `}` if needed).
3. Edit the values:

```json
{
  "slug": "my-new-lamp",
  "name": "My New Lamp",
  "price": "$129",
  "type": "physical",
  "source": "affiliate",
  "category": "Home Decor",
  "subcategory": "Lighting",
  "image": "https://link-to-the-product-photo.jpg",
  "affiliateLink": "https://your-affiliate-link-here",
  "description": "One short paragraph about the product.",
  "colors": ["#D8CFC0", "#5C594F", "#23211D"]
}
```

Rules:
- `slug` must be **unique** and use only lowercase letters, numbers, and dashes. It becomes the URL: `product.html?slug=my-new-lamp`.
- `type` is `"physical"`, `"digital"`, or `""`. If set, the product page shows a "Digital product" or "Physical product" tag (digital items also get a small "Digital" note on cards). If left `""`, no tag is shown.
- `source` is `"affiliate"` or `"own"`. Affiliate products show the disclosure line next to the Buy Now button; `"own"` (your own product) shows no affiliate wording anywhere and uses a plain link.
- `category` is the top-level group (e.g. `"Home Decor"`, `"Fashion"`, `"Digital"`). Categories become the filter tabs in the shop and the category cards on the home page — automatically, based on whatever categories your products use.
- `subcategory` is **optional** (e.g. `"Living Room"`, `"Lighting"`, `"T-Shirts"`). Subcategories become the second filter row inside a category, and the small label above the product name.
- `price` is **optional** plain text — write it exactly how you want it shown (e.g. `"$1,249"`), or leave it `""` to show the product without a price.
- `colors` is **optional** — 3–4 hex color codes shown as small circles on the product page. Use `[]` for none (e.g. digital products).

Save the file — the product appears in the shop (and its category in the filters) automatically.

## How to add a new blog post

1. Open `posts.json`.
2. Copy one existing post object and paste it after the last post (mind the comma between objects).
3. Edit the values:

```json
{
  "slug": "my-new-post",
  "title": "My New Post Title",
  "date": "2026-07-04",
  "cover": "https://link-to-cover-image.jpg",
  "excerpt": "One or two sentences shown in the blog list.",
  "content": [
    { "type": "paragraph", "text": "First paragraph of the post." },
    { "type": "heading", "text": "A section heading" },
    { "type": "paragraph", "text": "More text..." },
    { "type": "image", "src": "https://an-image.jpg", "alt": "Describe the image" },
    { "type": "product", "slug": "arden-sofa" }
  ]
}
```

Rules:
- `slug` must be **unique**, lowercase-with-dashes. URL becomes `post.html?slug=my-new-post`.
- `date` must be in `YYYY-MM-DD` format — the blog list sorts newest first by this date.
- `content` is a list of blocks rendered top to bottom. Four block types:
  - `paragraph` — a paragraph of text
  - `heading` — a section heading
  - `image` — an image with alt text
  - `product` — embeds a product card with a Buy Now button. The `slug` must match a product in `products.json` — the name, price, image, and affiliate link are pulled from there automatically.

Save the file — the post appears in the Journal automatically.

## Admin panel (edit the site from the browser)

Open `admin.html` on your live site (e.g. `https://your-domain/admin.html`). It lets you add, edit, and delete products and posts without touching any files — every save is committed to GitHub automatically and goes live in about a minute.

First-time setup (once per browser):

1. On GitHub go to **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. Repository access: **Only select repositories** → choose **Subtle-Sway**.
3. Permissions: **Contents → Read and write**. Generate the token and copy it.
4. Open `admin.html`, paste the token, press **Connect**.

The token is stored only in your browser (localStorage) — never on a server. Anyone else who opens `admin.html` sees only the connect screen and can change nothing without a valid token. Use **Disconnect** to remove the token from a shared computer. When the token expires, generate a new one the same way.

## Tips

- **Validate your JSON** after editing: paste the file into https://jsonlint.com. A missing comma or quote is the only thing that can break the site.
- Commas go **between** objects, never after the last one.

## Files

| File | Purpose |
|---|---|
| `products.json` / `posts.json` | **All content — the only files you edit** |
| `index.html` | Home — animated editorial landing page |
| `shop.html` | Shop (full product grid) |
| `product.html` | Product page template (`?slug=...`) |
| `blog.html` | Journal (blog list) |
| `post.html` | Post page template (`?slug=...`) |
| `style.css` | All styling |
| `main.js` | Loads the JSON and renders the pages |
| `admin.html` / `admin.js` / `admin.css` | Browser admin panel — edits the JSON via the GitHub API |
| `CNAME` | Your custom domain for GitHub Pages — replace `example.com` with your real domain |

## Running locally

Pages load content with `fetch`, so opening the files directly (`file://`) won't work. Run any static server from this folder, e.g.:

```
python -m http.server 8000
```

then open http://localhost:8000

## Deploying to GitHub Pages

1. Create a GitHub repository and push all files in this folder to it.
2. In the repo: **Settings → Pages → Source → Deploy from a branch**, pick `main` and `/ (root)`.
3. Done. All paths are relative, so the site works both at `username.github.io/repo/` and on a custom domain.
