import fs from "fs/promises";
import path from "path";

/** 프로젝트 루트의 Comfy API용 워크플로 — 이 파일만 사용합니다. */
export const WORKFLOW_TEMPLATE_FILE = "default.json";

const TEMPLATE_PATH = path.join(process.cwd(), WORKFLOW_TEMPLATE_FILE);

const EXPECTED = {
  "3": "KSampler",
  "4": "CheckpointLoaderSimple",
  "5": "EmptyLatentImage",
  "6": "CLIPTextEncode",
  "7": "CLIPTextEncode",
  "8": "VAEDecode",
  "9": "SaveImage"
};

function assertDefaultWorkflowShape(workflow) {
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
  assertDefaultWorkflowShape(parsed);
  return parsed;
}

function setNodeInput(workflow, nodeId, key, value) {
  const node = workflow?.[String(nodeId)];
  if (!node || !node.inputs) throw new Error(`Missing node ${nodeId} in ${WORKFLOW_TEMPLATE_FILE}`);
  node.inputs[key] = value;
}

/**
 * `default.json` 그래프는 그대로 두고, 런타임에만 아래 입력만 덮어씁니다.
 * - 6: positive 프롬프트 (CLIPTextEncode)
 * - 3: 시드 (KSampler)
 * - 5: width / height / batch_size (EmptyLatentImage)
 *
 * 나머지 노드(4 체크포인트, 7 네거티브, 8 디코드, 9 저장, 연결 배열)는 JSON 원본 유지.
 */
export function buildWorkflowFromTemplate(template, { prompt, seed, width, height, batchSize }) {
  const workflow = JSON.parse(JSON.stringify(template || {}));
  assertDefaultWorkflowShape(workflow);

  setNodeInput(workflow, 6, "text", String(prompt || "").trim());

  if (Number.isFinite(seed)) {
    setNodeInput(workflow, 3, "seed", Number(seed));
  }
  if (Number.isFinite(width)) {
    setNodeInput(workflow, 5, "width", Number(width));
  }
  if (Number.isFinite(height)) {
    setNodeInput(workflow, 5, "height", Number(height));
  }
  if (Number.isFinite(batchSize)) {
    setNodeInput(workflow, 5, "batch_size", Number(batchSize));
  }

  return workflow;
}
