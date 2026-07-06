/* ============================================================
   Subtle Sway — admin panel
   Edits products.json / posts.json directly in the GitHub repo
   through the GitHub Contents API. The access token lives only
   in this browser's localStorage — there is no server.
   ============================================================ */

(function () {
  "use strict";

  // Repository the panel writes to. Change these if the repo moves.
  var CONFIG = {
    owner: "saidjaxon1",
    repo: "Subtle-Sway",
    branch: "main"
  };

  var TOKEN_KEY = "ss-admin-token";
  var API_BASE = "https://api.github.com/repos/" + CONFIG.owner + "/" + CONFIG.repo + "/contents/";

  // In-memory state: parsed JSON plus the git blob sha needed to update each file.
  var state = {
    token: null,
    products: { data: [], sha: null },
    posts: { data: [], sha: null },
    site: { data: { contact: { text: "", email: "", pinterest: "", instagram: "" }, categories: { products: [], articles: [] } }, sha: null },
    tab: "products",     // which tab is active
    editIndex: -1,       // -1 = adding a new item
    blocks: [],          // working copy of a post's content blocks while editing
    extraImages: [],     // working copy of a product's extra photos while editing
    listFilter: { q: "", cat: null }  // search/category filter on the list views
  };

  /* ---------- DOM helpers ---------- */

  function $(id) { return document.getElementById(id); }

  // Same safe element builder as main.js: strings become text nodes.
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) { node.setAttribute(key, attrs[key]); });
    }
    (children || []).forEach(function (child) {
      if (child === null || child === undefined) return;
      node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    });
    return node;
  }

  function setStatus(message, isError) {
    var status = $("status");
    status.textContent = message;
    status.className = "admin-status" + (isError ? " error" : "");
    if (message && !isError) {
      setTimeout(function () {
        if (status.textContent === message) status.textContent = "";
      }, 4000);
    }
  }

  /* ---------- UTF-8 safe base64 (GitHub API stores file content as base64) ---------- */

  function b64encode(text) {
    var bytes = new TextEncoder().encode(text);
    var binary = "";
    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  function b64decode(b64) {
    var binary = atob(b64.replace(/\s/g, ""));
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  /* ---------- GitHub API ---------- */

  function apiHeaders() {
    return {
      "Authorization": "Bearer " + state.token,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
  }

  function fetchFile(name) {
    return fetch(API_BASE + name + ".json?ref=" + CONFIG.branch, { headers: apiHeaders() })
      .then(function (response) {
        if (response.status === 401) throw new Error("Token was rejected. Check that it is valid and has Contents read/write access.");
        if (!response.ok) throw new Error("Could not load " + name + ".json (HTTP " + response.status + ").");
        return response.json();
      })
      .then(function (file) {
        state[name].data = JSON.parse(b64decode(file.content));
        state[name].sha = file.sha;
      });
  }

  function saveFile(name, message) {
    setStatus("Saving…");
    var payload = {
      message: message,
      content: b64encode(JSON.stringify(state[name].data, null, 2) + "\n"),
      branch: CONFIG.branch
    };
    if (state[name].sha) payload.sha = state[name].sha; // no sha = create the file
    return fetch(API_BASE + name + ".json", {
      method: "PUT",
      headers: apiHeaders(),
      body: JSON.stringify(payload)
    }).then(function (response) {
      if (response.status === 409) {
        // The file changed on GitHub since we loaded it — reload and ask to retry.
        return fetchFile(name).then(function () {
          throw new Error("The file changed on GitHub in the meantime. Fresh data was reloaded — please redo your change.");
        });
      }
      if (!response.ok) throw new Error("Save failed (HTTP " + response.status + ").");
      return response.json().then(function (result) {
        state[name].sha = result.content.sha;
        setStatus("Saved ✓ Live on the site in about a minute.");
      });
    });
  }

  /* ---------- Auth flow ---------- */

  function showAuth(errorMessage) {
    $("auth-screen").hidden = false;
    $("panel").hidden = true;
    $("loading").hidden = true;
    $("auth-error").textContent = errorMessage || "";
  }

  function connect(token) {
    state.token = token;
    $("auth-screen").hidden = true;
    $("loading").hidden = false;
    // site.json may not exist yet — fall back to defaults and create it on first save.
    var fetchSite = fetchFile("site").catch(function () {
      state.site = { data: { contact: { text: "", email: "", pinterest: "", instagram: "" }, categories: { products: [], articles: [] } }, sha: null };
    });
    Promise.all([fetchFile("products"), fetchFile("posts"), fetchSite])
      .then(function () {
        ensureCatStore();
        localStorage.setItem(TOKEN_KEY, token);
        $("loading").hidden = true;
        $("panel").hidden = false;
        selectTab(state.tab);
      })
      .catch(function (error) {
        localStorage.removeItem(TOKEN_KEY);
        state.token = null;
        showAuth(error.message);
      });
  }

  /* ---------- List view ---------- */

  // Normalised comparison key (survives stray spaces and casing).
  function norm(value) {
    return (value || "").trim().toLowerCase();
  }

  // Ordered unique values of a product field ("category" / "subcategory"),
  // deduplicated case-insensitively; the first spelling seen wins.
  function uniqueProductValues(products, key) {
    var seen = {};
    var out = [];
    products.forEach(function (p) {
      var raw = (p[key] || "").trim();
      if (!raw) return;
      var k = raw.toLowerCase();
      if (!seen[k]) {
        seen[k] = true;
        out.push(raw);
      }
    });
    return out;
  }

  /* ---------- Category structure (shared by forms and the Categories tab) ----------

     Categories live in two places that we always merge:
       • site.json  → the deliberate structure, including empty categories
                      the owner set up before adding any items
       • the items  → every category/subcategory an item already uses
     Merging means nothing is ever lost, and empty categories still persist. */

  // Which site.json key holds this file's categories.
  function catKey(fileName) { return fileName === "products" ? "products" : "articles"; }

  function ensureCatStore() {
    if (!state.site.data) state.site.data = {};
    if (!state.site.data.categories) state.site.data.categories = {};
    if (!state.site.data.categories.products) state.site.data.categories.products = [];
    if (!state.site.data.categories.articles) state.site.data.categories.articles = [];
  }

  // Merged tree: [{ name, subs: [..] }, ...] preserving stored order first.
  function categoryTree(fileName) {
    ensureCatStore();
    var tree = [];
    var index = {};
    function ensure(name) {
      var k = norm(name);
      if (!index[k]) { var e = { name: name, subs: [], _sub: {} }; index[k] = e; tree.push(e); }
      return index[k];
    }
    function ensureSub(entry, sub) {
      var k = norm(sub);
      if (k && !entry._sub[k]) { entry._sub[k] = true; entry.subs.push(sub); }
    }
    state.site.data.categories[catKey(fileName)].forEach(function (c) {
      var e = ensure(c.name);
      (c.subs || []).forEach(function (s) { ensureSub(e, s); });
    });
    state[fileName].data.forEach(function (item) {
      if (item.category) {
        var e = ensure(item.category);
        if (item.subcategory) ensureSub(e, item.subcategory);
      }
    });
    return tree;
  }

  function findCatEntry(fileName, name) {
    return categoryTree(fileName).filter(function (c) { return norm(c.name) === norm(name); })[0] || null;
  }

  // Save the store and/or the items file, whichever changed, in sequence.
  function persistCategory(fileName, storeChanged, itemsChanged, message, done) {
    var chain = Promise.resolve();
    if (storeChanged) chain = chain.then(function () { return saveFile("site", message); });
    if (itemsChanged) chain = chain.then(function () { return saveFile(fileName, message); });
    chain.then(function () { if (done) done(); })
      .catch(function (error) { setStatus(error.message, true); renderList(); });
  }

  function selectTab(tab) {
    state.tab = tab;
    ["products", "posts", "categories", "contact"].forEach(function (name) {
      $("tab-" + name).setAttribute("aria-selected", tab === name);
    });
    $("add-item").hidden = tab === "categories" || tab === "contact";

    if (tab === "contact") {
      $("list-view").hidden = true;
      openContactForm();
      return;
    }

    $("list-title").textContent = { products: "Products", posts: "Articles", categories: "Categories" }[tab];
    $("form-view").hidden = true;
    $("list-view").hidden = false;
    state.listFilter = { q: "", cat: null };
    buildListControls();
    renderList();
  }

  // Search + category chips above the Products/Articles lists.
  // Built once per tab so the search box keeps focus while typing.
  function buildListControls() {
    var wrap = $("list-controls");
    wrap.textContent = "";
    if (state.tab !== "products" && state.tab !== "posts") {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;

    var search = el("input", {
      type: "search",
      class: "list-search",
      placeholder: state.tab === "products" ? "Search products…" : "Search articles…",
      autocomplete: "off"
    });
    search.addEventListener("input", function () {
      state.listFilter.q = search.value;
      renderList();
    });

    var chipRow = el("div", { class: "picker-chips" });
    var cats = uniqueProductValues(state[state.tab].data, "category");
    function renderChips() {
      chipRow.textContent = "";
      function addChip(label, value) {
        var button = el("button", { type: "button", class: "chip", "aria-pressed": String(state.listFilter.cat === value) }, [label]);
        button.addEventListener("click", function () {
          state.listFilter.cat = value;
          renderChips();
          renderList();
        });
        chipRow.appendChild(button);
      }
      addChip("All", null);
      cats.forEach(function (c) { addChip(c, c); });
    }
    renderChips();

    wrap.appendChild(search);
    if (cats.length) wrap.appendChild(chipRow);
  }

  /* ---------- Contact form (footer contact line, stored in site.json) ---------- */

  function openContactForm() {
    var contact = (state.site.data && state.site.data.contact) || {};
    var view = $("form-view");
    view.textContent = "";
    view.appendChild(el("h1", { class: "admin-title" }, ["Contact"]));
    view.appendChild(el("p", { class: "admin-hint" }, [
      "Shown as a small “Contact us” line at the bottom of every page. Leave a field empty to hide that part."
    ]));

    var form = el("form", { class: "admin-form", novalidate: "" }, [
      field("Short line", textInput("c-text", contact.text, "e.g. Questions or collaborations — write to us."), "Optional — a few friendly words before the email."),
      field("Email", textInput("c-email", contact.email, "hello@example.com")),
      field("Pinterest link", textInput("c-pinterest", contact.pinterest, "https://pinterest.com/…"), "Optional."),
      field("Instagram link", textInput("c-instagram", contact.instagram, "https://instagram.com/…"), "Optional.")
    ]);

    var error = el("p", { class: "form-error", role: "alert" }, []);
    var save = el("button", { class: "btn", type: "submit" }, ["Save"]);
    form.appendChild(el("div", null, [error, el("div", { class: "form-buttons" }, [save])]));

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      error.textContent = "";
      // Keep the rest of site.json (categories) intact — only replace contact.
      ensureCatStore();
      state.site.data.contact = {
        text: $("c-text").value.trim(),
        email: $("c-email").value.trim(),
        pinterest: $("c-pinterest").value.trim(),
        instagram: $("c-instagram").value.trim()
      };
      save.disabled = true;
      saveFile("site", "admin: update contact details")
        .then(function () { save.disabled = false; })
        .catch(function (saveError) {
          save.disabled = false;
          error.textContent = saveError.message;
        });
    });

    view.appendChild(form);
    view.hidden = false;
  }

  function renderList() {
    var list = $("item-list");
    list.textContent = "";

    if (state.tab === "categories") {
      renderCategories(list);
      return;
    }

    var items = state[state.tab].data;

    if (!items.length) {
      list.appendChild(el("li", { class: "admin-empty" }, ["Nothing here yet. Use “Add new” to create the first one."]));
      return;
    }

    // Filter for display but keep each item's original index, so Edit
    // and Delete always act on the right entry.
    var q = norm(state.listFilter.q);
    var cat = state.listFilter.cat;
    var entries = items
      .map(function (item, index) { return { item: item, index: index }; })
      .filter(function (entry) {
        var item = entry.item;
        if (cat && norm(item.category) !== norm(cat)) return false;
        if (!q) return true;
        return [item.name, item.title, item.slug, item.category, item.subcategory]
          .some(function (part) { return norm(part).indexOf(q) !== -1; });
      });

    if (!entries.length) {
      list.appendChild(el("li", { class: "admin-empty" }, ["Nothing matches that search."]));
      return;
    }

    entries.forEach(function (entry) {
      var item = entry.item;
      var index = entry.index;
      var isProduct = state.tab === "products";
      var editBtn = el("button", { class: "ghost-btn", type: "button" }, ["Edit"]);
      var deleteBtn = el("button", { class: "ghost-btn danger", type: "button" }, ["Delete"]);

      editBtn.addEventListener("click", function () { openForm(index); });
      deleteBtn.addEventListener("click", function () { deleteItem(index); });

      var thumbSrc = isProduct ? item.image : item.cover;
      list.appendChild(el("li", null, [
        thumbSrc ? el("img", { src: thumbSrc, alt: "" }) : el("span", { class: "thumb-empty" }),
        el("div", { class: "item-info" }, [
          el("span", { class: "item-name" }, [isProduct ? item.name : item.title]),
          el("span", { class: "item-meta" }, [
            isProduct
              ? [item.price || "no price",
                 (item.type || "") === "digital" ? "digital" : null,
                 (item.source || "") === "own" ? "my product" : null,
                 item.slug]
                  .filter(Boolean).join("  ·  ")
              : [item.date, item.category || null, item.slug].filter(Boolean).join("  ·  ")
          ])
        ]),
        el("div", { class: "item-actions" }, [editBtn, deleteBtn])
      ]));
    });
  }

  /* ---------- Categories view (rename everywhere in one step) ---------- */

  // Find a category's entry in the stored list (if any).
  function storeEntry(fileName, name) {
    var arr = state.site.data.categories[catKey(fileName)];
    for (var i = 0; i < arr.length; i++) {
      if (norm(arr[i].name) === norm(name)) return arr[i];
    }
    return null;
  }

  // Add a brand-new empty category to the stored list, then save.
  function addCategory(fileName, noun) {
    ensureCatStore();
    var name = window.prompt("New " + noun + " category name:");
    name = name ? name.trim() : "";
    if (!name) return;
    if (findCatEntry(fileName, name)) { setStatus("“" + name + "” already exists.", true); return; }
    state.site.data.categories[catKey(fileName)].push({ name: name, subs: [] });
    persistCategory(fileName, true, false, "admin: add category “" + name + "”", renderList);
  }

  // Add a subcategory inside an existing category, then save.
  function addSubcategory(fileName, category) {
    ensureCatStore();
    var name = window.prompt("New subcategory inside “" + category + "”:");
    name = name ? name.trim() : "";
    if (!name) return;
    var entry = storeEntry(fileName, category);
    if (!entry) { entry = { name: category, subs: [] }; state.site.data.categories[catKey(fileName)].push(entry); }
    if (entry.subs.some(function (s) { return norm(s) === norm(name); })) { setStatus("“" + name + "” already exists here.", true); return; }
    entry.subs.push(name);
    persistCategory(fileName, true, false, "admin: add subcategory “" + name + "”", renderList);
  }

  // Rename a category/subcategory in both the store and every item.
  function renameCategory(fileName, noun, category, oldSub) {
    var isSub = !!oldSub;
    var label = isSub ? "subcategory" : "category";
    var oldName = isSub ? oldSub : category;
    var next = window.prompt("New name for " + label + " “" + oldName + "”:", oldName);
    if (next === null) return;
    next = next.trim();
    if (!next || next === oldName) return;

    var storeChanged = false;
    var itemsChanged = false;

    // Store
    if (isSub) {
      var e = storeEntry(fileName, category);
      if (e) e.subs = e.subs.map(function (s) { if (norm(s) === norm(oldName)) { storeChanged = true; return next; } return s; });
    } else {
      var ce = storeEntry(fileName, oldName);
      if (ce) { ce.name = next; storeChanged = true; }
    }

    // Items
    state[fileName].data.forEach(function (item) {
      if (isSub) {
        if (norm(item.category) === norm(category) && norm(item.subcategory) === norm(oldName)) { item.subcategory = next; itemsChanged = true; }
      } else if (norm(item.category) === norm(oldName)) { item.category = next; itemsChanged = true; }
    });

    persistCategory(fileName, storeChanged, itemsChanged, "admin: rename " + label + " “" + oldName + "” to “" + next + "”", renderList);
  }

  // Remove a category/subcategory label from the store and every item.
  // Items are never deleted — they just lose the label.
  function removeCategory(fileName, noun, category, oldSub, count) {
    var isSub = !!oldSub;
    var label = isSub ? "subcategory" : "category";
    var oldName = isSub ? oldSub : category;
    var message = "Remove " + label + " “" + oldName + "”?\n\nThe " + count + " " + noun + (count === 1 ? "" : "s") +
      " in it will NOT be deleted — " + (count === 1 ? "it" : "they") + " just lose this label" +
      (isSub ? "" : " (and its subcategories)") + " and stay visible under All.";
    if (!window.confirm(message)) return;

    var storeChanged = false;
    var itemsChanged = false;

    // Store
    var arr = state.site.data.categories[catKey(fileName)];
    if (isSub) {
      var e = storeEntry(fileName, category);
      if (e) {
        var before = e.subs.length;
        e.subs = e.subs.filter(function (s) { return norm(s) !== norm(oldName); });
        if (e.subs.length !== before) storeChanged = true;
      }
    } else {
      for (var i = arr.length - 1; i >= 0; i--) {
        if (norm(arr[i].name) === norm(oldName)) { arr.splice(i, 1); storeChanged = true; }
      }
    }

    // Items
    state[fileName].data.forEach(function (item) {
      if (isSub) {
        if (norm(item.category) === norm(category) && norm(item.subcategory) === norm(oldName)) { item.subcategory = ""; itemsChanged = true; }
      } else if (norm(item.category) === norm(oldName)) { item.category = ""; item.subcategory = ""; itemsChanged = true; }
    });

    persistCategory(fileName, storeChanged, itemsChanged, "admin: remove " + label + " “" + oldName + "”", renderList);
  }

  // One group of category rows (used for products and for articles).
  function renderCategoryGroup(list, fileName, groupLabel, noun) {
    var tree = categoryTree(fileName);
    var items = state[fileName].data;

    var addBtn = el("button", { class: "ghost-btn add-cat", type: "button" }, ["+ Add category"]);
    addBtn.addEventListener("click", function () { addCategory(fileName, noun); });
    list.appendChild(el("li", { class: "group-head" }, [
      el("span", null, [groupLabel]),
      addBtn
    ]));

    if (!tree.length) {
      list.appendChild(el("li", { class: "admin-empty" }, [
        "No categories yet. Use “+ Add category”, or set a category when you add a " + noun + "."
      ]));
      return;
    }

    tree.forEach(function (entry) {
      var category = entry.name;
      var count = items.filter(function (p) { return norm(p.category) === norm(category); }).length;

      var addSub = el("button", { class: "ghost-btn", type: "button", title: "Add a subcategory inside " + category }, ["+ Sub"]);
      addSub.addEventListener("click", function () { addSubcategory(fileName, category); });
      var renameBtn = el("button", { class: "ghost-btn", type: "button" }, ["Rename"]);
      renameBtn.addEventListener("click", function () { renameCategory(fileName, noun, category); });
      var removeBtn = el("button", { class: "ghost-btn danger", type: "button" }, ["Remove"]);
      removeBtn.addEventListener("click", function () { removeCategory(fileName, noun, category, null, count); });

      list.appendChild(el("li", null, [
        el("div", { class: "item-info" }, [
          el("span", { class: "item-name" }, [category]),
          el("span", { class: "item-meta" }, [count + " " + noun + (count === 1 ? "" : "s")])
        ]),
        el("div", { class: "item-actions" }, [addSub, renameBtn, removeBtn])
      ]));

      entry.subs.forEach(function (sub) {
        var subCount = items.filter(function (p) { return norm(p.category) === norm(category) && norm(p.subcategory) === norm(sub); }).length;
        var subRename = el("button", { class: "ghost-btn", type: "button" }, ["Rename"]);
        subRename.addEventListener("click", function () { renameCategory(fileName, noun, category, sub); });
        var subRemove = el("button", { class: "ghost-btn danger", type: "button" }, ["Remove"]);
        subRemove.addEventListener("click", function () { removeCategory(fileName, noun, category, sub, subCount); });

        list.appendChild(el("li", { class: "sub" }, [
          el("div", { class: "item-info" }, [
            el("span", { class: "item-name sub-name" }, ["↳  " + sub]),
            el("span", { class: "item-meta" }, [subCount + " " + noun + (subCount === 1 ? "" : "s")])
          ]),
          el("div", { class: "item-actions" }, [subRename, subRemove])
        ]));
      });
    });
  }

  function renderCategories(list) {
    list.appendChild(el("li", { class: "admin-hint" }, [
      "Add a category with “+ Add category”, or a subcategory inside one with “+ Sub”. You can also just set a category when adding a product or article. Renaming or removing here updates every item in one step; removing never deletes items — they only lose the label."
    ]));
    renderCategoryGroup(list, "products", "Product categories", "product");
    renderCategoryGroup(list, "posts", "Article categories", "article");
  }

  function deleteItem(index) {
    var isProduct = state.tab === "products";
    var item = state[state.tab].data[index];
    var label = isProduct ? item.name : item.title;
    if (!window.confirm("Delete “" + label + "”? This removes it from the live site.")) return;

    state[state.tab].data.splice(index, 1);
    saveFile(state.tab, "admin: delete " + (isProduct ? "product" : "article") + " “" + label + "”")
      .then(renderList)
      .catch(function (error) { setStatus(error.message, true); renderList(); });
  }

  /* ---------- Form helpers ---------- */

  function textInput(id, value, placeholder) {
    return el("input", { type: "text", id: id, value: value || "", placeholder: placeholder || "", autocomplete: "off" });
  }

  function field(labelText, inputEl, hint) {
    return el("label", { class: "field" }, [
      el("span", { class: "field-label" }, [labelText]),
      inputEl,
      hint ? el("span", { class: "field-hint" }, [hint]) : null
    ]);
  }

  /* ---------- Category picker for the product / article forms ----------
     Two linked dropdowns instead of free typing. The category list is the
     merged tree; the last option is "+ New…", which asks for a name. The
     subcategory dropdown follows the chosen category. */

  var NEW_OPTION = "__add_new__";

  function categoryFields(fileName, ids, currentCat, currentSub) {
    var tree = categoryTree(fileName);

    // Preserve legacy values that aren't in the tree yet (shouldn't happen,
    // but never lose an item's existing category).
    if (currentCat && !tree.some(function (c) { return norm(c.name) === norm(currentCat); })) {
      tree.push({ name: currentCat, subs: currentSub ? [currentSub] : [] });
    }

    var catSelect = el("select", { id: ids.cat });
    var subSelect = el("select", { id: ids.sub });

    function entryFor(name) {
      return tree.filter(function (c) { return norm(c.name) === norm(name); })[0];
    }

    function fillCat(selected) {
      catSelect.textContent = "";
      catSelect.appendChild(el("option", { value: "" }, ["— No category —"]));
      tree.forEach(function (c) { catSelect.appendChild(el("option", { value: c.name }, [c.name])); });
      catSelect.appendChild(el("option", { value: NEW_OPTION }, ["+ New category…"]));
      catSelect.value = selected || "";
    }

    function fillSub(catName, selected) {
      subSelect.textContent = "";
      subSelect.appendChild(el("option", { value: "" }, ["— No subcategory —"]));
      var entry = entryFor(catName);
      (entry ? entry.subs : []).forEach(function (s) {
        subSelect.appendChild(el("option", { value: s }, [s]));
      });
      subSelect.appendChild(el("option", { value: NEW_OPTION }, ["+ New subcategory…"]));
      subSelect.value = selected || "";
      subSelect.disabled = !catName;
    }

    fillCat(currentCat);
    fillSub(currentCat, currentSub);

    var lastCat = catSelect.value;
    catSelect.addEventListener("change", function () {
      if (catSelect.value === NEW_OPTION) {
        var name = window.prompt("New category name:");
        name = name ? name.trim() : "";
        if (name) {
          if (!entryFor(name)) tree.push({ name: name, subs: [] });
          fillCat(name);
          fillSub(name, "");
          lastCat = name;
        } else {
          fillCat(lastCat);
        }
        return;
      }
      lastCat = catSelect.value;
      fillSub(catSelect.value, "");
    });

    subSelect.addEventListener("change", function () {
      if (subSelect.value === NEW_OPTION) {
        var name = window.prompt("New subcategory name:");
        name = name ? name.trim() : "";
        if (name) {
          var entry = entryFor(catSelect.value);
          if (entry && !entry.subs.some(function (s) { return norm(s) === norm(name); })) entry.subs.push(name);
          fillSub(catSelect.value, name);
        } else {
          fillSub(catSelect.value, subSelect.dataset ? "" : "");
        }
      }
    });

    return [
      field("Category", catSelect, "Pick a group, or choose “+ New category…” to make one."),
      field("Subcategory", subSelect, "Optional — a finer group inside the category.")
    ];
  }

  // Read a category select's value, treating the "+ New" sentinel as empty.
  function catValue(id) {
    var v = $(id).value;
    return v === NEW_OPTION ? "" : v.trim();
  }

  /* ---------- Automatic URL slugs (no technical field to fill in) ---------- */

  // "The Quiet Living Room: Five Principles" -> "the-quiet-living-room-five-principles"
  function slugify(text) {
    return (text || "")
      .toLowerCase()
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "item";
  }

  // Appends -2, -3… until the slug is unique within the current list.
  function uniqueSlug(base, items) {
    var candidate = base;
    var n = 2;
    while (items.some(function (item) { return item.slug === candidate; })) {
      candidate = base + "-" + n++;
    }
    return candidate;
  }

  // Editing keeps the existing slug (links stay stable); new items get one
  // generated from their name/title.
  function resolveSlug(nameOrTitle) {
    if (state.editIndex !== -1) return state[state.tab].data[state.editIndex].slug;
    return uniqueSlug(slugify(nameOrTitle), state[state.tab].data);
  }

  /* ---------- Image upload (straight into the repo) ---------- */

  function uploadImage(file, onDone, onError) {
    var safe = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "") || "image.jpg";
    var path = "images/" + Date.now().toString(36) + "-" + safe;
    var reader = new FileReader();
    reader.onerror = function () { onError(new Error("Could not read the file.")); };
    reader.onload = function () {
      fetch(API_BASE + path, {
        method: "PUT",
        headers: apiHeaders(),
        body: JSON.stringify({
          message: "admin: upload image " + safe,
          content: String(reader.result).split(",")[1],
          branch: CONFIG.branch
        })
      }).then(function (response) {
        if (!response.ok) throw new Error("Upload failed (HTTP " + response.status + ").");
        onDone("./" + path);
      }).catch(onError);
    };
    reader.readAsDataURL(file);
  }

  // Reusable Upload control: returns a button, hidden file input and a
  // status span; calls applyUrl(url) when the upload finishes.
  function makeUploader(applyUrl) {
    var fileInput = el("input", { type: "file", accept: "image/*", hidden: "" });
    var btn = el("button", { type: "button", class: "ghost-btn" }, ["Upload"]);
    var status = el("span", { class: "field-hint" }, []);
    btn.addEventListener("click", function () { fileInput.click(); });
    fileInput.addEventListener("change", function () {
      var file = fileInput.files[0];
      if (!file) return;
      if (file.size > 8 * 1024 * 1024) {
        status.textContent = "That image is over 8 MB — please use a smaller one.";
        return;
      }
      btn.disabled = true;
      status.textContent = "Uploading…";
      uploadImage(file, function (url) {
        btn.disabled = false;
        status.textContent = "Uploaded ✓";
        fileInput.value = "";
        applyUrl(url);
      }, function (error) {
        btn.disabled = false;
        status.textContent = error.message;
      });
    });
    return { btn: btn, fileInput: fileInput, status: status };
  }

  // A photo field: paste a link, or press Upload to use a file from this
  // computer — the link fills itself in. Shows a small live preview.
  function imageField(labelText, inputId, value, hint) {
    var input = el("input", { type: "text", id: inputId, value: value || "", placeholder: "https://…  (or press Upload)", autocomplete: "off" });
    var thumb = el("img", { class: "img-thumb", alt: "", hidden: "" });
    function syncThumb() {
      var src = input.value.trim();
      if (src) { thumb.src = src; thumb.hidden = false; } else { thumb.hidden = true; }
    }
    input.addEventListener("input", syncThumb);
    syncThumb();

    var fileInput = el("input", { type: "file", accept: "image/*", hidden: "" });
    var uploadBtn = el("button", { type: "button", class: "ghost-btn" }, ["Upload"]);
    var uploadStatus = el("span", { class: "field-hint" }, []);
    uploadBtn.addEventListener("click", function () { fileInput.click(); });
    fileInput.addEventListener("change", function () {
      var file = fileInput.files[0];
      if (!file) return;
      if (file.size > 8 * 1024 * 1024) {
        uploadStatus.textContent = "That image is over 8 MB — please use a smaller one.";
        return;
      }
      uploadBtn.disabled = true;
      uploadStatus.textContent = "Uploading…";
      uploadImage(file, function (url) {
        input.value = url;
        syncThumb();
        uploadBtn.disabled = false;
        uploadStatus.textContent = "Uploaded ✓";
        fileInput.value = "";
      }, function (error) {
        uploadBtn.disabled = false;
        uploadStatus.textContent = error.message;
      });
    });

    return el("div", { class: "field" }, [
      el("span", { class: "field-label" }, [labelText]),
      el("div", { class: "img-row" }, [input, uploadBtn, thumb]),
      fileInput,
      uploadStatus,
      hint ? el("span", { class: "field-hint" }, [hint]) : null
    ]);
  }

  /* ---------- Product form ---------- */

  function productForm(product) {
    var typeSelect = el("select", { id: "f-type" }, [
      el("option", { value: "physical" }, ["Physical — a shipped item"]),
      el("option", { value: "digital" }, ["Digital — delivered online"]),
      el("option", { value: "" }, ["Don't show anything"])
    ]);
    var currentType = (product.type || "").toLowerCase();
    typeSelect.value = currentType === "digital" || currentType === "physical" ? currentType : "";

    var sourceSelect = el("select", { id: "f-source" }, [
      el("option", { value: "affiliate" }, ["Affiliate link — shows the affiliate note"]),
      el("option", { value: "own" }, ["My own product — no affiliate notes"])
    ]);
    sourceSelect.value = (product.source || "").toLowerCase() === "own" ? "own" : "affiliate";

    var catFields = categoryFields("products", { cat: "f-cat", sub: "f-sub" }, product.category, product.subcategory);

    var nameInput = textInput("f-name", product.name, "e.g. Walnut Coffee Table");
    nameInput.classList.add("big");

    // Optional extra photos, shown stacked under the main photo on the
    // product page.
    state.extraImages = (product.images || []).slice();
    var extraWrap = el("div", { class: "stack" }, []);
    function renderExtraPhotos() {
      extraWrap.textContent = "";
      state.extraImages.forEach(function (src, i) {
        var input = el("input", { type: "text", value: src || "", placeholder: "Photo link — or press Upload" });
        input.addEventListener("input", function () { state.extraImages[i] = input.value; });
        var uploader = makeUploader(function (url) { input.value = url; state.extraImages[i] = url; });
        var removeBtn = el("button", { type: "button", class: "ghost-btn danger", title: "Remove this photo" }, ["×"]);
        removeBtn.addEventListener("click", function () {
          state.extraImages.splice(i, 1);
          renderExtraPhotos();
        });
        extraWrap.appendChild(el("div", { class: "gallery-item" }, [
          el("div", { class: "img-row" }, [input, uploader.btn, removeBtn]),
          uploader.fileInput,
          uploader.status
        ]));
      });
      var addBtn = el("button", { type: "button", class: "ghost-btn" }, ["+ Add photo"]);
      addBtn.addEventListener("click", function () {
        state.extraImages.push("");
        renderExtraPhotos();
      });
      extraWrap.appendChild(addBtn);
    }
    renderExtraPhotos();

    var form = el("form", { class: "admin-form", novalidate: "" }, [
      field("Name", nameInput),
      imageField("Photo", "f-image", product.image, "Paste a link, or press Upload to use a photo from this computer."),
      el("div", { class: "field" }, [
        el("span", { class: "field-label" }, ["More photos"]),
        el("span", { class: "field-hint" }, ["Optional — extra photos shown under the main one on the product page."]),
        extraWrap
      ]),
      field("Price", textInput("f-price", product.price, "e.g. $249"), "Optional — leave empty to show no price."),
      field("Buy Now link", textInput("f-link", product.affiliateLink, "https://…"), "Where the Buy Now button sends the visitor."),
      field("Link type", sourceSelect),
      field("Product kind", typeSelect, "Shown as a small tag on the product page."),
      catFields[0],
      catFields[1],
      field("Description", el("textarea", { id: "f-desc" }, [product.description || ""]), "One short paragraph shown on the product page."),
      field("Colors", textInput("f-colors", (product.colors || []).join(", "), "#D8CFC0, #5C594F"), "Optional — hex codes separated by commas, shown as small circles.")
    ]);

    form.appendChild(formButtons(form, function () {
      var name = $("f-name").value.trim();
      if (!name) return { error: "Give the product a name." };
      return { item: {
        slug: resolveSlug(name),
        name: name,
        price: $("f-price").value.trim(),
        type: $("f-type").value,
        source: $("f-source").value,
        category: catValue("f-cat"),
        subcategory: catValue("f-sub"),
        image: $("f-image").value.trim(),
        images: state.extraImages.map(function (s) { return (s || "").trim(); }).filter(Boolean),
        affiliateLink: $("f-link").value.trim(),
        description: $("f-desc").value.trim(),
        colors: $("f-colors").value.split(",").map(function (c) { return c.trim(); }).filter(Boolean)
      } };
    }));
    return form;
  }

  /* ---------- Post form (with content block editor) ---------- */

  var BLOCK_LABELS = { paragraph: "Text", heading: "Heading", image: "Photo", gallery: "Gallery", product: "Product" };

  function blockRow(block, index) {
    var tools = el("div", { class: "block-tools" }, []);

    [["↑", -1], ["↓", 1]].forEach(function (pair) {
      var btn = el("button", { type: "button", title: "Move" }, [pair[0]]);
      btn.addEventListener("click", function () {
        var target = index + pair[1];
        if (target < 0 || target >= state.blocks.length) return;
        state.blocks.splice(target, 0, state.blocks.splice(index, 1)[0]);
        renderBlocks();
      });
      tools.appendChild(btn);
    });

    var removeBtn = el("button", { type: "button", title: "Remove block" }, ["×"]);
    removeBtn.addEventListener("click", function () {
      state.blocks.splice(index, 1);
      renderBlocks();
    });
    tools.appendChild(removeBtn);

    var body = el("div", { class: "stack" }, []);

    if (block.type === "paragraph" || block.type === "heading") {
      var textEl = block.type === "paragraph"
        ? el("textarea", null, [block.text || ""])
        : el("input", { type: "text", value: block.text || "" });
      textEl.addEventListener("input", function () { block.text = textEl.value; });
      body.appendChild(textEl);
    } else if (block.type === "image") {
      var src = el("input", { type: "text", value: block.src || "", placeholder: "Photo link — or press Upload" });
      var alt = el("input", { type: "text", value: block.alt || "", placeholder: "A few words describing the photo" });
      src.addEventListener("input", function () { block.src = src.value; });
      alt.addEventListener("input", function () { block.alt = alt.value; });
      var uploader = makeUploader(function (url) { src.value = url; block.src = url; });
      body.appendChild(el("div", { class: "img-row" }, [src, uploader.btn]));
      body.appendChild(uploader.fileInput);
      body.appendChild(uploader.status);
      body.appendChild(alt);
    } else if (block.type === "gallery") {
      // Several photos shown side by side in the article.
      if (!block.images) block.images = [];
      block.images.forEach(function (img, imgIndex) {
        var srcIn = el("input", { type: "text", value: img.src || "", placeholder: "Photo link — or press Upload" });
        srcIn.addEventListener("input", function () { img.src = srcIn.value; });
        var altIn = el("input", { type: "text", value: img.alt || "", placeholder: "A few words describing the photo" });
        altIn.addEventListener("input", function () { img.alt = altIn.value; });
        var uploader = makeUploader(function (url) { srcIn.value = url; img.src = url; });
        var removeBtn = el("button", { type: "button", class: "ghost-btn danger", title: "Remove this photo" }, ["×"]);
        removeBtn.addEventListener("click", function () {
          block.images.splice(imgIndex, 1);
          renderBlocks();
        });
        body.appendChild(el("div", { class: "gallery-item" }, [
          el("div", { class: "img-row" }, [srcIn, uploader.btn, removeBtn]),
          uploader.fileInput,
          uploader.status,
          altIn
        ]));
      });
      var addPhotoBtn = el("button", { type: "button", class: "ghost-btn" }, ["+ Photo"]);
      addPhotoBtn.addEventListener("click", function () {
        block.images.push({ src: "", alt: "" });
        renderBlocks();
      });
      body.appendChild(addPhotoBtn);
    } else if (block.type === "product") {
      var select = el("select", null, state.products.data.map(function (p) {
        var option = el("option", { value: p.slug }, [p.name + (p.price ? " (" + p.price + ")" : "")]);
        if (p.slug === block.slug) option.setAttribute("selected", "");
        return option;
      }));
      if (!block.slug && state.products.data.length) block.slug = state.products.data[0].slug;
      select.addEventListener("change", function () { block.slug = select.value; });
      body.appendChild(select);
    }

    return el("div", { class: "block-row" }, [
      el("div", { class: "block-head" }, [
        el("span", { class: "block-type" }, [BLOCK_LABELS[block.type] || block.type]),
        tools
      ]),
      body
    ]);
  }

  function renderBlocks() {
    var editor = $("blocks-editor");
    editor.textContent = "";
    if (!state.blocks.length) {
      editor.appendChild(el("p", { class: "admin-empty" }, ["No blocks yet — add the first one below."]));
    }
    state.blocks.forEach(function (block, index) {
      editor.appendChild(blockRow(block, index));
    });
  }

  function postForm(post) {
    state.blocks = (post.content || []).map(function (block) {
      return JSON.parse(JSON.stringify(block)); // edit a copy, not the live data
    });

    var addRow = el("div", { class: "add-block-row" }, []);
    Object.keys(BLOCK_LABELS).forEach(function (type) {
      var btn = el("button", { type: "button", class: "ghost-btn" }, ["+ " + BLOCK_LABELS[type]]);
      btn.addEventListener("click", function () {
        state.blocks.push(
          type === "image" ? { type: type, src: "", alt: "" } :
          type === "gallery" ? { type: type, images: [{ src: "", alt: "" }, { src: "", alt: "" }] } :
          type === "product" ? { type: type, slug: "" } :
          { type: type, text: "" }
        );
        renderBlocks();
      });
      addRow.appendChild(btn);
    });

    // Product picker panel: search + category chips + one-tap insert.
    // Tapping a product drops its card (photo, price, Buy Now) at the
    // end of the article.
    var picker = (function () {
      var pickerState = { q: "", cat: null };
      var pickerCats = uniqueProductValues(state.products.data, "category");

      var searchIn = el("input", { type: "search", class: "picker-search", placeholder: "Search products…", autocomplete: "off" });
      var chipRow = el("div", { class: "picker-chips" });
      var itemsWrap = el("div", { class: "product-picker" });

      function renderChips() {
        chipRow.textContent = "";
        function addChip(label, value) {
          var button = el("button", { type: "button", class: "chip", "aria-pressed": String(pickerState.cat === value) }, [label]);
          button.addEventListener("click", function () {
            pickerState.cat = value;
            renderChips();
            renderItems();
          });
          chipRow.appendChild(button);
        }
        addChip("All", null);
        pickerCats.forEach(function (c) { addChip(c, c); });
      }

      function renderItems() {
        itemsWrap.textContent = "";
        var visible = state.products.data.filter(function (p) {
          var catOk = !pickerState.cat || norm(p.category) === norm(pickerState.cat);
          var q = norm(pickerState.q);
          var qOk = !q || norm(p.name).indexOf(q) !== -1;
          return catOk && qOk;
        });
        if (!visible.length) {
          itemsWrap.appendChild(el("span", { class: "field-hint" }, ["No products match."]));
          return;
        }
        visible.forEach(function (p) {
          var pickBtn = el("button", { type: "button", class: "picker-item", title: "Insert " + p.name }, [
            p.image ? el("img", { src: p.image, alt: "" }) : null,
            el("span", null, [p.name]),
            p.price ? el("span", { class: "picker-price" }, [p.price]) : null
          ]);
          pickBtn.addEventListener("click", function () {
            state.blocks.push({ type: "product", slug: p.slug });
            renderBlocks();
            setStatus("“" + p.name + "” added to the end of the article.");
          });
          itemsWrap.appendChild(pickBtn);
        });
      }

      searchIn.addEventListener("input", function () {
        pickerState.q = searchIn.value;
        renderItems();
      });

      renderChips();
      renderItems();

      return el("div", { class: "picker-panel" }, [
        el("span", { class: "field-label" }, ["Insert a product"]),
        el("span", { class: "field-hint" }, ["Tap one — its card lands at the end of the article (move it with the arrows)."]),
        searchIn,
        chipRow,
        itemsWrap
      ]);
    })();

    var titleInput = textInput("f-title", post.title, "Article title…");
    titleInput.classList.add("big");

    var catFields = categoryFields("posts", { cat: "f-post-cat", sub: "f-post-sub" }, post.category, post.subcategory);

    var form = el("form", { class: "admin-form", novalidate: "" }, [
      field("Title", titleInput),
      catFields[0],
      catFields[1],
      imageField("Cover photo", "f-cover", post.cover, "Optional — the large photo at the top of the article and in the journal list. Articles look good without one too."),
      field("Date", el("input", { type: "date", id: "f-date", value: post.date || new Date().toISOString().slice(0, 10) }), "Newest date shows first in the journal."),
      field("Short summary", el("textarea", { id: "f-excerpt" }, [post.excerpt || ""]), "1–2 sentences shown in the journal list."),
      el("div", { class: "field" }, [
        el("span", { class: "field-label" }, ["Article"]),
        el("span", { class: "field-hint" }, ["Build the article from blocks: text, headings, single photos, a gallery (photos side by side), or products. Reorder with the arrows."]),
        el("div", { class: "blocks-editor", id: "blocks-editor" }),
        addRow,
        picker
      ])
    ]);

    form.appendChild(formButtons(form, function () {
      var title = $("f-title").value.trim();
      if (!title) return { error: "Give the article a title." };
      if (!$("f-date").value) return { error: "Pick a date." };
      return { item: {
        slug: resolveSlug(title),
        title: title,
        date: $("f-date").value,
        category: catValue("f-post-cat"),
        subcategory: catValue("f-post-sub"),
        cover: $("f-cover").value.trim(),
        excerpt: $("f-excerpt").value.trim(),
        content: state.blocks
      } };
    }));

    // The editor div exists only after the form is in the DOM, so render on next tick.
    setTimeout(renderBlocks, 0);
    return form;
  }

  /* ---------- Shared form plumbing ---------- */

  function formButtons(form, collect) {
    var error = el("p", { class: "form-error", role: "alert" }, []);
    var save = el("button", { class: "btn", type: "submit" }, ["Save"]);
    var cancel = el("button", { class: "ghost-btn", type: "button" }, ["Cancel"]);
    cancel.addEventListener("click", function () { selectTab(state.tab); });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      error.textContent = "";

      var result = collect();
      if (result.error) { error.textContent = result.error; return; }

      var items = state[state.tab].data;
      var isNew = state.editIndex === -1;
      if (isNew) items.push(result.item);
      else items[state.editIndex] = result.item;

      var noun = state.tab === "products" ? "product" : "article";
      var label = result.item.name || result.item.title;
      save.disabled = true;
      saveFile(state.tab, "admin: " + (isNew ? "add" : "update") + " " + noun + " “" + label + "”")
        .then(function () { selectTab(state.tab); })
        .catch(function (saveError) {
          save.disabled = false;
          error.textContent = saveError.message;
        });
    });

    return el("div", null, [error, el("div", { class: "form-buttons" }, [save, cancel])]);
  }

  function openForm(index) {
    // Only Products and Articles have an add/edit form.
    if (state.tab !== "products" && state.tab !== "posts") return;
    state.editIndex = index;
    var isProduct = state.tab === "products";
    var blank = isProduct
      ? { slug: "", name: "", price: "", type: "physical", source: "affiliate", category: "", subcategory: "", image: "", images: [], affiliateLink: "", description: "", colors: [] }
      : { slug: "", title: "", date: "", category: "", subcategory: "", cover: "", excerpt: "", content: [] };
    var item = index === -1 ? blank : state[state.tab].data[index];

    var view = $("form-view");
    view.textContent = "";
    view.appendChild(el("h1", { class: "admin-title" }, [
      (index === -1 ? "Add " : "Edit ") + (isProduct ? "product" : "article")
    ]));
    view.appendChild(isProduct ? productForm(item) : postForm(item));

    $("list-view").hidden = true;
    view.hidden = false;
  }

  /* ---------- Boot ---------- */

  document.addEventListener("DOMContentLoaded", function () {
    $("token-connect").addEventListener("click", function () {
      var token = $("token-input").value.trim();
      if (!token) { $("auth-error").textContent = "Paste a token first."; return; }
      connect(token);
    });
    $("token-input").addEventListener("keydown", function (event) {
      if (event.key === "Enter") $("token-connect").click();
    });

    $("tab-products").addEventListener("click", function () { selectTab("products"); });
    $("tab-posts").addEventListener("click", function () { selectTab("posts"); });
    $("tab-categories").addEventListener("click", function () { selectTab("categories"); });
    $("tab-contact").addEventListener("click", function () { selectTab("contact"); });
    $("add-item").addEventListener("click", function () { openForm(-1); });
    $("logout").addEventListener("click", function () {
      localStorage.removeItem(TOKEN_KEY);
      state.token = null;
      $("token-input").value = "";
      showAuth("");
    });

    var saved = localStorage.getItem(TOKEN_KEY);
    if (saved) connect(saved);
    else showAuth("");
  });

  // Debug hook so the UI can be exercised without a real token (used in testing).
  window.SSAdmin = {
    _debugLoad: function (products, posts, site) {
      state.products = { data: products, sha: "debug" };
      state.posts = { data: posts, sha: "debug" };
      if (site) state.site = { data: site, sha: "debug" };
      ensureCatStore();
      $("auth-screen").hidden = true;
      $("loading").hidden = true;
      $("panel").hidden = false;
      selectTab("products");
    }
  };
})();
