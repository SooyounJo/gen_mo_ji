import fs from "fs/promises";
import path from "path";
import { getFixedStylePrompt } from "@/lib/prompts/fixedStylePrompt";

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
 * white | light | green — 기본 white(순백 배경). 그린/라이트는 레거시 호환.
 * CHROMA_BACKGROUND=dark 는 예전 이름 호환용으로 light 와 동일(연배경·진캐릭터).
 */
export function getChromaBackgroundMode() {
  const v = process.env.CHROMA_BACKGROUND;
  if (v === undefined || v === "") return "white";
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
  return "white";
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
  const { prefix, style } = getFixedStylePrompt(bg);
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
