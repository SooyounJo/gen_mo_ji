/**
 * ComfyUI로 보내기 직전 프롬프트 처리 (내용만: 스타일·렌더는 워크플로 템플릿 쪽):
 * 내부 ID 제거 → (한글 시) 영역 번역 → 가벼운 영문 다듬기(enrich, 짧으면 생략) → 얼굴 보강 → 사물 부유 보강.
 * 풍부화 끄기: OPENAI_ENRICH_DISABLED=1
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

export function ensureFaceVisiblePrompt(promptEn, promptOriginalKo) {
  const p = String(promptEn || "").replace(/\s+/g, " ").trim();
  const ko = String(promptOriginalKo || "");
  if (!p) return "";

  const low = p.toLowerCase();
  const already =
    /\bfront\b/.test(low) ||
    /\bfacing\b/.test(low) ||
    /\bface\b/.test(low) ||
    /\beyes?\b/.test(low) ||
    /\blooking\b/.test(low) ||
    /\bportrait\b/.test(low) ||
    /\bclose[- ]?up\b/.test(low) ||
    /\bthree[- ]?quarter\b/.test(low) ||
    /\bexpression\b/.test(low);
  if (already) return p;

  const subject = hasAnimateSubject(p, ko);
  if (!subject) return p;

  const actionish =
    /\bdanc(ing|e)\b/.test(low) ||
    /\brun(ning)?\b/.test(low) ||
    /\bjump(ing)?\b/.test(low) ||
    /\bwave(ing)?\b/.test(low) ||
    /\bwalk(ing)?\b/.test(low) ||
    /\bspin(ning)?\b/.test(low) ||
    /\bcheer(ing)?\b/.test(low) ||
    /\bpose\b/.test(low) ||
    /\bpet(ting)?\b/.test(low) ||
    /\bstrok(e|ing)\b/.test(low) ||
    /\btyp(ing|e)\b/.test(low) ||
    /\bwork(ing)?\b/.test(low) ||
    /\bcomputer\b/.test(low) ||
    /\bkeyboard\b/.test(low) ||
    /\bdesk\b/.test(low) ||
    /\bhands?\b/.test(low) ||
    /\bfingers?\b/.test(low) ||
    /\bpaw(s)?\b/.test(low);

  return actionish ? `${p} face visible` : p;
}

/** 이미 움직임이 묘사되어 있으면 덧붙이지 않음 */
const HAS_EXPLICIT_MOTION_EN =
  /\b(float|floating|flying|danc|run|walk|jump|wave|spin|swim|drift|bob|rotat|mov(e|ing)|sway|shake|bounce|slide|roll|turn|work(s|ing)|sit(s|ting)|stand(s|ing)|lie(s|ing)|sleep(s|ing)|eat(s|ing)|cry|cries|smil|laugh|frown|kiss|hug|fight|play|throw|catch|lift|drop|pour|spill)\b/i;

/** 살아 움직이는 주체(사람·동물 등) — 이런 경우 부유 보강 제외. mouse/mice 는 아래에서 computer mouse 와 분리해 판별 */
const ANIMATE_EN_NO_MOUSE =
  /\b(cat|cats|dog|dogs|bird|birds|frog|frogs|hamster|hamsters|person|people|human|humans|baby|babies|man|men|woman|women|boy|boys|girl|girls|dinosaur|dinosaurs|fish|rabbit|rabbits|bear|bears|fox|foxes|pig|pigs|cow|cows|horse|horses|duck|ducks|chicken|chickens|rat|rats|turtle|turtles|snake|snakes|bee|bees|ant|ants|spider|spiders|student|teacher|friend|friends|mom|dad|child|children|guy|guys|monkey|monkeys|ape|apes|gorilla|gorillas)\b/i;

const ANIMATE_KO =
  /(고양이|강아지|개|쥐|쥐가|새|개구리|햄스터|사람|아기|아이|어른|남자|여자|아빠|엄마|친구|선생|학생|공룡|물고기|토끼|곰|여우|돼지|소|말|오리|닭|벌|개미|거미|거북이|뱀|캐릭터|원숭이|침팬지|고릴라)/;

