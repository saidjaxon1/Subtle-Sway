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
    tab: "products",     // which tab is active
    editIndex: -1,       // -1 = adding a new item
    blocks: []           // working copy of a post's content blocks while editing
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
    return fetch(API_BASE + name + ".json", {
      method: "PUT",
      headers: apiHeaders(),
      body: JSON.stringify({
        message: message,
        content: b64encode(JSON.stringify(state[name].data, null, 2) + "\n"),
        sha: state[name].sha,
        branch: CONFIG.branch
      })
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
    Promise.all([fetchFile("products"), fetchFile("posts")])
      .then(function () {
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

  function selectTab(tab) {
    state.tab = tab;
    $("tab-products").setAttribute("aria-selected", tab === "products");
    $("tab-posts").setAttribute("aria-selected", tab === "posts");
    $("tab-categories").setAttribute("aria-selected", tab === "categories");
    $("list-title").textContent = { products: "Products", posts: "Articles", categories: "Categories" }[tab];
    $("add-item").hidden = tab === "categories";
    $("form-view").hidden = true;
    $("list-view").hidden = false;
    renderList();
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

    items.forEach(function (item, index) {
      var isProduct = state.tab === "products";
      var editBtn = el("button", { class: "ghost-btn", type: "button" }, ["Edit"]);
      var deleteBtn = el("button", { class: "ghost-btn danger", type: "button" }, ["Delete"]);

      editBtn.addEventListener("click", function () { openForm(index); });
      deleteBtn.addEventListener("click", function () { deleteItem(index); });

      list.appendChild(el("li", null, [
        el("img", { src: isProduct ? item.image : item.cover, alt: "" }),
        el("div", { class: "item-info" }, [
          el("span", { class: "item-name" }, [isProduct ? item.name : item.title]),
          el("span", { class: "item-meta" }, [
            isProduct
              ? [item.price || "no price",
                 (item.type || "") === "digital" ? "digital" : null,
                 (item.source || "") === "own" ? "my product" : null,
                 item.slug]
                  .filter(Boolean).join("  ·  ")
              : item.date + "  ·  " + item.slug
          ])
        ]),
        el("div", { class: "item-actions" }, [editBtn, deleteBtn])
      ]));
    });
  }

  /* ---------- Categories view (rename everywhere in one step) ---------- */

  function renameEverywhere(label, key, oldName, filter) {
    var next = window.prompt(
      "New name for " + label + " “" + oldName + "”.\nEvery product in it will be updated.",
      oldName
    );
    if (next === null) return;
    next = next.trim();
    if (!next || next === oldName) return;

    state.products.data.forEach(function (p) {
      if (norm(p[key]) === norm(oldName) && (!filter || filter(p))) p[key] = next;
    });
    saveFile("products", "admin: rename " + label + " “" + oldName + "” to “" + next + "”")
      .then(renderList)
      .catch(function (error) { setStatus(error.message, true); renderList(); });
  }

  function renderCategories(list) {
    var products = state.products.data;
    var categories = uniqueProductValues(products, "category");

    if (!categories.length) {
      list.appendChild(el("li", { class: "admin-empty" }, [
        "No categories yet. Categories are created from products — give a product a category name and it appears here."
      ]));
      return;
    }

    list.appendChild(el("li", { class: "admin-hint" }, [
      "Categories come from your products: type a new name on any product to create one; empty categories disappear on their own. Renaming here updates every product in one step."
    ]));

    categories.forEach(function (category) {
      var inCategory = products.filter(function (p) { return norm(p.category) === norm(category); });

      var renameBtn = el("button", { class: "ghost-btn", type: "button" }, ["Rename"]);
      renameBtn.addEventListener("click", function () {
        renameEverywhere("category", "category", category);
      });

      list.appendChild(el("li", null, [
        el("div", { class: "item-info" }, [
          el("span", { class: "item-name" }, [category]),
          el("span", { class: "item-meta" }, [inCategory.length + (inCategory.length === 1 ? " product" : " products")])
        ]),
        el("div", { class: "item-actions" }, [renameBtn])
      ]));

      uniqueProductValues(inCategory, "subcategory").forEach(function (sub) {
        var subCount = inCategory.filter(function (p) { return norm(p.subcategory) === norm(sub); }).length;
        var subRename = el("button", { class: "ghost-btn", type: "button" }, ["Rename"]);
        subRename.addEventListener("click", function () {
          // Scope the rename to this category so a same-named subcategory
          // elsewhere is left untouched.
          renameEverywhere("subcategory", "subcategory", sub, function (p) {
            return norm(p.category) === norm(category);
          });
        });

        list.appendChild(el("li", { class: "sub" }, [
          el("div", { class: "item-info" }, [
            el("span", { class: "item-name sub-name" }, ["↳  " + sub]),
            el("span", { class: "item-meta" }, [subCount + (subCount === 1 ? " product" : " products")])
          ]),
          el("div", { class: "item-actions" }, [subRename])
        ]));
      });
    });
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

    // Existing category/subcategory names appear as typing suggestions,
    // so a typo can't accidentally create a new category.
    var catInput = textInput("f-cat", product.category, "e.g. Home Decor");
    catInput.setAttribute("list", "dl-categories");
    var subInput = textInput("f-sub", product.subcategory, "e.g. Living Room");
    subInput.setAttribute("list", "dl-subcategories");

    var nameInput = textInput("f-name", product.name, "e.g. Walnut Coffee Table");
    nameInput.classList.add("big");

    var form = el("form", { class: "admin-form", novalidate: "" }, [
      el("datalist", { id: "dl-categories" },
        uniqueProductValues(state.products.data, "category").map(function (c) { return el("option", { value: c }); })),
      el("datalist", { id: "dl-subcategories" },
        uniqueProductValues(state.products.data, "subcategory").map(function (s) { return el("option", { value: s }); })),
      field("Name", nameInput),
      imageField("Photo", "f-image", product.image, "Paste a link, or press Upload to use a photo from this computer."),
      field("Price", textInput("f-price", product.price, "e.g. $249"), "Optional — leave empty to show no price."),
      field("Buy Now link", textInput("f-link", product.affiliateLink, "https://…"), "Where the Buy Now button sends the visitor."),
      field("Link type", sourceSelect),
      field("Product kind", typeSelect, "Shown as a small tag on the product page."),
      field("Category", catInput, "The shop filter group. Pick an existing one or type a new name."),
      field("Subcategory", subInput, "Optional — the finer filter inside a category."),
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
        category: $("f-cat").value.trim(),
        subcategory: $("f-sub").value.trim(),
        image: $("f-image").value.trim(),
        affiliateLink: $("f-link").value.trim(),
        description: $("f-desc").value.trim(),
        colors: $("f-colors").value.split(",").map(function (c) { return c.trim(); }).filter(Boolean)
      } };
    }));
    return form;
  }

  /* ---------- Post form (with content block editor) ---------- */

  var BLOCK_LABELS = { paragraph: "Text", heading: "Heading", image: "Photo", product: "Product" };

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
          src.value = url;
          block.src = url;
          uploadBtn.disabled = false;
          uploadStatus.textContent = "Uploaded ✓";
          fileInput.value = "";
        }, function (error) {
          uploadBtn.disabled = false;
          uploadStatus.textContent = error.message;
        });
      });

      body.appendChild(el("div", { class: "img-row" }, [src, uploadBtn]));
      body.appendChild(fileInput);
      body.appendChild(uploadStatus);
      body.appendChild(alt);
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
        state.blocks.push(type === "image" ? { type: type, src: "", alt: "" } :
                          type === "product" ? { type: type, slug: "" } :
                          { type: type, text: "" });
        renderBlocks();
      });
      addRow.appendChild(btn);
    });

    var titleInput = textInput("f-title", post.title, "Article title…");
    titleInput.classList.add("big");

    var form = el("form", { class: "admin-form", novalidate: "" }, [
      field("Title", titleInput),
      imageField("Cover photo", "f-cover", post.cover, "The large photo at the top of the article and in the journal list."),
      field("Date", el("input", { type: "date", id: "f-date", value: post.date || new Date().toISOString().slice(0, 10) }), "Newest date shows first in the journal."),
      field("Short summary", el("textarea", { id: "f-excerpt" }, [post.excerpt || ""]), "1–2 sentences shown in the journal list."),
      el("div", { class: "field" }, [
        el("span", { class: "field-label" }, ["Article"]),
        el("span", { class: "field-hint" }, ["Build the article from blocks. Use the buttons below to add text, headings, photos, or a product with its Buy Now button."]),
        el("div", { class: "blocks-editor", id: "blocks-editor" }),
        addRow
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
    state.editIndex = index;
    var isProduct = state.tab === "products";
    var blank = isProduct
      ? { slug: "", name: "", price: "", type: "physical", source: "affiliate", category: "", subcategory: "", image: "", affiliateLink: "", description: "", colors: [] }
      : { slug: "", title: "", date: "", cover: "", excerpt: "", content: [] };
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
    _debugLoad: function (products, posts) {
      state.products = { data: products, sha: "debug" };
      state.posts = { data: posts, sha: "debug" };
      $("auth-screen").hidden = true;
      $("loading").hidden = true;
      $("panel").hidden = false;
      selectTab("products");
    }
  };
})();
