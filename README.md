# Subtle Sway

subtlesway.com: a catalogue of Subtle Sway printable wall art. Every product links to its Etsy listing, and nothing is sold on the site itself.

The site is plain static HTML generated from JSON and hosted on GitHub Pages. It has no framework and no server.

## How it fits together

| Path | What it is |
|---|---|
| `data/settings.json` | Shop name, Etsy shop link, home page text, contact email |
| `data/catalogs.json` | Catalogues, which mirror the Etsy shop sections. Each catalogue has an optional Etsy section link |
| `data/products.json` | Published products only. Drafts never come into this public repo |
| `data/pages.json` | About, FAQ, Contact, Privacy, Terms and Disclaimer texts, in simple markdown |
| `media/products/<slug>/` | Mockup images as WebP at 640/1080/1600 px plus a 1600 px JPG, and the mockup video |
| `scripts/build.mjs` | Generates every HTML page, `sitemap.xml` and `robots.txt` from `data/` |
| `assets/` | Stylesheet, small scripts, self-hosted fonts, and the shared Etsy-link and text helpers |
| `.github/workflows/build.yml` | On every push to `data/`, `scripts/` or `assets/`, runs the tests, rebuilds the pages and commits them |

The generated files are `index.html`, `products/`, `about/`, `faq/`, `contact/`, `privacy/`, `terms/`, `disclaimer/`, `404.html`, `sitemap.xml`, `robots.txt` and the old `*.html` redirect stubs. Never edit them by hand.

## Commands

```bash
npm test          # unit tests
npm run build     # regenerate the pages
npm run dev       # build, then serve at http://localhost:8080
```

Building requires Node 20 or newer. The build and the tests have no npm dependencies.

## Rules the code enforces

- A product is written to the site only when it has a valid Etsy listing link on this shop (`assets/js/lib/etsy-url.js`).
- Etsy links use the Share & Save form `https://<shop>.etsy.com/listing/<id>/…`, with tracking parameters stripped.
- Prices are never shown on the site, because Etsy is the single source of truth for prices.
- The site has no cookies and no third-party scripts or fonts.
