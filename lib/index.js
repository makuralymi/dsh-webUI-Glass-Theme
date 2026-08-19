/**
 * Host half of the frosted-glass / Monet skin plugin.
 *
 * The browser half owns the whole skin (glass token layer, Monet theme
 * registry, wallpaper extraction from the custom background). This host half
 * adds one small optional service: a `/api/dsh-client-ui-frosted-glass/
 * desktop-wallpaper` route that reads the operating system desktop wallpaper
 * and returns a downscaled base64 image the browser can extract a Monet seed
 * color from.
 *
 * Primary path: the cross-platform `wallpaper` npm package (GNOME / KDE /
 * XFCE / MATE / Cinnamon / swaybg / swww / macOS / Windows and more).
 * Fallback path: the `subprocess` service with hand-rolled detection scripts.
 *
 * The route is registered only when the `webServer` service is composed. If
 * neither `wallpaper` nor `subprocess` can produce a result the route returns
 * a JSON error and the client shows the generic extraction-failed hint.
 */

import { spawn } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";

const WALLPAPER_ROUTE = "/api/dsh-client-ui-frosted-glass/desktop-wallpaper";

/**
 * POSIX (Linux + macOS) wallpaper detection + downscale/read script.
 * Outputs three lines:
 *   PATH:<absolute wallpaper path>
 *   MIME:<image mime of the returned bytes>
 *   <single line of base64 image bytes>
 * ImageMagick (`magick` or `convert`) is used when present so exotic
 * wallpaper formats (JXL, HEIC, AVIF) become a small PNG the browser can
 * decode; otherwise the original file bytes are base64-encoded as-is.
 */
