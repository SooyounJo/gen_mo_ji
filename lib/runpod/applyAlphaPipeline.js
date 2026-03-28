import { getChromaBackgroundMode } from "@/lib/comfy/buildWorkflow";
import {
  cropBottomOfPngDataUrl,
  parseImageInputToBuffer,
  removeGreenScreenToPngDataUrl,
  removeLightBackdropToPngDataUrl,
  removeWhiteScreenToPngDataUrl
} from "@/lib/image/whiteToAlpha";

/** 기본 켜짐 — 크로마 배경 제거. 끄려면 RUNPOD_IMAGE_ALPHA=0 */
export function isRunpodImageAlphaEnabled() {
  const v = process.env.RUNPOD_IMAGE_ALPHA;
  if (v === undefined || v === "") return true;
  const s = String(v).toLowerCase().trim();
  if (s === "0" || s === "false" || s === "off" || s === "no") return false;
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

/** 크로마 그린과의 L∞ 거리가 이 값 이하면 투명 처리 시작 (기본 40) */
export function getChromaTolerance() {
  const n = Number(process.env.CHROMA_TOLERANCE);
  if (Number.isFinite(n) && n >= 0 && n <= 255) return n;
  const legacy = Number(process.env.WHITE_BG_TOLERANCE);
  if (Number.isFinite(legacy) && legacy >= 0 && legacy <= 255) return legacy;
  return 40;
}

export function getChromaFeather() {
  const n = Number(process.env.CHROMA_FEATHER);
  if (Number.isFinite(n) && n >= 0 && n <= 64) return n;
  const legacy = Number(process.env.WHITE_BG_FEATHER);
  if (Number.isFinite(legacy) && legacy >= 0 && legacy <= 64) return legacy;
  return 14;
}

/** 0~1, 초록 스필 제거 강도 (기본 0.62). 0이면 끔 */
export function getChromaDespill() {
  const n = Number(process.env.CHROMA_DESPILL);
  if (Number.isFinite(n) && n >= 0 && n <= 1) return n;
  return 0.62;
}

/** 반투명 가장자리 2차 디스필 (기본 0.42). 0이면 끔 */
export function getChromaEdgeDespill() {
  const n = Number(process.env.CHROMA_EDGE_DESPILL);
  if (Number.isFinite(n) && n >= 0 && n <= 1) return n;
  return 0.42;
}

export function isChromaDistBlendEnabled() {
  const v = process.env.CHROMA_USE_CHROMA_DIST;
  if (v === undefined || v === "") return true;
  const s = String(v).toLowerCase().trim();
  return !(s === "0" || s === "false" || s === "off");
}

export function isChromaSmoothstepEnabled() {
  const v = process.env.CHROMA_SMOOTHSTEP;
  if (v === undefined || v === "") return true;
  const s = String(v).toLowerCase().trim();
  return !(s === "0" || s === "false" || s === "off");
}

export function isChromaHeuristicEnabled() {
  const v = process.env.CHROMA_USE_HEURISTIC;
  if (v === undefined || v === "") return true;
  const s = String(v).toLowerCase().trim();
  return !(s === "0" || s === "false" || s === "off");
}

/** 어두운 초록 바닥 그림자를 배경으로 키잉 (기본 켜짐). 끄려면 CHROMA_KEY_FLOOR_SHADOW=0 */
export function isChromaFloorShadowKeyEnabled() {
  const v = process.env.CHROMA_KEY_FLOOR_SHADOW;
  if (v === undefined || v === "") return true;
  const s = String(v).toLowerCase().trim();
  return !(s === "0" || s === "false" || s === "off");
}

/** 알파 채널만 블러 시그마 (기본 1.15). 0이면 끔 */
export function getChromaEdgeBlurSigma() {
  const n = Number(process.env.CHROMA_EDGE_BLUR_SIGMA);
  if (Number.isFinite(n) && n >= 0 && n <= 8) return n;
  return 1.15;
}

/** 밝은 피사체(흰 털 등) 키잉 구멍 방지 (기본 켜짐). 끄려면 CHROMA_HIGHLIGHT_PROTECT=0 */
export function isChromaHighlightProtectEnabled() {
  const v = process.env.CHROMA_HIGHLIGHT_PROTECT;
  if (v === undefined || v === "") return true;
  const s = String(v).toLowerCase().trim();
  return !(s === "0" || s === "false" || s === "off");
}

/** 알파 3×3 클로징 — 작은 구멍 메우기 (기본 켜짐). 끄려면 CHROMA_MORPH_CLOSE=0 */
export function isChromaMorphCloseEnabled() {
  const v = process.env.CHROMA_MORPH_CLOSE;
  if (v === undefined || v === "") return true;
  const s = String(v).toLowerCase().trim();
  return !(s === "0" || s === "false" || s === "off");
}

/** white 모드 끝단: 직선 알파를 화이트 위에 올린 것과 같은 RGB (기본 켜짐). 끄려면 CHROMA_WHITE_MATTE=0 */
export function isChromaWhiteMatteEnabled() {
  const v = process.env.CHROMA_WHITE_MATTE;
  if (v === undefined || v === "") return true;
  const s = String(v).toLowerCase().trim();
  return !(s === "0" || s === "false" || s === "off");
}

/**
 * light 모드: 하단 회색 그림자 띠 알파 제거 (기본 켜짐). 완벽하진 않음. 끄려면 CHROMA_STRIP_FLOOR_SHADOW=0
 */
export function isChromaStripFloorShadowEnabled() {
  const v = process.env.CHROMA_STRIP_FLOOR_SHADOW;
  if (v === undefined || v === "") return true;
  const s = String(v).toLowerCase().trim();
  return !(s === "0" || s === "false" || s === "off");
}

/** 하단 몇 %에서 그림자 스트립 적용 (기본 0.28) */
export function getChromaFloorShadowBottomFrac() {
  const n = Number(process.env.CHROMA_FLOOR_SHADOW_BOTTOM);
  if (Number.isFinite(n) && n >= 0.06 && n <= 0.55) return n;
  return 0.28;
}

/** 키잉 후 이미지 높이 하단을 잘라냄 (0 비활성). 예: 0.08 = 아래 8% 제거 — CHROMA_CROP_BOTTOM */
export function getChromaCropBottomFrac() {
  const n = Number(process.env.CHROMA_CROP_BOTTOM);
  if (Number.isFinite(n) && n > 0 && n <= 0.45) return n;
  return 0;
}

/** light 모드 키 색 — 연한 배경 (기본 244,245,250 = #F4F5FA). CHROMA_LIGHT_RGB=244,245,250 */
export function getChromaLightScreenRgb() {
  const raw = process.env.CHROMA_LIGHT_RGB;
  if (raw !== undefined && String(raw).trim() !== "") {
    const parts = String(raw)
      .split(/[\s,]+/)
      .map((x) => Number(x.trim()))
      .filter((n) => Number.isFinite(n));
    if (parts.length >= 3) {
      const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
      return { lightR: clamp(parts[0]), lightG: clamp(parts[1]), lightB: clamp(parts[2]) };
    }
  }
  return { lightR: 244, lightG: 245, lightB: 250 };
}

/**
 * RunPod status/generate 응답 images → PNG 알파.
 * CHROMA_BACKGROUND 에 따라 화이트 / 연배경+진캐릭(light) / 그린 키.
 * 실패 시 해당 항목은 원본 유지.
 * @param {string[]} images
 * @returns {Promise<string[]>}
 */
export async function applyAlphaPipeline(images) {
  if (!isRunpodImageAlphaEnabled() || !Array.isArray(images) || images.length === 0) {
    return images;
  }

  const tolerance = getChromaTolerance();
  const feather = getChromaFeather();
  const useHeuristic = isChromaHeuristicEnabled();
  const despill = getChromaDespill();
  const useChromaDist = isChromaDistBlendEnabled();
  const useSmoothstep = isChromaSmoothstepEnabled();
  const keyFloorShadow = isChromaFloorShadowKeyEnabled();
  const edgeBlurSigma = getChromaEdgeBlurSigma();
  const highlightProtect = isChromaHighlightProtectEnabled();
  const morphClose = isChromaMorphCloseEnabled();
  const edgeDespill = getChromaEdgeDespill();
  const bgMode = getChromaBackgroundMode();
  const whiteMatte = isChromaWhiteMatteEnabled();
  const lightRgb = getChromaLightScreenRgb();
  const stripFloorShadow = isChromaStripFloorShadowEnabled();
  const floorShadowBottomFrac = getChromaFloorShadowBottomFrac();
  const cropBottomFrac = getChromaCropBottomFrac();
  const out = [];

  for (const img of images) {
    try {
      const buf = await parseImageInputToBuffer(img);
      let dataUrl;
      if (bgMode === "white") {
        dataUrl = await removeWhiteScreenToPngDataUrl(buf, {
          tolerance,
          feather,
          useHeuristic,
          useSmoothstep,
          morphClose,
          edgeBlurSigma,
          whiteMatte
        });
      } else if (bgMode === "light") {
        dataUrl = await removeLightBackdropToPngDataUrl(buf, {
          tolerance,
          feather,
          useHeuristic,
          useSmoothstep,
          morphClose,
          edgeBlurSigma,
          stripFloorShadow,
          floorShadowBottomFrac,
          ...lightRgb
        });
      } else {
        dataUrl = await removeGreenScreenToPngDataUrl(buf, {
          tolerance,
          feather,
          useHeuristic,
          despill,
          useChromaDist,
          useSmoothstep,
          keyFloorShadow,
          edgeBlurSigma,
          highlightProtect,
          morphClose,
          edgeDespill
        });
      }
      if (cropBottomFrac > 0) {
        dataUrl = await cropBottomOfPngDataUrl(dataUrl, cropBottomFrac);
      }
      out.push(dataUrl);
    } catch (e) {
      console.error("[applyAlphaPipeline]", e?.message || e);
      out.push(img);
    }
  }

  return out;
}
