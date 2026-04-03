import styles from "@/styles/Text.module.css";
import { useTextLogic } from "./logic";
import { useRef } from "react";
import GradientText from "@/components/ui/GradientText";

const AVATAR_1 = "https://www.figma.com/api/mcp/asset/18dff48d-f38a-47be-a34a-04b06dd781d0";
const AVATAR_2 = "https://www.figma.com/api/mcp/asset/77875335-69e8-49ba-a511-c42c87bda56f";

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeSpace(str) {
  return String(str || "").replace(/\s+/g, " ").trim();
}

function candidateToPattern(candidate) {
  // 후보 내 공백은 원문에서의 공백/줄바꿈/다중공백과 매칭되도록 \s+ 로 변환
  const norm = normalizeSpace(candidate);
  const escaped = escapeRegExp(norm);
  return escaped.replace(/\\\s+/g, "\\s+");
}

function findCandidateAtCaret(text, candidates, caretIndex) {
  const value = String(text || "");
  const list = (candidates || []).filter(Boolean);
  const idx = Math.max(0, Math.min(Number(caretIndex || 0), value.length));
  if (!value || list.length === 0) return null;

  const sorted = list.slice().sort((a, b) => b.length - a.length);
  for (const c of sorted) {
    const pat = candidateToPattern(c);
    if (!pat) continue;
    const re = new RegExp(pat, "g");
    let m;
    // eslint-disable-next-line no-cond-assign
    while ((m = re.exec(value))) {
      const start = m.index;
      const end = start + String(m[0] || "").length;
      if (idx >= start && idx <= end) return c;
      if (re.lastIndex === m.index) re.lastIndex += 1;
    }
  }
  return null;
}

function HighlightText({ text, candidates, onPick, guide, sourceMessageId }) {
  const list = (candidates || []).filter(Boolean);
  if (!text || list.length === 0) return text;

  const normalizedMap = new Map(list.map((c) => [normalizeSpace(c), c]));

  const pattern = list
    .slice()
    .sort((a, b) => b.length - a.length)
    .map(candidateToPattern)
    .join("|");

  if (!pattern) return text;
  const re = new RegExp(`(${pattern})`, "g");
  const parts = String(text).split(re);

  let guideUsed = false;
  return parts.map((p, idx) => {
    const key = normalizeSpace(p);
    const canonical = normalizedMap.get(key);
    const hit = Boolean(canonical);
    if (!hit) return <span key={idx}>{p}</span>;
    const isGuide = Boolean(!guideUsed && guide);
    if (isGuide) guideUsed = true;
    return (
      <button
        key={idx}
        type="button"
        className={isGuide ? `${styles.candidateBtn} ${styles.candidateBtnGuide}` : styles.candidateBtn}
        onClick={() => onPick(canonical, sourceMessageId)}
      >
        <GradientText
          inline
          className={styles.candidateGradient}
          colors={["#5227FF", "#FF9FFC", "#B19EEF"]}
          animationSpeed={6}
          pauseOnHover
        >
          {p}
        </GradientText>
      </button>
    );
  });
}

function InputMirror({ text, candidates, selected }) {
  const value = String(text || "");
  const list = (candidates || []).filter(Boolean);
  if (!value) return <span className={styles.inputMirrorText}>{value}</span>;
  if (list.length === 0) return <span className={styles.inputMirrorText}>{value}</span>;

  const normalizedMap = new Map(list.map((c) => [normalizeSpace(c), c]));
  const pattern = list
    .slice()
    .sort((a, b) => b.length - a.length)
    .map(candidateToPattern)
    .join("|");
  if (!pattern) return <span className={styles.inputMirrorText}>{value}</span>;

  const re = new RegExp(`(${pattern})`, "g");
  const parts = value.split(re);

  return parts.map((p, idx) => {
    const key = normalizeSpace(p);
    const canonical = normalizedMap.get(key);
    const hit = Boolean(canonical);
    if (!hit) {
      return (
        <span key={idx} className={styles.inputMirrorText}>
          {p}
        </span>
      );
    }
    const isSelected = canonical === selected;
    return (
      <span key={idx} className={isSelected ? `${styles.draftCandidate} ${styles.draftCandidateSelected}` : styles.draftCandidate}>
        <GradientText
          inline
          className={styles.draftCandidateGradient}
          colors={["#5227FF", "#FF9FFC", "#B19EEF"]}
          animationSpeed={6}
          pauseOnHover
        >
          {p}
        </GradientText>
      </span>
    );
  });
}

