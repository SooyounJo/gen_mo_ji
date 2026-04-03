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
    책: "book",

    // foods / plants / nature (common)
    당근: "carrot",
    사과: "apple",
    바나나: "banana",
    딸기: "strawberry",
    포도: "grape",
    레몬: "lemon",
    수박: "watermelon",
    버섯: "mushroom",
    꽃: "flower",
    장미: "rose",
    튤립: "tulip",
    나무: "tree",
    잎: "leaf",
    풀: "grass",
    잔디: "grass",
    돌: "rock",
    산: "mountain",
    바다: "ocean",
    파도: "wave",
    구름: "cloud",
    해: "sun",
    태양: "sun",
    달: "moon",
    별: "star",
    눈: "snow",
    비: "rain",
    번개: "lightning",
    불: "fire",
    물: "water"
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

function paletteEn(emo, seedStr) {
  const palettes =
    {
      happy: [
        "butter yellow and sky blue",
        "coral and mint",
        "candy pink and turquoise",
        "peach and teal"
      ],
      excited: [
        "electric blue and hot pink",
        "neon purple and aqua",
        "magenta and cobalt",
        "lime accents with deep blue"
      ],
      sad: [
        "powder blue and lavender",
        "cool gray and soft blue",
        "periwinkle and misty teal"
      ],
      angry: [
        "crimson and charcoal",
        "red-orange and deep navy",
        "scarlet accents with black"
      ],
      scared: [
        "pale teal and cool gray",
        "mint and lilac",
        "soft cyan and slate"
      ],
      surprised: [
        "sunny yellow and royal blue",
        "orange and cyan",
        "gold and violet"
      ],
      touched: [
        "rose gold and warm beige",
        "soft pink and champagne",
        "warm peach and pearl gray"
      ],
      bored: [
        "sage and cool gray",
        "dusty blue and taupe",
        "muted violet and stone"
      ]
    }[emo] || [
      "coral and teal",
      "sky blue and lavender",
      "pink and cobalt",
      "orange and deep blue"
    ];
  return pickStable(palettes, seedStr);
}

function conventionalColorClause({ character, fullText }) {
  const c = String(character || "").toLowerCase();
  const f = String(fullText || "").toLowerCase();
  const s = `${c} ${f}`.trim();
  if (!s) return "";

  // Food / plant conventions
  if (/(당근|carrot)/.test(s)) return "Conventional colors: bright orange body with a fresh green leafy top.";
  if (/(바나나|banana)/.test(s)) return "Conventional colors: rich banana yellow with slightly darker tips.";
  if (/(사과|apple)/.test(s)) return "Conventional colors: shiny apple red (or green), with a brown stem and small green leaf.";
  if (/(딸기|strawberry)/.test(s)) return "Conventional colors: strawberry red with tiny yellow seeds and a green calyx.";
  if (/(포도|grape)/.test(s)) return "Conventional colors: deep purple grapes with a green stem.";
  if (/(레몬|lemon)/.test(s)) return "Conventional colors: lemon yellow with subtle texture; small green leaf optional.";
  if (/(수박|watermelon)/.test(s)) return "Conventional colors: watermelon green rind with red flesh accents (minimal).";
  if (/(버섯|mushroom)/.test(s)) return "Conventional colors: warm beige stem with a brown or red cap (with white spots if needed).";
  if (/(선인장|cactus)/.test(s)) return "Conventional colors: cactus green body with tiny lighter green ribs; optional small pink flower.";
  if (/(꽃|flower|장미|rose|튤립|tulip)/.test(s))
    return "Conventional colors: vivid petals (red/pink/yellow) with green stem/leaves.";
  if (/(나무|tree)/.test(s)) return "Conventional colors: brown trunk with lush green canopy.";
  if (/(잎|leaf)/.test(s)) return "Conventional colors: fresh green leaf with visible veins.";
  if (/(풀|grass|잔디)/.test(s)) return "Conventional colors: natural green tones with slight variation.";

  // Nature / sky conventions (often white-ish)
  if (/(구름|cloud)/.test(s))
    return "Conventional colors: soft white cloud with cool pale-blue shading for form; add a small colored accent so it isn't pure #FFFFFF.";
  if (/(눈\\b|snow)/.test(s))
    return "Conventional colors: snow white with cool-blue shading; add a tiny colored accessory/accent so it isn't pure #FFFFFF.";
  if (/(바다|ocean|파도|wave)/.test(s)) return "Conventional colors: ocean blue/teal gradients (subtle), with white foam accents.";
  if (/(산|mountain)/.test(s)) return "Conventional colors: stone gray with cool-blue shadows and small snowcap accents.";
  if (/(해|태양|sun)/.test(s)) return "Conventional colors: bright yellow sun with warm orange accents.";
  if (/(달|moon)/.test(s)) return "Conventional colors: pale warm gray moon with cool shading; optional tiny star accents.";
  if (/(별|star)/.test(s)) return "Conventional colors: golden yellow star with slight warm gradient.";
  if (/(비\\b|rain)/.test(s)) return "Conventional colors: cool blue raindrops with subtle translucency.";
  if (/(번개|lightning)/.test(s)) return "Conventional colors: bright yellow lightning with white-hot core highlights.";
  if (/(불\\b|fire)/.test(s)) return "Conventional colors: warm orange-red flames with a yellow core.";
  if (/(물\\b|water)/.test(s)) return "Conventional colors: clear light-cyan water with subtle blue tint.";

  return "";
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

  const conventional = conventionalColorClause({ character, fullText });
  const palette = paletteEn(emo, `${seed}|palette|${noun}|${emotion}|${action}`);
  const colorClause = conventional
    ? ` ${conventional}`
    : palette
      ? ` Color palette: ${palette}. Avoid unintentionally all-white body.`
      : " Avoid unintentionally all-white body.";

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

  const prompt = `${subject} ${actionClause}.${propSuffix}${colorClause}`;
  return { prompt, title, expressionWord };
}

