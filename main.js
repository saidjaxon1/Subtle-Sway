/* ============================================================
   Subtle Sway — shared page logic
   Each page sets <body data-page="..."> and this script renders
   its content from ./products.json and ./posts.json.
   All text is inserted via textContent (never raw innerHTML),
   so JSON content can never inject markup.
   ============================================================ */

(function () {
  "use strict";

  var SITE_NAME = "Subtle Sway";

  /* ---------- Small helpers ---------- */

  // Create an element with attributes and children in one call.
  // Strings passed as children become text nodes (safe by construction).
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        node.setAttribute(key, attrs[key]);
      });
    }
    (children || []).forEach(function (child) {
      if (child === null || child === undefined) return;
      node.appendChild(
        typeof child === "string" ? document.createTextNode(child) : child
      );
    });
    return node;
  }

  // Fetch and parse a JSON file, throwing on any failure.
  function loadJSON(path) {
    return fetch(path).then(function (response) {
      if (!response.ok) throw new Error("HTTP " + response.status + " for " + path);
      return response.json();
    });
  }

  // Read a query-string parameter (e.g. ?slug=arden-sofa).
  function getParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  // "2026-07-01" -> "July 1, 2026" (falls back to the raw string).
  function formatDate(iso) {
    var date = new Date(iso + "T00:00:00");
    if (isNaN(date.getTime())) return iso;
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric"
    });
  }

  // Replace a container's contents with a friendly status message.
  function showStatus(container, title, message, withHomeLink) {
    container.textContent = "";
    var children = [
      el("h2", null, [title]),
      el("p", null, [message])
    ];
    if (withHomeLink) {
      children.push(el("a", { href: "./shop.html", class: "text-link" }, ["Back to the shop"]));
    }
    container.appendChild(el("div", { class: "status" }, children));
  }

  function showLoadError(container) {
    showStatus(
      container,
      "Something went quiet",
      "We couldn't load the content just now. Please refresh the page or try again in a moment.",
      true
    );
  }

  /* ---------- Product display helpers ---------- */

  function productType(product) {
    var type = (product.type || "").toLowerCase();
    return type === "digital" || type === "physical" ? type : "";
  }

  // "own" products are the site's own goods — no affiliate wording for them.
  function isOwnProduct(product) {
    return (product.source || "").toLowerCase() === "own";
  }

  // Small uppercase label above a product name.
  function eyebrowText(product) {
    return product.subcategory || product.category || "Objects";
  }

  // Price line on cards: price is optional; digital products carry a
  // small marker so the format is clear before clicking through.
  function priceLineText(product) {
    var parts = [];
    if (product.price) parts.push(product.price);
    if (productType(product) === "digital") parts.push("Digital");
    return parts.join(" · ");
  }

  /* ---------- Shared render pieces ---------- */

  // "Buy Now" button. Affiliate links carry nofollow/sponsored;
  // the site's own products get a plain link.
  function buyButton(product) {
    return el(
      "a",
      {
        class: "btn",
        href: product.affiliateLink,
        target: "_blank",
        rel: isOwnProduct(product) ? "noopener" : "nofollow sponsored noopener"
      },
      ["Buy Now"]
    );
  }

  // Quiet affiliate disclosure next to Buy Now buttons.
  // Own products get no note at all.
  function affiliateNote(product, short) {
    if (isOwnProduct(product)) return null;
    var text = short
      ? "Affiliate link — we may earn a commission."
      : "As an affiliate partner, we may earn a commission when you buy through this link — at no extra cost to you.";
    return el("p", { class: "affiliate-note" }, [text]);
  }

  // Type tag on the product page. Only rendered when a type is set:
  // digital -> "Digital product", physical -> "Physical product".
  function typeBadge(product) {
    var type = productType(product);
    if (!type) return null;
    return el(
      "span",
      { class: "badge-type " + type },
      [type === "digital" ? "Digital product" : "Physical product"]
    );
  }

  // Product card used by the shop grid and the home page.
  function productCard(product) {
    var priceLine = priceLineText(product);
    return el("li", { class: "product-card" }, [
      el("a", { href: "./product.html?slug=" + encodeURIComponent(product.slug) }, [
        el("figure", null, [
          el("img", { src: product.image, alt: product.name, loading: "lazy" })
        ]),
        el("span", { class: "eyebrow" }, [eyebrowText(product)]),
        el("h2", null, [product.name]),
        priceLine ? el("span", { class: "price" }, [priceLine]) : null
      ])
    ]);
  }

  // Compact product card embedded inside a blog post.
  function embeddedProductCard(product) {
    var metaParts = [];
    if (product.price) metaParts.push(product.price);
    if (productType(product) === "digital") metaParts.push("Digital product");
    return el("aside", { class: "embed-product" }, [
      el("figure", null, [
        el("img", { src: product.image, alt: product.name, loading: "lazy" })
      ]),
      el("div", null, [
        el("span", { class: "eyebrow" }, ["Featured piece"]),
        el("h3", null, [
          el("a", { href: "./product.html?slug=" + encodeURIComponent(product.slug) }, [product.name])
        ]),
        metaParts.length ? el("span", { class: "price" }, [metaParts.join(" · ")]) : null,
        buyButton(product),
        affiliateNote(product, true)
      ])
    ]);
  }

  // Journal card used by the blog list and the home page preview.
  function postCard(post) {
    return el("li", { class: "post-card" }, [
      el("a", { href: "./post.html?slug=" + encodeURIComponent(post.slug) }, [
        el("figure", null, [
          el("img", { src: post.cover, alt: post.title, loading: "lazy" })
        ]),
        el("span", { class: "eyebrow" }, [formatDate(post.date)]),
        el("h2", null, [post.title]),
        el("p", { class: "excerpt" }, [post.excerpt])
      ])
    ]);
  }

  function sortNewestFirst(posts) {
    // ISO dates sort correctly as strings.
    return posts.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  }

  // Ordered list of unique values, preserving JSON order.
  function uniqueValues(items, pick) {
    var seen = [];
    items.forEach(function (item) {
      var value = pick(item);
      if (value && seen.indexOf(value) === -1) seen.push(value);
    });
    return seen;
  }

  /* ---------- Scroll reveal (home page) ---------- */

  function initReveal() {
    var targets = Array.prototype.slice.call(document.querySelectorAll(".reveal"));
    if (!targets.length) return;

    function showAll() {
      targets.forEach(function (target) { target.classList.add("visible"); });
    }

    if (!("IntersectionObserver" in window)) { showAll(); return; }

    var observerReported = false;
    var observer = new IntersectionObserver(function (entries) {
      observerReported = true;
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    targets.forEach(function (target) { observer.observe(target); });

    // Safety net: the observer normally reports immediately for every
    // observed element. If it stays silent (throttled embeds, odd browsers),
    // reveal everything rather than leaving sections hidden.
    setTimeout(function () {
      if (!observerReported) {
        observer.disconnect();
        showAll();
      }
    }, 2000);
  }

  /* ---------- Page: home (landing) ---------- */

  function initHome() {
    initReveal();

    loadJSON("./products.json")
      .then(function (products) {
        // Shop-by-category cards: one per top-level category, using the
        // first product in that category as the card image.
        var categoryGrid = document.getElementById("category-grid");
        uniqueValues(products, function (p) { return p.category; }).forEach(function (category, index) {
          var inCategory = products.filter(function (p) { return p.category === category; });
          var count = inCategory.length;
          categoryGrid.appendChild(
            el("li", { class: "category-card" }, [
              el("a", { href: "./shop.html?category=" + encodeURIComponent(category) }, [
                el("span", { class: "num", "aria-hidden": "true" }, ["0" + (index + 1)]),
                el("figure", null, [
                  el("img", { src: inCategory[0].image, alt: category, loading: "lazy" })
                ]),
                el("h3", null, [category]),
                el("span", { class: "count" }, [count + (count === 1 ? " piece" : " pieces")])
              ])
            ])
          );
        });

        var featured = document.getElementById("featured-grid");
        products.slice(0, 3).forEach(function (product) {
          featured.appendChild(productCard(product));
        });
      })
      .catch(function (error) { console.error(error); });

    loadJSON("./posts.json")
      .then(function (posts) {
        var list = document.getElementById("journal-preview");
        sortNewestFirst(posts).slice(0, 2).forEach(function (post) {
          list.appendChild(postCard(post));
        });
      })
      .catch(function (error) { console.error(error); });
  }

  /* ---------- Page: shop (grid with two-level category filter) ---------- */

  function initShop() {
    var grid = document.getElementById("product-grid");
    var catRow = document.getElementById("category-row");
    var subRow = document.getElementById("subcategory-row");

    loadJSON("./products.json")
      .then(function (products) {
        var categories = uniqueValues(products, function (p) { return p.category; });
        var state = {
          category: getParam("category"),
          sub: getParam("sub")
        };
        // Ignore unknown URL values so a stale link can't break the page.
        if (categories.indexOf(state.category) === -1) state.category = null;

        function chip(label, pressed, onClick) {
          var button = el("button", { class: "chip", type: "button", "aria-pressed": String(pressed) }, [label]);
          button.addEventListener("click", onClick);
          return button;
        }

        function syncUrl() {
          var params = new URLSearchParams();
          if (state.category) params.set("category", state.category);
          if (state.sub) params.set("sub", state.sub);
          var query = params.toString();
          history.replaceState(null, "", "./shop.html" + (query ? "?" + query : ""));
        }

        function render() {
          syncUrl();

          // Top-level category chips.
          catRow.textContent = "";
          catRow.appendChild(chip("All", !state.category, function () {
            state.category = null;
            state.sub = null;
            render();
          }));
          categories.forEach(function (category) {
            catRow.appendChild(chip(category, state.category === category, function () {
              state.category = category;
              state.sub = null;
              render();
            }));
          });

          // Subcategory chips — shown for every chosen category, starting
          // with an "All <category>" chip.
          var inCategory = state.category
            ? products.filter(function (p) { return p.category === state.category; })
            : products;
          var subs = state.category
            ? uniqueValues(inCategory, function (p) { return p.subcategory; })
            : [];

          subRow.textContent = "";
          subRow.hidden = !state.category || subs.length === 0;
          if (!subRow.hidden) {
            if (subs.indexOf(state.sub) === -1) state.sub = null;
            subRow.appendChild(chip("All " + state.category, !state.sub, function () {
              state.sub = null;
              render();
            }));
            subs.forEach(function (sub) {
              subRow.appendChild(chip(sub, state.sub === sub, function () {
                state.sub = sub;
                render();
              }));
            });
          } else {
            state.sub = null;
          }

          // The grid itself.
          grid.textContent = "";
          var visible = inCategory.filter(function (p) {
            return !state.sub || p.subcategory === state.sub;
          });
          if (!visible.length) {
            grid.appendChild(el("li", { class: "grid-empty" }, ["Nothing in this category yet."]));
            return;
          }
          visible.forEach(function (product) {
            grid.appendChild(productCard(product));
          });
        }

        render();
      })
      .catch(function (error) {
        console.error(error);
        showLoadError(document.querySelector("main"));
      });
  }

  /* ---------- Page: single product ---------- */

  function initProduct() {
    var main = document.querySelector("main");
    var slug = getParam("slug");

    loadJSON("./products.json")
      .then(function (products) {
        var product = products.find(function (p) { return p.slug === slug; });

        if (!product) {
          document.title = "Product not found — " + SITE_NAME;
          showStatus(
            main,
            "Product not found",
            "We couldn't find that piece. It may have been moved or retired.",
            true
          );
          return;
        }

        document.title = product.name + " — " + SITE_NAME;

        var info = el("div", { class: "info" }, [
          el("span", { class: "eyebrow" }, [eyebrowText(product)]),
          el("h1", null, [product.name]),
          product.price ? el("span", { class: "price" }, [product.price]) : null,
          typeBadge(product),
          el("p", { class: "description" }, [product.description])
        ]);

        // Colour swatches only when the product defines colours.
        if (product.colors && product.colors.length) {
          info.appendChild(el("div", { class: "swatches" }, [
            el("span", { class: "eyebrow" }, ["Colourways"]),
            el(
              "div",
              { class: "swatch-row" },
              product.colors.map(function (hex) {
                var swatch = el("span", {
                  class: "swatch",
                  role: "img",
                  "aria-label": "Colour " + hex
                });
                swatch.style.backgroundColor = hex;
                return swatch;
              })
            )
          ]));
        }

        info.appendChild(buyButton(product));
        var note = affiliateNote(product, false);
        if (note) info.appendChild(note);

        main.textContent = "";
        main.appendChild(
          el("article", { class: "product-detail" }, [
            el("figure", null, [
              el("img", { src: product.image, alt: product.name })
            ]),
            info
          ])
        );
      })
      .catch(function (error) {
        console.error(error);
        showLoadError(main);
      });
  }

  /* ---------- Page: blog list ---------- */

  function initBlog() {
    var list = document.getElementById("blog-list");
    loadJSON("./posts.json")
      .then(function (posts) {
        sortNewestFirst(posts).forEach(function (post) {
          list.appendChild(postCard(post));
        });
      })
      .catch(function (error) {
        console.error(error);
        showLoadError(document.querySelector("main"));
      });
  }

  /* ---------- Page: single post ---------- */

  function initPost() {
    var main = document.querySelector("main");
    var slug = getParam("slug");

    // Products are loaded too so "product" blocks always show live data.
    Promise.all([loadJSON("./posts.json"), loadJSON("./products.json")])
      .then(function (results) {
        var posts = results[0];
        var products = results[1];
        var post = posts.find(function (p) { return p.slug === slug; });

        if (!post) {
          document.title = "Post not found — " + SITE_NAME;
          showStatus(
            main,
            "Post not found",
            "We couldn't find that story. It may have been moved or unpublished.",
            true
          );
          return;
        }

        document.title = post.title + " — " + SITE_NAME;

        var body = el("div", { class: "article-body" });
        (post.content || []).forEach(function (block) {
          if (block.type === "paragraph") {
            body.appendChild(el("p", null, [block.text]));
          } else if (block.type === "heading") {
            body.appendChild(el("h2", null, [block.text]));
          } else if (block.type === "image") {
            body.appendChild(
              el("figure", null, [
                el("img", { src: block.src, alt: block.alt || "", loading: "lazy" })
              ])
            );
          } else if (block.type === "product") {
            var product = products.find(function (p) { return p.slug === block.slug; });
            if (product) body.appendChild(embeddedProductCard(product));
            // Unknown product slugs are skipped silently rather than breaking the post.
          }
        });

        main.textContent = "";
        main.appendChild(
          el("article", { class: "article" }, [
            el("header", { class: "article-header" }, [
              el("span", { class: "eyebrow" }, [formatDate(post.date)]),
              el("h1", null, [post.title])
            ]),
            el("figure", { class: "article-cover" }, [
              el("img", { src: post.cover, alt: post.title })
            ]),
            body
          ])
        );
      })
      .catch(function (error) {
        console.error(error);
        showLoadError(main);
      });
  }

  /* ---------- Boot ---------- */

  var page = document.body.getAttribute("data-page");
  var init = {
    home: initHome,
    shop: initShop,
    product: initProduct,
    blog: initBlog,
    post: initPost
  }[page];

  if (init) {
    document.addEventListener("DOMContentLoaded", init);
  }
})();