const POSIX_SCRIPT = `
detect_uri() {
  case "$(uname -s)" in
    Darwin)
      uri=$(osascript -e 'tell application "System Events" to get picture of current desktop' 2>/dev/null)
      if [ -n "$uri" ]; then printf '%s' "$uri"; return 0; fi
      ;;
  esac
  if command -v gsettings >/dev/null 2>&1; then
    uri=$(gsettings get org.gnome.desktop.background picture-uri 2>/dev/null | tr -d "'")
    if [ -n "$uri" ] && [ "$uri" != "file://" ]; then printf '%s' "$uri"; return 0; fi
  fi
  if command -v kreadconfig6 >/dev/null 2>&1; then
    uri=$(kreadconfig6 --group Wallpaper --key Image 2>/dev/null)
    if [ -n "$uri" ]; then printf '%s' "$uri"; return 0; fi
  fi
  if command -v kreadconfig5 >/dev/null 2>&1; then
    uri=$(kreadconfig5 --group Wallpaper --key Image 2>/dev/null)
    if [ -n "$uri" ]; then printf '%s' "$uri"; return 0; fi
  fi
  if [ -f "$HOME/.config/plasma-org.kde.plasma.desktop-appletsrc" ]; then
    uri=$(awk -F= '/^Image=/{print $2; exit}' "$HOME/.config/plasma-org.kde.plasma.desktop-appletsrc" 2>/dev/null)
    if [ -n "$uri" ]; then printf '%s' "$uri"; return 0; fi
  fi
  if command -v xfconf-query >/dev/null 2>&1; then
    uri=$(xfconf-query -c xfce4-desktop -p /backdrop/screen0/monitor0/last-image 2>/dev/null)
    if [ -n "$uri" ]; then printf '%s' "$uri"; return 0; fi
  fi
  if [ -f "$HOME/.config/nitrogen/bg-saved.cfg" ]; then
    uri=$(sed -n 's/^file=//p' "$HOME/.config/nitrogen/bg-saved.cfg" | head -n1)
    if [ -n "$uri" ]; then printf '%s' "$uri"; return 0; fi
  fi
  return 1
}

guess_mime() {
  case "$1" in
    *.png|*.PNG) printf 'image/png' ;;
    *.webp|*.WEBP) printf 'image/webp' ;;
    *.avif|*.AVIF) printf 'image/avif' ;;
    *.jxl|*.JXL) printf 'image/jxl' ;;
    *.gif|*.GIF) printf 'image/gif' ;;
    *) printf 'image/jpeg' ;;
  esac
}

uri=$(detect_uri) || { echo "wallpaper uri not found" >&2; exit 1; }
case "$uri" in
  file://*) path=\${uri#file://} ;;
  http://*|https://*) echo "remote wallpaper uri is not supported" >&2; exit 3 ;;
  *) path=$uri ;;
esac
if [ ! -f "$path" ]; then
  if command -v gsettings >/dev/null 2>&1; then
    color=$(gsettings get org.gnome.desktop.background primary-color 2>/dev/null | tr -d "'")
    if [ -n "$color" ]; then printf 'SEED:%s\n' "$color"; exit 0; fi
  fi
  echo "wallpaper file not found: $path" >&2; exit 2
fi
printf 'PATH:%s\\n' "$path"

mime=$(guess_mime "$path")
encode_stream() {
  if command -v base64 >/dev/null 2>&1; then base64 | tr -d '\n'; else openssl base64 -A 2>/dev/null; fi
}
encode_file() {
  if command -v base64 >/dev/null 2>&1; then base64 < "$1" | tr -d '\n'; else openssl base64 -A -in "$1" 2>/dev/null; fi
}
if [ "$(uname -s)" = "Darwin" ] && command -v sips >/dev/null 2>&1; then
  tmp="\${TMPDIR:-/tmp}/dsh-wallpaper-$$.png"
  sips -s format png -Z 512 "$path" --out "$tmp" >/dev/null 2>&1
  encoded=$(encode_file "$tmp")
  rm -f "$tmp"
  if [ -n "$encoded" ]; then
    mime='image/png'
  else
    encoded=$(encode_file "$path")
  fi
elif command -v magick >/dev/null 2>&1; then
  encoded=$(magick "$path" -auto-orient -resize '512x512>' PNG:- 2>/dev/null | encode_stream)
  if [ -n "$encoded" ]; then
    mime='image/png'
  else
    encoded=$(encode_file "$path")
  fi
elif command -v convert >/dev/null 2>&1; then
  encoded=$(convert "$path" -auto-orient -resize '512x512>' PNG:- 2>/dev/null | encode_stream)
  if [ -n "$encoded" ]; then
    mime='image/png'
  else
    encoded=$(encode_file "$path")
  fi
else
  encoded=$(encode_file "$path")
fi
[ -n "$encoded" ] || { echo "wallpaper image could not be read" >&2; exit 4; }
printf 'MIME:%s\\n' "$mime"
printf '%s\\n' "$encoded"
`;

/**
 * Windows wallpaper detection + read script (raw bytes; Windows wallpapers
 * are virtually always PNG/JPG, which browsers decode natively).
 */
