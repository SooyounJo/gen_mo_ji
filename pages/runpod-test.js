import { useEffect, useMemo, useRef, useState } from "react";
import styles from "@/styles/RunpodTest.module.css";
import GradientText from "@/components/ui/GradientText";
import Grainient from "@/components/ui/Grainient";
function looksKorean(s) {
  return /[가-힣]/.test(String(s || ""));
}

function escapeRegExp(str) {
  return String(str || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function uniq(arr) {
  return Array.from(new Set(arr));
}

function extractCandidates(text) {
  const s = String(text || "").trim();
  if (!s) return [];

  const normalized = s.replace(/\s+/g, " ").trim();
  const stop = new Set([
    "그리고",
    "그런데",
    "하지만",
    "그래서",
    "저는",
    "나는",
    "너는",
    "우리는",
    "오늘",
    "진짜",
    "너무",
    "완전",
    "그냥"
  ]);

  // 1) 구/문장 스팬 우선 추출 (명사+동사/행동 사건)
  const phrasePatterns = [
    /[A-Za-z0-9가-힣]+(?:\s+[A-Za-z0-9가-힣]+){0,4}\s+(?:춤추는|먹는|마시는|주는|줬어|줬다|산책하는|달리는|뛰는|웃는|우는|변신하는|떨어뜨리는|보고있는)/g,
    /[A-Za-z0-9가-힣]+(?:\s+[A-Za-z0-9가-힣]+){0,4}\s+(?:했어|했다|하고있어|하는중|됨|됐다|돼서|되어서)/g,
    /[A-Za-z0-9가-힣]+(?:랑|과)\s+[A-Za-z0-9가-힣]+(?:\s+[A-Za-z0-9가-힣]+){0,3}/g
  ];
  const phraseCandidates = [];
  for (const re of phrasePatterns) {
    const hits = normalized.match(re) || [];
    for (const h of hits) {
      const t = String(h || "").trim();
      if (t.length >= 4 && t.length <= 42) phraseCandidates.push(t);
    }
  }

  // 2) fallback: 짧은 스팬(2~4단어 n-gram)
  const words = normalized
    .split(" ")
    .map((w) => String(w || "").trim())
    .filter((w) => w && !stop.has(w))
    // 내부 캐릭터 ID(예: character-rcr001)는 후보에서 제거
    .filter((w) => !/^character-[a-z0-9]+$/i.test(w));
  const shortSpans = [];
  for (let n = 2; n <= 4; n += 1) {
    for (let i = 0; i + n <= words.length; i += 1) {
      const span = words.slice(i, i + n).join(" ").trim();
      if (span.length >= 4 && span.length <= 24) shortSpans.push(span);
    }
  }

  // 3) 단일 단어는 최소화해서 보조로만
  const single = (normalized.match(/[A-Za-z0-9가-힣]{2,}/g) || [])
    .filter((w) => !stop.has(w))
    .filter((w) => !/^character-[a-z0-9]+$/i.test(w))
    .slice(0, 2);

  return uniq([...phraseCandidates, ...shortSpans, ...single])
    .filter((x) => !/character-[a-z0-9]+/i.test(String(x || "")))
    .slice(0, 12);
}

/** RunPod/ComfyUI 오류 문자열을 웹에 표시할 한국어로 정리 */
function toKoreanRunpodMessage(raw, hint) {
  const s = String(raw || "").trim();
  const h = String(hint || "").trim();
  const combined = `${s}\n${h}`.trim();

  if (!s && !h) return "알 수 없는 오류가 발생했습니다.";

  if (/ComfyUI HTTP 404/i.test(combined) || /404 Not Found/i.test(combined)) {
    return [
      "ComfyUI 서버에서 404(Not Found)가 발생했습니다.",
      "대부분 `COMFYUI_BASE_URL`이 ComfyUI 루트가 아니거나(포트/경로 오류), 해당 주소에서 ComfyUI가 실행 중이 아닌 경우입니다.",
      "확인: 브라우저에서 `COMFYUI_BASE_URL`을 열었을 때 ComfyUI 화면이 떠야 하고, 보통 API는 `/prompt`가 존재합니다."
    ].join(" ");
  }

  if (/Failed to fetch|NetworkError|Load failed|네트워크.*실패/i.test(combined)) {
    return "네트워크 오류로 서버에 연결할 수 없습니다. 인터넷 연결과 API 주소를 확인하세요.";
  }
  if (/RunPod job id가 없습니다|job id가 없습니다/i.test(combined)) {
    return "RunPod에서 작업 ID를 받지 못했습니다. 엔드포인트 응답 형식·API 키·엔드포인트 ID를 확인하세요.";
  }
  if (/^(RunPod run 실패|RunPod status 실패)$/i.test(s)) {
    return "RunPod API 호출에 실패했습니다. .env.local의 RUNPOD_API_KEY·RUNPOD_ENDPOINT_ID와 네트워크를 확인하세요.";
  }

  if (/Missing ['"]workflow['"] parameter/i.test(combined)) {
    return "워커가 workflow(JSON)를 요구합니다. 현재 서버는 prompt-only로 보내고 있습니다(RUNPOD_INPUT_PROMPT_ONLY=1). 이 에러가 뜨면 해당 엔드포인트가 prompt-only를 지원하지 않는 구성입니다.";
  }
  if (/request does not exist/i.test(combined) || /RunPod HTTP 404/i.test(s)) {
    return "RunPod에서 해당 작업을 찾을 수 없습니다. 엔드포인트 ID·API 키·작업 ID가 맞는지 확인하세요.";
  }
  if (/RunPod status failed/i.test(s) || /RunPod run failed/i.test(s)) {
    if (/401|403|Unauthorized|Forbidden/i.test(combined)) {
      return "RunPod API 인증에 실패했습니다. .env.local의 RUNPOD_API_KEY를 확인하세요.";
    }
    if (/502|503|fetch failed|ECONNREFUSED/i.test(combined)) {
      return "RunPod 서버와 통신할 수 없습니다. 네트워크 또는 RunPod 상태를 확인하세요.";
    }
  }
  if (/Workflow validation failed/i.test(combined) || /value_not_in_list|not in \[\]/i.test(combined)) {
    const ko =
      "워크플로우 검증에 실패했습니다. JSON 문제보다는 RunPod 워커가 모델·노드를 못 찾는 경우가 많습니다. 템플릿 예시 파일명: qwen_3_4b.safetensors, z_image_turbo_bf16.safetensors, pixar_style_v21.safetensors, ae.safetensors. Serverless Handler는 보통 /runpod-volume/models 를 스캔합니다 — 실제 모델이 /workspace/runpod-slim/ComfyUI/models 등에만 있으면 심볼릭 링크로 스캔 경로와 연결해야 합니다( docs/runpod-serverless-worker-paths.md ).";
    const tech = [s, h].filter(Boolean).join("\n\n");
    return tech
      ? `${ko}\n\n──── 서버에서 받은 원문·상세 ────\n${tech}`
      : `${ko}\n\n(RunPod가 짧은 메시지만 넘긴 경우입니다. RunPod 작업 로그·output 필드를 확인하세요.)`;
  }
  if (/Text Multiline does not exist|node Text Multiline/i.test(combined)) {
    return "워커에 'Text Multiline' 노드가 없습니다. /runpod-volume/custom_nodes(또는 Handler가 읽는 custom_nodes)에 ComfyUI-Custom-Scripts 등이 심볼릭 링크로 연결됐는지 확인하세요. 임시 우회: 서버(.env.local)에 RUNPOD_STRIP_TEXT_MULTILINE=1 이면 노드 172 없이 전송합니다.";
  }
  if (/Base64EncodeNode does not exist/i.test(combined)) {
    return "워커에 Base64Encode 노드가 없습니다. RunPod ComfyUI 환경에 해당 커스텀 노드를 설치하세요.";
  }
  if (/RunPod timeout waiting|시간 초과|Timed out/i.test(combined)) {
    return "RunPod 작업이 시간 초과되었습니다. 워커 대기열·GPU 할당을 RunPod 콘솔에서 확인하세요.";
  }
  if (/Cannot execute because node/i.test(combined)) {
    return "ComfyUI에서 필요한 노드가 워커에 없습니다. RunPod 워커 로그와 커스텀 노드 설치 여부를 확인하세요.";
  }
  if (/COMPLETED but no image base64/i.test(combined)) {
    return "작업은 완료되었으나 이미지 데이터를 받지 못했습니다. RunPod 출력 형식(base64/URL)과 /api/runpod/status 의 파싱을 확인하세요.";
  }
  if (/상태 조회 HTTP 오류/i.test(h)) {
    return `${h}\n\n${s || "상태 API 응답이 올바르지 않습니다."}`;
  }

  // API가 이미 한국어 힌트를 주는 경우
  if (h && /[가-힣]/.test(h)) {
    return h.length > s.length ? `${h}${s && s !== h ? `\n\n(상세) ${s}` : ""}` : `${s}${h ? `\n\n${h}` : ""}`;
  }

  return s || h || "알 수 없는 오류가 발생했습니다.";
}

/** FAILED 시 error만 짧게 오고 상세는 output에 있는 경우가 많음 */
function pickRunpodFailureText(stData) {
  const fd = String(stData?.failureDetail || "").trim();
  if (fd) return fd;
  const e = stData?.error;
  if (e != null) {
    if (typeof e === "string") return e;
    try {
      return JSON.stringify(e, null, 2);
    } catch {
      return String(e);
    }
  }
  const out = stData?.output;
  if (out != null) {
    return typeof out === "string" ? out : JSON.stringify(out, null, 2);
  }
  try {
    return JSON.stringify(stData, null, 2);
  } catch {
    return String(stData);
  }
}

function HighlightText({ text, candidates, selectedTerm, onPick }) {
  const value = String(text || "");
  const list = (candidates || []).filter(Boolean);
  if (!value || list.length === 0) return value;

  const pattern = list
    .slice()
    .sort((a, b) => b.length - a.length)
    .map((c) => escapeRegExp(c))
    .join("|");
  if (!pattern) return value;

  const re = new RegExp(`(${pattern})`, "g");
  const parts = value.split(re);
  const set = new Set(list);

  return parts.map((p, idx) => {
    if (!set.has(p)) return <span key={idx}>{p}</span>;
    const isSelected = String(selectedTerm || "") === p;
    return (
      <button
        key={idx}
        type="button"
        className={`${styles.termBtn} ${isSelected ? styles.termBtnSelected : ""}`}
        onClick={() => onPick(p)}
      >
        <GradientText
          inline
          className={styles.termGradient}
          colors={["#6A3CFF", "#8B5CFF", "#FF8EEA", "#B19EEF", "#6A3CFF"]}
          animationSpeed={3.8}
          gradientScale={180}
          textWeight={700}
          pauseOnHover
        >
          {p}
        </GradientText>
      </button>
    );
  });
}

export default function RunpodTestPage() {
  const [text, setText] = useState("");
  const [selected, setSelected] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | done | error
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");
  const [images, setImages] = useState([]);
  const [videoUrl, setVideoUrl] = useState("");
  const [count, setCount] = useState(2);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [totalMs, setTotalMs] = useState(0);
  const [debugRequest, setDebugRequest] = useState(null);
  const [debugResponse, setDebugResponse] = useState(null);
  const [promptPreviewMeta, setPromptPreviewMeta] = useState(null);
  const [promptPreviewLoading, setPromptPreviewLoading] = useState(false);
  const [promptPreviewError, setPromptPreviewError] = useState("");
  const abortRef = useRef(null);
  const previewAbortRef = useRef(null);
  const previewTimerRef = useRef(null);
  const lastTermRef = useRef("");
  const startedAtRef = useRef(0);
  const tickTimerRef = useRef(null);

  const candidates = useMemo(() => extractCandidates(text), [text]);
  const promptPreview = useMemo(() => {
    const t = String(selected || "").trim();
    const internal = /^character-[a-z0-9]+$/i.test(t);
    const requestPrompt = t;
    const sentFromRun = String(debugResponse?.meta?.promptSent || "");
    const comfyEn = sentFromRun || String(promptPreviewMeta?.promptSent || "");
    const translated = Boolean(debugResponse?.meta?.translated ?? promptPreviewMeta?.translated);

    return {
      internal,
      requestPrompt,
      comfyEn,
      translated,
      note: !t
        ? ""
        : internal
          ? "내부 캐릭터 ID(character-...)는 프롬프트로 전송되지 않도록 차단됩니다."
          : looksKorean(t) && !promptPreviewMeta && !sentFromRun
            ? "아래 'Comfy 전송(영어)'는 서버 미리보기로 채워집니다."
            : ""
    };
  }, [selected, debugResponse, promptPreviewMeta]);
  const processLine = useMemo(() => {
    if (status === "loading") {
      return "생성 중…";
    }
    if (status === "done") return "생성 완료";
    if (status === "error") return "생성 실패";
    return "대기 중";
  }, [status]);

  const requestedCount = useMemo(() => {
    const n = Math.max(1, Math.min(4, Number(count) || 2));
    return n;
  }, [count]);

  const imageSlots = useMemo(() => {
    const arr = Array.isArray(images) ? images : [];
    return Array.from({ length: requestedCount }, (_, i) => String(arr?.[i] || ""));
  }, [images, requestedCount]);

  const errorDetail = useMemo(() => {
    const seconds = Math.max(0, Math.floor((elapsedMs || 0) / 1000));
    const totalSeconds = Math.max(0, Math.floor((totalMs || 0) / 1000));

    if (status === "loading") {
      return `생성 중...\n경과: ${seconds}초`;
    }
    if (status === "done") {
      return `생성 완료\n총 소요: ${totalSeconds || seconds}초`;
    }
    if (status === "error") {
      const base = toKoreanRunpodMessage(error, hint);
      const t = totalSeconds || seconds;
      return t ? `${base}\n\n총 소요: ${t}초` : base;
    }
    return "오류가 발생하면 이 영역에 상세 사유가 표시됩니다.";
  }, [status, error, hint, elapsedMs, totalMs]);

  useEffect(() => {
    if (!selected) return;
    if (!String(text || "").includes(selected)) {
      setSelected("");
    }
  }, [text, selected]);

  useEffect(() => {
    // Debug: 어떤 하이라이트 후보가 나오는지(토큰/구문)
    if (!text.trim()) return;
    // eslint-disable-next-line no-console
    console.log("[runpod-test] highlight candidates", { text, candidates });
  }, [text, candidates]);

  useEffect(() => {
    // Debug: 현재 선택된 하이라이트
    // eslint-disable-next-line no-console
    console.log("[runpod-test] selected highlight", selected || "(none)");
  }, [selected]);

  useEffect(() => {
    const t = String(selected || "").trim();
    if (previewTimerRef.current) window.clearTimeout(previewTimerRef.current);
    if (previewAbortRef.current) previewAbortRef.current.abort();

    if (!t || /^character-[a-z0-9]+$/i.test(t)) {
      setPromptPreviewMeta(null);
      setPromptPreviewLoading(false);
      setPromptPreviewError("");
      return undefined;
    }

    setPromptPreviewLoading(true);
    setPromptPreviewError("");

    previewTimerRef.current = window.setTimeout(() => {
      const controller = new AbortController();
      previewAbortRef.current = controller;
      (async () => {
        try {
          const res = await fetch("/api/comfy/prompt-preview", {
            method: "POST",
            headers: { "content-type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({ prompt: t })
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data?.detail || data?.error || "프롬프트 미리보기 실패");
          setPromptPreviewMeta(data?.meta || null);
          setPromptPreviewError("");
        } catch (e) {
          if (controller.signal.aborted) return;
          setPromptPreviewMeta(null);
          setPromptPreviewError(String(e?.message || e));
        } finally {
          if (!controller.signal.aborted) setPromptPreviewLoading(false);
        }
      })();
    }, 320);

    return () => {
      if (previewTimerRef.current) window.clearTimeout(previewTimerRef.current);
      previewAbortRef.current?.abort();
    };
  }, [selected]);

  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
      if (tickTimerRef.current) window.clearInterval(tickTimerRef.current);
    };
  }, []);

  function cancel() {
    if (abortRef.current) abortRef.current.abort();
    if (tickTimerRef.current) window.clearInterval(tickTimerRef.current);
    setStatus("idle");
    setError("");
    setHint("");
    setImages([]);
    setVideoUrl("");
    setElapsedMs(0);
    setTotalMs(0);
    setDebugRequest(null);
    setDebugResponse(null);
  }

  function retry() {
    const t = String(lastTermRef.current || "").trim();
    if (!t) return;
    generate(t);
  }

  async function generate(term) {
    const t = String(term || "").trim();
    if (!t) return;

    lastTermRef.current = t;
    setSelected(t);
    setStatus("loading");
    setError("");
    setHint("");
    setImages([]);
    setVideoUrl("");
    setElapsedMs(0);
    setTotalMs(0);
    setDebugRequest(null);
    setDebugResponse(null);

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // ComfyUI server-connected endpoint: /api/comfy/generate returns images + (optional) videoUrl
    // 이 테스트 페이지는 선택 텍스트를 prompt로 그대로 전송하고,
    // 한국어 번역은 서버(/api/comfy/generate)에서 처리합니다.
    if (/^character-[a-z0-9]+$/i.test(t)) {
      throw new Error("내부 캐릭터 ID(character-...)가 선택되어 프롬프트로 전송할 수 없습니다. 텍스트에서 '쥐/고양이' 같은 실제 단어를 선택해 주세요.");
    }

    try {
      startedAtRef.current = Date.now();
      if (tickTimerRef.current) window.clearInterval(tickTimerRef.current);
      tickTimerRef.current = window.setInterval(() => {
        setElapsedMs(Date.now() - (startedAtRef.current || Date.now()));
      }, 250);

      const payload = { prompt: t, count: requestedCount, width: 512, height: 512 };
      setDebugRequest(payload);

      // eslint-disable-next-line no-console
      console.log("[runpod-test] send generate", {
        selected: t,
        request: payload
      });
      // eslint-disable-next-line no-console
      console.log("[runpod-test] interpretation", {
        note: "이 테스트 페이지는 선택 텍스트를 prompt로 그대로 전송합니다(추가 분석 없음).",
        selected: t,
        prompt: t
      });
      const runRes = await fetch("/api/comfy/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify(payload)
      });
      const runData = await runRes.json().catch(() => ({}));
      if (!runRes.ok) throw new Error(runData?.detail || runData?.error || "ComfyUI generate 실패");
      // eslint-disable-next-line no-console
      console.log("[runpod-test] response <- /api/comfy/generate", {
        images: Array.isArray(runData?.images) ? runData.images.length : 0,
        videoUrl: String(runData?.videoUrl || ""),
        videoRef: runData?.videoRef || null
      });
      setDebugResponse({
        images: Array.isArray(runData?.images) ? runData.images.length : 0,
        videoUrl: String(runData?.videoUrl || ""),
        videoRef: runData?.videoRef || null,
        seed: runData?.seed,
        meta: runData?.meta || null
      });
      const imgs = Array.isArray(runData?.images) ? runData.images.filter(Boolean) : [];
      setImages(imgs.slice(0, requestedCount));
      setVideoUrl(String(runData?.videoUrl || ""));
      setStatus("done");
      const ms = Date.now() - (startedAtRef.current || Date.now());
      setElapsedMs(ms);
      setTotalMs(ms);
      if (tickTimerRef.current) window.clearInterval(tickTimerRef.current);
    } catch (e) {
      if (controller.signal.aborted) return;
      setStatus("error");
      setError(String(e?.message || e));
      // eslint-disable-next-line no-console
      console.error("[runpod-test] generate error", e);
      if (tickTimerRef.current) window.clearInterval(tickTimerRef.current);
      const ms = Date.now() - (startedAtRef.current || Date.now());
      setElapsedMs(ms);
      setTotalMs(ms);
      setDebugResponse({ error: String(e?.message || e) });
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.backgroundLayer}>
        <Grainient
          color1="#FF9FFC"
          color2="#5227FF"
          color3="#B19EEF"
          timeSpeed={0.25}
          colorBalance={0}
          warpStrength={1}
          warpFrequency={5}
          warpSpeed={2}
          warpAmplitude={50}
          blendAngle={0}
          blendSoftness={0.05}
          rotationAmount={500}
          noiseScale={2}
          grainAmount={0.1}
          grainScale={2}
          grainAnimated={false}
          contrast={1.5}
          gamma={1}
          saturation={1}
          centerX={0}
          centerY={0}
          zoom={0.9}
        />
      </div>
      <div className={styles.appShell}>
        <header className={styles.header}>
          <div>
            <div className={styles.title}>ComfyUI 서버 연결 테스트</div>
          </div>
        </header>

        <div className={styles.columns}>
          <section className={styles.leftPanel}>
            <div className={styles.panelTitle}>Task</div>

            <label className={styles.label}>텍스트</label>
            <textarea
              className={styles.textarea}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              placeholder="예: 춤추는 개구리"
              spellCheck={false}
            />

            <label className={styles.label}>이미지 수 (count)</label>
            <input
              className={styles.countInput}
              type="number"
              min={1}
              max={4}
              step={1}
              value={count}
              onChange={(e) => setCount(e.target.value)}
            />

            <div className={styles.previewLabel}>하이라이트 (클릭)</div>
            <div className={styles.previewBox} aria-label="하이라이트 프리뷰">
              <HighlightText text={text} candidates={candidates} selectedTerm={selected} onPick={setSelected} />
            </div>

            <button
              type="button"
              className={styles.sendBtn}
              onClick={() => generate(selected)}
              disabled={status === "loading" || !String(selected || "").trim()}
            >
              Send
            </button>

            <div className={styles.metaCard}>
              <div className={styles.metaLine}>
                <span className={styles.metaKey}>선택</span>
                <span className={styles.metaVal}>{selected || "-"}</span>
              </div>
              <div className={styles.metaLine}>
                <span className={styles.metaKey}>상태</span>
                <span className={styles.metaVal}>{status === "loading" ? "생성 중" : status === "error" ? "에러" : status === "done" ? "완료" : "대기"}</span>
              </div>
            </div>

            <div className={styles.promptPreviewCard} aria-label="프롬프트 미리보기">
              <div className={styles.promptPreviewTitle}>프롬프트 미리보기 (하이라이트 클릭 즉시)</div>
              <div className={styles.promptPreviewLine}>
                <span className={styles.promptPreviewKey}>원문</span>
                <span className={`${styles.promptPreviewVal} ${styles.promptPreviewMono}`}>
                  {promptPreview.requestPrompt || "-"}
                </span>
              </div>
              <div className={styles.promptPreviewLine}>
                <span className={styles.promptPreviewKey}>Comfy 전송(영어)</span>
                <span className={`${styles.promptPreviewVal} ${styles.promptPreviewMono}`}>
                  {promptPreviewLoading
                    ? "서버에서 프롬프트 확정 중…"
                    : promptPreviewError
                      ? `(미리보기 실패) ${promptPreviewError}`
                      : promptPreview.comfyEn
                        ? `${promptPreview.comfyEn}${promptPreview.translated ? " (번역됨)" : ""}`
                        : "-"}
                </span>
              </div>
              {promptPreview.note ? <div className={styles.promptPreviewNote}>{promptPreview.note}</div> : null}
            </div>

            <div className={styles.errorPanel}>
              <div className={styles.errorPanelTitle}>오류/상세</div>
              <div className={styles.errorPanelText}>{errorDetail}</div>
            </div>

            <div className={styles.debugPanel}>
              <div className={styles.debugPanelTitle}>디버그 (전송/응답)</div>
              <div className={styles.debugPanelText}>
                <div className={styles.debugBlockTitle}>request → /api/comfy/generate</div>
                <pre className={styles.debugPre}>{debugRequest ? JSON.stringify(debugRequest, null, 2) : "(없음)"}</pre>
                <div className={styles.debugBlockTitle}>response ← /api/comfy/generate</div>
                <pre className={styles.debugPre}>{debugResponse ? JSON.stringify(debugResponse, null, 2) : "(없음)"}</pre>
              </div>
            </div>

            <div className={styles.actionRow}>
              {status === "error" ? (
                <button type="button" onClick={retry} disabled={!lastTermRef.current}>
                  다시 시도
                </button>
              ) : null}
              {status === "loading" || status === "error" ? (
                <button type="button" onClick={cancel}>
                  취소
                </button>
              ) : null}
            </div>
          </section>

          <section className={styles.rightPanel}>
            <div className={styles.panelTitle}>Result</div>
            <div className={styles.processLine}>{processLine}</div>
            <div className={styles.resultScroll} aria-label="생성 결과(스크롤)">
              <div className={styles.imageGrid} aria-label="생성 이미지들">
                {imageSlots.map((src, i) => (
                  <div key={i} className={styles.imageTile} aria-label={`생성 이미지 ${i + 1}`}>
                    {src ? (
                      <div className={styles.alphaImgWrap}>
                        <img className={styles.mainImg} src={src} alt={`generated ${i + 1}`} />
                      </div>
                    ) : (
                      <div className={styles.emptyImageState}>
                        {status === "loading" ? `이미지 ${i + 1} 생성 중…` : `이미지 ${i + 1} 대기`}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className={styles.videoSquare} aria-label="생성 비디오">
                {videoUrl ? (
                  <video className={styles.video} src={videoUrl} controls loop muted playsInline />
                ) : (
                  <div className={styles.emptyImageState}>비디오 대기 중</div>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

