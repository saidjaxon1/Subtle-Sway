// Any page address the site ever had must keep working (as a redirect if the page is gone).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "..");

test("old addresses become redirects, never 404", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ss-urls-"));
  const data = path.join(tmp, "data");
  const out = path.join(tmp, "out");
  fs.mkdirSync(data);
  for (const f of ["settings.json", "catalogs.json", "pages.json"]) fs.copyFileSync(path.join(ROOT, "data", f), path.join(data, f));
  fs.writeFileSync(path.join(data, "products.json"), "[]");
  fs.writeFileSync(path.join(data, "urls.json"), JSON.stringify(["/products/gone-print/", "/old-page/", "/about/"]));
  execFileSync("node", [path.join(ROOT, "scripts/build.mjs"), "--data", data, "--out", out]);
  assert.match(fs.readFileSync(path.join(out, "products/gone-print/index.html"), "utf8"), /url=\/products\//);
  assert.match(fs.readFileSync(path.join(out, "old-page/index.html"), "utf8"), /url=\//);
  assert.match(fs.readFileSync(path.join(out, "about/index.html"), "utf8"), /About Subtle Sway/, "live pages are not replaced");
  const urls = JSON.parse(fs.readFileSync(path.join(data, "urls.json"), "utf8"));
  assert.ok(urls.includes("/products/gone-print/") && urls.includes("/faq/"), "the record only ever grows");
});
