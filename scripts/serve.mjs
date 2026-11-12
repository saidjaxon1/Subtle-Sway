#!/usr/bin/env node
// Minimal local static server that behaves like GitHub Pages:
// folder URLs serve index.html, unknown paths serve 404.html.
//   node scripts/serve.mjs [--dir DIR] [--port 8080]

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const arg = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const ROOT = path.resolve(arg("--dir", path.join(path.dirname(fileURLToPath(import.meta.url)), "..")));
const PORT = Number(arg("--port", process.env.PORT || 8080));

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".woff2": "font/woff2",
};

http
  .createServer((req, res) => {
    let rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT)) {
      res.writeHead(403).end();
      return;
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      if (!rel.endsWith("/")) {
        res.writeHead(301, { Location: rel + "/" }).end();
        return;
      }
      file = path.join(file, "index.html");
    }
    let status = 200;
    if (!fs.existsSync(file)) {
      status = 404;
      file = path.join(ROOT, "404.html");
    }
    const type = TYPES[path.extname(file)] || "application/octet-stream";
    const stat = fs.statSync(file);
    const range = req.headers.range;
    if (range && status === 200) {
      const [s, e] = range.replace("bytes=", "").split("-");
      const start = Number(s);
      const end = e ? Number(e) : stat.size - 1;
      res.writeHead(206, { "Content-Type": type, "Content-Range": `bytes ${start}-${end}/${stat.size}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1 });
      fs.createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.writeHead(status, { "Content-Type": type, "Content-Length": stat.size, "Cache-Control": "no-cache" });
    fs.createReadStream(file).pipe(res);
  })
  .listen(PORT, () => console.log(`Serving ${ROOT} at http://localhost:${PORT}`));
