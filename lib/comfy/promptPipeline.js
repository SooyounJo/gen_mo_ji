/**
 * ComfyUI로 보내기 직전 프롬프트 처리 (번역 + 내부 ID 제거 + 얼굴 가시성 보강).
 * /api/comfy/generate 와 /api/comfy/prompt-preview 가 동일 로직을 쓴다.
 */

export function looksKorean(s) {
  return /[가-힣]/.test(String(s || ""));
}

export function sanitizePromptForComfy(input) {
  const raw = String(input || "");
  const stripped = raw
    .replace(/character-[a-z0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { raw: raw.trim(), stripped };
}

export function ensureFaceVisiblePrompt(promptEn) {
  const p = String(promptEn || "").replace(/\s+/g, " ").trim();
  if (!p) return "";

  const low = p.toLowerCase();
  const already =
    /\bfront\b/.test(low) ||
    /\bfacing\b/.test(low) ||
    /\bface\b/.test(low) ||
    /\blooking\b/.test(low) ||
    /\bportrait\b/.test(low) ||
    /\bclose[- ]?up\b/.test(low);
  if (already) return p;

  const actionish =
    /\bdanc(ing|e)\b/.test(low) ||
    /\brun(ning)?\b/.test(low) ||
    /\bjump(ing)?\b/.test(low) ||
    /\bwave(ing)?\b/.test(low) ||
    /\bwalk(ing)?\b/.test(low) ||
    /\bspin(ning)?\b/.test(low) ||
    /\bcheer(ing)?\b/.test(low) ||
    /\bpose\b/.test(low);

  return actionish ? `${p} front facing face visible` : p;
}

async function translateToShortEnglish(text) {
  const apiKey = process.env.OPEN_API_KEY;
  if (!apiKey) throw new Error("Missing OPEN_API_KEY for AI translation");

  const input = String(text || "").replace(/\s+/g, " ").trim();
  const model = process.env.OPENAI_TRANSLATE_MODEL || "gpt-4o-mini";

  const sys =
    "You translate short Korean emoji prompts into short English prompts for image/video generation. " +
    "Return a short English phrase (1-5 words). No punctuation. No style words. No extra details. " +
    "Examples: '행복한 고양이' -> 'happy cat', '화난 당근' -> 'angry carrot'.";

  const body = {
    model,
    temperature: 0,
    messages: [
      { role: "system", content: sys },
      { role: "user", content: input }
    ]
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const raw = await res.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    // ignore
  }
  if (!res.ok) {
    throw new Error(`OpenAI translate failed: HTTP ${res.status} ${raw || res.statusText}`);
  }
  const out = String(data?.choices?.[0]?.message?.content || "").replace(/\s+/g, " ").trim();
  if (!out || out.length > 80) {
    throw new Error("OpenAI translate returned empty/invalid output");
  }
  return out;
}

/**
 * @returns {Promise<{ ok: true, promptOriginal: string, promptSent: string, translated: boolean } | { ok: false, error: string, detail?: string }>}
 */
export async function resolvePromptForComfy(prompt) {
  const cleaned = sanitizePromptForComfy(prompt);
  const p0 = cleaned.stripped;
  if (!p0) {
    return {
      ok: false,
      error: "prompt is required",
      detail:
        cleaned.raw && /character-[a-z0-9]+/i.test(cleaned.raw)
          ? "Internal character id was removed; prompt became empty."
          : ""
    };
  }

  const translated = looksKorean(p0);
  const pBase = translated ? await translateToShortEnglish(p0) : p0;
  if (translated && looksKorean(pBase)) {
    return {
      ok: false,
      error: "Korean prompt must be translated to English",
      detail: "Translation output still contains Korean. Comfy send is blocked."
    };
  }
  const p = ensureFaceVisiblePrompt(pBase);

  return { ok: true, promptOriginal: p0, promptSent: p, translated };
}
