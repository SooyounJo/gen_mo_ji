/**
 * 이미지 프롬프트 생성 전용 AI 시스템 프롬프트.
 * (하이라이트 프롬프트와 별도 파일/규칙으로 분리)
 */
export const IMAGE_PROMPT_SYSTEM_PROMPT = `You are an extractor and prompt builder for a real-time chat emoji generation system.

Your task is to convert a user message (or a selected highlight, especially a long phrase) into structured emoji slots AND a visual prompt suitable for image generation (e.g., ComfyUI).

This is not general sentiment analysis.
This is not summarization.
This is not translation.

You must extract emoji-friendly content and organize it into:
emoji_slots
image_prompt

Priority Rule
If a long phrase is provided:
-> Use it as the primary reference for determining all outputs

Emoji Extraction Rules

Extract the following slots:

character
- The main visible subject (person, animal, or object)
- Use "나" if the speaker is the subject
- If no clear subject exists, return null

emotion
- Only when clearly expressed in the input
- If unclear, return "neutral"
- Do NOT infer hidden emotions

action
- A visually representable action (required)
- Examples: spilling, eating, running, watching, holding
- If unclear, use "expressing"

props
- Supporting visual elements (objects, companions, effects)
- Maximum 2-3 items
- Must be visually concrete
- Avoid abstract concepts
- Avoid duplicates

Core Principles
- Prioritize visual clarity over linguistic completeness
- Only extract what can be clearly visualized
- Do NOT hallucinate or invent details
- Ignore filler or non-visual expressions
- When the input is Korean, analyze Korean directly

---

Image Prompt Construction Rules (ComfyUI)

Generate a visual prompt that can be directly used for image generation.

The prompt must:

1. Be visually concrete and concise
2. Describe a single coherent scene
3. Include:
   - character appearance (simple, emoji-style or stylized)
   - action
   - props/environment
4. Reflect the emotion ONLY if explicitly present
5. Avoid abstract or narrative language
6. Prefer simple, iconic, emoji-like composition
7. Keep it short and generation-friendly

Style Guidelines (default unless overridden):
- simple composition
- centered subject
- clean background or minimal environment
- soft lighting
- emoji or sticker style
- high readability at small size

---

Output Format
Return JSON only:

{
  "emoji_slots": {
    "character": "... or null",
    "emotion": "...",
    "action": "...",
    "props": ["...", "..."]
  },
  "image_prompt": "..."
}`;

export function buildImagePromptUserPrompt({ userText, selectedHighlight }) {
  const input = String(userText || "").trim();
  const selected = String(selectedHighlight || "").trim();
  return `Input text:
${input}

Selected highlight (optional, prioritize this if it is a long phrase):
${selected || "(none)"}

Return JSON only.`;
}

function toAsciiSlug(input, fallback = "user") {
  const s = String(input || "").trim();
  let hash = 5381;
  for (let i = 0; i < s.length; i += 1) {
    hash = (hash * 33) ^ s.charCodeAt(i);
  }
  const h = (hash >>> 0).toString(36);
  const ascii = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (ascii) return ascii;
  return `${fallback}-${h}`;
}

export function toEnglishNoun(kr) {
  const k = String(kr || "").trim().replace(/\(.*?\)$/g, "");
  if (!k) return "character";
  const dict = {
    햄스터: "hamster",
    강아지: "puppy",
    고양이: "cat",
    고슴도치: "hedgehog",
    공룡: "dinosaur",
    개구리: "frog",
    새: "bird",
    오징어: "squid",
    당나귀: "donkey",
    아기: "baby",
    사람: "person",
    친구: "friend",
    선인장: "cactus",
    초콜릿: "chocolate",
    피자: "pizza",
    하트: "heart",
    풍선: "balloon",
    당고: "dango",
    녹차: "matcha",
    흙: "soil",
    우산: "umbrella",
    책: "book"
  };
  if (dict[k]) return dict[k];
  if (/^[A-Za-z0-9 _-]+$/.test(k)) return k.trim();
  return toAsciiSlug(k, "character");
}

function withArticle(nounPhrase) {
  const n = String(nounPhrase || "").trim();
  if (!n) return "A character";
  const lower = n.toLowerCase();
  const an = /^[aeiou]/.test(lower) || lower.startsWith("hour") || lower.startsWith("honest");
  return `${an ? "An" : "A"} ${n}`;
}

