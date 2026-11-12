// Subtle Sway — small progressive enhancements. Every page works without it.
(function () {
  "use strict";
  document.documentElement.classList.add("js");

  // ---------- Mobile navigation ----------
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("site-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(open));
    });
  }

  // ---------- Reveal on scroll ----------
  var reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && reveals.length) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px" }
    );
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add("is-in"); });
  }

  // ---------- Product gallery ----------
  var gallery = document.querySelector("[data-gallery]");
  if (gallery) {
    var slides = gallery.querySelectorAll(".slide");
    var thumbs = gallery.querySelectorAll(".thumb");
    var current = 0;

    var show = function (i) {
      if (!slides.length) return;
      i = (i + slides.length) % slides.length;
      var old = slides[current].querySelector("video");
      if (old) old.pause();
      slides[current].hidden = true;
      slides[i].hidden = false;
      thumbs.forEach(function (t, n) { t.setAttribute("aria-selected", String(n === i)); });
      if (thumbs[i]) thumbs[i].scrollIntoView({ block: "nearest", inline: "nearest" });
      var vid = slides[i].querySelector("video");
      if (vid) {
        var p = vid.play();
        if (p && p.catch) p.catch(function () {});
      }
      current = i;
    };

    thumbs.forEach(function (t) {
      t.addEventListener("click", function () { show(Number(t.dataset.go)); });
    });
    gallery.querySelectorAll("[data-step]").forEach(function (b) {
      b.addEventListener("click", function () { show(current + Number(b.dataset.step)); });
    });
    gallery.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") show(current - 1);
      if (e.key === "ArrowRight") show(current + 1);
    });

    // Swipe
    var stage = gallery.querySelector(".stage");
    var startX = null;
    stage.addEventListener("touchstart", function (e) { startX = e.touches[0].clientX; }, { passive: true });
    stage.addEventListener("touchend", function (e) {
      if (startX === null) return;
      var dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 40) show(current + (dx < 0 ? 1 : -1));
      startX = null;
    });

    // Lightbox zoom
    gallery.querySelectorAll(".zoom").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var img = btn.querySelector("img");
        var box = document.createElement("div");
        box.className = "lightbox";
        box.setAttribute("role", "dialog");
        box.setAttribute("aria-modal", "true");
        box.setAttribute("aria-label", "Enlarged image");
        var big = document.createElement("img");
        big.src = btn.dataset.full;
        big.alt = img ? img.alt : "";
        var close = document.createElement("button");
        close.className = "close";
        close.type = "button";
        close.setAttribute("aria-label", "Close");
        close.textContent = "×";
        box.appendChild(big);
        box.appendChild(close);
        var done = function () {
          box.remove();
          document.removeEventListener("keydown", onKey);
          btn.focus();
        };
        var onKey = function (e) { if (e.key === "Escape") done(); };
        box.addEventListener("click", done);
        document.addEventListener("keydown", onKey);
        document.body.appendChild(box);
        close.focus();
      });
    });
  }

  // ---------- Products page filters ----------
  var grid = document.querySelector(".page-products .product-grid");
  if (grid) {
    var cards = Array.prototype.slice.call(grid.querySelectorAll(".product-card"));
    var chips = document.querySelectorAll(".chip[data-collection]");
    var search = document.getElementById("product-search");
    var selects = document.querySelectorAll("select[data-filter]");
    var empty = document.getElementById("no-results");
    var title = document.getElementById("collection-title");
    var eyebrow = document.getElementById("collection-eyebrow");
    var lede = document.getElementById("collection-lede");
    var etsy = document.getElementById("collection-etsy");
    var etsyLabel = document.getElementById("collection-etsy-label");
    var defaults = {
      title: title && title.textContent,
      eyebrow: eyebrow && eyebrow.textContent,
      lede: lede && lede.textContent,
    };
    var params = new URLSearchParams(location.search);
    var collection = params.get("collection") || "";

    var apply = function () {
      var q = search ? search.value.trim().toLowerCase() : "";
      var shown = 0;
      cards.forEach(function (card) {
        var ok = true;
        if (collection && card.dataset.collections.split("|").indexOf(collection) < 0) ok = false;
        if (ok && q && card.dataset.search.indexOf(q) < 0) ok = false;
        selects.forEach(function (s) {
          if (ok && s.value && card.dataset[s.dataset.filter].split("|").indexOf(s.value) < 0) ok = false;
        });
        card.hidden = !ok;
        if (ok) shown++;
      });
      if (empty) empty.hidden = shown > 0;
    };

    var setCollection = function (slug, push) {
      var chip = null;
      chips.forEach(function (c) {
        var on = c.dataset.collection === slug;
        c.setAttribute("aria-current", String(on));
        if (on) chip = c;
      });
      if (!chip) { slug = ""; chips.length && chips[0].setAttribute("aria-current", "true"); }
      collection = slug;
      var named = chip && slug;
      if (title) title.textContent = named ? chip.dataset.name : defaults.title;
      if (eyebrow) eyebrow.textContent = named ? "Catalogue" : defaults.eyebrow;
      if (lede) lede.textContent = named && chip.dataset.description ? chip.dataset.description : defaults.lede;
      if (etsy) {
        var section = named ? chip.dataset.etsy : "";
        etsy.href = section || etsy.dataset.shop;
        if (etsyLabel) etsyLabel.textContent = section ? "View this catalogue on Etsy" : "Visit our Etsy shop";
      }
      document.title = (named ? chip.dataset.name : "All products — printable wall art") + " | Subtle Sway";
      if (push) history.pushState({ c: slug }, "", slug ? "?collection=" + encodeURIComponent(slug) : location.pathname);
      apply();
    };

    chips.forEach(function (c) {
      c.addEventListener("click", function (e) {
        e.preventDefault();
        setCollection(c.dataset.collection, true);
      });
    });
    window.addEventListener("popstate", function () {
      setCollection(new URLSearchParams(location.search).get("collection") || "", false);
    });
    if (search) search.addEventListener("input", apply);
    selects.forEach(function (s) { s.addEventListener("change", apply); });
    setCollection(collection, false);
  }
})();