function BubbleText({ message, onPick, guide }) {
  if (message.parts && Array.isArray(message.parts)) {
    return message.parts.map((p, idx) => {
      const clean = String(p.text || "").replace(/\n[ \t]+/g, "\n");
      if (p.tone === "pinkGlow") {
        return (
          <GradientText
            key={idx}
            inline
            className={styles.inlineGradient}
            colors={["#FF9FFC", "#5227FF", "#B19EEF"]}
            animationSpeed={8}
            pauseOnHover
          >
            {clean}
          </GradientText>
        );
      }
      if (p.tone === "blueGlow") {
        return (
          <GradientText
            key={idx}
            inline
            className={styles.inlineGradient}
            colors={["#1F6998", "#4CC9FF", "#B19EEF"]}
            animationSpeed={8}
            pauseOnHover
          >
            {clean}
          </GradientText>
        );
      }
      return <span key={idx}>{clean}</span>;
    });
  }

  if (message.role === "user" && message.candidates?.length) {
    return (
      <HighlightText
        text={message.text}
        candidates={message.candidates}
        onPick={onPick}
        guide={guide}
        sourceMessageId={message.id}
      />
    );
  }

  return message.text;
}

export default function TextPage() {
  const {
    step,
    nickname,
    setNickname,
    proceedNickname,
    joinChat,
    dateText,
    timeline,
    revealedCount,
    input,
    setInput,
    listRef,
    canSend,
    send,
    hasUserMessage,
    showComposer,
    selectCandidate,
    guideMessageId,
    draftSelectedTerm,
    setDraftSelectedTerm,
    liveCandidates,
    draftPreviewColors,
    draftPreviewImages,
    draftPreviewVideoUrl,
    draftPromptRequest,
    draftPromptSent,
    draftGenerateStatus,
    draftGenerateError,
    draftPreviewIndex,
    setDraftPreviewIndex,
    completeDraftWithPreview,
    goNext
  } = useTextLogic();
  const nicknameRef = useRef(null);
  const composerRef = useRef(null);

  return (
    <main className={styles.page}>
      {step === "nickname" ? (
        <div className={styles.onboardingPhone + " " + styles.phoneGreen}>
          <div className={styles.onboardingCenter}>
            <div className={styles.prompt}>
              <div className={styles.promptSmall}>입장하기 전에</div>
              <div className={styles.promptBig}>사용자님의 이름을 알려주세요!</div>
            </div>

            <div
              className={styles.capsule}
              onClick={() => {
                nicknameRef.current?.focus();
              }}
            >
              <input
                className={styles.nicknameInput}
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") proceedNickname();
                }}
                placeholder=""
                aria-label="닉네임"
                ref={nicknameRef}
              />
            </div>

            {nickname.trim() ? (
              <button className={styles.nicknameNext} type="button" onClick={proceedNickname}>
                다음
              </button>
            ) : null}
          </div>
        </div>
      ) : step === "join" ? (
        <div className={styles.onboardingPhone + " " + styles.phoneBlue}>
          <div className={styles.onboardingCenter}>
            <div className={styles.avatarStack} aria-hidden="true">
              <div className={styles.avatarOne}>
                <img className={styles.avatarImg} src={AVATAR_1} alt="" />
              </div>
              <div className={styles.avatarTwo}>
                <img className={styles.avatarImg} src={AVATAR_2} alt="" />
              </div>
            </div>
            <button className={styles.joinBtn} type="button" onClick={joinChat}>
              채팅방 입장
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.chatPhone}>
          <div className={styles.chatDate}>{dateText}</div>

          <div ref={listRef} className={styles.chatStream} aria-label="채팅">
            {timeline.slice(0, revealedCount).map((m) => {
              if (m.type === "system") {
                return (
                  <div key={m.id} className={styles.chatSystem}>
                    {m.text}
                  </div>
                );
              }

              if (m.type === "analysis") {
                const a = m.analysis || {};
                return (
                  <div key={m.id} className={styles.analysisRow}>
                    <div className={styles.analysisCard}>
                      <div className={styles.analysisLine}>1. 캐릭터: {a.character || "-"}</div>
                      <div className={styles.analysisLine}>
                        2. 행동 및 감정: {a.action || "-"} / {a.emotion || "-"}
                      </div>
                      <div className={styles.analysisLine}>3. 외형 묘사 및 특징: {a.appearance || "-"}</div>
                      <div className={styles.analysisLine}>
                        4. 소품 및 특수 소품: {(a.props && a.props.length ? a.props.join(", ") : "-")}
                      </div>
                      <div className={styles.analysisLine}>5. 이미지 저장 이름: {a.saveName || "-"}</div>
                      <div className={styles.analysisLine}>6. 이미지 생성 프롬프트: {a.imagePrompt || "-"}</div>
                      <div className={styles.analysisLine}>
                        7. 제목/표현어: {a.title || "-"} / {a.expressionWord || "-"}
                      </div>
                    </div>
                  </div>
                );
              }

              if (m.type === "image") {
                return (
                  <div key={m.id} className={styles.introRow}>
                    <div className={styles.introAvatar}>
                      <img
                        className={styles.introAvatarImg}
                        src={m.speaker === "B" ? AVATAR_1 : AVATAR_2}
                        alt=""
                      />
                    </div>
                    <div className={styles.figImageCard}>
                      <div className={styles.figImageLabel}>{m.label || "예시"}</div>
                      <img className={styles.figImage} src={m.src} alt={m.label || ""} />
                      {m.reaction ? <div className={styles.figReaction}>{m.reaction}</div> : null}
                    </div>
                  </div>
                );
              }

              if (m.type === "generatedImage") {
                const isSelected = Number(m.index) === Number(m.selectedIndex);
                return (
                  <div key={m.id} className={styles.introRow}>
                    <div className={styles.introAvatar}>
                      <img className={styles.introAvatarImg} src={AVATAR_2} alt="" />
                    </div>
                    <div className={styles.figImageCard}>
                      <div className={styles.figImageLabel}>{isSelected ? "선택된 이미지" : "생성 이미지"}</div>
                      {m.src ? (
                        <img
                          className={isSelected ? `${styles.figImage} ${styles.figImageSelected}` : styles.figImage}
                          src={m.src}
                          alt={isSelected ? "선택된 생성 이미지" : "생성 이미지"}
                        />
                      ) : (
                        <div
                          className={isSelected ? `${styles.figColorPreview} ${styles.figColorPreviewSelected}` : styles.figColorPreview}
                          style={{ background: m.color || "#D1D5DB" }}
                          aria-label={isSelected ? "선택된 생성 이미지" : "생성 이미지"}
                        />
                      )}
                    </div>
                  </div>
                );
              }

              if (m.type === "generatedVideo") {
                return (
                  <div key={m.id} className={styles.introRow}>
                    <div className={styles.introAvatar}>
                      <img className={styles.introAvatarImg} src={AVATAR_2} alt="" />
                    </div>
                    <div className={styles.figImageCard}>
                      <div className={styles.figImageLabel}>생성 비디오</div>
                      {m.src ? (
                        <video className={styles.figImage} src={m.src} controls loop muted playsInline />
                      ) : (
                        <div className={styles.figColorPreview} aria-label="생성 비디오" />
                      )}
                    </div>
                  </div>
                );
              }

              const bubbleClass =
                m.variant === "userWhite"
                  ? styles.userBubble
                  : m.variant === "blue"
                  ? styles.figBubbleBlue
                  : m.variant === "yellowPink"
                    ? styles.figBubbleYellowPink
                    : styles.figBubbleYellow;

              return (
                <div key={m.id} className={styles.introRow}>
                  <div className={styles.introAvatar}>
                    {m.role === "user" ? (
                      <div className={styles.userAvatar} aria-hidden="true" />
                    ) : (
                      <img
                        className={styles.introAvatarImg}
                        src={m.speaker === "B" ? AVATAR_1 : AVATAR_2}
                        alt=""
                      />
                    )}
                  </div>
                  <div className={bubbleClass}>
                    <BubbleText message={m} onPick={selectCandidate} guide={m.id === guideMessageId} />
                  </div>
                </div>
              );
            })}
          </div>

          {showComposer ? (
            <div className={styles.figComposer}>
              <div className={draftSelectedTerm ? `${styles.composerPill} ${styles.composerPillActive}` : styles.composerPill}>
                {draftSelectedTerm ? "제이모지 생성 시작" : "제이모지 생성"}
              </div>
              {draftGenerateStatus === "loading" ? (
                <div className={styles.comfyHint} aria-live="polite">
                  이미지 생성 중...
                </div>
              ) : null}
              {draftGenerateStatus === "error" && draftGenerateError ? (
                <div className={styles.comfyHintError} aria-live="polite">
                  {draftGenerateError}
                </div>
              ) : null}
              {draftSelectedTerm ? (
                <div className={styles.draftPromptCard} aria-label="Comfy 프롬프트 미리보기">
                  <div className={styles.draftPromptTitle}>Comfy 프롬프트 미리보기</div>
                  <div className={styles.draftPromptLine}>
                    <span className={styles.draftPromptKey}>요청</span>
                    <span className={`${styles.draftPromptVal} ${styles.draftPromptMono}`}>{draftPromptRequest || "-"}</span>
                  </div>
                  <div className={styles.draftPromptLine}>
                    <span className={styles.draftPromptKey}>Comfy 전송</span>
                    <span className={`${styles.draftPromptVal} ${styles.draftPromptMono}`}>
                      {draftPromptSent ? `${draftPromptSent} (번역됨)` : "(생성 후 meta.promptSent로 확정)"}
                    </span>
                  </div>
                </div>
              ) : null}
              <form
                className={styles.figComposerInner}
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
              >
                <div className={styles.inputWrap}>
                  <div className={styles.draftPreviewRow} aria-label="이미지 생성 프리뷰">
                    <button
                      type="button"
                      className={
                        draftPreviewIndex === 0
                          ? `${styles.draftPreviewBox} ${styles.draftPreviewSelected}`
                          : styles.draftPreviewBox
                      }
                      style={
                        draftPreviewImages?.[0]
                          ? undefined
                          : { background: draftPreviewColors?.[0] || "#D1D5DB" }
                      }
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setDraftPreviewIndex(0);
                        completeDraftWithPreview(0);
                      }}
                      aria-label="프리뷰 1 선택"
                    >
                      {draftPreviewImages?.[0] ? (
                        <span className={styles.draftPreviewAlpha}>
                          <img className={styles.draftPreviewImg} src={draftPreviewImages[0]} alt="" />
                        </span>
                      ) : null}
                      {draftGenerateStatus === "loading" ? <span className={styles.draftPreviewLoading} aria-hidden="true" /> : null}
                    </button>
                    <button
                      type="button"
                      className={
                        draftPreviewIndex === 1
                          ? `${styles.draftPreviewBox} ${styles.draftPreviewSelected}`
                          : styles.draftPreviewBox
                      }
                      style={
                        draftPreviewImages?.[1]
                          ? undefined
                          : { background: draftPreviewColors?.[1] || "#E5E7EB" }
                      }
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setDraftPreviewIndex(1);
                        completeDraftWithPreview(1);
                      }}
                      aria-label="프리뷰 2 선택"
                    >
                      {draftPreviewImages?.[1] ? (
                        <span className={styles.draftPreviewAlpha}>
                          <img className={styles.draftPreviewImg} src={draftPreviewImages[1]} alt="" />
                        </span>
                      ) : null}
                      {draftGenerateStatus === "loading" ? <span className={styles.draftPreviewLoading} aria-hidden="true" /> : null}
                    </button>
                  </div>
                  {draftPreviewVideoUrl && draftGenerateStatus !== "loading" ? (
                    <div className={styles.draftVideoRow} aria-label="비디오 생성 프리뷰">
                      <video className={styles.draftVideo} src={draftPreviewVideoUrl} controls loop muted playsInline />
                    </div>
                  ) : null}
                  <div
                    className={styles.inputMirror}
                    onMouseDown={(e) => {
                      // 후보 클릭이 아닌 곳을 눌러도 입력에 포커스
                      if (e.target.closest("button")) return;
                      e.preventDefault();
                      composerRef.current?.focus();
                    }}
                    aria-hidden="true"
                  >
                    <InputMirror
                      text={input}
                      candidates={liveCandidates}
                      selected={draftSelectedTerm}
                    />
                  </div>
                  <textarea
                    ref={composerRef}
                    className={styles.figTextarea}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onClick={(e) => {
                      const el = e.currentTarget;
                      const idx = el.selectionStart ?? 0;
                      const term = findCandidateAtCaret(el.value, liveCandidates, idx);
                      if (term) setDraftSelectedTerm(term);
                    }}
                    rows={2}
                    spellCheck={false}
                  />
                </div>
                <button className={styles.figSend} type="submit" disabled={!canSend} aria-label="전송">
                  ↗
                </button>
              </form>
            </div>
          ) : null}

          {showComposer && (hasUserMessage || canSend) ? (
            <button className={styles.nextAfterSend} type="button" onClick={goNext}>
              다음
            </button>
          ) : null}
        </div>
      )}
    </main>
  );
}

