import sharp from "sharp";

/**
 * data URL, http(s) URL, 또는 raw base64 없는 문자열은 지원하지 않음(호출부에서 정규화).
 * @param {string} input
 * @returns {Promise<Buffer>}
 */
export async function parseImageInputToBuffer(input) {
  const s = String(input || "").trim();
  if (!s) throw new Error("Empty image input");

  if (s.startsWith("data:")) {
    const m = s.match(/^data:[^;]+;base64,(.+)$/i);
    if (!m) throw new Error("Invalid data URL (expected base64)");
    return Buffer.from(m[1], "base64");
  }

  if (s.startsWith("http://") || s.startsWith("https://")) {
    const res = await fetch(s);
    if (!res.ok) throw new Error(`Image fetch failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  throw new Error("Unsupported image input (need data: or http(s) URL)");
}

/**
 * PNG data URL 하단을 비율만큼 잘라냄 (그림자 띠를 프레임 밖으로 밀었을 때 후처리).
 * @param {string} dataUrl
 * @param {number} frac 0~0.45 (예: 0.1 = 높이 10% 제거)
 * @returns {Promise<string>}
 */
export async function cropBottomOfPngDataUrl(dataUrl, frac) {
  const f = Number(frac);
  if (!Number.isFinite(f) || f <= 0 || f >= 0.5) return dataUrl;
  const s = String(dataUrl || "").trim();
  if (!s.startsWith("data:")) return dataUrl;
  const m = s.match(/^data:[^;]+;base64,(.+)$/i);
  if (!m) return dataUrl;
  const buf = Buffer.from(m[1], "base64");
  const meta = await sharp(buf).metadata();
  const w = meta.width;
  const h = meta.height;
  if (!w || !h) return dataUrl;
  const newH = Math.max(1, Math.floor(h * (1 - f)));
  if (newH >= h) return dataUrl;
  const out = await sharp(buf)
    .extract({ left: 0, top: 0, width: w, height: newH })
    .png({ compressionLevel: 9 })
    .toBuffer();
  return `data:image/png;base64,${out.toString("base64")}`;
}

/**
 * 목표 RGB에 가까운 픽셀을 투명 처리 (L∞ 거리 + 페더).
 * @param {Buffer} buffer
 * @param {{ targetRgb?: [number, number, number], tolerance?: number, feather?: number }} [options]
 * @returns {Promise<string>} PNG data URL
 */
export async function removeChromaBackgroundToPngDataUrl(buffer, options = {}) {
  const tr = options.targetRgb?.[0] ?? 0;
  const tg = options.targetRgb?.[1] ?? 255;
  const tb = options.targetRgb?.[2] ?? 0;
  const tolerance = Number.isFinite(options.tolerance) ? options.tolerance : 32;
  const feather = Math.max(0, Number.isFinite(options.feather) ? options.feather : 8);

  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  if (channels !== 4) {
    throw new Error(`Expected 4 channels after ensureAlpha, got ${channels}`);
  }

  const out = Buffer.alloc(data.length);
  const t0 = Math.max(0, Math.min(255, tolerance));
  const t1 = t0 + feather;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const aIn = data[i + 3];
    const dist = Math.max(Math.abs(r - tr), Math.abs(g - tg), Math.abs(b - tb));

    let aKey;
    if (dist <= t0) {
      aKey = 0;
    } else if (feather === 0 || dist >= t1) {
      aKey = 255;
    } else {
      aKey = Math.round((255 * (dist - t0)) / feather);
    }

    const aOut = Math.round((aKey * aIn) / 255);
    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
    out[i + 3] = aOut;
  }

  const png = await sharp(out, {
    raw: { width, height, channels: 4 }
  })
    .png()
    .toBuffer();

  return `data:image/png;base64,${png.toString("base64")}`;
}

/**
 * 크로마 그린 배경 제거: (1) #00FF00 근접 L∞ (2) 보조 휴리스틱 — 진짜 스크린만 dist=0.
 * 피사체의 초록 스필/반사(r·g·b가 같이 올라간 경우)는 max(r,b)가 커서 휴리스틱에서 제외.
 * @param {Buffer} buffer
 * @param {{
 *   tolerance?: number,
 *   feather?: number,
 *   useHeuristic?: boolean,
 *   heuristicMinG?: number,
 *   heuristicMaxRB?: number,
 *   heuristicMinGap?: number,
 *   heuristicBrightMinG?: number,
 *   heuristicBrightMaxRawDist?: number,
 *   heuristicBrightMaxRB?: number,
 *   heuristicMaxRBSum?: number,
 *   useChromaDist?: boolean,
 *   useSmoothstep?: boolean,
 *   despill?: number,
 *   edgeBlurSigma?: number,
 *   keyFloorShadow?: boolean,
 *   highlightProtect?: boolean,
 *   morphClose?: boolean,
 *   edgeDespill?: number
 * }} [options]
 */
function smoothstep01(u) {
  const t = Math.max(0, Math.min(1, u));
  return t * t * (3 - 2 * t);
}

/** G가 R·B보다 튀면 스크린 쪽으로 보고 거리를 줄여, L∞만 쓸 때보다 경계가 자연스러움 */
function chromaGreenDistance(r, g, b) {
  const gd = Math.max(0, g - Math.max(r, b));
  return 255 - Math.min(255, gd);
}

/**
 * 가장자리 초록 번짐 완화: g를 max(r,b) 쪽으로 당김. alpha가 낮을수록 약하게.
 * @param {number} strength 0~1
 */
function despillGreenChannel(r, g, b, alpha, strength) {
  if (strength <= 0 || alpha <= 0) return [r, g, b];
  const mx = Math.max(r, b);
  if (g <= mx) return [r, g, b];
  const spill = g - mx;
  const w = strength * (0.35 + (0.65 * alpha) / 255);
  const g2 = Math.round(mx + spill * (1 - w));
  return [r, Math.max(0, Math.min(255, g2)), b];
}

/** 초록 바닥 위 어두운 그림자(대체로 G 우세·전체 어두움) — 피사체 어두운 갈색과 구분 */
function looksLikeDarkGreenFloorShadow(r, g, b) {
  const mx = Math.max(r, b);
  const sum = r + g + b;
  if (sum > 168) return false;
  if (mx > 78) return false;
  if (g > 118) return false;
  if (g < mx + 20) return false;
  return true;
}

/**
 * 밝은 흰 털·하이라이트에 스필된 초록이 dist를 과소로 만들어 생기는 구멍 방지.
 */
function applyHighlightProtection(r, g, b, dist, t0) {
  const sum = r + g + b;
  const mx = Math.max(r, b);
  const gap = g - mx;
  if (sum < 380) return dist;
  if (gap >= 44) return dist;
  if (gap < -35) return dist;
  const boost = Math.min(48, 10 + Math.floor((sum - 380) / 13));
  return Math.max(dist, t0 + boost);
}

/** 알파만 블러 — RGB 디테일 유지, 계단·거친 외곽 완화 */
async function blurAlphaChannelOnly(out, width, height, sigma) {
  if (sigma <= 0) return;
  const w = width;
  const h = height;
  const n = w * h;
  const buf = Buffer.alloc(n * 3);
  for (let i = 0, j = 0; i < n; i++, j += 3) {
    const a = out[i * 4 + 3];
    buf[j] = a;
    buf[j + 1] = a;
    buf[j + 2] = a;
  }
  const blurred = await sharp(buf, { raw: { width: w, height: h, channels: 3 } })
    .blur(sigma)
    .raw()
    .toBuffer();
  for (let i = 0, j = 0; i < n; i++, j += 3) {
    out[i * 4 + 3] = blurred[j];
  }
}

/** 3×3 클로징: 작은 투명 구멍(노이즈) 메우고 외곽 안정화 */
function morphCloseAlpha3x3(out, width, height) {
  const w = width;
  const h = height;
  const n = w * h;
  const src = new Uint8Array(n);
  for (let i = 0; i < n; i++) src[i] = out[i * 4 + 3];
  const dil = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
            m = Math.max(m, src[ny * w + nx]);
          }
        }
      }
      dil[y * w + x] = m;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = 255;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
            m = Math.min(m, dil[ny * w + nx]);
          }
        }
      }
      out[(y * w + x) * 4 + 3] = m;
    }
  }
}

/** 반투명 가장자리에서만 추가 디스필(알파 블러 후) */
function edgeDespillPass(out, strength) {
  if (strength <= 0) return;
  for (let i = 0; i < out.length; i += 4) {
    const a = out[i + 3];
    if (a <= 12 || a >= 248) continue;
    const [r2, g2, b2] = despillGreenChannel(out[i], out[i + 1], out[i + 2], a, strength);
    out[i] = r2;
    out[i + 1] = g2;
    out[i + 2] = b2;
  }
}

/** 순백에 가깝고 무채색인 평면 스크린 */
function looksLikeWhiteScreen(r, g, b) {
  const mn = Math.min(r, g, b);
  const mx = Math.max(r, g, b);
  const sp = mx - mn;
  if (mn < 228) return false;
  if (sp > 28) return false;
  return true;
}

/** 크림·아이보리 털이 배경으로 잡히지 않게 dist 상향 */
function applyOffwhiteSubjectProtection(r, g, b, dist, t0) {
  const mn = Math.min(r, g, b);
  const mx = Math.max(r, g, b);
  const sp = mx - mn;
  if (mn >= 252 && sp <= 6) return dist;
  if (mn < 248 || sp > 18) {
    return Math.max(dist, t0 + 12 + Math.min(32, sp));
  }
  return dist;
}

/**
 * 알파 유지한 채 RGB만 “캐릭터 뒤 = 화이트”로 합성 (직선 알파 over #FFF).
 * 반투명 가장자리가 흰 배경에 올렸을 때 자연스럽게 맞음.
 */
export function applyWhiteMatteBacking(out) {
  for (let i = 0; i < out.length; i += 4) {
    const a = out[i + 3];
    if (a <= 0) continue;
    const t = a / 255;
    const inv = 1 - t;
    out[i] = Math.min(255, Math.round(out[i] * t + 255 * inv));
    out[i + 1] = Math.min(255, Math.round(out[i + 1] * t + 255 * inv));
    out[i + 2] = Math.min(255, Math.round(out[i + 2] * t + 255 * inv));
  }
}

/**
 * 화이트 스크린 #FFFFFF 키잉 + (옵션) 화이트 매트. 초록 스필/그린 디스필 없음.
 * @param {{ whiteMatte?: boolean } & Parameters<typeof removeGreenScreenToPngDataUrl>[1]} [options]
 */
export async function removeWhiteScreenToPngDataUrl(buffer, options = {}) {
  const tolerance = Number.isFinite(options.tolerance) ? options.tolerance : 32;
  const feather = Math.max(0, Number.isFinite(options.feather) ? options.feather : 14);
  const useHeuristic = options.useHeuristic !== false;
  const useSmoothstep = options.useSmoothstep !== false;
  const morphClose = options.morphClose !== false;
  const edgeBlurSigma = Number.isFinite(options.edgeBlurSigma) ? Math.max(0, options.edgeBlurSigma) : 1.15;
  const whiteMatte = options.whiteMatte !== false;

  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 4) {
    throw new Error(`Expected 4 channels after ensureAlpha, got ${info.channels}`);
  }

  const out = Buffer.alloc(data.length);
  const t0 = Math.max(0, Math.min(255, tolerance));
  const t1 = t0 + feather;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const aIn = data[i + 3];

    const rawDist = Math.max(Math.abs(r - 255), Math.abs(g - 255), Math.abs(b - 255));

    let dist = rawDist;
    const spread = Math.max(r, g, b) - Math.min(r, g, b);
    if (spread > 20) {
      dist = Math.max(dist, Math.min(120, spread * 1.2));
    }

    if (useHeuristic && looksLikeWhiteScreen(r, g, b)) {
      dist = 0;
    }
    dist = applyOffwhiteSubjectProtection(r, g, b, dist, t0);

    let aKey;
    if (feather === 0) {
      aKey = dist <= t0 ? 0 : 255;
    } else if (dist <= t0) {
      aKey = 0;
    } else if (dist >= t1) {
      aKey = 255;
    } else {
      const u = (dist - t0) / feather;
      const s = useSmoothstep ? smoothstep01(u) : u;
      aKey = Math.round(255 * s);
    }

    const aOut = Math.round((aKey * aIn) / 255);
    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
    out[i + 3] = aOut;
  }

  const { width, height } = info;
  if (morphClose) {
    morphCloseAlpha3x3(out, width, height);
  }
  if (edgeBlurSigma > 0) {
    await blurAlphaChannelOnly(out, width, height, edgeBlurSigma);
  }

  if (whiteMatte) {
    applyWhiteMatteBacking(out);
  }

  const png = await sharp(out, {
    raw: { width, height, channels: 4 }
  })
    .png({ compressionLevel: 9 })
    .toBuffer();

  return `data:image/png;base64,${png.toString("base64")}`;
}

/** 연한 무채 배경 평면 */
function looksLikeLightBackdrop(r, g, b) {
  const mn = Math.min(r, g, b);
  const mx = Math.max(r, g, b);
  const sp = mx - mn;
  if (mn < 208) return false;
  if (sp > 34) return false;
  return true;
}

/** 진한 캐릭터가 연한 배경으로 잘못 키잡히지 않게 */
function applyDarkSubjectProtectionLightKey(r, g, b, dist, t0) {
  const mx = Math.max(r, g, b);
  const sum = r + g + b;
  if (mx < 138 || (sum < 430 && mx < 188)) {
    return Math.max(dist, t0 + 14 + Math.min(44, Math.floor((150 - mx) / 2)));
  }
  return dist;
}

/**
 * 연한 배경 위 소프트 그림자(회색 띠) — 이미지 하단만, 무채·배경보다 어두운 중간톤.
 * 완벽하진 않음(모델이 그림자를 캐릭터에 붙이면 한계). 끄기: stripFloorShadow false
 */
function stripSoftFloorShadowLightBackdrop(out, width, height, tr, tg, tb, bottomFrac) {
  const ref = (tr + tg + tb) / 3;
  const y0 = Math.floor(height * (1 - bottomFrac));
  for (let y = y0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = out[i];
      const g = out[i + 1];
      const b = out[i + 2];
      const mx = Math.max(r, g, b);
      const mn = Math.min(r, g, b);
      const sp = mx - mn;
      const lum = (r + g + b) / 3;
      if (lum >= ref - 6) continue;
      if (lum < 92) continue;
      if (mx < 138 || mx > 218) continue;
      if (sp > 40) continue;
      if (lum > ref - 22) continue;
      out[i + 3] = 0;
    }
  }
}

/**
 * 연한 단색 배경 키잉 — 진한 캐릭터와 대비. 기본 타깃 #F4F5FA (244,245,250).
 * @param {{ lightR?: number, lightG?: number, lightB?: number, stripFloorShadow?: boolean, floorShadowBottomFrac?: number }} [options]
 */
export async function removeLightBackdropToPngDataUrl(buffer, options = {}) {
  const tr = Number.isFinite(options.lightR) ? options.lightR : 244;
  const tg = Number.isFinite(options.lightG) ? options.lightG : 245;
  const tb = Number.isFinite(options.lightB) ? options.lightB : 250;
  const tolerance = Number.isFinite(options.tolerance) ? options.tolerance : 34;
  const feather = Math.max(0, Number.isFinite(options.feather) ? options.feather : 14);
  const useHeuristic = options.useHeuristic !== false;
  const useSmoothstep = options.useSmoothstep !== false;
  const morphClose = options.morphClose !== false;
  const edgeBlurSigma = Number.isFinite(options.edgeBlurSigma) ? Math.max(0, options.edgeBlurSigma) : 1.15;
  const stripFloorShadow = options.stripFloorShadow !== false;
  const floorShadowBottomFrac = Number.isFinite(options.floorShadowBottomFrac)
    ? Math.max(0.08, Math.min(0.5, options.floorShadowBottomFrac))
    : 0.28;

  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 4) {
    throw new Error(`Expected 4 channels after ensureAlpha, got ${info.channels}`);
  }

  const out = Buffer.alloc(data.length);
  const t0 = Math.max(0, Math.min(255, tolerance));
  const t1 = t0 + feather;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const aIn = data[i + 3];

    const rawDist = Math.max(Math.abs(r - tr), Math.abs(g - tg), Math.abs(b - tb));

    let dist = rawDist;
    const spread = Math.max(r, g, b) - Math.min(r, g, b);
    if (spread > 20) {
      dist = Math.max(dist, Math.min(130, spread * 1.12));
    }

    if (useHeuristic && looksLikeLightBackdrop(r, g, b)) {
      dist = 0;
    }
    dist = applyDarkSubjectProtectionLightKey(r, g, b, dist, t0);

    let aKey;
    if (feather === 0) {
      aKey = dist <= t0 ? 0 : 255;
    } else if (dist <= t0) {
      aKey = 0;
    } else if (dist >= t1) {
      aKey = 255;
    } else {
      const u = (dist - t0) / feather;
      const s = useSmoothstep ? smoothstep01(u) : u;
      aKey = Math.round(255 * s);
    }

    const aOut = Math.round((aKey * aIn) / 255);
    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
    out[i + 3] = aOut;
  }

  const { width, height } = info;
  if (stripFloorShadow) {
    stripSoftFloorShadowLightBackdrop(out, width, height, tr, tg, tb, floorShadowBottomFrac);
  }
  if (morphClose) {
    morphCloseAlpha3x3(out, width, height);
  }
  if (edgeBlurSigma > 0) {
    await blurAlphaChannelOnly(out, width, height, edgeBlurSigma);
  }

  const png = await sharp(out, {
    raw: { width, height, channels: 4 }
  })
    .png({ compressionLevel: 9 })
    .toBuffer();

  return `data:image/png;base64,${png.toString("base64")}`;
}

export async function removeGreenScreenToPngDataUrl(buffer, options = {}) {
  const tolerance = Number.isFinite(options.tolerance) ? options.tolerance : 40;
  const feather = Math.max(0, Number.isFinite(options.feather) ? options.feather : 14);
  const useHeuristic = options.useHeuristic !== false;
  const useChromaDist = options.useChromaDist !== false;
  const useSmoothstep = options.useSmoothstep !== false;
  const despillStrength = Number.isFinite(options.despill) ? Math.max(0, Math.min(1, options.despill)) : 0.62;
  const edgeBlurSigma = Number.isFinite(options.edgeBlurSigma) ? Math.max(0, options.edgeBlurSigma) : 1.15;
  const keyFloorShadow = options.keyFloorShadow !== false;
  const highlightProtect = options.highlightProtect !== false;
  const morphClose = options.morphClose !== false;
  const edgeDespillStrength = Number.isFinite(options.edgeDespill)
    ? Math.max(0, Math.min(1, options.edgeDespill))
    : 0.42;
  const minG = Number.isFinite(options.heuristicMinG) ? options.heuristicMinG : 145;
  /** R,B 각각·합이 크면 갈색+스필 등으로 보고 스크린으로 보지 않음 */
  const maxRB = Number.isFinite(options.heuristicMaxRB) ? options.heuristicMaxRB : 88;
  const maxRBSum = Number.isFinite(options.heuristicMaxRBSum) ? options.heuristicMaxRBSum : 182;
  const minGap = Number.isFinite(options.heuristicMinGap) ? options.heuristicMinGap : 26;
  /** 약간 밝은/번진 스크린 변형(JPEG 등): G는 높고 화면에 가까운 L∞ */
  const brightMinG = Number.isFinite(options.heuristicBrightMinG) ? options.heuristicBrightMinG : 228;
  const brightMaxRaw = Number.isFinite(options.heuristicBrightMaxRawDist)
    ? options.heuristicBrightMaxRawDist
    : 112;
  const brightMaxRB = Number.isFinite(options.heuristicBrightMaxRB) ? options.heuristicBrightMaxRB : 118;

  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  const { channels } = info;
  if (channels !== 4) {
    throw new Error(`Expected 4 channels after ensureAlpha, got ${channels}`);
  }

  const out = Buffer.alloc(data.length);
  const t0 = Math.max(0, Math.min(255, tolerance));
  const t1 = t0 + feather;

  function looksLikeGreenScreen(r, g, b, rawDist) {
    if (g < minG || g - r < minGap || g - b < minGap) return false;
    const rbSum = r + b;
    if (r <= maxRB && b <= maxRB && rbSum <= maxRBSum) return true;
    if (
      g >= brightMinG &&
      rawDist <= brightMaxRaw &&
      r <= brightMaxRB &&
      b <= brightMaxRB &&
      g - r >= minGap &&
      g - b >= minGap
    ) {
      return true;
    }
    return false;
  }

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const aIn = data[i + 3];

    const rawDist = Math.max(Math.abs(r), Math.abs(g - 255), Math.abs(b));

    let dist = rawDist;
    if (useChromaDist) {
      const cDist = chromaGreenDistance(r, g, b);
      dist = Math.min(dist, cDist);
    }
    if (useHeuristic && looksLikeGreenScreen(r, g, b, rawDist)) {
      dist = 0;
    } else if (useHeuristic && keyFloorShadow && looksLikeDarkGreenFloorShadow(r, g, b)) {
      dist = 0;
    }
    if (highlightProtect) {
      dist = applyHighlightProtection(r, g, b, dist, t0);
    }

    let aKey;
    if (feather === 0) {
      aKey = dist <= t0 ? 0 : 255;
    } else if (dist <= t0) {
      aKey = 0;
    } else if (dist >= t1) {
      aKey = 255;
    } else {
      const u = (dist - t0) / feather;
      const s = useSmoothstep ? smoothstep01(u) : u;
      aKey = Math.round(255 * s);
    }

    const aOut = Math.round((aKey * aIn) / 255);
    let rOut = r;
    let gOut = g;
    let bOut = b;
    if (despillStrength > 0 && aOut > 0) {
      [rOut, gOut, bOut] = despillGreenChannel(r, g, b, aOut, despillStrength);
    }
    out[i] = rOut;
    out[i + 1] = gOut;
    out[i + 2] = bOut;
    out[i + 3] = aOut;
  }

  const { width, height } = info;
  if (morphClose) {
    morphCloseAlpha3x3(out, width, height);
  }
  if (edgeBlurSigma > 0) {
    await blurAlphaChannelOnly(out, width, height, edgeBlurSigma);
  }
  edgeDespillPass(out, edgeDespillStrength);

  const png = await sharp(out, {
    raw: { width: info.width, height: info.height, channels: 4 }
  })
    .png({ compressionLevel: 9 })
    .toBuffer();

  return `data:image/png;base64,${png.toString("base64")}`;
}