/** 움직임 없는 사물 위주 — 영상에서 정지처럼 보이지 않게 가벼운 부유만 덧붙임 */
const INANIMATE_EN =
  /\b(book|books|desk|desks|computer|computers|keyboard|keyboards|monitor|monitors|lamp|lamps|chair|chairs|clock|clocks|phone|phones|cup|cups|notebook|notebooks|laptop|laptops|pencil|pencils|umbrella|umbrellas|table|tables|vase|vases|plate|plates|bowl|bowls|screen|screens|cabinet|cabinets|shelf|shelves|drawer|drawers|bag|bags|bottle|bottles|box|boxes|carrot|carrots|pizza|apple|apples|donut|donuts|coffee|sandwich|sandwiches|paper|papers|pen|pens|scissors|stapler|mousepad|mouse\s+pad)\b/i;

const INANIMATE_KO =
  /(책|책상|컴퓨터|키보드|모니터|램프|의자|시계|휴대폰|스마트폰|컵|노트북|연필|가방|우산|서랍|전등|스탠드|선반|병|상자|종이|펜|가위|책장|마우스패드)/;

/**
 * 사물-only(또는 사물 중심) 장면이면 영상에서 미세 움직임이 생기도록 짧게 보강한다.
 * 사람/동물이 주인공이면 건드리지 않는다.
 */
function hasAnimateSubject(promptEn, promptOriginalKo) {
  const p = String(promptEn || "");
  const ko = String(promptOriginalKo || "");
  if (ANIMATE_KO.test(ko)) return true;
  if (ANIMATE_EN_NO_MOUSE.test(p)) return true;
  const low = p.toLowerCase();
  const animalMouse = (/\bmouse\b|\bmice\b/i.test(low) && !/\bcomputer\s+mouse\b/i.test(low)) || /(쥐|생쥐)/.test(ko);
  if (animalMouse) return true;
  return false;
}

export function ensureInanimateMotionPrompt(promptEn, promptOriginalKo) {
  const p = String(promptEn || "").replace(/\s+/g, " ").trim();
  const ko = String(promptOriginalKo || "");
  if (!p) return "";

  if (HAS_EXPLICIT_MOTION_EN.test(p)) return p;

  if (hasAnimateSubject(p, ko)) return p;

  const looksInanimate = INANIMATE_EN.test(p) || INANIMATE_KO.test(ko);
  if (!looksInanimate) return p;

  if (/\b(gently\s+floating|floating\s+gentle|subtle(ly)?\s+floating)\b/i.test(p)) return p;

  return `${p} gently floating`.replace(/\s+/g, " ").trim();
}

/** 색·질감은 Comfy 스타일 노드에서 처리 — 여기서는 덧붙이지 않음 */
export function ensureCharacterColorPrompt(promptEn) {
  return String(promptEn || "").replace(/\s+/g, " ").trim();
}

/** 구체적 인물·동물·사물이 거의 없고 감정·기분만 드러나는 짧은 한글 */
function isEmotionOnlyKo(ko) {
  const t = String(ko || "").replace(/\s+/g, " ").trim();
  if (!t || t.length > 40) return false;
  if (/(고양이|강아지|개|쥐|새|햄스터|공룡|토끼|곰|여우|원숭이|캐릭터|사람|아기|아이|남자|여자|엄마|아빠|친구|학생|책|컴퓨터|핸드폰|집|학교)/.test(t)) {
    return false;
  }
  if (/(이|가|을|를|은|는)\s+[가-힣]/.test(t)) return false;
  return /(행복|기쁘|슬프|우울|화나|짜증|설렘|설레|무섭|두려|놀람|감동|심심|즐거|신나|외로|허무|답답|웃|울어|좋아|싫어|힘들)/.test(t);
}

