import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { buildImagePrompt, toEnglishNoun } from "@/lib/prompts/imagePrompt";

function id() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function uniq(arr) {
  return Array.from(new Set(arr));
}

function extractCandidates(text) {
  const s = (text || "").trim();
  if (!s) return [];

  // 한글/영문/숫자 덩어리를 후보로 잡고, 조사/기호/짧은 토큰은 제외
  const raw = s.match(/[A-Za-z0-9가-힣]{2,}/g) || [];
  const stop = new Set([
    "그리고",
    "그런데",
    "하지만",
    "그래서",
    "저는",
    "나는",
    "너는",
    "우리는",
    "그거",
    "이거",
    "저거",
    "오늘",
    "진짜",
    "너무",
    "완전",
    "그냥",
    "조금",
    "아주",
    "정말"
  ]);

  const filtered = raw.filter((w) => !stop.has(w));

  // "구/절" 후보(수식/원인/결과가 있는 표현)
  const clauseCandidates = [];
  const normalized = s.replace(/\s+/g, " ").trim();
  const clauses = normalized.split(/[.!?]/).map((x) => x.trim()).filter(Boolean);
  for (const c of clauses) {
    const hasCausal = /(해서|하여|되서|돼서|되어|돼|때문에|덕분에|떨어뜨|붙여|섞어|넣어|만들어|변해|변신)/.test(c);
    const hasResult = /(됨|됐다|되어버|돼버|되어서|돼서)/.test(c);
    const hasIntense = /(완전|진짜|너무)/.test(c);
    if ((hasCausal && hasResult) || (hasIntense && hasResult)) {
      if (c.length >= 10 && c.length <= 60) clauseCandidates.push(c);
    }
  }

  // "완전 ~됨" / "~됨" 류 짧은 구문 후보
  const became = normalized.match(/(?:완전\s*)?[A-Za-z0-9가-힣]{2,12}됨/g) || [];

  // "명사구 + 행동" 후보 (예: "공룡 초콜릿 사먹음", "흙에 두쫀쿠를 떨어뜨려서 완전 고슴도치됨")
  const actionPhraseCandidates = [];
  const patterns = [
    // A한테 B 주고/줬어/줌
    /[A-Za-z0-9가-힣]+한테\s+[A-Za-z0-9가-힣]+(?:\s+[A-Za-z0-9가-힣]+){0,3}\s+주(?:고|었어|었다|었|줬어|줬다|줬|줌)/g,
    // A랑/과 B 산책했어/놀았어/갔어/했어
    /[A-Za-z0-9가-힣]+(?:랑|과)\s+[A-Za-z0-9가-힣]+(?:\s+[A-Za-z0-9가-힣]+){0,2}\s*(?:산책했어|산책했다|산책했|놀았어|놀았다|놀았|갔어|갔다|가서|했어|했다|함)/g,
    // (명사구) + 행동(먹/사먹/샀/만들/떨어뜨/됨...)
    /(?:[A-Za-z0-9가-힣]+(?:\s+|$)){1,6}(?:사먹(?:었어|었다|었|음)?|먹(?:었어|었다|었|음)?|샀(?:어|다|음)?|구매(?:했어|했다|함)?|만들(?:었어|었다|었|음)?|떨어뜨(?:렸어|렸다|려서|림)?|붙여(?:서|줌|봤어|봤다)?|섞어(?:서|봄|봤어|봤다)?|넣어(?:서|봄|봤어|봤다)?|됨|됐다|돼서|되어서)/g
  ];

  for (const re of patterns) {
    const hits = normalized.match(re) || [];
    for (const hit of hits) {
      const h = hit.trim();
      if (h.length >= 6 && h.length <= 70) actionPhraseCandidates.push(h);
    }
  }

  const emotionHints = [
    { re: /(행복|기쁘|기쁨|좋아|좋다)/, tag: "행복" },
    { re: /(설레|두근|두근두근)/, tag: "설렘" },
    { re: /(슬프|눈물|우울)/, tag: "슬픔" },
    { re: /(화나|짜증|분노)/, tag: "분노" },
    { re: /(무섭|공포|소름)/, tag: "두려움" },
    { re: /(놀라|깜짝)/, tag: "놀람" },
    { re: /(감동)/, tag: "감동" },
    { re: /(심심|지루)/, tag: "지루함" }
  ];

  const propHints = [
    /(하트|사랑)/,
    /(풍선)/,
    /(피자)/,
    /(책)/,
    /(눈물|휴지)/,
    /(불꽃|폭죽|불꽃축제)/,
    /(당고|녹차)/,
    /(선글라스|안경)/,
    /(꽃|장미)/,
    /(도쿄|여행)/,
    /(강아지|고양이|햄스터|새|선인장|당나귀|오징어|아기)/
  ];

  const scored = filtered.map((w) => {
    let score = 0;
    if (emotionHints.some((h) => h.re.test(w))) score += 4;
    if (propHints.some((re) => re.test(w))) score += 2;
    if (/(ㅋㅋ|ㅎㅎ)/.test(w)) score += 1;
    score += Math.min(w.length, 6) * 0.15;
    return { w, score };
  });

  const bestTokens = scored
    .filter((x) => x.score >= 2.2)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.w);

  // 여러 개가 나올 수 있도록: 구/절 + "됨" 구문 + 토큰 상위권을 합쳐 반환
  const phrases = uniq([...actionPhraseCandidates, ...clauseCandidates]);
  const tokens =
    phrases.length > 0
      ? bestTokens.filter((t) => !phrases.some((p) => p.includes(t)))
      : bestTokens;

  const merged = uniq([...phrases, ...became, ...tokens]);
  if (merged.length) return merged.slice(0, 8);

  return uniq(
    scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((x) => x.w)
  );
}

