function json(res, status, data) {
  res.status(status).json(data);
}

function buildViewUrl({ baseUrl, filename, subfolder = "", type = "output" }) {
  const qs = new URLSearchParams({
    filename: String(filename || ""),
    subfolder: String(subfolder || ""),
    type: String(type || "output")
  });
  return `${String(baseUrl).replace(/\/+$/, "")}/view?${qs.toString()}`;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });

  const baseUrl = process.env.COMFYUI_BASE_URL;
  if (!baseUrl) {
    return json(res, 500, {
      error: "Missing COMFYUI_BASE_URL",
      hint: "Set COMFYUI_BASE_URL in .env.local, e.g. http://127.0.0.1:8188 or your Tailscale IP."
    });
  }

  const filename = typeof req.query.filename === "string" ? req.query.filename : "";
  const subfolder = typeof req.query.subfolder === "string" ? req.query.subfolder : "";
  const type = typeof req.query.type === "string" ? req.query.type : "output";
  if (!filename) return json(res, 400, { error: "filename is required" });

  try {
    const url = buildViewUrl({ baseUrl, filename, subfolder, type });
    const range = typeof req.headers.range === "string" ? req.headers.range : "";

    const upstream = await fetch(url, {
      method: "GET",
      headers: {
        ...(range ? { range } : {})
      }
    });

    // Pass through status (200/206/404...)
    res.status(upstream.status);
    res.setHeader("cache-control", "no-store, max-age=0");

    // Pass through important headers for media playback.
    const pass = ["content-type", "content-length", "content-range", "accept-ranges"];
    for (const key of pass) {
      const v = upstream.headers.get(key);
      if (v) res.setHeader(key, v);
    }

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      return json(res, upstream.status, {
        error: "ComfyUI asset proxy failed",
        detail: `Upstream HTTP ${upstream.status} at ${url}${text ? ` | ${text.slice(0, 500)}` : ""}`
      });
    }

    if (!upstream.body) {
      return json(res, 502, { error: "ComfyUI asset proxy failed", detail: "Upstream body is empty" });
    }

    // Stream body to client (supports large videos).
    const { Readable } = await import("node:stream");
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (e) {
    return json(res, 502, { error: "ComfyUI asset proxy failed", detail: String(e?.message || e) });
  }
}

