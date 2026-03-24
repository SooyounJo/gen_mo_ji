import { buildWorkflowFromTemplate, loadWorkflowTemplate } from "@/lib/comfy/buildWorkflow";

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

/**
 * RunPod: POST https://api.runpod.ai/v2/{RUNPOD_ENDPOINT_ID}/run — body `{ "input": … }`.
 * - RUNPOD_INPUT_PROMPT_ONLY=1 → input 은 주로 `{ prompt }` (공식 curl 예시와 동일).
 * - 그 외 → `z image+rmbg (1).json` 템플릿만으로 만든 `workflow` + `prompt` 를 input 에 포함.
 */
export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  const apiKey = process.env.RUNPOD_API_KEY;
  const endpointId = process.env.RUNPOD_ENDPOINT_ID;
  if (!apiKey) return json(res, 500, { error: "Missing RUNPOD_API_KEY" });
  if (!endpointId) return json(res, 500, { error: "Missing RUNPOD_ENDPOINT_ID" });

  const { prompt, input, width = 1024, height = 1024, count = 2, seed } = req.body || {};
  const p = String(prompt || input?.prompt || "").trim();
  if (!p) return json(res, 400, { error: "prompt is required" });

  const promptOnly =
    String(process.env.RUNPOD_INPUT_PROMPT_ONLY || "").toLowerCase() === "true" ||
    process.env.RUNPOD_INPUT_PROMPT_ONLY === "1";

  try {
    const n = Math.max(1, Math.min(4, Number(count) || 2));
    const baseSeed = Number.isFinite(seed) ? Number(seed) : stableSeedFromString(p);

    const runUrl = `https://api.runpod.ai/v2/${encodeURIComponent(endpointId)}/run`;

    const baseInput = { ...(input || {}) };
    if ("workflow" in baseInput) delete baseInput.workflow;

    const buildPromptOnlyInput = () => ({
      ...baseInput,
      prompt: p
    });

    const buildWorkflowInput = async () => {
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
      return {
        ...baseInput,
        prompt: p,
        workflow: wf
      };
    };

    const dbg =
      req.body?.debugInput === true ||
      req.body?.debugInput === 1 ||
      req.body?.debugInput === "1" ||
      req.body?.debugWorkflow === true ||
      req.body?.debugWorkflow === 1 ||
      req.body?.debugWorkflow === "1";
    if (dbg) {
      if (promptOnly) {
        return json(res, 200, {
          debug: true,
          promptOnly,
          input: buildPromptOnlyInput()
        });
      }
      const wfPayload = await buildWorkflowInput();
      return json(res, 200, {
        debug: true,
        promptOnly,
        input: wfPayload
      });
    }

    const payload = promptOnly ? buildPromptOnlyInput() : await buildWorkflowInput();

    const run = await runpodFetch(runUrl, apiKey, {
      method: "POST",
      body: JSON.stringify({ input: payload })
    });

    const jobId = run?.id;
    if (!jobId) throw new Error(`RunPod did not return job id: ${JSON.stringify(run)}`);

    return json(res, 200, { id: jobId, status: run?.status || "SUBMITTED" });
  } catch (e) {
    return json(res, 502, { error: "RunPod run failed", detail: String(e?.message || e) });
  }
}
