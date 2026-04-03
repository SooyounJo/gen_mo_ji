import { resolvePromptForComfy } from "@/lib/comfy/promptPipeline";

function json(res, status, data) {
  res.status(status).json(data);
}

/**
 * Comfy로 보내기 직전 프롬프트(영문 등)만 미리보기 — 생성/Comfy 호출 없음.
 */
export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  const { prompt } = req.body || {};

  try {
    const resolved = await resolvePromptForComfy(prompt);
    if (!resolved.ok) {
      return json(res, 400, { error: resolved.error, detail: resolved.detail || "" });
    }
    return json(res, 200, {
      meta: {
        promptOriginal: resolved.promptOriginal,
        promptSent: resolved.promptSent,
        translated: resolved.translated
      }
    });
  } catch (e) {
    return json(res, 502, { error: "prompt preview failed", detail: String(e?.message || e) });
  }
}