function inferEmotion(term) {
  const t = (term || "").trim();
  const map = [
    { re: /(행복|기쁘|좋아|좋다)/, v: "행복" },
    { re: /(설레|두근)/, v: "설렘" },
    { re: /(슬프|눈물|우울)/, v: "슬픔" },
    { re: /(화나|짜증|분노)/, v: "분노" },
    { re: /(무섭|공포|소름)/, v: "두려움" },
    { re: /(놀라|깜짝)/, v: "놀람" },
    { re: /(감동)/, v: "감동" },
    { re: /(심심|지루)/, v: "지루함" }
  ];
  const hit = map.find((m) => m.re.test(t));
  return hit ? hit.v : "설렘";
}

function inferEmotionFromText(text) {
  return inferEmotion(text);
}

function stripParticle(word) {
  return String(word || "").replace(/(한테|에게|를|을|이|가|은|는|랑|과|로|으로|에|에서|까지|부터|도)$/g, "");
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

function pickStableColor(seedStr) {
  const palette = [
    "#D1D5DB", // neutral
    "#FFFFFF",
    "#BAF53A", // neon green
    "#FF9FFC", // pink
    "#5227FF", // purple
    "#4CC9FF", // sky
    "#F59E0B", // amber
    "#34D399" // mint
  ];
  return pickStable(palette, seedStr);
}

function emotionCode(kr) {
  const m = {
    행복: "happy",
    설렘: "excited",
    슬픔: "sad",
    분노: "angry",
    두려움: "scared",
    놀람: "surprised",
    감동: "moved",
    지루함: "bored"
  };
  return m[kr] || "excited";
}

function actionCode(kr) {
  const m = {
    "산책하기": "walk",
    "주기": "give",
    "먹기": "eat",
    "떨어뜨리기": "drop",
    "변신하기": "transform",
    "표현하기": "express"
  };
  return m[kr] || "express";
}

function isAdverbLike(word) {
  const w = String(word || "");
  if (!w) return false;
  // 즐겁게/신나게/귀엽게/빠르게 등
  if (w.length >= 3 && w.endsWith("게")) return true;
  return false;
}

function appearanceFromCharacter({ character, emotion, action, fullText, props, seed }) {
  const c = String(character || "").trim();
  const s = `${seed}|${c}|${emotion}|${action}|${fullText}|${(props || []).join(",")}`;

  const paletteByEmotion = {
    행복: ["라임", "파스텔 옐로우", "크림"],
    설렘: ["핑크", "라벤더", "하늘"],
    슬픔: ["파스텔 블루", "라일락 그레이", "민트 그레이"],
    분노: ["레드", "버건디", "차콜"],
    두려움: ["퍼플", "딥 블루", "그레이"],
    놀람: ["레몬", "코랄", "오프화이트"],
    감동: ["피치", "샴페인", "오프화이트"],
    지루함: ["베이지", "라이트 그레이", "오프화이트"]
  };

  const palette = (paletteByEmotion[emotion] || paletteByEmotion["설렘"]).join(" 톤 ");

  const expressions = {
    행복: ["활짝 웃는 표정", "반달눈 미소", "입꼬리가 올라간 표정"],
    설렘: ["두근거리는 눈빛", "볼이 살짝 발그레", "눈이 반짝이는 표정"],
    슬픔: ["촉촉한 눈", "입꼬리가 내려간 표정", "눈물이 맺힌 표정"],
    분노: ["찡그린 눈썹", "볼이 붉게 달아오른 표정", "이를 악문 표정"],
    두려움: ["동그랗게 커진 눈", "몸을 움츠린 자세", "떨리는 표정"],
    놀람: ["입이 동그랗게 열린 표정", "눈이 크게 뜬 표정", "깜짝 놀란 눈"],
    감동: ["눈이 반짝이며 미소", "따뜻한 표정", "살짝 울컥한 표정"],
    지루함: ["힘이 빠진 표정", "반쯤 감긴 눈", "축 처진 자세"]
  };

  const expression = pickStable(expressions[emotion] || expressions["설렘"], s);

  const materials = [
    "3D 유광",
    "젤리처럼 반투명한",
    "말랑한 러버 질감의",
    "유리처럼 반사되는"
  ];
  const material = pickStable(materials, s);

  const bodyShapes = ["동글동글한", "통통한", "미니멀한", "말랑말랑한"];
  const bodyShape = pickStable(bodyShapes, s);

  const featureBits = uniq([
    props?.some((p) => String(p).includes("하트")) ? "작은 하트 포인트" : "",
    props?.some((p) => String(p).includes("풍선")) ? "손에 풍선을 든" : "",
    props?.some((p) => String(p).includes("해바라기")) ? "해바라기씨 자국 디테일" : "",
    props?.some((p) => String(p).includes("피자")) ? "치즈가 늘어나는 디테일" : "",
    props?.some((p) => String(p).includes("책")) ? "책장을 넘기는 포즈" : "",
    /(비\(|비오)/.test(fullText) ? "물방울 반짝임" : "",
    /(바람\(|바람)/.test(fullText) ? "머리카락/귀가 휘날리는" : ""
  ]).filter(Boolean);

  const feature = featureBits.length ? featureBits.join(", ") : pickStable(["하이라이트가 강한 표면", "미세한 스펙큘러", "부드러운 그라데이션 쉐이딩"], s);

  const actionHint =
    action === "산책하기"
      ? "가볍게 걸어가는 포즈"
      : action === "주기"
        ? "두 손으로 건네는 포즈"
        : action === "먹기"
          ? "한 입 베어무는 포즈"
          : action === "떨어뜨리기"
            ? "손에서 미끄러지는 모션"
            : action === "변신하기"
              ? "변신 중 번쩍이는 이펙트"
              : "손을 흔드는 포즈";

  // 캐릭터 타입별 디테일
  const lower = c.toLowerCase();
  const isAnimal = /(햄스터|강아지|고양이|새|당나귀|오징어|개구리|고슴도치|공룡)/.test(c);
  const isHuman = /(사람|친구)/.test(c);
  const isFood = /(초콜릿|피자|당고|녹차)/.test(c);
  const isObject = /(풍선|책|우산|하트)/.test(c) || (!isAnimal && !isHuman && !isFood);

  const base =
    isAnimal
      ? `${material} ${bodyShape} ${c}`
      : isHuman
        ? `${material} ${bodyShape} 사람 캐릭터`
        : isFood
          ? `${material} ${bodyShape} ${c} 캐릭터`
          : `${material} ${bodyShape} ${c} 오브제`;

  return `${base}, ${palette}, ${expression}, ${actionHint}, ${feature}`;
}

function analyzeSelection(selected, contextText, nickname) {
  const s = String(selected || "").replace(/\s+/g, " ").trim();
  const ctx = String(contextText || "");

  const emotion = inferEmotionFromText(ctx + " " + s);

  const fullText = `${ctx} ${s}`.replace(/\s+/g, " ").trim();
  const action =
    /(산책)/.test(fullText)
      ? "산책하기"
      : /(주고|줬|주기)/.test(fullText)
        ? "주기"
        : /(사먹|먹|마셔)/.test(fullText)
          ? "먹기"
          : /(떨어뜨)/.test(fullText)
            ? "떨어뜨리기"
            : /(됨|됐다|돼서|되어서|변신)/.test(fullText)
              ? "변신하기"
              : "표현하기";

  // 캐릭터(음식/사물/동물/인간 등)
  const tokens = fullText.split(" ").filter(Boolean);
  let character = "";

  // "~한테/~에게"가 있으면 그 앞(받는 대상)을 캐릭터로 우선
  const recipient = tokens.find((t) => /(한테|에게)$/.test(t));
  if (recipient) character = stripParticle(recipient);

  // 산책하기면 "A랑 산책"의 A를 캐릭터로 우선
  if (!character && action === "산책하기") {
    const walkMatch = fullText.match(/([A-Za-z0-9가-힣]+)(?:랑|과)\s+산책/);
    if (walkMatch?.[1]) character = stripParticle(walkMatch[1]);
  }

  if (!character) {
    // 동물/인간 우선
    const animalsHumans = [
      "햄스터",
      "강아지",
      "고양이",
      "새",
      "선인장",
      "당나귀",
      "오징어",
      "아기",
      "공룡",
      "개구리",
      "사람",
      "친구"
    ];
    const hit = animalsHumans.find((e) => fullText.includes(e));
    if (hit) character = hit;
  }

  if (!character) {
    // 음식/사물(살아있는 캐릭터가 없을 때만)
    const thingsFoods = ["초콜릿", "피자", "하트", "풍선", "당고", "녹차", "흙", "우산", "책"];
    const hit = thingsFoods.find((e) => fullText.includes(e));
    if (hit) character = hit;
  }

  if (!character) {
    // 기본: 동사 앞 명사구를 캐릭터로
    const verbIdx = tokens.findIndex((t) => /(사먹|먹|줬|주고|산책|됨|됐다|돼서|되어서|떨어뜨)/.test(t));
    const head = verbIdx > 0 ? tokens.slice(0, verbIdx).join(" ") : tokens.slice(0, 2).join(" ");
    character = stripParticle(head) || stripParticle(tokens[0] || "");
  }

  // 소품: "구체 명사/사물/음식" 위주로, 부사/감정어/조사는 제거
  const full = fullText;
  const propSet = new Set();

  // 규칙 기반으로 더 정확한 소품 추출
  // 1) "X한테 Y 주고" → Y를 소품
  const giveMatch = full.match(/([A-Za-z0-9가-힣]+)한테\s+(.+?)\s+주(?:고|었어|었다|었|줬어|줬다|줬|줌)/);
  if (giveMatch?.[2]) {
    const y = giveMatch[2]
      .replace(/\s+/g, " ")
      .split(" ")
      .map(stripParticle)
      .filter(Boolean)
      .filter((w) => !isAdverbLike(w));
    // "해바라기씨도" 같은 형태 정리
    if (y.length) propSet.add(y.join(" ").replace(/도$/g, ""));
  }

  // 2) "A랑 산책" → A는 동반 캐릭터(특수 소품 취급)
  const walkMatch = full.match(/([A-Za-z0-9가-힣]+)(?:랑|과)\s+산책/);
  if (walkMatch?.[1]) {
    const companion = stripParticle(walkMatch[1]);
    if (companion && companion !== character) propSet.add(`${companion}(동반)`);
  }

  const propCandidates = full.match(/[A-Za-z0-9가-힣]{2,}/g) || [];
  const noise = /(오늘|어제|진짜|완전|너무|그리고|하지만|그래서|저는|나는|너는|우리는|심심|대박|헐)/;
  const verbish = /(사먹|먹|마셔|주고|줬|산책|됨|됐다|돼서|되어서|떨어뜨|변신|했어|했다|함|가서|갔다|갔어|보고|봤|맞았|맞아)/;

  for (const w0 of propCandidates) {
    const w = stripParticle(w0);
    if (!w) continue;
    if (noise.test(w)) continue;
    if (verbish.test(w)) continue;
    if (isAdverbLike(w)) continue;
    if (w === character || character.includes(w)) continue;
    if (w.length <= 1) continue;
    // 감정 단어는 소품에서 제외
    if (/(행복|설렘|슬픔|분노|두려움|놀람|감동|지루)/.test(w)) continue;
    // 조사/접속부사 류 제거(도쿄에서/비오는 등은 아래에서 처리)
    if (/(비오|바람|날씨)/.test(w)) continue;
    propSet.add(w);
  }

  // 환경/특수 소품(날씨/효과) 별도 보강
  if (/(비|비오)/.test(full)) propSet.add("비(날씨)");
  if (/(바람)/.test(full)) propSet.add("바람(효과)");

  const props = Array.from(propSet).slice(0, 4);

  const appearance = appearanceFromCharacter({
    character,
    emotion,
    action,
    fullText: full,
    props,
    seed: `${nickname}|${contextText}|${selected}`
  });

  const promptPack = buildImagePrompt({
    character,
    emotion,
    action,
    props,
    fullText: full,
    seed: `${nickname}|${contextText}|${selected}`
  });

  const charName = (nickname || "00").trim() || "00";
  const saveName = [
    toAsciiSlug(charName, "user"),
    toAsciiSlug(character, "character"),
    emotionCode(emotion),
    actionCode(action)
  ].join("-");

  return {
    character,
    emotion,
    action,
    appearance,
    props,
    saveName,
    imagePrompt: promptPack.prompt,
    title: promptPack.title,
    expressionWord: promptPack.expressionWord
  };
}

function inferAction(term, emotion) {
  const t = (term || "").trim();
  if (/(웃|ㅋㅋ|ㅎㅎ)/.test(t)) return "웃는";
  if (/(울|눈물)/.test(t)) return "우는";
  if (/(화나|짜증|분노)/.test(t)) return "발끈하는";
  if (/(불꽃|폭죽)/.test(t)) return "감탄하는";
  if (/(피자|먹)/.test(t)) return "먹는";
  if (/(책|읽)/.test(t)) return "읽는";
  if (emotion === "설렘") return "두근거리는";
  if (emotion === "행복") return "손을 흔드는";
  if (emotion === "슬픔") return "훌쩍이는";
  return "포즈를 취하는";
}

function inferAppearance(term, emotion) {
  const t = (term || "").trim();
  if (/(반짝|빛|네온)/.test(t)) return "반짝이는 네온";
  if (/(귀엽|아기)/.test(t)) return "동글동글한";
  if (emotion === "분노") return "진한 붉은 그라데이션";
  if (emotion === "슬픔") return "파스텔 블루 톤";
  return "3D 유광";
}

function inferProp(term, emotion) {
  const t = (term || "").trim();
  const pick = (v) => v;
  if (/(하트|사랑)/.test(t)) return pick("하트");
  if (/(풍선)/.test(t)) return pick("풍선");
  if (/(피자)/.test(t)) return pick("피자");
  if (/(책)/.test(t)) return pick("책");
  if (/(불꽃|폭죽)/.test(t)) return pick("불꽃");
  if (/(당고|녹차)/.test(t)) return pick("녹차 당고");
  if (emotion === "설렘") return pick("하트");
  if (emotion === "행복") return pick("풍선");
  if (emotion === "슬픔") return pick("휴지");
  if (emotion === "분노") return pick("불꽃");
  return pick("반짝 스티커");
}

function buildCluster(term, characterName) {
  const t = (term || "").trim();
  const emotion = inferEmotion(t);
  const action = inferAction(t, emotion);
  const appearance = inferAppearance(t, emotion);
  const prop = inferProp(t, emotion);
  const charName = (characterName || "00").trim() || "00";
  return {
    term: t,
    emotion,
    action,
    appearance,
    prop,
    characterName: charName,
    imageName: `${charName}-${t.replace(/\s+/g, "")}-${emotion}`.toLowerCase()
  };
}

export function useTextLogic() {
  const router = useRouter();
  const [step, setStep] = useState("nickname"); // nickname -> join -> chat
  const [nickname, setNickname] = useState("");

  const [messageInput, setMessageInput] = useState("");
  const [draftSelectedTerm, setDraftSelectedTerm] = useState(null);
  const [draftPreviewIndex, setDraftPreviewIndex] = useState(0);
  const [draftPreviewImages, setDraftPreviewImages] = useState([]);
  const [draftPreviewVideoUrl, setDraftPreviewVideoUrl] = useState("");
  const [draftGenerateStatus, setDraftGenerateStatus] = useState("idle"); // idle | loading | done | error
  const [draftGenerateError, setDraftGenerateError] = useState("");
  const [timeline, setTimeline] = useState(() => []);
  const [revealedCount, setRevealedCount] = useState(0);
  const [showComposer, setShowComposer] = useState(false);
  const [guideMessageId, setGuideMessageId] = useState(null);
  const [hasPickedCandidate, setHasPickedCandidate] = useState(false);

  const listRef = useRef(null);
  const introTimerRef = useRef(null);
  const genAbortRef = useRef(null);
  const genTimerRef = useRef(null);
  const genSeqRef = useRef(0);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [revealedCount, timeline.length, showComposer]);

  const canSend = useMemo(() => messageInput.trim().length > 0, [messageInput]);
  const canProceedNickname = useMemo(() => nickname.trim().length > 0, [nickname]);
  const hasUserMessage = useMemo(() => timeline.some((m) => m.role === "user"), [timeline]);
  const liveCandidates = useMemo(() => extractCandidates(messageInput), [messageInput]);
  const draftPreviewColors = useMemo(() => {
    const seed = `${nickname}|${messageInput}|${draftSelectedTerm || ""}`;
    return [pickStableColor(`${seed}|0`), pickStableColor(`${seed}|1`)];
  }, [nickname, messageInput, draftSelectedTerm]);

  useEffect(() => {
    if (!draftSelectedTerm) return;
    const t = String(draftSelectedTerm);
    if (!messageInput.includes(t)) setDraftSelectedTerm(null);
  }, [draftSelectedTerm, messageInput]);

  useEffect(() => {
    return () => {
      if (genAbortRef.current) genAbortRef.current.abort();
      if (genTimerRef.current) window.clearTimeout(genTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const term = String(draftSelectedTerm || "").trim();
    const text = String(messageInput || "");
    if (!term || !text.trim() || !text.includes(term)) {
      if (genAbortRef.current) genAbortRef.current.abort();
      if (genTimerRef.current) window.clearTimeout(genTimerRef.current);
      setDraftPreviewImages([]);
      setDraftPreviewVideoUrl("");
      setDraftGenerateStatus("idle");
      setDraftGenerateError("");
      return;
    }

    if (genAbortRef.current) genAbortRef.current.abort();
    const controller = new AbortController();
    genAbortRef.current = controller;

    if (genTimerRef.current) window.clearTimeout(genTimerRef.current);
    const seq = (genSeqRef.current += 1);
    setDraftGenerateStatus("loading");
    setDraftGenerateError("");

    genTimerRef.current = window.setTimeout(async () => {
      try {
        const analysis = analyzeSelection(term, text, nickname);
        const motion =
          analysis.action === "산책하기"
            ? "walking"
            : analysis.action === "주기"
              ? "giving"
              : analysis.action === "먹기"
                ? "eating"
                : analysis.action === "떨어뜨리기"
                  ? "dropping"
                  : analysis.action === "변신하기"
                    ? "transforming"
                    : "posing";
        // eslint-disable-next-line no-console
        console.log("[comfy] ai interpretation (analysis)", analysis);
        const payload = {
          prompt: analysis.imagePrompt,
          motion,
          width: 1024,
          height: 1024,
          count: 2
        };
        // eslint-disable-next-line no-console
        console.log("[comfy] request payload -> /api/comfy/generate", payload);
        const res = await fetch("/api/comfy/generate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify(payload)
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.detail || data?.error || "이미지 생성 실패");
        if (seq !== genSeqRef.current) return;
        const imgs = Array.isArray(data?.images) ? data.images.filter(Boolean) : [];
        setDraftPreviewImages(imgs.slice(0, 2));
        setDraftPreviewVideoUrl(String(data?.videoUrl || ""));
        // eslint-disable-next-line no-console
        console.log("[comfy] response <- /api/comfy/generate", {
          images: Array.isArray(data?.images) ? data.images.length : 0,
          videoUrl: String(data?.videoUrl || ""),
          videoRef: data?.videoRef || null
        });
        setDraftGenerateStatus("done");
      } catch (e) {
        if (controller.signal.aborted) return;
        if (seq !== genSeqRef.current) return;
        setDraftPreviewImages([]);
        setDraftPreviewVideoUrl("");
        setDraftGenerateStatus("error");
        setDraftGenerateError(String(e?.message || e));
      }
    }, 450);

    return () => {
      controller.abort();
      if (genTimerRef.current) window.clearTimeout(genTimerRef.current);
    };
  }, [draftSelectedTerm, messageInput, nickname]);

  const introScript = useMemo(
    () => [
      { type: "date", text: "2026.3.5" },
      { type: "bubble", speaker: "A", variant: "yellow", text: "B야 너 오늘 뭐했어? 심심해 죽겠다" },
      {
        type: "bubble",
        speaker: "B",
        variant: "blue",
        text: "하이~ 나 오늘 엄마 아빠랑 도쿄에\n유명한 불꽃축제 보고왔어. 완전 대박"
      },
      {
        type: "bubble",
        speaker: "A",
        variant: "yellowPink",
        parts: [
          { text: "헐 나도 도쿄에 불꽃축제 너무 가고싶어 ㅠ\n", tone: "pinkGlow" },
          { text: "거기 유명한 녹차 당고도 먹었겠네?" }
        ]
      },
      {
        type: "image",
        speaker: "B",
        label: "예시",
        src: "https://www.figma.com/api/mcp/asset/e5ea6ede-2c01-4383-a013-31512b01ba02"
      },
      {
        type: "bubble",
        speaker: "B",
        variant: "blue",
        parts: [
          { text: "아 이모지 뭐야 ㅋㅋㅋㅋㅋ 넘 귀엽!\n" },
          { text: "당연하지 ", tone: "normal" },
          { text: "진짜 눈물나게 맛있었던 ", tone: "blueGlow" },
          { text: "녹차 맛 당고였어....", tone: "blueGlow" }
        ]
      },
      {
        type: "image",
        speaker: "B",
        label: "예시",
        src: "https://www.figma.com/api/mcp/asset/e5ea6ede-2c01-4383-a013-31512b01ba02",
        reaction: "❤️"
      },
      { type: "system", text: `${nickname || "00"}님이 채팅에 참여했어요!` },
      {
        type: "bubble",
        speaker: "A",
        variant: "yellow",
        text: `오 ${nickname || "00"}이 왔구나! 하이~\nB는 오늘 도쿄에서 완전 재밌었대\n넌 뭐했어??`
      }
    ],
    [nickname]
  );

  useEffect(() => {
    return () => {
      if (introTimerRef.current) window.clearInterval(introTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!showComposer) return;
    setRevealedCount(timeline.length);
  }, [showComposer, timeline.length]);

  const send = (opts = {}) => {
    const text = messageInput.trim();
    if (!text) return;

    const selected = draftSelectedTerm;
    const previewIndex = Number.isFinite(opts.previewIndex) ? opts.previewIndex : draftPreviewIndex;
    const imagesSnapshot = Array.isArray(draftPreviewImages) ? draftPreviewImages.slice(0, 2) : [];
    const videoSnapshot = String(draftPreviewVideoUrl || "");
    setMessageInput("");
    setDraftSelectedTerm(null);
    setDraftPreviewIndex(0);
    setDraftPreviewImages([]);
    setDraftPreviewVideoUrl("");
    setDraftGenerateStatus("idle");
    setDraftGenerateError("");
    const candidates = extractCandidates(text);
    const msgId = id();
    setTimeline((prev) => {
      const next = [...prev, { id: msgId, role: "user", type: "bubble", variant: "userWhite", text, candidates }];
      if (selected && String(selected).trim()) {
        const analysis = analyzeSelection(selected, text, nickname);
        next.push({ id: id(), role: "bot", type: "analysis", variant: "analysisWhite", analysis });
        const seed = `${nickname}|${text}|${selected}`;
        const colors = [pickStableColor(`${seed}|0`), pickStableColor(`${seed}|1`)];
        next.push(
          {
            id: id(),
            role: "bot",
            type: "generatedImage",
            src: imagesSnapshot[0] || "",
            color: colors[0],
            index: 0,
            selectedIndex: previewIndex
          },
          {
            id: id(),
            role: "bot",
            type: "generatedImage",
            src: imagesSnapshot[1] || "",
            color: colors[1],
            index: 1,
            selectedIndex: previewIndex
          }
        );
        if (videoSnapshot) {
          next.push({
            id: id(),
            role: "bot",
            type: "generatedVideo",
            src: videoSnapshot
          });
        }
      }
      return next;
    });
    if (!hasPickedCandidate && !guideMessageId && candidates.length) setGuideMessageId(msgId);
  };

  const selectCandidate = (term, sourceMessageId) => {
    const contextText = (() => {
      const byId = timeline.find((m) => m?.id === sourceMessageId);
      if (byId?.role === "user" && byId?.text) return byId.text;
      // fallback: includes search
      const normTerm = String(term || "").replace(/\s+/g, " ").trim();
      for (let i = timeline.length - 1; i >= 0; i -= 1) {
        const m = timeline[i];
        if (m?.role !== "user") continue;
        if (String(m.text || "").replace(/\s+/g, " ").includes(normTerm)) return m.text;
      }
      return "";
    })();

    const analysis = analyzeSelection(term, contextText, nickname);
    setHasPickedCandidate(true);
    setGuideMessageId(null);
    setTimeline((prev) => [
      ...prev,
      {
        id: id(),
        role: "bot",
        type: "analysis",
        variant: "analysisWhite",
        analysis
      }
    ]);
    window.setTimeout(() => setShowComposer(true), 0);
  };

  return {
    step,
    nickname,
    setNickname,
    proceedNickname: () => {
      if (!canProceedNickname) return;
      setStep("join");
    },
    joinChat: () => {
      setStep("chat");
      setMessageInput("");
      setShowComposer(false);
      setGuideMessageId(null);
      setHasPickedCandidate(false);

      const items = introScript.slice(1).map((m) => ({
        id: id(),
        ...m
      }));
      setTimeline(items);
      setRevealedCount(items.length ? 1 : 0);

      if (introTimerRef.current) window.clearInterval(introTimerRef.current);
      introTimerRef.current = window.setInterval(() => {
        setRevealedCount((c) => {
          const next = c + 1;
          if (next >= items.length) {
            window.clearInterval(introTimerRef.current);
            introTimerRef.current = null;
            window.setTimeout(() => setShowComposer(true), 650);
            return items.length;
          }
          return next;
        });
      }, 2000);
    },
    introScript,
    dateText: introScript[0]?.text || "",
    timeline,
    revealedCount,
    showComposer,
    selectCandidate,
    guideMessageId,
    draftSelectedTerm,
    setDraftSelectedTerm,
    liveCandidates,
    draftPreviewColors,
    draftPreviewImages,
    draftPreviewVideoUrl,
    draftGenerateStatus,
    draftGenerateError,
    draftPreviewIndex,
    setDraftPreviewIndex,
    completeDraftWithPreview: (idx) => send({ previewIndex: idx }),

    input: messageInput,
    setInput: setMessageInput,
    listRef,
    canSend,
    send,
    hasUserMessage,
    goNext: () => router.push("/archive")
  };
}