async function translateToShortEnglish(text) {
  const apiKey = process.env.OPEN_API_KEY;
  if (!apiKey) throw new Error("Missing OPEN_API_KEY for AI translation");

  const input = String(text || "").replace(/\s+/g, " ").trim();
  const model = process.env.OPENAI_TRANSLATE_MODEL || "gpt-4o-mini";

  const sys =
    "You translate short Korean into ONE English line for ComfyUI **content** (subject/action only). " +
    "No art style, no lighting, no camera, no materials, no quality words. " +
    "Use a clear subject + verb; add an object only if the Korean clearly has one. " +
    "Keep it compact: about 4 to 12 words. Do not add extra scenery, props, or appearance details — the workflow handles look. " +
    "If the Korean names a specific thing or animal, that must stay the subject. " +
    "If the message is ONLY mood/emotion with no named subject (no animal, object, or scene), use ONE **human** person as the subject showing that feeling " +
    "(e.g. 소소한 행복 / 그냥 좋아 -> 'a person smiling softly' or 'a person looks happy'). " +
    "Examples: '행복한 고양이' -> 'a happy cat', '춤추는 고양이' -> 'a cat is dancing', " +
    "'눈물 흘리는 쥐' -> 'a mouse is crying', '화난 당근' -> 'an angry carrot', '말' -> 'a horse running'.";

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
  if (!out || out.length > 140) {
    throw new Error("OpenAI translate returned empty/invalid output");
  }
  return out;
}

/**
 * 영문 초안을 살짝 다듬기만 (스타일·질감·색·조명은 Comfy 쪽 — 여기서는 내용만).
 * 이미 짧고 명확하면 API 호출 생략.
 */
async function enrichSceneEnglish(shortEn, originalUserText) {
  const apiKey = process.env.OPEN_API_KEY;
  if (!apiKey) throw new Error("Missing OPEN_API_KEY for scene enrichment");

  const base = String(shortEn || "").replace(/\s+/g, " ").trim();
  const orig = String(originalUserText || "").replace(/\s+/g, " ").trim();
  if (!base) return "";

  const wc = base.split(/\s+/).filter(Boolean).length;
  if (wc <= 14 && base.length < 110) {
    return base;
  }

  const model =
    process.env.OPENAI_ENRICH_MODEL ||
    process.env.OPENAI_TRANSLATE_MODEL ||
    "gpt-4o-mini";

  const sys =
    "You lightly edit ONE English line for a ComfyUI **content** prompt (what happens, who/what). " +
    "Do NOT add art style, rendering, materials, lighting, camera, lens, or quality words. " +
    "Do NOT add extra props, colors, fur patterns, or background details unless the user text already implies them. " +
    "Fix grammar and clarity only; keep the same meaning. About 6 to 18 words. " +
    "If the original Korean was emotion-only, keep a **human** person as the subject unless the draft already names an animal or object. " +
    "Output ONE line, English, no quotes.";

  const emotionHint = looksKorean(orig) && isEmotionOnlyKo(orig) ? "\n(Note: emotion-only Korean input — prefer a human figure if still vague.)\n" : "";

  const user =
    orig && orig !== base
      ? `English draft:\n${base}\n\nOriginal user text (may be Korean):\n${orig}${emotionHint}`
      : `English draft:\n${base}${emotionHint}`;

  const body = {
    model,
    temperature: 0.2,
    messages: [
      { role: "system", content: sys },
      { role: "user", content: user }
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
    throw new Error(`OpenAI enrich failed: HTTP ${res.status} ${raw || res.statusText}`);
  }
  const out = String(data?.choices?.[0]?.message?.content || "").replace(/\s+/g, " ").trim();
  if (!out || out.length > 220) {
    throw new Error("OpenAI enrich returned empty/invalid output");
  }
  if (looksKorean(out)) {
    throw new Error("Enrich output must be English only");
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

  let pRich = pBase;
  if (process.env.OPENAI_ENRICH_DISABLED !== "1") {
    try {
      pRich = await enrichSceneEnglish(pBase, p0);
    } catch (e) {
      console.warn("[promptPipeline] enrichSceneEnglish:", e?.message || e);
      pRich = pBase;
    }
  }

  const pFace = ensureFaceVisiblePrompt(pRich, p0);
  const pColor = ensureCharacterColorPrompt(pFace);
  const pOut = ensureInanimateMotionPrompt(pColor, p0);

  return { ok: true, promptOriginal: p0, promptSent: pOut, translated };
}
