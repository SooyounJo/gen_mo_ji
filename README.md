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

## RunPod Serverless + ComfyUI

- **RunPod HTTP**: `POST https://api.runpod.ai/v2/<RUNPOD_ENDPOINT_ID>/run` + `GET .../status/<job_id>` — 구현은 `pages/api/runpod/run.js`, `pages/api/runpod/status/[id].js`, 테스트 UI `pages/runpod-test.js`.
- **워크플로 JSON 템플릿**: 저장소에서는 **`z image+rmbg (1).json` 하나만** 사용합니다 (`lib/comfy/buildWorkflow.js`의 `WORKFLOW_TEMPLATE_FILE`). RunPod에 workflow 를 실어 보낼 때도 이 파일만 기준으로 채웁니다. `RUNPOD_INPUT_PROMPT_ONLY=1` 이면 RunPod 페이로드는 curl 예시처럼 `input.prompt` 위주이고, 워커 쪽에서 고정 그래프를 씁니다.
- 워커에서 모델·`custom_nodes` 가 Handler 스캔 경로와 다르면 `not in []` / 노드 누락이 납니다. → **`docs/runpod-serverless-worker-paths.md`**
- 환경 변수: **`.env.local.example`**

