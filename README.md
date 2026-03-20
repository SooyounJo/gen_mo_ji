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

- API: `pages/api/runpod/run.js`, `pages/api/runpod/status/[id].js`, 테스트 UI: `pages/runpod-test.js`
- 워커에서 모델·`custom_nodes` 가 **Handler가 스캔하는 경로**와 다르면 `not in []` / 노드 누락이 납니다. 심볼릭 링크로 맞추는 방법은 **`docs/runpod-serverless-worker-paths.md`** 참고.
- 환경 변수 예시: **`.env.local.example`**