function emotionEn(emotionKr) {
  const m = {
    행복: "happy",
    설렘: "excited",
    슬픔: "sad",
    분노: "angry",
    두려움: "scared",
    놀람: "surprised",
    감동: "touched",
    지루함: "bored"
  };
  return m[emotionKr] || "excited";
}

function actionEn(actionKr) {
  const m = {
    산책하기: "walking",
    주기: "giving",
    먹기: "eating",
    떨어뜨리기: "dropping",
    변신하기: "transforming",
    표현하기: "posing"
  };
  return m[actionKr] || "posing";
}

function stableHash(input) {
  const s = String(input || "");
  let hash = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pickStable(list, seedStr) {
  if (!Array.isArray(list) || list.length === 0) return "";
  const h = stableHash(seedStr);
  return list[h % list.length];
}

export function buildImagePrompt({ character, emotion, action, props, fullText, seed }) {
  const noun = toEnglishNoun(character);
  const subject = withArticle(noun);
  const emo = emotionEn(emotion);
  const act = actionEn(action);

  const targetTransform =
    String(fullText || "").match(/([A-Za-z0-9가-힣]+)됨/)?.[1] ||
    String(fullText || "").match(/변신.*?([A-Za-z0-9가-힣]+)/)?.[1] ||
    "";
  const transformTo = targetTransform ? toEnglishNoun(targetTransform) : "";

  const heldProp = (props || [])
    .map((p) => String(p))
    .find((p) => p && !p.includes("(날씨)") && !p.includes("(효과)") && !p.includes("(동반)"));
  const heldPropEn = heldProp ? toEnglishNoun(heldProp.replace(/\(.*?\)/g, "")) : "";

  const actionClause =
    action === "주기" && heldPropEn
      ? `is ${act} a ${heldPropEn} with a ${emo} expression`
      : action === "먹기" && heldPropEn
        ? `is ${act} a ${heldPropEn} with a ${emo} expression`
        : action === "떨어뜨리기" && heldPropEn
          ? `is ${act} a ${heldPropEn} with a ${emo} expression`
          : action === "변신하기" && transformTo
            ? `is ${act} into a ${transformTo}, with a ${emo} expression`
            : `is ${act} with a ${emo} expression`;

  const propBits = (props || [])
    .map((p) => String(p))
    .filter((p) => p && !/(날씨|효과)/.test(p))
    .slice(0, 3)
    .map((p) => toEnglishNoun(p.replace(/\(.*?\)/g, "")));
  const propSuffix = propBits.length ? ` Featuring ${propBits.join(", ")}.` : "";

  const expressionWord = pickStable(
    {
      happy: ["Joy", "Gleam", "Cheer"],
      excited: ["Spark", "Blush", "Bounce"],
      sad: ["Gloom", "Sigh", "Drizzle"],
      angry: ["Rage", "Blaze", "Stomp"],
      scared: ["Shiver", "Eek", "Hush"],
      surprised: ["Pop", "Whoa", "Zap"],
      touched: ["Warmth", "Glow", "Heart"],
      bored: ["Meh", "Yawn", "Dull"]
    }[emo] || ["Spark", "Glow", "Pop"],
    seed
  );

  const title = (() => {
    const adj = pickStable(
      {
        happy: ["Smiling", "Sunny", "Bright"],
        excited: ["Neon", "Glowing", "Sparkly"],
        sad: ["Misty", "Quiet", "Blue"],
        angry: ["Fiery", "Fierce", "Hot"],
        scared: ["Shy", "Tiny", "Nervous"],
        surprised: ["Popped", "Wide-eyed", "Sudden"],
        touched: ["Warm", "Tender", "Soft"],
        bored: ["Lazy", "Sleepy", "Plain"]
      }[emo] || ["Glowing", "Neon", "Sparkly"],
      seed
    );
    const base = noun.replace(/^\w/, (c) => c.toUpperCase());
    return `${adj} ${base}`;
  })();

  const prompt = `${subject} ${actionClause}.${propSuffix}`;
  return { prompt, title, expressionWord };
}