const WINDOWS_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$p = (Get-ItemProperty 'HKCU:\\Control Panel\\Desktop' -Name WallPaper -ErrorAction SilentlyContinue).WallPaper
if (-not $p) { Write-Error 'wallpaper registry value not found'; exit 1 }
if (-not (Test-Path -LiteralPath $p)) { Write-Error "wallpaper file not found: $p"; exit 2 }
$mime = 'image/jpeg'
if ($p -match '\\.png$') { $mime = 'image/png' }
elseif ($p -match '\\.webp$') { $mime = 'image/webp' }
elseif ($p -match '\\.avif$') { $mime = 'image/avif' }
elseif ($p -match '\\.jxl$') { $mime = 'image/jxl' }
elseif ($p -match '\\.gif$') { $mime = 'image/gif' }
Write-Output ('PATH:' + $p)
Write-Output ('MIME:' + $mime)
$bytes = [IO.File]::ReadAllBytes($p)
[Console]::Out.Write([Convert]::ToBase64String($bytes))
Write-Output ''
`;

function guessMimeFromPath(path) {
  const lower = (path ?? "").toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".avif")) return "image/avif";
  if (lower.endsWith(".jxl")) return "image/jxl";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

function spawnConvert(argv, timeoutMs = 15000) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(argv[0], argv.slice(1), { stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      resolve({ ok: false, error: String(error) });
      return;
    }
    const chunks = [];
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill("SIGKILL"); } catch { /* already closed */ }
    }, timeoutMs);
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ ok: false, error: String(error) });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) resolve({ ok: false, error: "conversion timed out" });
      else if (code === 0) resolve({ ok: true, data: Buffer.concat(chunks), stderr });
      else resolve({ ok: false, error: stderr || `converter exited ${code}` });
    });
  });
}

/** Downscale/transcode to PNG when a converter is available; null otherwise. */
async function convertWallpaperToPng(path) {
  const temp = join(tmpdir(), `dsh-wallpaper-${Date.now()}-${Math.random().toString(36).slice(2)}.png`);
  for (const argv of [
    ["magick", path, "-auto-orient", "-resize", "512x512>", "PNG:-"],
    ["convert", path, "-auto-orient", "-resize", "512x512>", "PNG:-"],
  ]) {
    const result = await spawnConvert(argv);
    if (result.ok && result.data.length > 0) return result.data;
  }
  const sips = await spawnConvert(["sips", "-s", "format", "png", "-Z", "512", path, "--out", temp]);
  if (!sips.ok) return null;
  try {
    const data = await readFile(temp);
    if (data.length > 0) return data;
  } catch {
    // fall through
  } finally {
    rm(temp, { force: true }).catch(() => {});
  }
  return null;
}

/**
 * Universal wallpaper read via the `wallpaper` npm package. This package is a
 * runtime-optional dependency: dynamic import keeps the plugin loadable even
 * before the profile has reinstalled the package.
 */
async function readDesktopWallpaperUniversal() {
  let wallpaperPath;
  try {
    const wallpaperModule = await import("wallpaper");
    if (typeof wallpaperModule.getWallpaper !== "function") {
      return { ok: false, code: 502, error: "wallpaper package has no getWallpaper" };
    }
    wallpaperPath = await wallpaperModule.getWallpaper();
    if (typeof wallpaperPath !== "string" || wallpaperPath === "") {
      return { ok: false, code: 502, error: "wallpaper path not resolved" };
    }
  } catch (error) {
    return { ok: false, code: 502, error: `wallpaper package unavailable: ${String(error)}` };
  }
  try {
    const raw = await readFile(wallpaperPath);
    const png = await convertWallpaperToPng(wallpaperPath);
    if (png !== null) {
      return {
        ok: true,
        path: wallpaperPath,
        mime: "image/png",
        base64: Buffer.from(png).toString("base64"),
        lossy: false,
      };
    }
    return {
      ok: true,
      path: wallpaperPath,
      mime: guessMimeFromPath(wallpaperPath),
      base64: Buffer.from(raw).toString("base64"),
      lossy: false,
    };
  } catch (error) {
    return { ok: false, code: 502, error: `wallpaper file not found: ${wallpaperPath}` };
  }
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function runSpawn(subprocess, argv, maxBytes) {
  return new Promise((resolve) => {
    let handle;
    try {
      handle = subprocess.spawn({
        argv,
        cwd: ".",
        stdio: {
          stdin: "ignore",
          stdout: { maxBytes, spill: { maxBytes } },
          stderr: { maxBytes: 4096 },
        },
        graceMs: 3000,
      });
    } catch (error) {
      resolve({ ok: false, exitCode: null, stdout: "", stderr: String(error), lossy: false });
      return;
    }
    let settled = false;
    handle.done.then((outcome) => {
      if (settled) return;
      settled = true;
      const collected = handle.collected;
      const out = collected?.stdout?.readFrom(0) ?? { text: "", lossy: true };
      const err = collected?.stderr?.readFrom(0) ?? { text: "" };
      resolve({
        ok: outcome.exitCode === 0,
        exitCode: outcome.exitCode,
        stdout: out.text,
        stderr: err.text,
        lossy: out.lossy === true,
      });
    }, (error) => {
      if (settled) return;
      settled = true;
      resolve({ ok: false, exitCode: null, stdout: "", stderr: String(error), lossy: false });
    });
  });
}

function parseWallpaperOutput(result) {
  if (!result.ok) {
    return {
      ok: false,
      code: result.exitCode === null ? 503 : 502,
      error: (result.stderr ?? "").trim() || "wallpaper detection failed",
    };
  }
  const lines = result.stdout.split(/\r?\n/);
  let path = "";
  let mime = "";
  let seedHex = "";
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.startsWith("PATH:")) path = line.slice(5);
    else if (line.startsWith("MIME:")) mime = line.slice(5);
    else if (line.startsWith("SEED:")) seedHex = line.slice(5);
  }
  const base64 = lines.filter((line) => !line.startsWith("PATH:") && !line.startsWith("MIME:") && !line.startsWith("SEED:")).join("").replace(/\s+/g, "");
  if (seedHex !== "") {
    return { ok: true, path: path || "gnome:primary-color", seedHex, lossy: false };
  }
  if (path === "" || base64 === "") {
    return { ok: false, code: 502, error: "wallpaper image could not be read" };
  }
  return {
    ok: true,
    path,
    mime: mime || "image/jpeg",
    base64,
    lossy: result.lossy === true,
  };
}

async function readPosixWallpaper(subprocess) {
  return parseWallpaperOutput(await runSpawn(subprocess, ["bash", "-lc", POSIX_SCRIPT], 32 * 1024 * 1024));
}

async function readWindowsWallpaper(subprocess) {
  return parseWallpaperOutput(await runSpawn(subprocess, ["powershell", "-NoProfile", "-NonInteractive", "-Command", WINDOWS_SCRIPT], 32 * 1024 * 1024));
}

async function readDesktopWallpaper(subprocess) {
  const posix = await readPosixWallpaper(subprocess);
  if (posix.ok) return posix;
  // Windows may still succeed even when bash exists (Git Bash) but the POSIX
  // desktop detection found nothing. Only skip Windows when it is this
  // process's native platform and POSIX found a desktop but no wallpaper —
  // that is indistinguishable from Git Bash, so try both and merge errors.
  const windows = await readWindowsWallpaper(subprocess);
  if (windows.ok) return windows;
  return {
    ok: false,
    code: posix.code === 503 && windows.code === 503 ? 503 : 502,
    error: [posix.error, windows.error].filter((text) => text !== "" && text !== undefined).join(" | ") || "wallpaper detection failed",
  };
}

export function apply(ctx) {
  ctx.inject(["webServer"], (httpCtx) => {
    httpCtx.effect(() => httpCtx.webServer.register({
      kind: "exact",
      path: WALLPAPER_ROUTE,
      handler: async (req, res) => {
        if (req.method !== "GET" && req.method !== "HEAD") {
          sendJson(res, 405, { ok: false, error: "method not allowed" });
          return;
        }
        const universal = await readDesktopWallpaperUniversal();
        if (universal.ok) {
          sendJson(res, 200, universal);
          return;
        }
        const subprocess = httpCtx.get("subprocess");
        if (subprocess === undefined || subprocess === null) {
          sendJson(res, 503, { ok: false, error: "subprocess service unavailable" });
          return;
        }
        const wallpaper = await readDesktopWallpaper(subprocess);
        if (!wallpaper.ok) {
          sendJson(res, wallpaper.code ?? 502, { ok: false, error: wallpaper.error });
          return;
        }
        sendJson(res, 200, wallpaper);
      },
    }), "ui-frosted-glass: desktop wallpaper route");
  });
}
