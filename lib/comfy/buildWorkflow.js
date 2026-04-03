import fs from "fs/promises";
import path from "path";

/**
 * 단일 워크플로 템플릿(Comfy API JSON). 다른 루트 *.json 은 레거시/참고용이며
 * RunPod·로컬 Comfy API 경로는 전부 WORKFLOW_TEMPLATE_FILE 한 파일만 읽습니다.
 */
export const WORKFLOW_TEMPLATE_FILE = "genmo0404.json";

const TEMPLATE_PATH = path.join(process.cwd(), WORKFLOW_TEMPLATE_FILE);

// NOTE:
// - 템플릿(ComfyUI 워크플로)에 이미 스타일/룩이 포함될 수 있으므로,
//   우리 쪽에서 "기본 스타일 프롬프트"를 덮어쓰지 않습니다.
// - 노드 ID는 환경/워크플로 편집에 따라 달라질 수 있으므로,
//   가능한 한 class_type + 연결관계로 찾아서 주입합니다.

const REQUIRED_CLASS_TYPES = [
  "PrimitiveStringMultiline",
  "EmptySD3LatentImage",
  "KSampler",
  // 영상/저장 노드는 템플릿에 따라 달라질 수 있어 필수로 강제하지 않습니다.
  // (결과 추출은 history outputs 스캔으로 처리)
];

function assertWorkflowShape(workflow) {
  const nodes = workflow && typeof workflow === "object" ? Object.values(workflow) : [];
  const got = new Set(nodes.map((n) => n?.class_type).filter(Boolean));
  const missing = REQUIRED_CLASS_TYPES.filter((t) => !got.has(t));
  if (missing.length) {
    throw new Error(`${WORKFLOW_TEMPLATE_FILE}: missing required class_type(s): ${missing.join(", ")}`);
  }
}

export async function loadWorkflowTemplate() {
  const raw = await fs.readFile(TEMPLATE_PATH, "utf8");
  const parsed = JSON.parse(raw);
  assertWorkflowShape(parsed);
  return parsed;
}

function getNode(workflow, nodeId) {
  const node = workflow?.[String(nodeId)] || null;
  return node && typeof node === "object" ? node : null;
}

function setNodeInputById(workflow, nodeId, key, value) {
  const node = getNode(workflow, nodeId);
  if (!node || !node.inputs) throw new Error(`Missing node ${nodeId} in ${WORKFLOW_TEMPLATE_FILE}`);
  node.inputs[key] = value;
}

function nodeTitle(node) {
  const t = node?._meta?.title;
  return typeof t === "string" ? t : "";
}

function findNodeId(workflow, predicate) {
  if (!workflow || typeof workflow !== "object") return "";
  for (const id of Object.keys(workflow)) {
    const node = workflow[id];
    if (predicate(node, id)) return id;
  }
  return "";
}

function isLinkTo(nodeId, maybeLink) {
  return Array.isArray(maybeLink) && String(maybeLink?.[0] || "") === String(nodeId);
}

function findUserPromptNodeId(workflow) {
  if (getNode(workflow, "58")?.class_type === "PrimitiveStringMultiline") return "58";
  const byTitle = findNodeId(
    workflow,
    (n) => n?.class_type === "PrimitiveStringMultiline" && /image prompt/i.test(nodeTitle(n))
  );
  if (byTitle) return byTitle;
  return findNodeId(workflow, (n) => n?.class_type === "PrimitiveStringMultiline" && n?.inputs && "value" in n.inputs);
}

function findConcatNodeIds(workflow) {
  if (!workflow || typeof workflow !== "object") return [];
  return Object.keys(workflow).filter((id) => workflow?.[id]?.class_type === "StringConcatenate");
}

function findLatentNodeId(workflow) {
  if (getNode(workflow, "71")?.class_type === "EmptySD3LatentImage") return "71";
  return findNodeId(workflow, (n) => n?.class_type === "EmptySD3LatentImage" && n?.inputs);
}

function findSamplerNodeId(workflow) {
  if (getNode(workflow, "77")?.class_type === "KSampler") return "77";
  return findNodeId(workflow, (n) => n?.class_type === "KSampler" && n?.inputs);
}

export function buildWorkflowFromTemplate(template, { prompt, seed, width, height, batchSize }) {
  const workflow = JSON.parse(JSON.stringify(template || {}));
  assertWorkflowShape(workflow);

  const promptText = String(prompt || "").trim();
  const userPromptId = findUserPromptNodeId(workflow);
  if (!userPromptId) throw new Error(`${WORKFLOW_TEMPLATE_FILE}: could not find user prompt node (PrimitiveStringMultiline)`);
  setNodeInputById(workflow, userPromptId, "value", promptText);

  if (Number.isFinite(seed)) {
    const samplerId = findSamplerNodeId(workflow);
    if (!samplerId) throw new Error(`${WORKFLOW_TEMPLATE_FILE}: could not find KSampler node`);
    setNodeInputById(workflow, samplerId, "seed", Number(seed));
  }
  if (Number.isFinite(width)) {
    const latentId = findLatentNodeId(workflow);
    if (!latentId) throw new Error(`${WORKFLOW_TEMPLATE_FILE}: could not find latent image node (EmptySD3LatentImage)`);
    setNodeInputById(workflow, latentId, "width", Number(width));
  }
  if (Number.isFinite(height)) {
    const latentId = findLatentNodeId(workflow);
    if (!latentId) throw new Error(`${WORKFLOW_TEMPLATE_FILE}: could not find latent image node (EmptySD3LatentImage)`);
    setNodeInputById(workflow, latentId, "height", Number(height));
  }
  if (Number.isFinite(batchSize)) {
    const latentId = findLatentNodeId(workflow);
    if (!latentId) throw new Error(`${WORKFLOW_TEMPLATE_FILE}: could not find latent image node (EmptySD3LatentImage)`);
    setNodeInputById(workflow, latentId, "batch_size", Number(batchSize));
  }

  return workflow;
}
