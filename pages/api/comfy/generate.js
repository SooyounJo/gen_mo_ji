import { buildWorkflowFromTemplate, loadWorkflowTemplate } from "@/lib/comfy/buildWorkflow";

function json(res, status, data) {
  res.status(status).json(data);
}

function toDataUrlWebp(base64) {
  const b64 = String(base64 || "").trim();
  if (!b64) return "";
  if (b64.startsWith("data:")) return b64;
  return `data:image/webp;base64,${b64}`;
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
    throw new Error(`ComfyUI HTTP ${res.status}: ${msg}`);
  }
  return data;
}

function extractBase64FromHistoryEntry(entry) {
  const outputs = entry?.outputs || entry?.prompt?.outputs || null;
  if (!outputs || typeof outputs !== "object") return "";

  const node127 = outputs["127"];
  if (node127 && typeof node127 === "object") {
    // ShowText|pysssss output is usually a list of strings (STRING)
    for (const k of Object.keys(node127)) {
      const v = node127[k];
      if (Array.isArray(v) && typeof v[0] === "string") return v[0];
      if (typeof v === "string") return v;
    }
  }

  const node126 = outputs["126"];
  if (node126) {
    const t = node126.text ?? node126.string ?? node126.base64 ?? node126.output ?? null;
    if (Array.isArray(t) && typeof t[0] === "string") return t[0];
    if (typeof t === "string") return t;
    if (Array.isArray(node126?.texts) && typeof node126.texts[0] === "string") return node126.texts[0];
  }

  // fallback: scan any output that looks like base64 webp
  for (const k of Object.keys(outputs)) {
    const out = outputs[k];
    if (!out || typeof out !== "object") continue;
    const candidates = [];
    if (typeof out.text === "string") candidates.push(out.text);
    if (Array.isArray(out.text) && typeof out.text[0] === "string") candidates.push(out.text[0]);
    if (typeof out.base64 === "string") candidates.push(out.base64);
    if (Array.isArray(out.base64) && typeof out.base64[0] === "string") candidates.push(out.base64[0]);
    for (const c of candidates) {
      const s = String(c || "").trim();
      if (s.length > 100 && /^[A-Za-z0-9+/=]+$/.test(s)) return s;
    }
  }

  return "";
}

function extractFirstImageRefFromHistoryEntry(entry) {
  const outputs = entry?.outputs || entry?.prompt?.outputs || null;
  if (!outputs || typeof outputs !== "object") return null;

  const prefer = ["113", "70", "63"];
  for (const nodeId of prefer) {
    const out = outputs[nodeId];
    const imgs = out?.images;
    if (Array.isArray(imgs) && imgs.length && imgs[0]?.filename) return imgs[0];
  }

  for (const k of Object.keys(outputs)) {
    const out = outputs[k];
    const imgs = out?.images;
    if (Array.isArray(imgs) && imgs.length && imgs[0]?.filename) return imgs[0];
  }

  return null;
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

async function waitForResult(baseUrl, promptId, { timeoutMs = 240000, pollMs = 800 } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const history = await comfyFetch(baseUrl, `/history/${encodeURIComponent(promptId)}`, { method: "GET" });
    const entry = history?.[promptId] || null;

    const b64 = extractBase64FromHistoryEntry(entry);
    if (b64) return { kind: "base64", base64: b64 };

    const imgRef = extractFirstImageRefFromHistoryEntry(entry);
    if (imgRef) return { kind: "imageRef", imageRef: imgRef };

    await sleep(pollMs);
  }
  throw new Error(`ComfyUI timeout waiting for prompt_id=${promptId}`);
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

  const { prompt, width = 1024, height = 1024, count = 2, seed } = req.body || {};
  const p = String(prompt || "").trim();
  if (!p) return json(res, 400, { error: "prompt is required" });

  const n = Math.max(1, Math.min(4, Number(count) || 2));
  const baseSeed = Number.isFinite(seed) ? Number(seed) : stableSeedFromString(p);

  let template;
  try {
    template = await loadWorkflowTemplate();
  } catch (e) {
    return json(res, 500, { error: "Failed to load workflow template", detail: String(e?.message || e) });
  }

  try {
    const results = [];
    for (let i = 0; i < n; i += 1) {
      const wf = buildWorkflowFromTemplate(template, {
        prompt: p,
        seed: baseSeed + i,
        width: Number(width),
        height: Number(height)
      });

      const queued = await comfyFetch(baseUrl, "/prompt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: wf })
      });

      const promptId = queued?.prompt_id;
      if (!promptId) throw new Error("ComfyUI did not return prompt_id");

      const result = await waitForResult(baseUrl, promptId);
      if (result.kind === "base64") {
        results.push(toDataUrlWebp(result.base64));
      } else if (result.kind === "imageRef") {
        results.push(await fetchViewAsDataUrl(baseUrl, result.imageRef));
      } else {
        throw new Error("Unknown ComfyUI result kind");
      }
    }

    return json(res, 200, { images: results, seed: baseSeed });
  } catch (e) {
    return json(res, 502, { error: "ComfyUI generation failed", detail: String(e?.message || e) });
  }
}

