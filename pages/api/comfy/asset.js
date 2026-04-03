function json(res, status, data) {
  res.status(status).json(data);
}

async function proxyViewAsBinary({ baseUrl, filename, subfolder = "", type = "output" }) {
  const qs = new URLSearchParams({
    filename: String(filename || ""),
    subfolder: String(subfolder || ""),
    type: String(type || "output")
  });
  const url = `${String(baseUrl).replace(/\/+$/, "")}/view?${qs.toString()}`;
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ComfyUI /view failed: HTTP ${res.status} ${res.statusText}${text ? ` | ${text}` : ""}`);
  }
  const ab = await res.arrayBuffer();
  const ct = res.headers.get("content-type") || "application/octet-stream";
  return { ct, ab };
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
    const { ct, ab } = await proxyViewAsBinary({ baseUrl, filename, subfolder, type });
    res.setHeader("cache-control", "no-store, max-age=0");
    res.setHeader("content-type", ct);
    res.status(200).send(Buffer.from(ab));
  } catch (e) {
    return json(res, 502, { error: "ComfyUI asset proxy failed", detail: String(e?.message || e) });
  }
}

