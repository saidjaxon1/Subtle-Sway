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
  // A timestamp query skips browser/CDN caches, so content saved in the
  // admin panel shows up immediately instead of minutes later.
  function loadJSON(path) {
    return fetch(path + "?v=" + Date.now()).then(function (response) {
      if (!response.ok) throw new Error("HTTP " + response.status + " for " + path);
      return response.json();
    });
  }

  // Normalised comparison key: category matching must survive stray
  // spaces and casing differences typed into the admin panel.
  function norm(value) {
    return (value || "").trim().toLowerCase();
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
  // Affiliate clicks open the go.html interstitial in a new tab (which
  // discloses the relationship and offers a "Go to Amazon" button); the
  // site's own products link straight out.
  function outboundHref(product, url) {
    return isOwnProduct(product) ? url : "./go.html?to=" + encodeURIComponent(url);
  }

  function buyButton(product) {
    return el(
      "a",
      {
        class: "btn",
        href: outboundHref(product, product.affiliateLink),
        target: "_blank",
        rel: isOwnProduct(product) ? "noopener" : "sponsored noopener"
      },
      ["Buy Now"]
    );
  }

  // Secondary "Different Colors" / "Different Sizes" button — only shown
  // when the product provides that link.
  function variantButton(product, label, url) {
    return el(
      "a",
      {
        class: "btn-secondary",
        href: outboundHref(product, url),
        target: "_blank",
        rel: isOwnProduct(product) ? "noopener" : "sponsored noopener"
      },
      [label]
    );
  }

  // Quiet affiliate disclosure next to Buy Now buttons.
  // Own products get no note at all.
  function affiliateNote(product, short) {
    if (isOwnProduct(product)) return null;
    var text = short
      ? "Affiliate link — we may earn a commission."
      : "As an affiliate partner, we may earn a commission when you buy through this link.";
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
  // Posts without a cover photo get a clean typographic card instead
  // of a broken image.
  function postCard(post) {
    var hasCover = !!(post.cover || "").trim();
    return el("li", { class: "post-card" + (hasCover ? "" : " no-cover") }, [
      el("a", { href: "./post.html?slug=" + encodeURIComponent(post.slug) }, [
        hasCover
          ? el("figure", null, [
              el("img", { src: post.cover, alt: post.title, loading: "lazy" })
            ])
          : null,
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

  // True when the query appears in any of the given strings.
  function matchesQuery(query, parts) {
    var q = norm(query);
    if (!q) return true;
    return parts.some(function (part) { return norm(part).indexOf(q) !== -1; });
  }

  /* ---------- Contact details (edited from the admin panel) ---------- */

  // Normalise links, converting the legacy pinterest/instagram fields
  // into the flexible {label, url} list so older data still works.
  function contactLinks(c) {
    if (Array.isArray(c.links)) {
      return c.links.filter(function (l) { return l && l.url; })
        .map(function (l) { return { label: (l.label || "Link"), url: l.url }; });
    }
    var out = [];
    if (c.pinterest) out.push({ label: "Pinterest", url: c.pinterest });
    if (c.instagram) out.push({ label: "Instagram", url: c.instagram });
    return out;
  }

  function initFooterContact() {
    var slot = document.getElementById("footer-contact");
    if (!slot) return;
    loadJSON("./site.json")
      .then(function (site) {
        var c = (site && site.contact) || {};
        if (!c.email && !c.text && !contactLinks(c).length) return;
        slot.hidden = false;
        // Goes to the Contact page, never straight to a mail client.
        slot.appendChild(el("div", { class: "contact-actions" }, [
          el("a", { class: "contact-btn", href: "./contact.html" }, ["Contact Us"])
        ]));
      })
      .catch(function () { /* footer simply stays without a contact line */ });
  }

  /* ---------- Page: contact ---------- */

  function initContact() {
    var slot = document.getElementById("contact-body");
    loadJSON("./site.json")
      .then(function (site) {
        var c = (site && site.contact) || {};
        var wrap = el("div", { class: "contact-page" });

        if (c.text) wrap.appendChild(el("p", { class: "contact-intro" }, [c.text]));

        if (c.email) {
          wrap.appendChild(el("div", { class: "contact-line" }, [
            el("span", { class: "eyebrow" }, ["Email"]),
            // Shown as selectable text — no mailto, so nothing auto-opens.
            el("span", { class: "contact-email" }, [c.email])
          ]));
        }

        var links = contactLinks(c);
        if (links.length) {
          var actions = el("div", { class: "contact-actions" });
          links.forEach(function (link) {
            actions.appendChild(el("a", { class: "contact-btn", href: link.url, target: "_blank", rel: "noopener" }, [link.label]));
          });
          wrap.appendChild(actions);
        }

        if (!c.email && !c.text && !links.length) {
          wrap.appendChild(el("p", { class: "contact-intro" }, ["Contact details are coming soon."]));
        }

        slot.appendChild(wrap);
      })
      .catch(function () {
        slot.appendChild(el("p", { class: "contact-intro" }, ["We couldn't load the contact details just now. Please try again in a moment."]));
      });
  }

  /* ---------- Page: go (affiliate interstitial) ---------- */

  function initGo() {
    var slot = document.getElementById("go-body");
    var to = getParam("to") || "";
    // Only ever follow http(s) destinations — never javascript: or data:.
    var safe = /^https?:\/\//i.test(to);
    var isAmazon = /(^|\.)amazon\.|amzn\./i.test(to);
    var store = isAmazon ? "Amazon" : "the store";

    document.title = "Heading out — " + SITE_NAME;

    if (!safe) {
      slot.appendChild(el("div", { class: "status" }, [
        el("h2", null, ["This link isn't available"]),
        el("p", null, ["Please head back and try again."]),
        el("a", { class: "text-link", href: "./shop.html" }, ["Back to the shop"])
      ]));
      return;
    }

    slot.appendChild(el("span", { class: "eyebrow" }, ["A quick note before you go"]));
    slot.appendChild(el("h1", { class: "page-title" }, ["You're on your way to " + store]));
    slot.appendChild(el("p", { class: "go-message" }, [
      "When you visit " + store + " through our link, we may earn a commission on anything you buy there within the next 24 hours — " +
      "whether it's this piece, a different size or colour, or something else entirely. You don't have to buy this exact item. " +
      "Shopping this way directly supports the site."
    ]));
    slot.appendChild(el("div", { class: "go-actions" }, [
      el("a", { class: "btn", href: to, rel: "nofollow sponsored noopener" }, [isAmazon ? "Go to Amazon" : "Continue to the store"]),
      el("a", { class: "text-link", href: "./index.html" }, ["Back to Subtle Sway"])
    ]));
  }

  /* ---------- Reading progress line (article pages) ---------- */

  function initReadingProgress() {
    var bar = el("div", { class: "read-progress", "aria-hidden": "true" });
    document.body.appendChild(bar);
    function update() {
      var doc = document.documentElement;
      var max = doc.scrollHeight - doc.clientHeight;
      var ratio = max > 0 ? doc.scrollTop / max : 0;
      bar.style.transform = "scaleX(" + Math.min(1, Math.max(0, ratio)) + ")";
    }
    window.addEventListener("scroll", update, { passive: true });
    update();
  }

  // Ordered list of unique display values, deduplicated case- and
  // whitespace-insensitively (first spelling seen wins).
  function uniqueValues(items, pick) {
    var seen = {};
    var out = [];
    items.forEach(function (item) {
      var raw = (pick(item) || "").trim();
      if (!raw) return;
      var key = raw.toLowerCase();
      if (!seen[key]) {
        seen[key] = true;
        out.push(raw);
      }
    });
    return out;
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

  /* ---------- Related-content strips (shared) ---------- */

  // A small linked section: eyebrow + heading + a grid of cards.
  function relatedSection(eyebrow, heading, listClass, cards) {
    if (!cards.length) return null;
    return el("section", { class: "related-section" }, [
      el("div", { class: "section-head" }, [
        el("div", null, [
          el("span", { class: "eyebrow" }, [eyebrow]),
          el("h2", null, [heading])
        ])
      ]),
      el("ul", { class: listClass }, cards)
    ]);
  }

  function postsInCategory(posts, category, excludeSlug, limit) {
    return sortNewestFirst(posts)
      .filter(function (p) {
        return (!category || norm(p.category) === norm(category)) && p.slug !== excludeSlug;
      })
      .slice(0, limit);
  }

  function productsInCategory(products, category, excludeSlug, limit) {
    return products
      .filter(function (p) {
        return (!category || norm(p.category) === norm(category)) && p.slug !== excludeSlug;
      })
      .slice(0, limit);
  }

  /* ---------- Page: home (landing) ---------- */

  function initHome() {
    initReveal();

    Promise.all([loadJSON("./products.json"), loadJSON("./posts.json")])
      .then(function (results) {
        var products = results[0];
        var posts = results[1];

        // Latest three journal cards.
        var list = document.getElementById("journal-preview");
        sortNewestFirst(posts).slice(0, 3).forEach(function (post) {
          list.appendChild(postCard(post));
        });

        // Shop-by-category cards: one per top-level category, using the
        // first product in that category as the card image.
        var categoryGrid = document.getElementById("category-grid");
        uniqueValues(products, function (p) { return p.category; }).forEach(function (category, index) {
          var inCategory = products.filter(function (p) { return norm(p.category) === norm(category); });
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

        initHomeSearch(products, posts);
      })
      .catch(function (error) {
        console.error(error);
        showLoadError(document.querySelector("main"));
      });
  }

  // Live site-wide search on the home page: a dropdown of matching
  // products and articles that links straight to each page.
  function initHomeSearch(products, posts) {
    var input = document.getElementById("home-search");
    var panel = document.getElementById("home-search-results");
    if (!input || !panel) return;

    var sortedPosts = sortNewestFirst(posts);

    function resultLink(href, thumb, title, tag) {
      return el("a", { class: "search-result", href: href }, [
        thumb ? el("img", { src: thumb, alt: "", loading: "lazy" }) : el("span", { class: "search-thumb-empty" }),
        el("span", { class: "search-result-title" }, [title]),
        el("span", { class: "search-result-tag" }, [tag])
      ]);
    }

    function render() {
      var q = norm(input.value);
      panel.textContent = "";
      if (!q) { panel.hidden = true; return; }

      var prod = products.filter(function (p) {
        return matchesQuery(q, [p.name, p.category, p.subcategory, p.description]);
      }).slice(0, 4);
      var arts = sortedPosts.filter(function (p) {
        var blockText = (p.content || []).map(function (b) { return b.text || ""; }).join(" ");
        return matchesQuery(q, [p.title, p.excerpt, p.category, p.subcategory, blockText]);
      }).slice(0, 4);

      if (!prod.length && !arts.length) {
        panel.appendChild(el("p", { class: "search-empty" }, ["No matches for “" + input.value.trim() + "”."]));
        panel.hidden = false;
        return;
      }

      if (prod.length) {
        panel.appendChild(el("span", { class: "search-group" }, ["Products"]));
        prod.forEach(function (p) {
          panel.appendChild(resultLink(
            "./product.html?slug=" + encodeURIComponent(p.slug),
            p.image, p.name, p.category || "Shop"
          ));
        });
      }
      if (arts.length) {
        panel.appendChild(el("span", { class: "search-group" }, ["Journal"]));
        arts.forEach(function (p) {
          panel.appendChild(resultLink(
            "./post.html?slug=" + encodeURIComponent(p.slug),
            p.cover, p.title, p.category || "Journal"
          ));
        });
      }
      panel.hidden = false;
    }

    input.addEventListener("input", render);
    input.addEventListener("focus", render);
    // Close the dropdown on Escape or when clicking away.
    input.addEventListener("keydown", function (e) { if (e.key === "Escape") { panel.hidden = true; input.blur(); } });
    document.addEventListener("click", function (e) {
      if (!panel.contains(e.target) && e.target !== input) panel.hidden = true;
    });
  }

  /* ---------- Page: shop (grid with two-level category filter) ---------- */

  function initShop() {
    var grid = document.getElementById("product-grid");
    var catRow = document.getElementById("category-row");
    var subRow = document.getElementById("subcategory-row");
    var searchInput = document.getElementById("product-search");
    var relatedSlot = el("div");
    document.querySelector("main").appendChild(relatedSlot);

    Promise.all([loadJSON("./products.json"), loadJSON("./posts.json").catch(function () { return []; })])
      .then(function (results) {
        var products = results[0];
        var allPosts = results[1];
        var categories = uniqueValues(products, function (p) { return p.category; });

        // Resolve a raw value (e.g. from the URL) to its canonical spelling.
        function canonical(list, value) {
          if (!value) return null;
          return list.find(function (item) { return norm(item) === norm(value); }) || null;
        }

        var state = {
          category: canonical(categories, getParam("category")),
          sub: getParam("sub"),
          query: ""
        };

        if (searchInput) {
          searchInput.addEventListener("input", function () {
            state.query = searchInput.value;
            render();
          });
        }

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
            ? products.filter(function (p) { return norm(p.category) === norm(state.category); })
            : products;
          var subs = state.category
            ? uniqueValues(inCategory, function (p) { return p.subcategory; })
            : [];

          subRow.textContent = "";
          subRow.hidden = !state.category || subs.length === 0;
          if (!subRow.hidden) {
            state.sub = canonical(subs, state.sub);
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

          // The grid itself: category filter, then subcategory, then search.
          grid.textContent = "";
          var visible = inCategory.filter(function (p) {
            return (!state.sub || norm(p.subcategory) === norm(state.sub)) &&
              matchesQuery(state.query, [p.name, p.description, p.category, p.subcategory]);
          });
          if (!visible.length) {
            grid.appendChild(el("li", { class: "grid-empty" }, [
              norm(state.query) ? "Nothing matches that search." : "Nothing in this category yet."
            ]));
          } else {
            visible.forEach(function (product) {
              grid.appendChild(productCard(product));
            });
          }

          // Reading suggestions that follow the chosen category.
          relatedSlot.textContent = "";
          var section = relatedSection(
            "The Journal",
            state.category ? "Notes on " + state.category : "From the journal",
            "related-journal",
            postsInCategory(allPosts, state.category, null, 3).map(postCard)
          );
          if (section) relatedSlot.appendChild(section);
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

    Promise.all([loadJSON("./products.json"), loadJSON("./posts.json").catch(function () { return []; })])
      .then(function (results) {
        var products = results[0];
        var allPosts = results[1];
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

        // Actions: optional Different Colors / Different Sizes buttons
        // above the primary Buy Now button.
        var actions = el("div", { class: "product-actions" });
        var variants = el("div", { class: "variant-links" });
        if ((product.colorsLink || "").trim()) variants.appendChild(variantButton(product, "Different Colors", product.colorsLink));
        if ((product.sizesLink || "").trim()) variants.appendChild(variantButton(product, "Different Sizes", product.sizesLink));
        if (variants.children.length) actions.appendChild(variants);
        actions.appendChild(buyButton(product));
        info.appendChild(actions);

        var note = affiliateNote(product, false);
        if (note) info.appendChild(note);

        // Main photo plus any extra photos, stacked in a quiet column.
        var media = el("div", { class: "media" }, [
          el("figure", null, [
            el("img", { src: product.image, alt: product.name })
          ])
        ]);
        (product.images || []).forEach(function (src) {
          if (!(src || "").trim()) return;
          media.appendChild(el("figure", null, [
            el("img", { src: src, alt: product.name, loading: "lazy" })
          ]));
        });

        main.textContent = "";
        main.appendChild(
          el("article", { class: "product-detail" }, [media, info])
        );

        // Below the product: more pieces from the same category, then
        // journal notes about it.
        var moreSection = relatedSection(
          "The Shop",
          "You may also like",
          "product-grid",
          productsInCategory(products, product.category, product.slug, 3).map(productCard)
        );
        if (moreSection) main.appendChild(moreSection);

        var notesSection = relatedSection(
          "The Journal",
          product.category ? "Notes on " + product.category : "From the journal",
          "related-journal",
          postsInCategory(allPosts, product.category, null, 3).map(postCard)
        );
        if (notesSection) main.appendChild(notesSection);
      })
      .catch(function (error) {
        console.error(error);
        showLoadError(main);
      });
  }

  /* ---------- Page: blog list ---------- */

  function initBlog() {
    var list = document.getElementById("blog-list");
    var catRow = document.getElementById("post-category-row");
    var subRow = document.getElementById("post-subcategory-row");
    var searchInput = document.getElementById("post-search");
    var relatedSlot = el("div");
    document.querySelector("main").appendChild(relatedSlot);

    Promise.all([loadJSON("./posts.json"), loadJSON("./products.json").catch(function () { return []; })])
      .then(function (results) {
        var sorted = sortNewestFirst(results[0]);
        var allProducts = results[1];
        var categories = uniqueValues(sorted, function (p) { return p.category; });

        function canonical(listValues, value) {
          if (!value) return null;
          return listValues.find(function (item) { return norm(item) === norm(value); }) || null;
        }

        var state = {
          category: canonical(categories, getParam("category")),
          sub: getParam("sub"),
          query: ""
        };

        if (searchInput) {
          searchInput.addEventListener("input", function () {
            state.query = searchInput.value;
            render();
          });
        }

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
          history.replaceState(null, "", "./blog.html" + (query ? "?" + query : ""));
        }

        function render() {
          syncUrl();

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

          var inCategory = state.category
            ? sorted.filter(function (p) { return norm(p.category) === norm(state.category); })
            : sorted;
          var subs = state.category
            ? uniqueValues(inCategory, function (p) { return p.subcategory; })
            : [];

          subRow.textContent = "";
          subRow.hidden = !state.category || subs.length === 0;
          if (!subRow.hidden) {
            state.sub = canonical(subs, state.sub);
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

          list.textContent = "";
          var visible = inCategory.filter(function (post) {
            var blockText = (post.content || []).map(function (b) { return b.text || ""; }).join(" ");
            return (!state.sub || norm(post.subcategory) === norm(state.sub)) &&
              matchesQuery(state.query, [post.title, post.excerpt, blockText, post.category, post.subcategory]);
          });
          if (!visible.length) {
            list.appendChild(el("li", { class: "grid-empty" }, [
              norm(state.query) ? "Nothing matches that search." : "Nothing in this category yet."
            ]));
          } else {
            visible.forEach(function (post) { list.appendChild(postCard(post)); });
          }

          // Product suggestions that follow the chosen category.
          relatedSlot.textContent = "";
          var section = relatedSection(
            "The Shop",
            state.category ? "Shop " + state.category : "From the shop",
            "product-grid",
            productsInCategory(allProducts, state.category, null, 3).map(productCard)
          );
          if (section) relatedSlot.appendChild(section);
        }

        render();
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
          } else if (block.type === "gallery") {
            // Several photos side by side; two or three columns by count.
            var images = (block.images || []).filter(function (img) { return (img.src || "").trim(); });
            if (images.length) {
              body.appendChild(
                el("div", { class: "gallery cols-" + Math.min(images.length, 3) },
                  images.map(function (img) {
                    return el("figure", null, [
                      el("img", { src: img.src, alt: img.alt || "", loading: "lazy" })
                    ]);
                  }))
              );
            }
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
            // The cover is optional — articles read just as well without one.
            (post.cover || "").trim()
              ? el("figure", { class: "article-cover" }, [
                  el("img", { src: post.cover, alt: post.title })
                ])
              : null,
            body
          ])
        );

        // Below the article: products from the same category that the
        // article didn't already feature, then more reading.
        var embeddedSlugs = (post.content || [])
          .filter(function (b) { return b.type === "product"; })
          .map(function (b) { return b.slug; });
        var relatedProducts = products
          .filter(function (p) {
            return (!post.category || norm(p.category) === norm(post.category)) &&
              embeddedSlugs.indexOf(p.slug) === -1;
          })
          .slice(0, 3);
        var shopSection = relatedSection(
          "The Shop",
          post.category ? "Shop " + post.category : "Shop the edit",
          "product-grid",
          relatedProducts.map(productCard)
        );
        if (shopSection) main.appendChild(shopSection);

        var readingSection = relatedSection(
          "Keep reading",
          "More like this",
          "related-journal",
          postsInCategory(posts, post.category, post.slug, 3).map(postCard)
        );
        if (readingSection) main.appendChild(readingSection);

        initReadingProgress();
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
    post: initPost,
    contact: initContact,
    go: initGo
  }[page];

  document.addEventListener("DOMContentLoaded", function () {
    if (init) init();
    initFooterContact();
  });
})();
