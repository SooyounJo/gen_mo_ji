# RunPod Serverless 워커 — 모델·커스텀 노드 경로 (심볼릭 링크)

## Next.js API (`/api/runpod/run`)

워크플로를 실어 보낼 때: **`input.prompt`** + **`input.workflow`** — 템플릿은 루트 **`genmo0404.json`** (`lib/comfy/buildWorkflow.js`의 `WORKFLOW_TEMPLATE_FILE`).

prompt 만 받는 핸들러: `.env.local`에 **`RUNPOD_INPUT_PROMPT_ONLY=1`**

```bash
# 디버그: 실제로 보낼 input 미리보기 (서버 로컬)
# POST /api/runpod/run  body: { "prompt": "test", "debugWorkflow": true }
```

---

**로컬/원격 ComfyUI** (`/api/comfy/generate`)도 같은 **`genmo0404.json`** 템플릿을 사용합니다. **RunPod Serverless Handler** 스캔 경로와 실제 ComfyUI 설치 경로가 다르면 `not in []`, `value_not_in_list` 등으로 실패할 수 있습니다.

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

## (권장) 워커 컨테이너에서 바로 실행하는 링크 스크립트

아래는 “실제 ComfyUI 설치 경로가 `/workspace/runpod-slim/ComfyUI`”이고, “Handler가 `/runpod-volume/models`·`/runpod-volume/custom_nodes`를 스캔”하는 케이스에서 가장 흔히 쓰는 형태입니다.

```bash
set -euo pipefail

COMFY_ROOT="/workspace/runpod-slim/ComfyUI"
SCAN_ROOT="/runpod-volume"

mkdir -p "$SCAN_ROOT"

# /runpod-volume 쪽이 Handler 스캔 경로인 경우
for d in models custom_nodes; do
  if [ ! -e "$SCAN_ROOT/$d" ] && [ -d "$COMFY_ROOT/$d" ]; then
    ln -s "$COMFY_ROOT/$d" "$SCAN_ROOT/$d"
  fi
done

# 이미지/핸들러가 /workspace/models 형태를 보는 경우도 있어 같이 맞춰두면 안전합니다.
for d in models custom_nodes; do
  if [ ! -e "/workspace/$d" ] && [ -d "$COMFY_ROOT/$d" ]; then
    ln -s "$COMFY_ROOT/$d" "/workspace/$d"
  fi
done

echo "[check] expected CLIP dir:"
ls -la "$SCAN_ROOT/models/clip" || true
```

### 체크 포인트 (이번 에러 케이스)

- `CLIPLoader`의 `clip_name`은 **`models/clip/` 아래 파일명 목록**에서만 매칭됩니다.
- 따라서 `qwen_3_4b.safetensors`는 보통 아래 중 하나에 “그대로” 존재해야 합니다.
  - `/runpod-volume/models/clip/qwen_3_4b.safetensors`
  - (또는 링크된 실제 경로) `/workspace/runpod-slim/ComfyUI/models/clip/qwen_3_4b.safetensors`

## 이 프로젝트(Next) 쪽 설정

- **노드 172(Text Multiline)** 가 워커에 로드되면: `.env.local` 에 **`RUNPOD_STRIP_TEXT_MULTILINE` 을 넣지 않거나 제거** — 워크플로에 172를 그대로 둡니다.
- 워커에 여전히 Text Multiline 이 없을 때만: `RUNPOD_STRIP_TEXT_MULTILINE=1` 로 172 없이 전송하는 우회 경로를 사용합니다.

워크플로 템플릿이 참조하는 모델 예시 파일명:

- (이미지) `qwen_3_4b.safetensors` (CLIP)
- (이미지) `z_image_turbo_bf16.safetensors` (UNET)
- (이미지) `ae.safetensors` (VAE)
- (이미지 LoRA) `Pixar style v2.1.safetensors` (LoRA) — **파일명이 공백 포함으로 정확히 일치**해야 합니다.
- (비디오) `umt5_xxl_fp8_e4m3fn_scaled.safetensors` (WAN CLIP)
- (비디오) `wan_2.1_vae.safetensors` (WAN VAE)
- (비디오 UNET) `wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors`
- (비디오 UNET) `wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors`
- (비디오 LoRA) `wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors`
- (비디오 LoRA) `wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors`

워커 목록에 **파일명이 정확히** 보여야 검증을 통과합니다.
