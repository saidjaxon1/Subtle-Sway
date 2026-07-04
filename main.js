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
      children.push(el("a", { href: "./index.html", class: "text-link" }, ["Back to the shop"]));
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

  /* ---------- Shared render pieces ---------- */

  // "Buy Now" affiliate button (new tab, nofollow sponsored).
  function buyButton(product) {
    return el(
      "a",
      {
        class: "btn",
        href: product.affiliateLink,
        target: "_blank",
        rel: "nofollow sponsored noopener"
      },
      ["Buy Now"]
    );
  }

  // Compact product card embedded inside a blog post.
  function embeddedProductCard(product) {
    return el("aside", { class: "embed-product" }, [
      el("figure", null, [
        el("img", { src: product.image, alt: product.name, loading: "lazy" })
      ]),
      el("div", null, [
        el("span", { class: "eyebrow" }, ["Featured piece"]),
        el("h3", null, [
          el("a", { href: "./product.html?slug=" + encodeURIComponent(product.slug) }, [product.name])
        ]),
        el("span", { class: "price" }, [product.price]),
        buyButton(product)
      ])
    ]);
  }

  /* ---------- Page: home (product grid) ---------- */

  function initHome() {
    var grid = document.getElementById("product-grid");
    loadJSON("./products.json")
      .then(function (products) {
        products.forEach(function (product) {
          grid.appendChild(
            el("li", { class: "product-card" }, [
              el("a", { href: "./product.html?slug=" + encodeURIComponent(product.slug) }, [
                el("figure", null, [
                  el("img", { src: product.image, alt: product.name, loading: "lazy" })
                ]),
                el("span", { class: "eyebrow" }, ["Interior"]),
                el("h2", null, [product.name]),
                el("span", { class: "price" }, [product.price])
              ])
            ])
          );
        });
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
        main.textContent = "";
        main.appendChild(
          el("article", { class: "product-detail" }, [
            el("figure", null, [
              el("img", { src: product.image, alt: product.name })
            ]),
            el("div", { class: "info" }, [
              el("span", { class: "eyebrow" }, ["Interior"]),
              el("h1", null, [product.name]),
              el("span", { class: "price" }, [product.price]),
              el("p", { class: "description" }, [product.description]),
              el("div", { class: "swatches" }, [
                el("span", { class: "eyebrow" }, ["Colourways"]),
                el(
                  "div",
                  { class: "swatch-row" },
                  (product.colors || []).map(function (hex) {
                    var swatch = el("span", {
                      class: "swatch",
                      role: "img",
                      "aria-label": "Colour " + hex
                    });
                    swatch.style.backgroundColor = hex;
                    return swatch;
                  })
                )
              ]),
              buyButton(product)
            ])
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
        // Newest first — ISO dates sort correctly as strings.
        posts
          .slice()
          .sort(function (a, b) { return a.date < b.date ? 1 : -1; })
          .forEach(function (post) {
            list.appendChild(
              el("li", { class: "post-card" }, [
                el("a", { href: "./post.html?slug=" + encodeURIComponent(post.slug) }, [
                  el("figure", null, [
                    el("img", { src: post.cover, alt: post.title, loading: "lazy" })
                  ]),
                  el("span", { class: "eyebrow" }, [formatDate(post.date)]),
                  el("h2", null, [post.title]),
                  el("p", { class: "excerpt" }, [post.excerpt])
                ])
              ])
            );
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
    product: initProduct,
    blog: initBlog,
    post: initPost
  }[page];

  if (init) {
    document.addEventListener("DOMContentLoaded", init);
  }
})();
