import fs from "fs/promises";
import path from "path";

/** 프로젝트 루트의 Comfy API용 워크플로 — 이 파일만 사용합니다. */
export const WORKFLOW_TEMPLATE_FILE = "z image.json";

const TEMPLATE_PATH = path.join(process.cwd(), WORKFLOW_TEMPLATE_FILE);

const EXPECTED = {
  "176": "CLIPLoader",
  "180": "EmptySD3LatentImage",
  "184": "CLIPTextEncode",
  "185": "KSampler",
};

const FIXED_STYLE_SUFFIX =
  ", Pixar cinematic style, 3D glassmorphism, 3D render, minimal style, high-glossy texture, white background";

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
  const finalPrompt = promptText ? `${promptText}${FIXED_STYLE_SUFFIX}` : FIXED_STYLE_SUFFIX.replace(/^,\s*/, "");
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
