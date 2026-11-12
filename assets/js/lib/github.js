// Tiny GitHub REST client used by the admin panel (browser). Dependency-free.

export class GitHubRepo {
  constructor(fullName, token) {
    this.fullName = fullName;
    this.token = token;
    this.branch = null;
  }

  async api(method, url, body, accept = "application/vnd.github+json") {
    const res = await fetch(`https://api.github.com/repos/${this.fullName}${url}`, {
      method,
      cache: "no-store",
      headers: {
        Accept: accept,
        Authorization: `Bearer ${this.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const err = new Error(`${this.fullName}: ${res.status} ${text.slice(0, 200)}`);
      err.status = res.status;
      throw err;
    }
    if (accept === "application/vnd.github.raw") return res;
    return res.status === 204 ? null : res.json();
  }

  async info() {
    const i = await this.api("GET", "");
    this.branch = i.default_branch || "main";
    this.private = i.private;
    this.permissions = i.permissions || {};
    return i;
  }

  async head() {
    if (!this.branch) await this.info();
    const ref = await this.api("GET", `/git/ref/heads/${this.branch}`);
    return ref.object.sha;
  }

  /** All file paths with their blob shas: Map(path → sha). */
  async tree() {
    const sha = await this.head();
    const t = await this.api("GET", `/git/trees/${sha}?recursive=1`);
    const map = new Map();
    for (const e of t.tree) if (e.type === "blob") map.set(e.path, e.sha);
    return map;
  }

  async raw(path) {
    if (!this.branch) await this.info();
    const res = await this.api("GET", `/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${this.branch}`, null, "application/vnd.github.raw");
    return res;
  }

  async json(path, fallback) {
    try {
      return await (await this.raw(path)).json();
    } catch (e) {
      if (e.status === 404 && fallback !== undefined) return fallback;
      throw e;
    }
  }

  async blob(path) {
    return (await this.raw(path)).blob();
  }

  async blobBase64BySha(sha) {
    const b = await this.api("GET", `/git/blobs/${sha}`);
    return b.content.replace(/\n/g, "");
  }

  /**
   * One commit with many changes.
   * change: { path, text } | { path, base64 } | { path, sha } (existing blob in THIS repo) | { path, delete: true }
   */
  async commit(changes, message) {
    if (!changes.length) return null;
    const parent = await this.head();
    const parentCommit = await this.api("GET", `/git/commits/${parent}`);
    const entries = [];
    for (const c of changes) {
      if (c.delete) {
        entries.push({ path: c.path, mode: "100644", type: "blob", sha: null });
      } else if (c.sha) {
        entries.push({ path: c.path, mode: "100644", type: "blob", sha: c.sha });
      } else if (c.base64 !== undefined) {
        const b = await this.api("POST", "/git/blobs", { content: c.base64, encoding: "base64" });
        entries.push({ path: c.path, mode: "100644", type: "blob", sha: b.sha });
      } else {
        entries.push({ path: c.path, mode: "100644", type: "blob", content: c.text });
      }
    }
    const tree = await this.api("POST", "/git/trees", { base_tree: parentCommit.tree.sha, tree: entries });
    const commit = await this.api("POST", "/git/commits", { message, tree: tree.sha, parents: [parent] });
    await this.api("PATCH", `/git/refs/heads/${this.branch}`, { sha: commit.sha });
    return commit.sha;
  }

  async commits(n = 20) {
    if (!this.branch) await this.info();
    return this.api("GET", `/commits?sha=${this.branch}&per_page=${n}`);
  }
}
