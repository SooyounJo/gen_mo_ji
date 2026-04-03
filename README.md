# genasset-web

Next.js **페이지 라우터** + React + Yarn 기본 세팅입니다.

## 시작하기

1) (사용자) Yarn 설치
2) 의존성 설치

```bash
yarn install
```

3) 개발 서버 실행

```bash
yarn dev
```

브라우저에서 `http://localhost:3000` 을 열면 됩니다.

## 스크립트

- `yarn dev`: 개발 서버
- `yarn build`: 프로덕션 빌드
- `yarn start`: 프로덕션 서버
- `yarn lint`: ESLint

## ComfyUI 서버 연결 (기본)

- **ComfyUI HTTP**: `COMFYUI_BASE_URL` 로 원격 ComfyUI에 직접 연결해서 생성합니다.
  - API: `POST /api/comfy/generate`
  - 테스트 UI: `pages/runpod-test.js` (이름은 legacy지만 현재는 ComfyUI 테스트 페이지로 사용)
- **워크플로 JSON 템플릿**: 루트 **`genmo0404.json`** 하나만 사용합니다 (`lib/comfy/buildWorkflow.js`의 `WORKFLOW_TEMPLATE_FILE`).
- `/api/comfy/generate` 응답은 **`images: string[]`(data URL)** + **`videoUrl: string`(프록시 URL)** 을 포함할 수 있습니다.

## RunPod Serverless + ComfyUI (레거시)

- **RunPod HTTP**: `POST https://api.runpod.ai/v2/<RUNPOD_ENDPOINT_ID>/run` + `GET .../status/<job_id>` — 구현은 `pages/api/runpod/run.js`, `pages/api/runpod/status/[id].js`, 테스트 UI `pages/runpod-test.js`.
- **워크플로 JSON 템플릿**: RunPod에 workflow 를 실어 보낼 때도 `lib/comfy/buildWorkflow.js`의 `WORKFLOW_TEMPLATE_FILE` 기준으로 채웁니다.
- 워커에서 모델·`custom_nodes` 가 Handler 스캔 경로와 다르면 `not in []` / 노드 누락이 납니다. → **`docs/runpod-serverless-worker-paths.md`**
- 환경 변수: **`.env.local.example`**

