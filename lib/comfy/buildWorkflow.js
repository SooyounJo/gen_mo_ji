import fs from "fs/promises";
import path from "path";

/**
 * 단일 워크플로 템플릿(Comfy API JSON). 다른 루트 *.json 은 레거시/참고용이며
 * RunPod·로컬 Comfy API 경로는 전부 WORKFLOW_TEMPLATE_FILE 한 파일만 읽습니다.
 */
export const WORKFLOW_TEMPLATE_FILE = "z image_v4.json";

const TEMPLATE_PATH = path.join(process.cwd(), WORKFLOW_TEMPLATE_FILE);

const EXPECTED = {
  "176": "CLIPLoader",
  "180": "EmptySD3LatentImage",
  "184": "CLIPTextEncode",
  "185": "KSampler",
};

/**
 * 크로마 키 후처리용: (1) 피사체·소품은 초록 계열 금지 (2) 배경만 #00FF00 단색.
 * 앞에 두어 CLIP이 먼저 읽도록 함.
 */
const CHROMA_SUBJECT_PREFIX =
  "Chroma-key compositing (critical): character MUST have visible eyes — pupils and irises, cute expressive face, not blank, not eyeless, not faceless. All specular highlights and rim lights pure white or cool white, never green. Smooth semi-gloss plastic or vinyl toy — NO fur, NO hair, NO fuzzy or fibrous texture. Body colors: zero green spill. Use brown, cream, cool gray, tan, orange, pink, blue, purple, or black only. ";

/**
 * 공중 부유·바닥·그림자·발받침 금지 + 눈 필수 — 스타일 블록 맨 앞
 */
const NO_FLOOR_NO_SHADOW =
  "CRITICAL — LEVITATING IN EMPTY SPACE: the character floats in mid-air with NO ground mesh, NO floor, NO white or gray blob, smear, oval, disc, rug, platform, or second layer under the paws — only infinite flat backdrop behind them; zero-G pose, hovering, not standing on anything, not touching a surface. CRITICAL — NO SHADOWS AT ALL: no drop shadow, no contact shadow, no baked shadow, no ground shadow plane, no dark gradient under the body, no AO under feet — render with shadows disabled, global soft light only. If the model still paints any contact tint, it MUST be the exact same RGB/hex as the flat screen (no darker gray, brown, or green patch); prefer no tint at all. CRITICAL — EYES REQUIRED: visible eyes with pupils and irises, friendly expression, NOT minimalist blank face, NOT missing eyes. ";

/** 스타일 + 배경(초록은 배경 평면맄) — 사용자 문장 뒤에 이어 붙음 */
const CHROMA_STYLE_AND_BG =
  `${NO_FLOOR_NO_SHADOW}Flat chroma #00FF00 only behind subject, evenly lit, no extra 3D floor. Any under-body tint must be the same #00FF00, not dark forest green. Neutral studio lights; satin or semi-gloss plastic, injection-molded clean surfaces; small white speculars, never green. NO fur rendering, NO hair cards. Pixar-style 3D, glassmorphism, clean stylized, soft glossy plastic, high-detail. Full-frame green #00FF00 edge to edge. COMPOSITION: subject in upper ~55–65% of frame; wide empty chroma band below (large gap between lowest paw and image bottom) so the bottom strip is safe to crop in post.`;

/** CHROMA_BACKGROUND=white 일 때: 순백 배경 + 알파 후 화이트 매트 — 흰 털은 순백이 아닌 크림·아이보리로 분리 */
const WHITE_SUBJECT_PREFIX =
  "Matte compositing (white screen): flat full-frame #FFFFFF only — NO separate floor, NO white patch under feet, NO oval. Character MUST have visible eyes (pupils, irises), cute face, not eyeless. Smooth plastic or vinyl — cream, ivory, #F5F0E8, eggshell, tan, cool gray — not large pure #FFFFFF areas; NO fur, NO hair fuzz. Small white speculars OK. ";

const WHITE_STYLE_AND_BG =
  `${NO_FLOOR_NO_SHADOW}Backdrop is ONLY uniform #FFFFFF — never add a second white shape, smudge, or ground plane under the character. Soft shadowless studio light. Pixar-style 3D, glassmorphism, clean stylized, satin or semi-gloss plastic toy, high-detail; cream or colored subject; matte or glossy plastic only, NO fur. COMPOSITION: subject in upper ~55–65% of frame; generous empty #FFFFFF margin below feet so the bottom band can be cropped if needed.`;

