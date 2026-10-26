"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { AuthPanel } from "@/components/auth-panel";
import { FuriganaText } from "@/components/furigana-text";
import { ConfettiCanvas } from "@/components/confetti";
import {
  playCorrectSound,
  playIncorrectSound,
  playVictorySound,
  setAudioFeedbackEnabled,
  useAudioFeedbackEnabled,
} from "@/lib/audio-feedback";
import { isSpeechSupported, speakJapanese } from "@/lib/speech";
import { lessons, type Lesson } from "@/lib/data";
import { hasSupabaseConfig, supabase } from "@/lib/supabase-client";
import {
  generateVocabQuestions,
  type VocabDirection,
  type VocabItem,
  type VocabQuestionCount,
  type VocabQuizQuestion,
} from "@/lib/vocab-quiz-domain";

type Summary = {
  correct: number;
  total: number;
  score: number;
};

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Yêu cầu không thành công.");
  return data as T;
}

export function VocabQuizPage({ lessonKey, demo = false }: { lessonKey?: string; demo?: boolean }) {
  const lesson = lessons.find(entry => entry.id === lessonKey);

  if (!lesson) {
    return (
      <div className="stack" style={{ gap: 24 }}>
        <div>
          <div className="eyebrow">KIỂM TRA TỪ VỰNG · MINNA NO NIHONGO</div>
          <h1 className="page-title" style={{ margin: "4px 0 8px" }}>Quiz Từ vựng</h1>
          <p className="muted" style={{ margin: 0 }}>
            Chọn bài học để làm bài kiểm tra từ vựng hai chiều: Nhật ➔ Việt và Việt ➔ Nhật.
          </p>
        </div>

        <div className="grid grid-3">
          {lessons.map(entry => (
            <Link
              className="card card-interactive stack"
              key={entry.id}
              href={`/vocab-quiz?lesson=${entry.id}`}
              style={{ padding: 20 }}
            >
              <span className="tag">Volume {entry.volume}</span>
              <strong style={{ fontSize: 18 }}>Bài {entry.number}</strong>
              <span className="muted" style={{ fontSize: 14 }}>Vào làm Quiz từ vựng →</span>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  return <LessonVocabQuiz key={lesson.id} lesson={lesson} demo={demo} />;
}

function LessonVocabQuiz({ lesson, demo = false }: { lesson: Lesson; demo?: boolean }) {
  const authVersion = useRef(0);
  const startedAt = useRef(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(!hasSupabaseConfig || demo);
  const [vocabItems, setVocabItems] = useState<VocabItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const soundOn = useAudioFeedbackEnabled();

  // Settings
  const [direction, setDirection] = useState<VocabDirection>("mixed");
  const [countChoice, setCountChoice] = useState<VocabQuestionCount>(20);

  // Play session state
  const [sessionQuestions, setSessionQuestions] = useState<VocabQuizQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<{
    correct: boolean;
    answer: string;
    correctAnswer: string;
  } | null>(null);
  const [attempts, setAttempts] = useState<{ questionId: string; correct: boolean }[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);
  const [animClass, setAnimClass] = useState("");
  const [showConfetti, setShowConfetti] = useState(false);

  function toggleSound() {
    setAudioFeedbackEnabled(!soundOn);
  }

  // Auth setup
  useEffect(() => {
    if (demo || !hasSupabaseConfig) return;
    const client = supabase;
    if (!client) return;
    let active = true;
    const version = authVersion.current;
    void client.auth.getUser().then(({ data, error: authError }) => {
      if (!active || authVersion.current !== version) return;
      setUserId(authError ? null : (data.user?.id ?? null));
      setAuthReady(true);
    });
    const { data: { subscription } } = client.auth.onAuthStateChange((event, authSession) => {
      if (!active) return;
      if (event !== "INITIAL_SESSION") authVersion.current += 1;
      setUserId(authSession?.user?.id ?? null);
      setAuthReady(true);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, [demo]);

  // Start / restart quiz session
  const startQuizSessionWith = useCallback((items: VocabItem[], count: VocabQuestionCount, dir: VocabDirection) => {
    if (items.length < 2) return;
    const q = generateVocabQuestions(items, count, dir);
    setSessionQuestions(q);
    setIndex(0);
    setAnswer("");
    setFeedback(null);
    setAttempts([]);
    setSummary(null);
    setShowConfetti(false);
    setAnimClass("");
    startedAt.current = Date.now();
  }, []);

  const startQuizSession = useCallback(() => {
    startQuizSessionWith(vocabItems, countChoice, direction);
  }, [vocabItems, countChoice, direction, startQuizSessionWith]);

  // Load vocabulary items for this lesson
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) return;
      setLoading(true);
      setError("");
      try {
        const data = await jsonRequest<{ items: VocabItem[] }>(
          `/api/quiz/vocab?lessonKey=${encodeURIComponent(lesson.id)}`
        );
        if (!active) return;
        setVocabItems(data.items);
        if (data.items.length >= 2) {
          startQuizSessionWith(data.items, countChoice, direction);
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Không tải được từ vựng.");
      } finally {
        if (active) setLoading(false);
      }
    });
    return () => { active = false; };
  }, [lesson.id, countChoice, direction, startQuizSessionWith]);

  const currentQ = sessionQuestions[index];
  const isAnswered = feedback !== null;
  const isLastQuestion = index >= sessionQuestions.length - 1;

  // Submit answer
  const submitAnswer = useCallback(() => {
    if (!currentQ || !answer.trim() || feedback || busy) return;
    const isCorrect = answer === currentQ.correctAnswer;
    const newFeedback = {
      correct: isCorrect,
      answer,
      correctAnswer: currentQ.correctAnswer,
    };
    setFeedback(newFeedback);

    if (isCorrect) {
      playCorrectSound();
      setAnimClass("animate-success");
    } else {
      playIncorrectSound();
      setAnimClass("animate-shake");
    }

    setAttempts(curr => [...curr, { questionId: currentQ.id, correct: isCorrect }]);
  }, [currentQ, answer, feedback, busy]);

  // Advance to next question or finish
  const handleNextOrFinish = useCallback(async () => {
    if (busy) return;
    if (!isLastQuestion) {
      setIndex(curr => curr + 1);
      setAnswer("");
      setFeedback(null);
      setAnimClass("");
      startedAt.current = Date.now();
    } else {
      // Calculate final summary
      const total = sessionQuestions.length;
      const correct = attempts.filter(a => a.correct).length;
      const score = total > 0 ? Math.round((correct / total) * 100) : 0;
      const finalSummary: Summary = { correct, total, score };
      setSummary(finalSummary);
      setFeedback(null);
      setAnswer("");
      setAnimClass("");

      if (score >= 80) {
        playVictorySound();
        setShowConfetti(true);
      }

      // Save result if user logged in
      if (userId && !demo) {
        setBusy(true);
        try {
          await jsonRequest("/api/quiz/vocab", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              lessonKey: lesson.id,
              correct,
              total,
              score,
              elapsedMs: Math.min(Date.now() - startedAt.current, 86_400_000),
            }),
          });
        } catch {
          // Non-blocking error for background progress save
        } finally {
          setBusy(false);
        }
      }
    }
  }, [busy, isLastQuestion, sessionQuestions.length, attempts, userId, demo, lesson.id]);

  // Keyboard navigation: 1, 2, 3, 4 to choose; Enter to submit / proceed
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.isComposing || (event as unknown as { keyCode: number }).keyCode === 229) return;
      const isInput = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
      if (isInput) return;

      // Number keys 1-4
      if (!feedback && currentQ) {
        const num = parseInt(event.key, 10);
        if (num >= 1 && num <= currentQ.options.length) {
          event.preventDefault();
          setAnswer(currentQ.options[num - 1]);
          setAnimClass("");
          return;
        }
      }

      // Enter key
      if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
        if (!feedback) {
          if (answer.trim() && !busy) {
            event.preventDefault();
            submitAnswer();
          }
        } else {
          event.preventDefault();
          void handleNextOrFinish();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [feedback, currentQ, answer, busy, submitAnswer, handleNextOrFinish]);

  // Progress percentage
  const progressPercent = useMemo(() => {
    if (sessionQuestions.length === 0) return 0;
    return Math.round(((index + (feedback ? 1 : 0)) / sessionQuestions.length) * 100);
  }, [index, feedback, sessionQuestions.length]);

  return (
    <div className="stack" style={{ gap: 24 }}>
      {showConfetti && <ConfettiCanvas onDone={() => setShowConfetti(false)} />}

      {/* Top action bar */}
      <div className="lesson">
        <Link className="muted" href={`/lessons/${lesson.id}`}>← Quay lại bài học</Link>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button
            className="tag"
            type="button"
            onClick={toggleSound}
            aria-label={soundOn ? "Tắt âm thanh hiệu ứng" : "Bật âm thanh hiệu ứng"}
          >
            {soundOn ? "🔊 Âm thanh: Bật" : "🔇 Âm thanh: Tắt"}
          </button>
          <Link className="btn secondary" href="/vocab-quiz" style={{ padding: "6px 14px", fontSize: 14 }}>
            Đổi bài
          </Link>
        </div>
      </div>

      {/* Header */}
      <div className="lesson">
        <div>
          <div className="eyebrow">VOLUME {lesson.volume} · BÀI {lesson.number}</div>
          <h1 className="page-title" style={{ margin: "4px 0" }}>Quiz Từ vựng</h1>
          <p className="muted" style={{ margin: 0, fontSize: 15 }}>
            Rèn phản xạ nhanh nghĩa từ vựng hai chiều (Nhật ➔ Việt & Việt ➔ Nhật)
          </p>
        </div>
      </div>

      {hasSupabaseConfig && !authReady && <p className="muted">Đang kiểm tra đăng nhập…</p>}
      {hasSupabaseConfig && authReady && !userId && !demo && (
        <div className="stack">
          <p className="muted">Đăng nhập để lưu tiến độ và điểm số Quiz từ vựng.</p>
          <AuthPanel />
        </div>
      )}

      {loading && (
        <div className="card stack">
          <div className="skeleton-shimmer" style={{ height: 28, width: "40%" }} />
          <div className="skeleton-shimmer" style={{ height: 20, width: "80%" }} />
          <div className="skeleton-shimmer" style={{ height: 48, width: "100%" }} />
        </div>
      )}

      {error && <p role="alert" style={{ color: "var(--red)" }}>{error}</p>}

      {/* Session Controls: Options for Direction & Question Count */}
      {vocabItems.length >= 2 && !summary && (
        <div className="card" style={{ padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          {/* Direction Filter */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>CHIỀU HỎI:</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                className={`tag ${direction === "mixed" ? "active" : ""}`}
                style={{ cursor: "pointer", padding: "6px 12px", fontSize: 13, background: direction === "mixed" ? "var(--blue)" : "var(--surface)", color: direction === "mixed" ? "#fff" : "inherit" }}
                onClick={() => {
                  setDirection("mixed");
                  startQuizSessionWith(vocabItems, countChoice, "mixed");
                }}
                title="Trộn ngẫu nhiên câu hỏi cả 2 chiều"
              >
                🔀 Hỗn hợp
              </button>
              <button
                type="button"
                className={`tag ${direction === "ja_to_vi" ? "active" : ""}`}
                style={{ cursor: "pointer", padding: "6px 12px", fontSize: 13, background: direction === "ja_to_vi" ? "var(--blue)" : "var(--surface)", color: direction === "ja_to_vi" ? "#fff" : "inherit" }}
                onClick={() => {
                  setDirection("ja_to_vi");
                  startQuizSessionWith(vocabItems, countChoice, "ja_to_vi");
                }}
                title="Hỏi từ tiếng Nhật, chọn nghĩa tiếng Việt"
              >
                🇯🇵 ➔ 🇻🇳 Nhật-Việt
              </button>
              <button
                type="button"
                className={`tag ${direction === "vi_to_ja" ? "active" : ""}`}
                style={{ cursor: "pointer", padding: "6px 12px", fontSize: 13, background: direction === "vi_to_ja" ? "var(--blue)" : "var(--surface)", color: direction === "vi_to_ja" ? "#fff" : "inherit" }}
                onClick={() => {
                  setDirection("vi_to_ja");
                  startQuizSessionWith(vocabItems, countChoice, "vi_to_ja");
                }}
                title="Hỏi nghĩa tiếng Việt, chọn từ tiếng Nhật"
              >
                🇻🇳 ➔ 🇯🇵 Việt-Nhật
              </button>
            </div>
          </div>

          {/* Count Filter */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>SỐ CÂU:</span>
            <div style={{ display: "flex", gap: 6 }}>
              {([10, 20, "all"] as const).map(cnt => (
                <button
                  key={cnt}
                  type="button"
                  className={`tag ${countChoice === cnt ? "active" : ""}`}
                  style={{
                    cursor: "pointer",
                    padding: "6px 12px",
                    fontSize: 13,
                    background: countChoice === cnt ? "var(--blue)" : "var(--surface)",
                    color: countChoice === cnt ? "#fff" : "inherit",
                  }}
                  onClick={() => {
                    setCountChoice(cnt);
                    startQuizSessionWith(vocabItems, cnt, direction);
                  }}
                >
                  {cnt === "all" ? `Tất cả (${vocabItems.length})` : `${cnt} câu`}
                </button>
              ))}
              <button
                type="button"
                className="btn secondary"
                style={{ padding: "6px 14px", fontSize: 13 }}
                onClick={startQuizSession}
                title="Áp dụng tùy chọn và xáo trộn lại câu hỏi"
              >
                🔄 Trộn lại
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Summary View */}
      {summary && (
        <section className="card stack animate-success" aria-live="polite" style={{ gap: 16, padding: "28px 24px" }}>
          <div className="eyebrow" style={{ color: "var(--blue)" }}>HOÀN THÀNH QUIZ TỪ VỰNG</div>
          <h2 className="section-title" style={{ margin: 0 }}>Kết quả lượt thi</h2>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <strong style={{ fontSize: "clamp(36px, 5vw, 48px)", color: summary.score >= 80 ? "var(--green)" : "var(--blue)" }}>
              {summary.correct} / {summary.total}
            </strong>
            <span style={{ fontSize: 24, fontWeight: 700, color: "var(--muted)" }}>
              ({summary.score}%)
            </span>
          </div>

          <p className="muted" style={{ fontSize: 16, margin: 0 }}>
            {summary.score >= 90
              ? "Tuyệt vời! Bạn ghi nhớ từ vựng bài này vô cùng chuẩn xác."
              : summary.score >= 70
              ? "Rất tốt! Phản xạ từ vựng của bạn đã tiến bộ đáng kể."
              : "Hãy làm lại một lượt nữa để củng cố các từ vừa chọn nhầm nhé!"}
          </p>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
            <button className="btn" type="button" onClick={startQuizSession} style={{ fontSize: 16, padding: "12px 24px" }}>
              🔄 Làm lại lượt mới
            </button>
            <Link className="btn secondary" href={`/lessons/${lesson.id}/vocabulary`}>
              📖 Xem lại bảng từ vựng
            </Link>
            <Link className="btn secondary" href={`/quiz?lesson=${lesson.id}`}>
              📝 Thử Quiz ngữ pháp bài này
            </Link>
          </div>
        </section>
      )}

      {/* Active Question Playing Screen */}
      {!summary && currentQ && (
        <section className={`card stack ${animClass}`} style={{ gap: 20 }}>
          {/* Progress Bar & Header */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span className="eyebrow" style={{ margin: 0 }}>
                CÂU {index + 1} / {sessionQuestions.length}
              </span>
              <span className="tag" style={{ fontSize: 12 }}>
                {currentQ.type === "ja_to_vi" ? "🇯🇵 ➔ 🇻🇳 Tiếng Nhật sang Tiếng Việt" : "🇻🇳 ➔ 🇯🇵 Tiếng Việt sang Tiếng Nhật"}
              </span>
            </div>
            {/* Visual Progress Line */}
            <div style={{ height: 6, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${progressPercent}%`,
                  background: "var(--blue)",
                  transition: "width 0.25s ease",
                }}
              />
            </div>
          </div>

          {/* Question Prompt */}
          <div className="stack" style={{ gap: 8 }}>
            <span className="muted" style={{ fontSize: 15, fontWeight: 500 }}>
              {currentQ.promptLabel}
            </span>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              {currentQ.type === "ja_to_vi" ? (
                // Japanese Word Question: large text with Furigana
                <div style={{ fontSize: "clamp(30px, 4.5vw, 42px)", lineHeight: 1.6, fontWeight: 700 }}>
                  <FuriganaText text={currentQ.promptDisplay} enableTooltip={false} />
                </div>
              ) : (
                // Vietnamese Meaning Question: bold prominent text
                <div style={{ fontSize: "clamp(24px, 3.5vw, 32px)", lineHeight: 1.4, fontWeight: 700, color: "var(--text)" }}>
                  {currentQ.promptDisplay}
                </div>
              )}

              {/* Speaker audio button if question is in Japanese */}
              {isSpeechSupported() && currentQ.type === "ja_to_vi" && (
                <button
                  type="button"
                  className="btn secondary"
                  style={{ padding: "8px 16px", fontSize: 15, display: "inline-flex", alignItems: "center", gap: 6 }}
                  onClick={() => speakJapanese(currentQ.promptDisplay)}
                  title="Nghe phát âm từ vựng"
                  aria-label="Nghe phát âm từ vựng"
                >
                  🔊 Nghe
                </button>
              )}
            </div>
          </div>

          {/* Options List */}
          <div className="stack" style={{ gap: 10 }}>
            {currentQ.options.map((opt, optIdx) => {
              const isChosen = answer === opt;
              let btnVariant = isChosen ? "" : "secondary";
              let extraStyle: React.CSSProperties = {
                fontSize: 17,
                padding: "16px 20px",
                justifyContent: "flex-start",
                textAlign: "left",
                flex: 1,
              };

              if (feedback) {
                if (opt === currentQ.correctAnswer) {
                  btnVariant = "green";
                } else if (isChosen && !feedback.correct) {
                  extraStyle = {
                    ...extraStyle,
                    background: "#fbd8d1",
                    color: "var(--red)",
                    borderColor: "var(--red)",
                  };
                }
              }

              return (
                <div key={opt} style={{ display: "flex", gap: 8, alignItems: "stretch", width: "100%" }}>
                  <button
                    className={`btn ${btnVariant}`}
                    type="button"
                    aria-pressed={isChosen}
                    disabled={isAnswered || busy}
                    style={extraStyle}
                    onClick={() => {
                      setAnswer(opt);
                      setAnimClass("");
                    }}
                  >
                    <span
                      className="tag"
                      style={{
                        marginRight: 12,
                        opacity: 0.8,
                        fontSize: 13,
                        padding: "2px 8px",
                        fontWeight: 700,
                      }}
                    >
                      {optIdx + 1}
                    </span>

                    {/* Display option content */}
                    {currentQ.type === "vi_to_ja" ? (
                      <FuriganaText text={opt} enableTooltip={isAnswered} />
                    ) : (
                      <span>{opt}</span>
                    )}
                  </button>

                  {/* Audio button for Japanese options */}
                  {isSpeechSupported() && currentQ.type === "vi_to_ja" && (
                    <button
                      type="button"
                      className="btn secondary"
                      style={{ padding: "0 16px", fontSize: 16, flexShrink: 0 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        speakJapanese(opt);
                      }}
                      title="Nghe phát âm đáp án"
                      aria-label="Nghe phát âm đáp án"
                    >
                      🔊
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Feedback Display */}
          {feedback && (
            <div
              role="status"
              aria-live="polite"
              className="stack"
              style={{
                padding: "16px 20px",
                borderRadius: 12,
                background: feedback.correct ? "var(--green-light)" : "var(--red-light)",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <strong style={{ color: feedback.correct ? "var(--green)" : "var(--red)", fontSize: 18 }}>
                  {feedback.correct ? "✓ Chính xác!" : "✗ Chưa đúng."}
                </strong>

                {/* Speaker button in feedback */}
                {isSpeechSupported() && (
                  <button
                    type="button"
                    className="tag"
                    style={{
                      cursor: "pointer",
                      border: "1px solid var(--border)",
                      background: "var(--surface)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "6px 12px",
                      fontSize: 14,
                    }}
                    onClick={() => speakJapanese(currentQ.target.japanese)}
                    title="Nghe phát âm từ vựng"
                  >
                    🔊 Nghe phát âm: {currentQ.target.japanese}
                  </button>
                )}
              </div>

              <div style={{ fontSize: 16 }}>
                Đáp án đúng:{" "}
                <strong style={{ color: "var(--green)" }}>
                  {currentQ.type === "vi_to_ja" ? (
                    <FuriganaText text={currentQ.correctAnswer} enableTooltip={true} />
                  ) : (
                    currentQ.correctAnswer
                  )}
                </strong>
                {currentQ.target.part_of_speech && (
                  <span className="muted" style={{ marginLeft: 8, fontSize: 13 }}>
                    ({currentQ.target.part_of_speech})
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Navigation Action Buttons */}
          <div style={{ marginTop: 4 }}>
            {!isAnswered ? (
              <button
                className="btn"
                type="button"
                disabled={!answer.trim() || busy}
                onClick={submitAnswer}
                style={{ fontSize: 16, padding: "14px 28px" }}
              >
                Nộp đáp án (Enter ↵)
              </button>
            ) : (
              <button
                className="btn green"
                type="button"
                disabled={busy}
                onClick={() => void handleNextOrFinish()}
                style={{ fontSize: 16, padding: "14px 28px" }}
              >
                {isLastQuestion ? "Xem tổng kết Quiz (Enter ↵)" : "Câu tiếp theo → (Enter ↵)"}
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
