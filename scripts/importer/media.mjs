// Convert mockups for the web with FFmpeg (run as a separate program).
// Images → WebP 640/1080/1600 + JPG 1600, all metadata stripped.
// Video  → H.264 MP4 + VP9 WebM, max 1080 px, no audio, plus a poster JPG.
// Results are cached by source hash so unchanged files are never re-encoded.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { assertAllowed } from "./allow-list.mjs";

export const IMAGE_WIDTHS = [640, 1080, 1600];
const CACHE = process.env.SUBTLESWAY_CACHE || path.join(os.homedir(), ".cache", "subtlesway-import");
const ENCODER_VERSION = "v1";

const ffmpeg = (args) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: ["ignore", "ignore", "pipe"] });

export function hasFfmpeg() {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function probeSize(file) {
  const out = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file]).toString().trim();
  const [w, h] = out.split(",").map(Number);
  return { width: w || 0, height: h || 0 };
}

function watermarkFilter(text) {
  const fonts = ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/TTF/DejaVuSans.ttf"];
  const font = fonts.find((f) => fs.existsSync(f));
  if (!font || !text) return "";
  const safe = text.replace(/[\\:'%]/g, "");
  return `,drawtext=fontfile=${font}:text='${safe}':fontcolor=white@0.35:fontsize=h*0.022:x=w-tw-h*0.03:y=h-th-h*0.03`;
}

/**
 * Convert one source file. Returns
 *   { type: "image", files: { "<n>-640.webp": absPath, ... }, width, height }
 *   { type: "video", files: { "<n>.mp4": absPath, "<n>.webm": absPath, "<n>-poster.jpg": absPath }, width, height }
 */
export function convert(root, source, hash, { watermark = "" } = {}) {
  assertAllowed(root, source.abs);
  const n = String(source.n);
  const isVideo = /\.mp4$/i.test(source.name);
  const key = `${ENCODER_VERSION}-${hash.slice(0, 32)}${watermark && !isVideo ? "-wm" : ""}`;
  const dir = path.join(CACHE, key);
  const done = path.join(dir, ".done.json");
  if (fs.existsSync(done)) {
    const meta = JSON.parse(fs.readFileSync(done, "utf8"));
    const files = Object.fromEntries(Object.entries(meta.files).map(([k, f]) => [k.replace(/^[^-.]+/, n), path.join(dir, f)]));
    return { ...meta, files };
  }
  fs.mkdirSync(dir, { recursive: true });
  const files = {};
  let size;

  if (isVideo) {
    const scale = "scale='min(1080,iw)':-2";
    ffmpeg(["-i", source.abs, "-an", "-map_metadata", "-1", "-vf", scale, "-c:v", "libx264", "-preset", "slow", "-crf", "24", "-pix_fmt", "yuv420p", "-movflags", "+faststart", path.join(dir, "x.mp4")]);
    ffmpeg(["-i", source.abs, "-an", "-map_metadata", "-1", "-vf", scale, "-c:v", "libvpx-vp9", "-crf", "34", "-b:v", "0", "-row-mt", "1", "-deadline", "good", "-cpu-used", "4", path.join(dir, "x.webm")]);
    ffmpeg(["-i", path.join(dir, "x.mp4"), "-frames:v", "1", "-q:v", "3", path.join(dir, "x-poster.jpg")]);
    files["x.mp4"] = "x.mp4";
    files["x.webm"] = "x.webm";
    files["x-poster.jpg"] = "x-poster.jpg";
    size = probeSize(path.join(dir, "x.mp4"));
  } else {
    size = probeSize(source.abs);
    for (const w of IMAGE_WIDTHS) {
      const wm = w === 1600 ? watermarkFilter(watermark) : "";
      ffmpeg(["-i", source.abs, "-map_metadata", "-1", "-vf", `scale='min(${w},iw)':-2${wm}`, "-c:v", "libwebp", "-quality", "80", "-compression_level", "6", path.join(dir, `x-${w}.webp`)]);
      files[`x-${w}.webp`] = `x-${w}.webp`;
    }
    const wm = watermarkFilter(watermark);
    ffmpeg(["-i", source.abs, "-map_metadata", "-1", "-vf", `scale='min(1600,iw)':-2${wm}`, "-q:v", "3", path.join(dir, "x-1600.jpg")]);
    files["x-1600.jpg"] = "x-1600.jpg";
  }
  const meta = { type: isVideo ? "video" : "image", width: size.width, height: size.height, files };
  fs.writeFileSync(done, JSON.stringify(meta));
  return { ...meta, files: Object.fromEntries(Object.entries(files).map(([k, f]) => [k.replace(/^x/, n), path.join(dir, f)])) };
}