/** 연한 단색 배경 + 진한 캐릭터 — 키잉·분리에 유리. 키 색은 CHROMA_LIGHT_RGB 와 맞출 것 */
const LIGHT_SUBJECT_PREFIX =
  "Matte compositing (light screen): the background is ONLY one flat full-frame pale cool color #F3F4F8 — uniform, no gradient, no checkerboard, no floor patch. The CHARACTER must read clearly DARKER than the backdrop: use rich saturated dark colors — deep chocolate or espresso brown, dark burgundy, crimson or brick red, deep rose or dusty pink, dark coral — avoid flat black-only silhouettes; NOT cream or pale pastel on large body areas (those merge with the ground). Surface: smooth semi-gloss plastic or vinyl toy, injection-molded, NO fur, NO hair, NO fibrous coat. Visible eyes with catchlights. Cute expressive face. ";

const LIGHT_STYLE_AND_BG =
  `${NO_FLOOR_NO_SHADOW}CRITICAL — SINGLE LIGHT PLANE ONLY: full-frame solid pale #F3F4F8 behind the subject, edge to edge; no transparency-grid texture, no darker floor oval. Even soft light so the colored plastic subject reads sharp against the light field — glossy toy look, NO fur, NO hair rendering. Pixar-style 3D, glassmorphism, clean stylized, satin or semi-gloss plastic, high-detail. COMPOSITION: subject in upper ~55–65% of frame; wide empty pale margin below paws (large vertical gap before image bottom) so floor-shadow artifacts sit in a croppable lower band.`;

/**
 * white | light | green — 기본 light(연한 배경 + 진한 캐릭터). 순백만: white. 그린: green
 * CHROMA_BACKGROUND=dark 는 예전 이름 호환용으로 light 와 동일(연배경·진캐릭터).
 */
export function getChromaBackgroundMode() {
  const v = process.env.CHROMA_BACKGROUND;
  if (v === undefined || v === "") return "light";
  const s = String(v).toLowerCase().trim();
  if (s === "green" || s === "g" || s === "chroma") return "green";
  if (s === "white" || s === "w") return "white";
  if (
    s === "light" ||
    s === "l" ||
    s === "pale" ||
    s === "contrast" ||
    s === "dark" ||
    s === "d"
  ) {
    return "light";
  }
  return "light";
}

function assertWorkflowShape(workflow) {
  for (const [id, classType] of Object.entries(EXPECTED)) {
    const got = workflow?.[id]?.class_type;
    if (got !== classType) {
      throw new Error(
        `${WORKFLOW_TEMPLATE_FILE}: node ${id} must be ${classType}, got ${got == null ? "(missing)" : JSON.stringify(got)}`
      );
    }
  }
}

export async function loadWorkflowTemplate() {
  const raw = await fs.readFile(TEMPLATE_PATH, "utf8");
  const parsed = JSON.parse(raw);
  assertWorkflowShape(parsed);
  return parsed;
}

function setNodeInput(workflow, nodeId, key, value) {
  const node = workflow?.[String(nodeId)];
  if (!node || !node.inputs) throw new Error(`Missing node ${nodeId} in ${WORKFLOW_TEMPLATE_FILE}`);
  node.inputs[key] = value;
}

export function buildWorkflowFromTemplate(template, { prompt, seed, width, height, batchSize }) {
  const workflow = JSON.parse(JSON.stringify(template || {}));
  assertWorkflowShape(workflow);

  const promptText = String(prompt || "").trim();
  const bg = getChromaBackgroundMode();
  const prefix =
    bg === "white" ? WHITE_SUBJECT_PREFIX : bg === "light" ? LIGHT_SUBJECT_PREFIX : CHROMA_SUBJECT_PREFIX;
  const style =
    bg === "white" ? WHITE_STYLE_AND_BG : bg === "light" ? LIGHT_STYLE_AND_BG : CHROMA_STYLE_AND_BG;
  const finalPrompt = promptText ? `${prefix}${promptText}, ${style}` : `${prefix}${style}`;
  setNodeInput(workflow, 184, "text", finalPrompt);

  // 일부 워커는 qwen_image만 허용
  if (workflow?.["176"]?.inputs?.type === "qwen") {
    workflow["176"].inputs.type = "qwen_image";
  }
  if (Number.isFinite(seed)) {
    setNodeInput(workflow, 185, "seed", Number(seed));
  }
  if (Number.isFinite(width)) {
    setNodeInput(workflow, 180, "width", Number(width));
  }
  if (Number.isFinite(height)) {
    setNodeInput(workflow, 180, "height", Number(height));
  }
  if (Number.isFinite(batchSize)) {
    setNodeInput(workflow, 180, "batch_size", Number(batchSize));
  }

  return workflow;
}
