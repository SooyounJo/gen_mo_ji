import { useEffect, useMemo, useRef, useState } from "react";
import styles from "@/styles/ComfyTest.module.css";
import GradientText from "@/components/ui/GradientText";

function escapeRegExp(str) {
  return String(str || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function uniq(arr) {
  return Array.from(new Set(arr));
}

function extractCandidates(text) {
  const s = String(text || "").trim();
  if (!s) return [];
  const raw = s.match(/[A-Za-z0-9가-힣]{2,}/g) || [];
  const stop = new Set(["그리고", "그런데", "하지만", "그래서", "저는", "나는", "너는", "우리는", "오늘", "진짜", "너무", "완전", "그냥"]);
  return uniq(raw.filter((w) => !stop.has(w))).slice(0, 18);
}

/** RunPod/ComfyUI 오류 문자열을 웹에 표시할 한국어로 정리 */
function toKoreanRunpodMessage(raw, hint) {
  const s = String(raw || "").trim();
  const h = String(hint || "").trim();
  const combined = `${s}\n${h}`.trim();

  if (!s && !h) return "알 수 없는 오류가 발생했습니다.";

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

function HighlightText({ text, candidates, onPick }) {
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
    return (
      <button key={idx} type="button" className={styles.termBtn} onClick={() => onPick(p)}>
        <GradientText inline className={styles.termGradient} colors={["#5227FF", "#FF9FFC", "#B19EEF"]} animationSpeed={6} pauseOnHover>
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
  const [runpodStatus, setRunpodStatus] = useState("");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [images, setImages] = useState([]);
  const [jobId, setJobId] = useState("");
  const abortRef = useRef(null);
  const pollTimerRef = useRef(null);
  const tickTimerRef = useRef(null);
  const lastTermRef = useRef("");
  const queueWarnedRef = useRef(false);

  const candidates = useMemo(() => extractCandidates(text), [text]);
  const mainImage = images?.[0] || "";

  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
      if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
      if (tickTimerRef.current) window.clearInterval(tickTimerRef.current);
    };
  }, []);

  function cancel() {
    if (abortRef.current) abortRef.current.abort();
    if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
    if (tickTimerRef.current) window.clearInterval(tickTimerRef.current);
    setStatus("idle");
    setRunpodStatus("");
    setElapsedMs(0);
    setError("");
    setHint("");
    setImages([]);
    setJobId("");
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
    queueWarnedRef.current = false;
    setSelected(t);
    setStatus("loading");
    setError("");
    setHint("");
    setRunpodStatus("");
    setElapsedMs(0);
    setImages([]);
    setJobId("");

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
    if (tickTimerRef.current) window.clearInterval(tickTimerRef.current);

    // Serverless endpoint: /run returns id, then we poll /status/{id}
    // 긴 영문 템플릿 대신 하이라이트 단어만 전달 (디버깅·에러 원인 분리용)
    const promptEn = String(t).trim();

    try {
      const runRes = await fetch("/api/runpod/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          prompt: promptEn,
          count: 2,
          width: 512,
          height: 512
        })
      });
      const runData = await runRes.json().catch(() => ({}));
      if (!runRes.ok) throw new Error(runData?.detail || runData?.error || "RunPod run 실패");
      const id = String(runData?.id || "");
      if (!id) throw new Error("RunPod job id가 없습니다");
      setJobId(id);

      const startedAt = Date.now();
      tickTimerRef.current = window.setInterval(() => {
        setElapsedMs(Date.now() - startedAt);
      }, 250);

      const pollOnce = async () => {
        if (controller.signal.aborted) return;
        let stRes = null;
        try {
          stRes = await fetch(`/api/runpod/status/${encodeURIComponent(id)}?t=${Date.now()}`, {
            method: "GET",
            signal: controller.signal,
            cache: "no-store"
          });
          const stData = await stRes.json().catch(() => ({}));
          if (!stRes.ok) throw new Error(stData?.detail || stData?.error || "RunPod status 실패");

          const st = String(stData?.status || "").toUpperCase();
          setRunpodStatus(st);
          if (st === "COMPLETED") {
            const imgs = Array.isArray(stData?.images) ? stData.images.filter(Boolean) : [];
            if (imgs.length === 0) {
              setStatus("error");
              setError(
                "RunPod status COMPLETED but no image in response. Check worker output shape and /api/runpod/status parsing."
              );
              setHint("");
              if (tickTimerRef.current) window.clearInterval(tickTimerRef.current);
              return;
            }
            setImages(imgs.slice(0, 2));
            setStatus("done");
            if (tickTimerRef.current) window.clearInterval(tickTimerRef.current);
            return;
          }
          if (st === "FAILED" || st === "CANCELLED" || st === "TIMED_OUT") {
            setStatus("error");
            setError(pickRunpodFailureText(stData));
            setHint(String(stData?.hint || ""));
            if (tickTimerRef.current) window.clearInterval(tickTimerRef.current);
            return;
          }

          // If it sits in queue too long, keep waiting but show a strong hint once.
          if (st === "IN_QUEUE" && Date.now() - startedAt > 2 * 60 * 1000 && !queueWarnedRef.current) {
            queueWarnedRef.current = true;
            setHint(
              "RunPod 대기열(IN_QUEUE)에서 오래 대기 중입니다. 콘솔에서 max workers·할당량·리전 GPU·워커 크래시 로그를 확인하세요."
            );
          }

          if (Date.now() - startedAt > 10 * 60 * 1000) {
            setStatus("error");
            setError(`RunPod timeout waiting for job_id=${id}`);
            if (tickTimerRef.current) window.clearInterval(tickTimerRef.current);
            return;
          }

          pollTimerRef.current = window.setTimeout(pollOnce, 1500);
        } catch (e) {
          if (controller.signal.aborted) return;
          setStatus("error");
          const msg = String(e?.message || e);
          setError(msg);
          setHint(stRes != null && !stRes.ok ? "상태 조회 HTTP 오류 — 엔드포인트·작업 ID·네트워크를 확인하세요." : "");
          if (tickTimerRef.current) window.clearInterval(tickTimerRef.current);
        }
      };

      pollTimerRef.current = window.setTimeout(pollOnce, 600);
    } catch (e) {
      if (controller.signal.aborted) return;
      setStatus("error");
      setError(String(e?.message || e));
      if (tickTimerRef.current) window.clearInterval(tickTimerRef.current);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.title}>RunPod 고정 URL 테스트</div>
          <div className={styles.sub}>Serverless Endpoint(/run + /status) 결과가 여기로 표시됩니다</div>
        </header>

        <section className={styles.inputSection}>
          <div style={{ marginBottom: 10 }}>
            <label className={styles.label} style={{ margin: 0 }}>
              텍스트
            </label>
            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
              서버 설정에 따라 RunPod로 <code>prompt</code>만 보내거나(<code>RUNPOD_INPUT_PROMPT_ONLY=1</code>),{" "}
              <code>prompt</code>+Comfy API용 <code>workflow</code>를 같이 보냅니다. 워크플로 템플릿 파일은{" "}
              <code>z image+rmbg (1).json</code> 하나만 씁니다.
            </div>
          </div>
          <textarea
            className={styles.textarea}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="예: 춤추는 고양이는 행복해보였어"
            spellCheck={false}
          />

          <div className={styles.previewLabel}>하이라이트 (클릭)</div>
          <div className={styles.previewBox} aria-label="하이라이트 프리뷰">
            <HighlightText text={text} candidates={candidates} onPick={generate} />
          </div>
        </section>

        <section className={styles.resultSection}>
          <div className={styles.resultMeta}>
            <div className={styles.metaLine}>
              <span className={styles.metaKey}>선택</span>
              <span className={styles.metaVal}>{selected || "-"}</span>
            </div>
            <div className={styles.metaLine}>
              <span className={styles.metaKey}>상태</span>
              <span className={styles.metaVal}>
                {status === "loading" ? "생성 중" : status === "error" ? "에러" : "—"}
              </span>
            </div>
            <div className={styles.metaLine}>
              <span className={styles.metaKey}>job_id</span>
              <span className={styles.metaVal}>{jobId || "-"}</span>
            </div>
          </div>

          {status === "error" && error ? (
            <div className={styles.errorBox} style={{ whiteSpace: "pre-wrap" }}>
              {toKoreanRunpodMessage(error, hint)}
              <div style={{ height: 12 }} />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" onClick={retry} disabled={!lastTermRef.current}>
                  다시 시도
                </button>
                <button type="button" onClick={cancel}>
                  취소
                </button>
              </div>
            </div>
          ) : null}

          <div className={styles.canvas} aria-label="생성 이미지">
            {status === "loading" ? (
              <div className={styles.loadingCard}>
                생성 중…
                {elapsedMs ? (
                  <div style={{ marginTop: 8, opacity: 0.85, fontSize: 13 }}>{Math.floor(elapsedMs / 1000)}초 경과</div>
                ) : null}
                {runpodStatus ? (
                  <div style={{ marginTop: 6, opacity: 0.75, fontSize: 12 }}>RunPod: {runpodStatus}</div>
                ) : null}
                <div style={{ marginTop: 10, display: "flex", justifyContent: "center" }}>
                  <button type="button" onClick={cancel}>
                    취소
                  </button>
                </div>
                {hint ? (
                  <>
                    <div style={{ height: 10 }} />
                    <div style={{ opacity: 0.9, fontSize: 13, lineHeight: 1.45 }}>{hint}</div>
                  </>
                ) : null}
              </div>
            ) : null}
            {status !== "loading" && mainImage ? <img className={styles.mainImg} src={mainImage} alt="generated" /> : null}
            {status !== "loading" && !mainImage ? <div className={styles.emptyCard}>이미지가 여기에 표시됩니다</div> : null}
          </div>
        </section>
      </div>
    </main>
  );
}

