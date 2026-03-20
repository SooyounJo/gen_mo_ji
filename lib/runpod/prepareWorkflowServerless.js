/**
 * RunPod Serverless용 ComfyUI 워크플로 전처리.
 * - pages/api/runpod/run.js 와 동일 로직을 한 곳에서 유지 (generate.js 등과 불일치 방지)
 *
 * 워커 경로: Handler는 보통 /runpod-volume/models · custom_nodes 등을 스캔합니다.
 * 실제 파일이 /workspace/runpod-slim/ComfyUI/ 아래에만 있으면 목록이 비게 됩니다.
 * → docs/runpod-serverless-worker-paths.md 참고 (심볼릭 링크로 스캔 경로와 연결)
 *
 * - 기본: 노드 172(Text Multiline) 유지 — 워커에 ComfyUI-Custom-Scripts 등이 로드된 경우
 * - RUNPOD_STRIP_TEXT_MULTILINE=1: 172 없는 최소 이미지용으로 172 제거 후 61.string_a에만 주입
 */
export function prepareWorkflowForRunpodServerless(workflow) {
  const wf = JSON.parse(JSON.stringify(workflow || {}));

  const stripTextMultiline =
    String(process.env.RUNPOD_STRIP_TEXT_MULTILINE || "").toLowerCase() === "true" ||
    process.env.RUNPOD_STRIP_TEXT_MULTILINE === "1";

  if (stripTextMultiline) {
    const userPrompt = String(wf?.["172"]?.inputs?.text || "").trim();
    if (wf?.["61"]?.inputs) wf["61"].inputs.string_a = userPrompt;
    if (wf?.["76"]?.inputs) wf["76"].inputs.text = ["61", 0];
  }

  if (wf?.["113"]?.inputs) wf["113"].inputs.images = ["70", 0];
  if (wf?.["173"]?.inputs) wf["173"].inputs.images = ["70", 0];
  if (wf?.["169"]?.inputs) wf["169"].inputs.images = ["70", 0];

  if (!wf["999"]) {
    wf["999"] = {
      inputs: {
        filename_prefix: "genasset",
        images: ["70", 0]
      },
      class_type: "SaveImage",
      _meta: { title: "Save Image" }
    };
  }

  const removeIds = ["63", "121", "126", "127", "168", "174"];
  if (stripTextMultiline) removeIds.push("172");
  for (const id of removeIds) {
    if (wf[id]) delete wf[id];
  }
  return wf;
}
