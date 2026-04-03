import { buildWorkflowFromTemplate, loadWorkflowTemplate } from "@/lib/comfy/buildWorkflow";

function json(res, status, data) {
  res.status(status).json(data);
}

function toDataUrl(contentType, base64) {
  const b64 = String(base64 || "").trim();
  if (!b64) return "";
  if (b64.startsWith("data:")) return b64;
  const ct = String(contentType || "").trim() || "image/png";
  return `data:${ct};base64,${b64}`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function comfyFetch(baseUrl, pathname, opts) {
  const url = `${String(baseUrl).replace(/\/+$/, "")}${pathname}`;
  let res;
  try {
    res = await fetch(url, opts);
  } catch (e) {
    const cause = e?.cause?.message ? ` | cause: ${e.cause.message}` : "";
    throw new Error(`ComfyUI fetch failed: ${url} | ${String(e?.message || e)}${cause}`);
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // ignore
  }
  if (!res.ok) {
    const msg = data?.error || data?.message || text || `${res.status} ${res.statusText}`;
    const short = String(msg || "").replace(/\s+/g, " ").trim().slice(0, 500);
    throw new Error(`ComfyUI HTTP ${res.status} at ${url}: ${short || res.statusText || "HTTP error"}`);
  }
  return data;
}

function isFileRef(v) {
  return v && typeof v === "object" && typeof v.filename === "string" && v.filename.trim();
}

function fileRefKey(ref) {
  return `${ref?.type || ""}::${ref?.subfolder || ""}::${ref?.filename || ""}`;
}

function collectFileRefsFromValue(value) {
  const out = [];
  const walk = (v) => {
    if (!v) return;
    if (isFileRef(v)) {
      out.push(v);
      return;
    }
    if (Array.isArray(v)) {
      for (const it of v) walk(it);
      return;
    }
    if (typeof v === "object") {
      for (const k of Object.keys(v)) walk(v[k]);
    }
  };
  walk(value);
  return out;
}

function hasVideoExtension(filename) {
  const f = String(filename || "").toLowerCase();
  return f.endsWith(".mp4") || f.endsWith(".webm") || f.endsWith(".gif") || f.endsWith(".mov") || f.endsWith(".mkv");
}

function guessVideoMime(filename) {
  const f = String(filename || "").toLowerCase();
  if (f.endsWith(".webm")) return "video/webm";
  if (f.endsWith(".gif")) return "image/gif";
  if (f.endsWith(".mov")) return "video/quicktime";
  if (f.endsWith(".mkv")) return "video/x-matroska";
  return "video/mp4";
}

function collectMediaRefsFromHistoryEntry(entry) {
  const outputs = entry?.outputs || entry?.prompt?.outputs || null;
  if (!outputs || typeof outputs !== "object") return { imageRefs: [], videoRef: null };

  const seen = new Set();
  const imageRefs = [];
  let videoRef = null;

  const pushUnique = (ref) => {
    if (!isFileRef(ref)) return;
    const key = fileRefKey(ref);
    if (seen.has(key)) return;
    seen.add(key);
    imageRefs.push(ref);
  };

  // Prefer images from PreviewImage (175) then decode (70)
  for (const preferId of ["175", "70"]) {
    const imgs = outputs?.[preferId]?.images;
    if (Array.isArray(imgs)) {
      for (const ref of imgs) pushUnique(ref);
    }
  }

  // Any other image refs
  for (const nodeId of Object.keys(outputs)) {
    const imgs = outputs?.[nodeId]?.images;
    if (Array.isArray(imgs)) {
      for (const ref of imgs) pushUnique(ref);
    }
  }

  // Prefer video from SaveVideo (130)
  const videoCandidates = [];
  const preferred = outputs?.["130"];
  if (preferred) videoCandidates.push(...collectFileRefsFromValue(preferred));
  for (const nodeId of Object.keys(outputs)) {
    videoCandidates.push(...collectFileRefsFromValue(outputs[nodeId]));
  }

  for (const ref of videoCandidates) {
    if (!isFileRef(ref)) continue;
    if (!hasVideoExtension(ref.filename)) continue;
    videoRef = ref;
    break;
  }

  return { imageRefs, videoRef };
}

async function fetchViewAsDataUrl(baseUrl, imageRef) {
  const filename = imageRef?.filename;
  if (!filename) throw new Error("Missing image filename in ComfyUI history output");

  const subfolder = imageRef?.subfolder || "";
  const type = imageRef?.type || "output";

  const qs = new URLSearchParams({
    filename: String(filename),
    subfolder: String(subfolder),
    type: String(type)
  });

  const url = `${String(baseUrl).replace(/\/+$/, "")}/view?${qs.toString()}`;
  let res;
  try {
    res = await fetch(url, { method: "GET" });
  } catch (e) {
    const cause = e?.cause?.message ? ` | cause: ${e.cause.message}` : "";
    throw new Error(`ComfyUI fetch failed: ${url} | ${String(e?.message || e)}${cause}`);
  }
  if (!res.ok) throw new Error(`ComfyUI HTTP ${res.status}: failed to fetch /view`);

  const ct = res.headers.get("content-type") || "image/png";
  const ab = await res.arrayBuffer();
  const b64 = Buffer.from(ab).toString("base64");
  return toDataUrl(ct, b64);
}

function buildLocalAssetUrl({ filename, subfolder, type }) {
  const qs = new URLSearchParams({
    filename: String(filename || ""),
    subfolder: String(subfolder || ""),
    type: String(type || "output")
  });
  return `/api/comfy/asset?${qs.toString()}`;
}

async function waitForMedia(baseUrl, promptId, { timeoutMs = 480000, pollMs = 900, wantVideo = true } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const history = await comfyFetch(baseUrl, `/history/${encodeURIComponent(promptId)}`, { method: "GET" });
    const entry = history?.[promptId] || null;
    const media = collectMediaRefsFromHistoryEntry(entry);
    const hasImages = Array.isArray(media.imageRefs) && media.imageRefs.length > 0;
    const hasVideo = !!media.videoRef;
    if (hasImages && (!wantVideo || hasVideo)) return media;

    await sleep(pollMs);
  }
  throw new Error(`ComfyUI timeout waiting for media prompt_id=${promptId}`);
}

