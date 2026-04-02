import { cropBottomImagesIfNeeded } from "@/lib/image/cropBottom";

// 참고: UI(runpod-test)는 /api/runpod/run + /api/runpod/status 를 사용합니다.
// 이 라우트는 동기 대기용 레거시; RunPod body 는 { input: { prompt } } 형태(run.js 의 prompt-only 와 같음).

function json(res, status, data) {
  res.status(status).json(data);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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
    // assume base64 without prefix; default to webp (this pipeline outputs webp)
    imgs.push(`data:image/webp;base64,${s}`);
  };

  const scan = (v) => {
    if (!v) return;
    if (typeof v === "string") {
      // likely URL or base64
      if (v.length > 24) pushImage(v);
      return;
    }
    if (Array.isArray(v)) {
      for (const it of v) scan(it);
      return;
    }
    if (typeof v === "object") {
      // comfy-style node output like { "127": { "text_0": "base64..." } }
      if ("127" in v) scan(v["127"]);
      // common keys
      for (const key of ["text_0", "text", "images", "image", "output", "result", "data"]) {
        if (key in v) scan(v[key]);
      }
      // if object looks like { url: ... }
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
      "content-type": "application/json",
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
  if (!res.ok) {
    throw new Error(`RunPod HTTP ${res.status}: ${data?.error || data?.message || text || res.statusText}`);
  }
  return data;
}

async function waitForRunpodJob({ endpointId, apiKey, jobId, timeoutMs = 240000, pollMs = 1500 }) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const statusUrl = `https://api.runpod.ai/v2/${encodeURIComponent(endpointId)}/status/${encodeURIComponent(jobId)}`;
    const st = await runpodFetch(statusUrl, apiKey, { method: "GET" });
    const status = String(st?.status || "").toUpperCase();

    if (status === "COMPLETED") return st;
    if (status === "FAILED" || status === "CANCELLED" || status === "TIMED_OUT") {
      throw new Error(`RunPod job ${status}: ${JSON.stringify(st?.error || st, null, 2)}`);
    }

    await sleep(pollMs);
  }
  throw new Error(`RunPod timeout waiting for job_id=${jobId}`);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  const apiKey = process.env.RUNPOD_API_KEY;
  const endpointId = process.env.RUNPOD_ENDPOINT_ID;
  if (!apiKey) return json(res, 500, { error: "Missing RUNPOD_API_KEY" });
  if (!endpointId) return json(res, 500, { error: "Missing RUNPOD_ENDPOINT_ID" });

  const { prompt, input } = req.body || {};
  const p = String(prompt || input?.prompt || "").trim();
  if (!p) return json(res, 400, { error: "prompt is required" });

  try {
    const runUrl = `https://api.runpod.ai/v2/${encodeURIComponent(endpointId)}/run`;
    const run = await runpodFetch(runUrl, apiKey, {
      method: "POST",
      body: JSON.stringify({
        input: {
          ...(input || {}),
          prompt: p
        }
      })
    });

    const jobId = run?.id;
    if (!jobId) throw new Error(`RunPod did not return job id: ${JSON.stringify(run)}`);

    // Wait for completion
    const finalStatus = await waitForRunpodJob({ endpointId, apiKey, jobId });

    const output = finalStatus?.output ?? null;
    const images = await cropBottomImagesIfNeeded(normalizeImagesFromOutput(output));

    return json(res, 200, {
      id: jobId,
      status: finalStatus?.status || "COMPLETED",
      images,
      output
    });
  } catch (e) {
    const msg = String(e?.message || e);
    const hint = (() => {
      if (/Base64EncodeNode does not exist/i.test(msg)) {
        return "Serverless Endpoint의 ComfyUI에 커스텀 노드 `Base64EncodeNode`가 설치되어 있지 않습니다. (현재 워크플로우는 WebP base64 출력을 위해 필수)";
      }
      if (/InspyrenetRembg does not exist/i.test(msg)) {
        return "Serverless Endpoint의 ComfyUI에 배경 제거 노드 `InspyrenetRembg`가 설치되어 있지 않습니다.";
      }
      if (/ShowText\\|pysssss does not exist/i.test(msg)) {
        return "Serverless Endpoint의 ComfyUI에 `comfyui-custom-scripts`(ShowText|pysssss) 커스텀 노드가 설치되어 있지 않습니다.";
      }
      if (/not in \\[\\]/i.test(msg) || /value_not_in_list/i.test(msg)) {
        return "Serverless Endpoint 컨테이너에서 모델 목록이 비어 있습니다. (ComfyUI models 경로에 필요한 .safetensors/vae/lora가 마운트되어야 함)";
      }
      return "";
    })();
    return json(res, 502, { error: "RunPod generation failed", detail: msg, hint });
  }
}

