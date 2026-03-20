import fs from "fs/promises";
import path from "path";

// Comfy에서 내보낸 API용 워크플로 (프로젝트 루트). RunPod/로컬 Comfy API 모두 이 JSON을 템플릿으로 사용.
// 예전 복사본: lib/comfy/workflows/1ccdD_gen_moji-z_image_7_for_serverless_0321_api.template.json
const TEMPLATE_PATH = path.join(process.cwd(), "1ccdD_gen moji-z_image 7_for suverless_0321 API.json");

export async function loadWorkflowTemplate() {
  const raw = await fs.readFile(TEMPLATE_PATH, "utf8");
  return JSON.parse(raw);
}

function setNodeInput(workflow, nodeId, key, value) {
  const node = workflow?.[String(nodeId)];
  if (!node || !node.inputs) throw new Error(`Missing node ${nodeId} in workflow template`);
  node.inputs[key] = value;
}

export function buildWorkflowFromTemplate(template, { prompt, seed, width, height, batchSize }) {
  const workflow = JSON.parse(JSON.stringify(template || {}));

  // Prompt text (Text Multiline)
  setNodeInput(workflow, 172, "text", String(prompt || "").trim());

  // Seed (KSampler)
  if (Number.isFinite(seed)) setNodeInput(workflow, 77, "seed", Number(seed));

  // Size (EmptySD3LatentImage)
  if (Number.isFinite(width)) setNodeInput(workflow, 71, "width", Number(width));
  if (Number.isFinite(height)) setNodeInput(workflow, 71, "height", Number(height));
  if (Number.isFinite(batchSize)) setNodeInput(workflow, 71, "batch_size", Number(batchSize));

  return workflow;
}