function stableSeedFromString(s) {
  const str = String(s || "");
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 2147483647;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  const baseUrl = process.env.COMFYUI_BASE_URL;
  if (!baseUrl) {
    return json(res, 500, {
      error: "Missing COMFYUI_BASE_URL",
      hint: "Set COMFYUI_BASE_URL in .env.local, e.g. http://127.0.0.1:8188 or your Tailscale IP."
    });
  }

  const { prompt, width = 1024, height = 1024, count = 2, seed, motion, video } = req.body || {};
  const p = String(prompt || "").trim();
  if (!p) return json(res, 400, { error: "prompt is required" });

  const n = Math.max(1, Math.min(4, Number(count) || 2));
  const baseSeed = Number.isFinite(seed) ? Number(seed) : stableSeedFromString(p);
  const wantVideo = video !== false && video !== 0 && video !== "0";

  let template;
  try {
    template = await loadWorkflowTemplate();
  } catch (e) {
    return json(res, 500, { error: "Failed to load workflow template", detail: String(e?.message || e) });
  }

  try {
    const wf = buildWorkflowFromTemplate(template, {
      prompt: p,
      seed: baseSeed,
      width: Number(width),
      height: Number(height),
      batchSize: n,
      motion
    });

    const queued = await comfyFetch(baseUrl, "/prompt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: wf })
    });

    const promptId = queued?.prompt_id;
    if (!promptId) throw new Error("ComfyUI did not return prompt_id");

    const media = await waitForMedia(baseUrl, promptId, { wantVideo });

    const imageRefs = Array.isArray(media.imageRefs) ? media.imageRefs.slice(0, n) : [];
    const images = [];
    for (const ref of imageRefs) {
      images.push(await fetchViewAsDataUrl(baseUrl, ref));
    }

    const videoRef = media.videoRef || null;
    const videoUrl = videoRef ? buildLocalAssetUrl(videoRef) : "";
    const videoMime = videoRef ? guessVideoMime(videoRef.filename) : "";

    return json(res, 200, {
      images,
      seed: baseSeed,
      ...(videoRef ? { videoUrl, videoRef: { ...videoRef, mime: videoMime } } : { videoUrl: "", videoRef: null })
    });
  } catch (e) {
    return json(res, 502, { error: "ComfyUI generation failed", detail: String(e?.message || e) });
  }
}

