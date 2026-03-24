# RunPod Serverless 워커 — 모델·커스텀 노드 경로 (심볼릭 링크)

## Next.js API (`/api/runpod/run`)

워크플로를 실어 보낼 때: **`input.prompt`** + **`input.workflow`** — 템플릿은 루트 **`z image+rmbg (1).json` 하나**만 (`lib/comfy/buildWorkflow.js`).

prompt 만 받는 핸들러: `.env.local`에 **`RUNPOD_INPUT_PROMPT_ONLY=1`**

```bash
# 디버그: 실제로 보낼 input 미리보기 (서버 로컬)
# POST /api/runpod/run  body: { "prompt": "test", "debugWorkflow": true }
```

---

**로컬 ComfyUI** (`/api/comfy/generate`)도 같은 **`z image+rmbg (1).json`** 템플릿만 사용합니다. **RunPod Serverless Handler** 스캔 경로와 실제 ComfyUI 설치 경로가 다르면 `not in []`, `value_not_in_list` 등으로 실패할 수 있습니다.

## Handler가 보통 스캔하는 경로

- `/runpod-volume/models`
- `/runpod-volume/custom_nodes`

(템플릿·이미지에 따라 `/workspace/...` 가 볼륨에 마운트된 형태로 노출되기도 합니다.)

## 권장: 심볼릭 링크로 “스캔 경로 ↔ 실제 경로” 연결

파일을 복사하지 않고, **서버가 찾는 상위 경로**에서 **실제 ComfyUI 트리**로 링크를 겁니다.

| 항목 | 실제 파일 위치 (예시) | 연결할 경로 (스캔/진입점) |
|------|------------------------|---------------------------|
| Models | `/workspace/runpod-slim/ComfyUI/models` | `/workspace/models` (또는 Handler가 스캔하는 `.../models` 에 맞춤) |
| Custom Nodes | `/workspace/runpod-slim/ComfyUI/custom_nodes` | `/workspace/custom_nodes` (또는 `.../custom_nodes`) |

> **주의:** 위 표의 “연결된 경로”는 배포한 Handler/이미지가 **실제로 읽는** 디렉터리와 일치해야 합니다. `runpod-volume` 이 `/workspace` 에 붙어 있다면 `runpod-volume/models` → ComfyUI `models` 로 가는 심볼릭 링크를 두는 식으로 맞춥니다.

## 이 프로젝트(Next) 쪽 설정

- **노드 172(Text Multiline)** 가 워커에 로드되면: `.env.local` 에 **`RUNPOD_STRIP_TEXT_MULTILINE` 을 넣지 않거나 제거** — 워크플로에 172를 그대로 둡니다.
- 워커에 여전히 Text Multiline 이 없을 때만: `RUNPOD_STRIP_TEXT_MULTILINE=1` 로 172 없이 전송하는 우회 경로를 사용합니다.

워크플로 템플릿이 참조하는 모델 예시 파일명:

- `qwen_3_4b.safetensors` (CLIP)
- `z_image_turbo_bf16.safetensors` (UNET)
- `pixar_style_v21.safetensors` (LoRA)
- `ae.safetensors` (VAE)

워커 목록에 **파일명이 정확히** 보여야 검증을 통과합니다.
