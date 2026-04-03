/**
 * Comfy 워크플로에 항상 붙는 고정 프롬프트 블록.
 * 역할별 분리를 위해 buildWorkflow에서 분리.
 */
const CHROMA_SUBJECT_PREFIX =
  "Chroma-key compositing (critical): character MUST have visible eyes — pupils and irises, cute expressive face, not blank, not eyeless, not faceless. All specular highlights and rim lights pure white or cool white, never green. Smooth semi-gloss plastic or vinyl toy — NO fur, NO hair, NO fuzzy or fibrous texture. Body colors: zero green spill. Use brown, cream, cool gray, tan, orange, pink, blue, purple, or black only. ";

const NO_FLOOR_NO_SHADOW =
  "CRITICAL — LEVITATING IN EMPTY SPACE: the character floats in mid-air with NO ground mesh, NO floor, NO white or gray blob, smear, oval, disc, rug, platform, or second layer under the paws — only infinite flat backdrop behind them; zero-G pose, hovering, not standing on anything, not touching a surface. CRITICAL — NO SHADOWS AT ALL: no drop shadow, no contact shadow, no baked shadow, no ground shadow plane, no dark gradient under the body, no AO under feet — render with shadows disabled, global soft light only. If any residual shadow/tint appears, place it very far below the character near the image bottom edge (never attached under feet), keep it very faint, and avoid mid-frame shadows. CRITICAL — EYES REQUIRED: visible eyes with pupils and irises, friendly expression, NOT minimalist blank face, NOT missing eyes. ";

const CHROMA_STYLE_AND_BG =
  `${NO_FLOOR_NO_SHADOW}Flat chroma #00FF00 only behind subject, evenly lit, no extra 3D floor. Any under-body tint must be the same #00FF00, not dark forest green. Neutral studio lights; satin or semi-gloss plastic, injection-molded clean surfaces; small white speculars, never green. NO fur rendering, NO hair cards. Pixar-style 3D, glassmorphism, clean stylized, soft glossy plastic, high-detail. Full-frame green #00FF00 edge to edge. COMPOSITION: subject in upper ~55–65% of frame; wide empty chroma band below (large gap between lowest paw and image bottom) so the bottom strip is safe to crop in post.`;

const WHITE_SUBJECT_PREFIX =
  "Matte compositing (white screen): flat full-frame #FFFFFF only — NO separate floor, NO white patch under feet, NO oval. Character MUST have visible eyes (pupils, irises), cute face, not eyeless. Smooth plastic or vinyl toy with CLEAR body colors (pastel or vivid). Avoid unintentionally monochrome/all-white characters unless the subject is naturally white (e.g., cloud, snow, milk); even then, add cool shading and a small colored accent so it isn't pure #FFFFFF. NO fur, NO hair fuzz. ";

const BASE_FIXED_STYLE =
  "Pixar cinematic style, 3D glassmorphism, 3D render, minimal style, ultra high-gloss glossy texture, on a pure white background, flat color, no shadow, shadowless background.";

const WHITE_STYLE_AND_BG =
  `${NO_FLOOR_NO_SHADOW}${BASE_FIXED_STYLE} Keep reflections crisp and premium, toy-like polished clearcoat, bright studio look. COMPOSITION: centered subject, clean one-scene composition, generous empty #FFFFFF margin below feet so the bottom band can be cropped if needed.`;

const LIGHT_SUBJECT_PREFIX =
  "Matte compositing (light screen): the background is ONLY one flat full-frame pale cool color #F3F4F8 — uniform, no gradient, no checkerboard, no floor patch. Character color is flexible (no forced high-contrast palette). Surface: smooth semi-gloss plastic or vinyl toy, injection-molded, NO fur, NO hair, NO fibrous coat. Visible eyes with catchlights. Cute expressive face. ";

const LIGHT_STYLE_AND_BG =
  `${NO_FLOOR_NO_SHADOW}${BASE_FIXED_STYLE} Keep reflections crisp and premium, toy-like polished clearcoat.`;

export function getFixedStylePrompt(bgMode) {
  if (bgMode === "white") {
    return { prefix: WHITE_SUBJECT_PREFIX, style: WHITE_STYLE_AND_BG };
  }
  if (bgMode === "light") {
    return { prefix: LIGHT_SUBJECT_PREFIX, style: LIGHT_STYLE_AND_BG };
  }
  return { prefix: CHROMA_SUBJECT_PREFIX, style: CHROMA_STYLE_AND_BG };
}

