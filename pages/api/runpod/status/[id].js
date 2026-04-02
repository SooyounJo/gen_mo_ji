import { cropBottomImagesIfNeeded } from "@/lib/image/cropBottom";

function json(res, status, data) {
  // Prevent browser/edge caching; avoid 304 which breaks client-side JSON parsing.
  res.setHeader("cache-control", "no-store, max-age=0");
  res.status(status).json(data);
}

function safeJsonSnippet(v, maxLen = 16000) {
  try {
    const out = typeof v === "string" ? v : JSON.stringify(v, null, 2);
    if (!out) return "";
    return out.length > maxLen ? `${out.slice(0, maxLen)}\n…(이하 잘림)` : out;
  } catch {
    return String(v);
  }
}

/** RunPod는 error만 짧게 주고 상세는 output에 넣는 경우가 많음 → 디버깅용으로 합침 */
function buildFailureDetail(error, output) {
  const parts = [];
  if (error != null && error !== "") {
    parts.push(typeof error === "string" ? error : safeJsonSnippet(error, 4000));
  }
  if (output != null && output !== "") {
    if (typeof output === "string") {
      parts.push(output);
    } else {
      parts.push(safeJsonSnippet(output));
    }
  }
  return parts.filter(Boolean).join("\n\n--- output / 추가 정보 ---\n\n");
}

function buildHintFromError(err) {
  const s = String(err || "");
  if (!s) return "";

  // Model lists empty => ComfyUI did not see mounted models in expected directories.
  const hasEmptyLists =
    /clip_name: '.*' not in \[\]/.test(s) ||
    /unet_name: '.*' not in \[\]/.test(s) ||
    /lora_name: '.*' not in \[\]/.test(s);

  if (hasEmptyLists) {
    const want = [];
    const m1 = s.match(/clip_name: '([^']+)'/);
    const m2 = s.match(/unet_name: '([^']+)'/);
    const m3 = s.match(/lora_name: '([^']+)'/);
    const m4 = s.match(/vae_name: '([^']+)' not in \[([^\]]+)\]/);
    if (m1?.[1]) want.push(`CLIP: ${m1[1]}`);
    if (m2?.[1]) want.push(`UNET: ${m2[1]}`);
    if (m3?.[1]) want.push(`LoRA: ${m3[1]}`);
    if (m4?.[1]) {
      const available = String(m4?.[2] || "").trim();
      want.push(`VAE: ${m4[1]} (available: ${available || "unknown"})`);
    }

    const wants = want.length ? `필요 모델: ${want.join(" | ")}.` : "";
    return [
      "ComfyUI 워커가 모델 목록을 비어 있게 보고 있습니다(RunPod Serverless Handler 스캔 경로와 실제 models 폴더가 어긋난 경우가 많습니다).",
      wants,
      "조치: Handler가 스캔하는 경로(예: /runpod-volume/models)와 실제 ComfyUI models(예: /workspace/runpod-slim/ComfyUI/models)를 심볼릭 링크로 맞추세요. 상세는 docs/runpod-serverless-worker-paths.md 참고."
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (/Missing 'workflow' parameter/i.test(s)) {
    return "워커가 workflow(JSON)를 요구합니다. 현재 서버는 prompt-only로 전송 중입니다(RUNPOD_INPUT_PROMPT_ONLY=1). 이 에러면 엔드포인트가 prompt-only를 지원하지 않는 구성입니다.";
  }

  if (/Workflow validation failed/i.test(s)) {
    return "ComfyUI가 워크플로 JSON 검증에 실패했습니다. failureDetail 원문에서 모델명·노드 오류를 확인하세요. 모델은 /runpod-volume/models 등 스캔 경로와 실제 경로 심볼릭 링크를 점검하세요.";
  }

  return "";
}

function guessMimeFromBase64(s) {
  const v = String(s || "").trim();
  // Common base64 prefixes:
  // - PNG: iVBORw0KGgo
  // - JPEG: /9j/
  // - WebP: UklGR
  if (v.startsWith("iVBOR")) return "image/png";
  if (v.startsWith("/9j/")) return "image/jpeg";
  if (v.startsWith("UklGR")) return "image/webp";
  return "image/webp";
}

function normalizeImagesFromOutput(output) {
  const out = output;
  const imgs = [];

  const pushImage = (v) => {
    const s = String(v || "").trim();
    if (!s) return;
    if (s.startsWith("data:") || s.startsWith("http://") || s.startsWith("https://")) {
      imgs.push(s);
      return;
    }
    const mime = guessMimeFromBase64(s);
    imgs.push(`data:${mime};base64,${s}`);
  };

  const scan = (v) => {
    if (!v) return;
    if (typeof v === "string") {
      if (v.length > 24) pushImage(v);
      return;
    }
    if (Array.isArray(v)) {
      for (const it of v) scan(it);
      return;
    }
    if (typeof v === "object") {
      // Common patterns: { base64, mime_type } or { b64, mime }
      if (typeof v.base64 === "string") pushImage(v.base64);
      if (typeof v.b64 === "string") pushImage(v.b64);
      if (typeof v.imageBase64 === "string") pushImage(v.imageBase64);

      if ("127" in v) scan(v["127"]);
      for (const key of [
        "text_0",
        "text",
        "images",
        "image",
        "image_base64",
        "imageBase64",
        "image_url",
        "imageUrl",
        "output",
        "result",
        "data"
      ]) {
        if (key in v) scan(v[key]);
      }
      if ("url" in v) scan(v.url);
    }
  };

  scan(out);
  return imgs.filter(Boolean);
}

async function runpodFetch(url, apiKey, opts) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      authorization: `Bearer ${apiKey}`,
      ...(opts?.headers || {})
    }
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // ignore
  }
  if (!res.ok) throw new Error(`RunPod HTTP ${res.status}: ${data?.error || data?.message || text || res.statusText}`);
  return data;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });

  const apiKey = process.env.RUNPOD_API_KEY;
  const endpointId = process.env.RUNPOD_ENDPOINT_ID;
  if (!apiKey) return json(res, 500, { error: "Missing RUNPOD_API_KEY" });
  if (!endpointId) return json(res, 500, { error: "Missing RUNPOD_ENDPOINT_ID" });

  const id = typeof req.query.id === "string" ? req.query.id : "";
  if (!id) return json(res, 400, { error: "id is required" });

  try {
    const statusUrl = `https://api.runpod.ai/v2/${encodeURIComponent(endpointId)}/status/${encodeURIComponent(id)}`;
    const st = await runpodFetch(statusUrl, apiKey, { method: "GET" });
    const output = st?.output ?? null;
    const error = st?.error ?? null;
    const images = await cropBottomImagesIfNeeded(normalizeImagesFromOutput(output));
    const hint = buildHintFromError(error);
    const failureDetail = buildFailureDetail(error, output);
    return json(res, 200, { id, status: st?.status || "", output, error, hint, images, failureDetail });
  } catch (e) {
    return json(res, 502, { error: "RunPod status failed", detail: String(e?.message || e) });
  }
}

