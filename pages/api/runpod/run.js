import { buildWorkflowFromTemplate, loadWorkflowTemplate } from "@/lib/comfy/buildWorkflow";
import { prepareWorkflowForRunpodServerless } from "@/lib/runpod/prepareWorkflowServerless";

function json(res, status, data) {
  res.status(status).json(data);
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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
  if (!res.ok) throw new Error(`RunPod HTTP ${res.status}: ${data?.error || data?.message || text || res.statusText}`);
  return data;
}

function isMissingWorkflowError(msg) {
  return /Missing 'workflow' parameter/i.test(String(msg || ""));
}

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  const apiKey = process.env.RUNPOD_API_KEY;
  const endpointId = process.env.RUNPOD_ENDPOINT_ID;
  if (!apiKey) return json(res, 500, { error: "Missing RUNPOD_API_KEY" });
  if (!endpointId) return json(res, 500, { error: "Missing RUNPOD_ENDPOINT_ID" });

  const { prompt, input, width = 1024, height = 1024, count = 2, seed, useWorkflow } = req.body || {};
  const p = String(prompt || input?.prompt || "").trim();
  if (!p) return json(res, 400, { error: "prompt is required" });

  try {
    const n = Math.max(1, Math.min(4, Number(count) || 2));
    const baseSeed = Number.isFinite(seed) ? Number(seed) : stableSeedFromString(p);

    const runUrl = `https://api.runpod.ai/v2/${encodeURIComponent(endpointId)}/run`;

    // Some endpoints accept just { input: { prompt: "..." } } (no ComfyUI workflow).
    // Others (ComfyUI serverless) require workflow. Support both with auto-detect.
    // Default to prompt-only to match the curl form, unless explicitly forced to workflow.
    // If the endpoint actually requires workflow, we detect it by polling status once and fallback.
    const explicit = useWorkflow === true ? "workflow" : "prompt";
    const baseInput = { ...(input || {}) };

    const buildPromptOnlyInput = () => ({
      ...baseInput,
      prompt: p,
      width: Number(width),
      height: Number(height),
      count: n,
      seed: baseSeed
    });

    const buildWorkflowInput = async () => {
      if (baseInput.workflow) return { ...baseInput };
      let template;
      try {
        template = await loadWorkflowTemplate();
      } catch (e) {
        throw new Error(`Failed to load workflow template: ${String(e?.message || e)}`);
      }
      const wf = buildWorkflowFromTemplate(template, {
        prompt: p,
        seed: baseSeed,
        width: Number(width),
        height: Number(height),
        batchSize: n
      });
      const wfServerless = prepareWorkflowForRunpodServerless(wf);
      return { ...baseInput, workflow: wfServerless };
    };

    let run = null;
    if (explicit === "prompt") {
      run = await runpodFetch(runUrl, apiKey, { method: "POST", body: JSON.stringify({ input: buildPromptOnlyInput() }) });

      // If the endpoint silently accepts prompt-only then fails later, catch it quickly and fallback.
      const jobIdMaybe = run?.id;
      if (jobIdMaybe) {
        const statusUrl = `https://api.runpod.ai/v2/${encodeURIComponent(endpointId)}/status/${encodeURIComponent(jobIdMaybe)}`;
        await sleep(600);
        const st = await runpodFetch(statusUrl, apiKey, { method: "GET" }).catch(() => null);
        if (st?.status === "FAILED" && isMissingWorkflowError(st?.error)) {
          const wfInput = await buildWorkflowInput();
          run = await runpodFetch(runUrl, apiKey, { method: "POST", body: JSON.stringify({ input: wfInput }) });
        }
      }
    } else {
      const wfInput = await buildWorkflowInput();
      run = await runpodFetch(runUrl, apiKey, { method: "POST", body: JSON.stringify({ input: wfInput }) });
    }

    const jobId = run?.id;
    if (!jobId) throw new Error(`RunPod did not return job id: ${JSON.stringify(run)}`);

    return json(res, 200, { id: jobId, status: run?.status || "SUBMITTED" });
  } catch (e) {
    return json(res, 502, { error: "RunPod run failed", detail: String(e?.message || e) });
  }
}

