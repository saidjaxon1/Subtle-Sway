// Where drafts are stored.
//   LocalTarget  — a folder on disk (tests, previews)
//   GitHubTarget — the PRIVATE drafts repository, through the GitHub API.
//
// The import token only has access to the private drafts repository, so the
// importer physically cannot write to the public site: it can create and
// update drafts, never publish.

import fs from "node:fs";
import path from "node:path";

export class LocalTarget {
  constructor(dir) {
    this.dir = path.resolve(dir);
    this.label = this.dir;
  }
  async listDrafts() {
    const base = path.join(this.dir, "drafts");
    if (!fs.existsSync(base)) return [];
    return fs
      .readdirSync(base, { withFileTypes: true })
      .filter((e) => e.isDirectory() && fs.existsSync(path.join(base, e.name, "draft.json")))
      .map((e) => JSON.parse(fs.readFileSync(path.join(base, e.name, "draft.json"), "utf8")));
  }
  async commit(changes) {
    for (const c of changes) {
      const file = path.join(this.dir, c.path);
      if (!file.startsWith(this.dir + path.sep)) throw new Error(`bad path ${c.path}`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      if (c.sourceFile) fs.copyFileSync(c.sourceFile, file);
      else fs.writeFileSync(file, c.content);
    }
  }
}

export class GitHubTarget {
  constructor(repo, token) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo || "")) throw new Error("DRAFTS_REPO must look like owner/name");
    if (!token) throw new Error("IMPORT_TOKEN is missing");
    this.repo = repo;
    this.token = token;
    this.label = `github.com/${repo} (private)`;
  }

  async api(method, url, body, accept = "application/vnd.github+json") {
    const res = await fetch(`https://api.github.com/repos/${this.repo}${url}`, {
      method,
      headers: {
        Accept: accept,
        Authorization: `Bearer ${this.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "subtlesway-importer",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      if (res.status === 401) {
        throw new Error("GitHub tokeni ishlamayapti: muddati tugagan yoki noto'g'ri. GitHub'da yangi token yarating va .env faylidagi IMPORT_TOKEN ni almashtiring (docs/QOLLANMA_UZ.md).");
      }
      if (res.status === 403 || res.status === 404) {
        throw new Error(`GitHub ruxsat bermadi (${res.status}). Token Subtle-Sway-drafts repozitoriyasiga "Contents: Read and write" ruxsati bilan berilganini tekshiring.`);
      }
      const err = new Error(`GitHub ${method} ${url} → ${res.status}: ${text.slice(0, 300)}`);
      err.status = res.status;
      throw err;
    }
    if (accept.endsWith(".raw")) return res.text();
    return res.status === 204 ? null : res.json();
  }

  async init() {
    if (this.branch) return;
    const info = await this.api("GET", "");
    if (!info.private) throw new Error(`${this.repo} is PUBLIC. Drafts must go to a private repository — refusing to upload.`);
    this.branch = info.default_branch || "main";
  }

  async head() {
    await this.init();
    try {
      const ref = await this.api("GET", `/git/ref/heads/${this.branch}`);
      return ref.object.sha;
    } catch (e) {
      if (e.status !== 409 && e.status !== 404) throw e;
      // Empty repository: create a first commit so the Git Data API works.
      await this.api("PUT", "/contents/README.md", {
        message: "Start drafts repository",
        content: Buffer.from("# Subtle Sway drafts\n\nPrivate. Written by the importer and the admin panel.\n").toString("base64"),
        branch: this.branch,
      });
      const ref = await this.api("GET", `/git/ref/heads/${this.branch}`);
      return ref.object.sha;
    }
  }

  async listDrafts() {
    const sha = await this.head();
    const tree = await this.api("GET", `/git/trees/${sha}?recursive=1`);
    const paths = tree.tree.filter((t) => /^drafts\/[^/]+\/draft\.json$/.test(t.path)).map((t) => t.path);
    const out = [];
    for (const p of paths) {
      const text = await this.api("GET", `/contents/${encodeURI(p)}?ref=${this.branch}`, null, "application/vnd.github.raw");
      out.push(JSON.parse(text));
    }
    return out;
  }

  async commit(changes, message) {
    if (!changes.length) return;
    const parent = await this.head();
    const parentCommit = await this.api("GET", `/git/commits/${parent}`);
    const tree = [];
    for (const c of changes) {
      const buf = c.sourceFile ? fs.readFileSync(c.sourceFile) : Buffer.from(c.content);
      const blob = await this.api("POST", "/git/blobs", { content: buf.toString("base64"), encoding: "base64" });
      tree.push({ path: c.path, mode: "100644", type: "blob", sha: blob.sha });
    }
    const newTree = await this.api("POST", "/git/trees", { base_tree: parentCommit.tree.sha, tree });
    const commit = await this.api("POST", "/git/commits", { message, tree: newTree.sha, parents: [parent] });
    await this.api("PATCH", `/git/refs/heads/${this.branch}`, { sha: commit.sha });
  }
}
