/**
 * 하이라이트 후보 추출·문장 분할 (RunPod 테스트 / text 채팅 공통)
 * - 여러 문장이 한 후보로 묶이지 않도록 문장 경계를 우선한다.
 */

export function splitIntoSentences(normalized) {
  const s = String(normalized || "").replace(/\s+/g, " ").trim();
  if (!s) return [];
  const parts = s.split(/(?<=[.!?。])\s*/).map((x) => x.trim()).filter(Boolean);
  return parts.length ? parts : [s];
}

/** 후보가 둘 이상의 완결 문장을 포함하면 false (한 덩어리 하이라이트 방지) */
export function isSingleSentenceSpan(cand) {
  const t = String(cand || "").replace(/\s+/g, " ").trim();
  if (!t) return false;
  return splitIntoSentences(t).length <= 1;
}

function uniq(arr) {
  return Array.from(new Set(arr));
}

/** 한 문장 안에서 주어-서술 느낌으로 나눌 수 있는 짧은 덩어리 */
function splitKoreanClauseChunks(sentence) {
  const s = String(sentence || "").trim();
  if (s.length < 8) return [];
  const out = [];
  const core = s.replace(/[.!?。]+$/g, "").trim();

  // 쉼표 절
  if (core.includes(",")) {
    const subs = core.split(/,\s*/).map((x) => x.trim()).filter((x) => x.length >= 4);
    if (subs.length >= 2) out.push(...subs);
  }

  // "~하는 [명사/보어]" (예: 이족보행하는 해피캣)
  const m1 = core.match(/^(.{3,24}하는)\s+([가-힣A-Za-z0-9][가-힣A-Za-z0-9\s]{1,20})$/);
  if (m1) {
    out.push(m1[1].trim());
    out.push(m1[2].trim());
  }

  // "[주제] [서술어 어미]" — 짧은 문장만 (너무 쪼개지 않게)
  const m2 = core.match(
    /^([가-힣A-Za-z0-9]{2,12}(?:은|는|이|가))\s+([가-힣A-Za-z0-9].{3,40})$/
  );
  if (m2 && core.length <= 48) {
    out.push(`${m2[1].trim()} ${m2[2].trim()}`.replace(/\s+/g, " "));
  }

  return out;
}

/**
 * @param {string} text
 * @returns {string[]}
 */
export function extractHighlightCandidates(text) {
  const s = String(text || "").trim();
  if (!s) return [];

  const normalized = s.replace(/\s+/g, " ").trim();
  const stop = new Set([
    "그리고",
    "그런데",
    "하지만",
    "그래서",
    "저는",
    "나는",
    "너는",
    "우리는",
    "오늘",
    "진짜",
    "너무",
    "완전",
    "그냥"
  ]);

  const sentences = splitIntoSentences(normalized);
  const blocks = sentences.length ? sentences : [normalized];

  const candidates = [];

  for (const block of blocks) {
    const b = block.trim();
    if (b.length < 2) continue;
    if (/^character-[a-z0-9]+$/i.test(b)) continue;
    candidates.push(b);

    for (const chunk of splitKoreanClauseChunks(b)) {
      if (chunk && chunk.length >= 3 && !stop.has(chunk)) candidates.push(chunk);
    }
  }

  const phrasePatterns = [
    /[A-Za-z0-9가-힣]+(?:\s+[A-Za-z0-9가-힣]+){0,4}\s+(?:춤추는|먹는|마시는|주는|줬어|줬다|산책하는|달리는|뛰는|웃는|우는|변신하는|떨어뜨리는|보고있는)/g,
    /[A-Za-z0-9가-힣]+(?:\s+[A-Za-z0-9가-힣]+){0,4}\s+(?:했어|했다|하고있어|하는중|됨|됐다|돼서|되어서)/g,
    /[A-Za-z0-9가-힣]+(?:랑|과)\s+[A-Za-z0-9가-힣]+(?:\s+[A-Za-z0-9가-힣]+){0,3}/g
  ];

  for (const block of blocks) {
    const bn = block.replace(/\s+/g, " ").trim();
    for (const re of phrasePatterns) {
      const hits = bn.match(re) || [];
      for (const h of hits) {
        const t = String(h || "").trim();
        if (t.length >= 4 && t.length <= 42 && isSingleSentenceSpan(t)) candidates.push(t);
      }
    }
  }

  const words = normalized
    .split(" ")
    .map((w) => String(w || "").trim())
    .filter((w) => w && !stop.has(w))
    .filter((w) => !/^character-[a-z0-9]+$/i.test(w));

  const shortSpans = [];
  for (let n = 2; n <= 3; n += 1) {
    for (let i = 0; i + n <= words.length; i += 1) {
      const span = words.slice(i, i + n).join(" ").trim();
      if (span.length >= 4 && span.length <= 22 && isSingleSentenceSpan(span)) shortSpans.push(span);
    }
  }

  const single = (normalized.match(/[A-Za-z0-9가-힣]{2,}/g) || [])
    .filter((w) => !stop.has(w))
    .filter((w) => !/^character-[a-z0-9]+$/i.test(w))
    .slice(0, 2);

  const merged = uniq([...candidates, ...shortSpans, ...single]).filter(
    (x) => !/character-[a-z0-9]+/i.test(String(x || ""))
  );

  const filtered = merged.filter((c) => {
    if (!isSingleSentenceSpan(c)) return false;
    if (c === normalized && normalized.length > 32) return false;
    return true;
  });

  return filtered.slice(0, 12);
}

/**
 * 후보를 좌→우로 비중첩 매칭 (긴 후보 우선으로 한 위치에서 하나만 소비)
 * @returns {{ type: "plain" | "hit", text: string }[]}
 */
export function splitTextForHighlight(text, candidates) {
  const value = String(text || "");
  const list = (candidates || []).filter(Boolean);
  if (!value || list.length === 0) return [{ type: "plain", text: value }];

  const byLenDesc = [...list].sort((a, b) => b.length - a.length);
  const out = [];
  let i = 0;
  while (i < value.length) {
    let found = null;
    for (const c of byLenDesc) {
      if (c && value.startsWith(c, i)) {
        found = c;
        break;
      }
    }
    if (found) {
      out.push({ type: "hit", text: found });
      i += found.length;
    } else {
      let j = i + 1;
      while (j < value.length) {
        let hitAtJ = false;
        for (const c of byLenDesc) {
          if (c && value.startsWith(c, j)) {
            hitAtJ = true;
            break;
          }
        }
        if (hitAtJ) break;
        j += 1;
      }
      out.push({ type: "plain", text: value.slice(i, j) });
      i = j;
    }
  }
  return out;
}
