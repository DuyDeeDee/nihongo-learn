"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AuthPanel } from "@/components/auth-panel";
import { QuizPractice } from "@/components/practice";
import { FuriganaText } from "@/components/furigana-text";
import { ConfettiCanvas } from "@/components/confetti";
import { playCorrectSound, playIncorrectSound, playVictorySound, setAudioFeedbackEnabled, useAudioFeedbackEnabled } from "@/lib/audio-feedback";
import { isSpeechSupported, speakJapanese, extractJapaneseForSpeech } from "@/lib/speech";
import { clientCache } from "@/lib/cache";
import { lessons } from "@/lib/data";
import type { QuizQuestion } from "@/lib/quiz-domain";
import { hasSupabaseConfig, supabase } from "@/lib/supabase-client";

function hasJapanese(text?: string | null): boolean {
  return Boolean(text && /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(text));
}

function extractTranslation(prompt?: string | null, explanation?: string | null): string | null {
  if (explanation) {
    const m = explanation.match(/(?:🇻🇳\s*)?Dịch\s*(?:câu|nghĩa)?:\s*([^\n]+)/i);
    if (m) return m[1].trim();
  }
  if (prompt) {
    const parenMatch = prompt.match(/\(([^\)]*[a-zA-Zà-ỹ][^\)]*)\)/);
    if (parenMatch) return parenMatch[1].trim();
    const quoteMatch = prompt.match(/['"“]([^'"”]*[a-zA-Zà-ỹ][^'"”]*)['"”]/);
    if (quoteMatch) return quoteMatch[1].trim();
  }
  return null;
}

type PublicQuestion = Pick<QuizQuestion, "id" | "prompt" | "question_type" | "options" | "difficulty">;
type QuizBankQuestion = QuizQuestion & { question_type: "multiple_choice" | "typed" };
type Attempt = { question_id: string; answer: string; is_correct: boolean };
type QuizSession = { id: string; questions: PublicQuestion[]; attempts: Attempt[] };
type AnswerResult = { correct: boolean; answer: string; acceptedAnswers: string[]; explanation: string | null };
type Summary = { correct: number; total: number; score: number };
type Draft = {
  prompt: string;
  questionType: "multiple_choice" | "typed";
  options: string;
  answers: string;
  explanation: string;
  difficulty: string;
};
const emptyDraft: Draft = { prompt: "", questionType: "multiple_choice", options: "", answers: "", explanation: "", difficulty: "3" };

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Yêu cầu không thành công.");
  return data as T;
}

export function QuizPage({ lessonKey, demo = false }: { lessonKey?: string; demo?: boolean }) {
  if (demo || !hasSupabaseConfig) {
    return (
      <div className="stack">
        <h1 className="page-title">Quiz demo</h1>
        <p className="muted">Câu mẫu tự biên. Kết quả demo không được lưu.</p>
        <QuizPractice />
        {hasSupabaseConfig && <Link className="btn secondary" href="/quiz">Mở Quiz cá nhân</Link>}
      </div>
    );
  }
  const lesson = lessons.find(entry => entry.id === lessonKey);
  if (!lesson) {
    return (
      <div className="stack">
        <h1 className="page-title">Kiểm tra nhanh</h1>
        <p className="muted">Chọn bài học để làm Quiz và kiểm tra từ vựng, ngữ pháp.</p>
        <div className="grid grid-3">
          {lessons.map(entry => (
            <Link className="card card-interactive stack" key={entry.id} href={`/quiz?lesson=${entry.id}`}>
              <span className="tag">Volume {entry.volume}</span>
              <strong style={{ fontSize: 18 }}>Bài {entry.number}</strong>
              <span className="muted">Mở Quiz →</span>
            </Link>
          ))}
        </div>
      </div>
    );
  }
  return <LessonQuiz key={lesson.id} lesson={lesson} />;
}

function LessonQuiz({ lesson }: { lesson: (typeof lessons)[number] }) {
  const authVersion = useRef(0);
  const startedAt = useRef(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(!hasSupabaseConfig);
  const [loadedForUser, setLoadedForUser] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuizBankQuestion[]>([]);
  const [session, setSession] = useState<QuizSession | null>(null);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<AnswerResult | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [animClass, setAnimClass] = useState("");
  const [showConfetti, setShowConfetti] = useState(false);
  const soundOn = useAudioFeedbackEnabled();
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiCount, setAiCount] = useState(5);
  const [userApiKey, setUserApiKey] = useState("");
  const [aiBusy, setAiBusy] = useState(false);

  function toggleSound() {
    setAudioFeedbackEnabled(!soundOn);
  }

  useEffect(() => {
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
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) return;
      setLoadedForUser(null);
      setSession(null);
      setSummary(null);
      setFormOpen(false);
      setError("");
      if (!userId) {
        setQuestions([]);
        return;
      }

      // Check cache first for instant loading
      const cacheKey = `quiz:bank:${lesson.id}:${userId}`;
      const cached = clientCache.get<QuizBankQuestion[]>(cacheKey);
      if (cached) {
        setQuestions(cached);
      } else {
        setLoading(true);
      }

      try {
        const [bank, current] = await Promise.all([
          jsonRequest<{ questions: QuizBankQuestion[] }>(`/api/quiz/questions?lessonKey=${encodeURIComponent(lesson.id)}`),
          jsonRequest<{ session: QuizSession | null }>(`/api/quiz/session?lessonKey=${encodeURIComponent(lesson.id)}`),
        ]);
        if (!active) return;
        setQuestions(bank.questions);
        clientCache.set(cacheKey, bank.questions);
        setSession(current.session);
        startedAt.current = Date.now();
        if (current.session) {
          setIndex(Math.max(0, current.session.questions.findIndex(question =>
            !current.session?.attempts.some(attempt => attempt.question_id === question.id))));
        }
        setLoadedForUser(userId);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Không tải được Quiz.");
      } finally {
        if (active) setLoading(false);
      }
    });
    return () => { active = false; };
  }, [lesson.id, userId]);

  function change(field: keyof Draft, value: string) {
    setDraft(current => ({ ...current, [field]: value }));
  }

  function startAdd() {
    setDraft(emptyDraft);
    setEditingId(null);
    setFormOpen(true);
    setError("");
    setNotice("");
  }

  function startEdit(q: QuizBankQuestion) {
    setDraft({
      prompt: q.prompt,
      questionType: q.question_type,
      options: q.options.join("\n"),
      answers: q.accepted_answers.join("\n"),
      explanation: q.explanation ?? "",
      difficulty: String(q.difficulty ?? 3),
    });
    setEditingId(q.id);
    setFormOpen(true);
    setError("");
    setNotice("");
  }

  async function saveQuestion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const payload = {
      lessonKey: lesson.id,
      prompt: draft.prompt.trim(),
      questionType: draft.questionType,
      options: draft.questionType === "multiple_choice" ? draft.options.split("\n").map(l => l.trim()).filter(Boolean) : [],
      acceptedAnswers: draft.answers.split("\n").map(l => l.trim()).filter(Boolean),
      explanation: draft.explanation.trim(),
      difficulty: Number(draft.difficulty),
    };
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await jsonRequest<{ question: QuizBankQuestion }>("/api/quiz/questions", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId ? { id: editingId, question: payload } : payload),
      });
      const updated = editingId
        ? questions.map(q => q.id === result.question.id ? result.question : q)
        : [...questions, result.question];
      setQuestions(updated);
      if (userId) clientCache.set(`quiz:bank:${lesson.id}:${userId}`, updated);
      setFormOpen(false);
      setEditingId(null);
      setDraft(emptyDraft);
      setNotice(editingId ? "Đã sửa câu hỏi." : "Đã thêm câu hỏi.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không lưu được câu hỏi.");
    } finally { setBusy(false); }
  }

  async function deleteQuestion(q: QuizBankQuestion) {
    if (busy || !window.confirm(`Xóa câu hỏi “${q.prompt}”? Kết quả cũ của câu này cũng sẽ bị xóa.`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await jsonRequest("/api/quiz/questions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: q.id, lessonKey: lesson.id }),
      });
      const updated = questions.filter(entry => entry.id !== q.id);
      setQuestions(updated);
      if (userId) clientCache.set(`quiz:bank:${lesson.id}:${userId}`, updated);
      setNotice("Đã xóa câu hỏi.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không xóa được câu hỏi.");
    } finally { setBusy(false); }
  }

  async function handleAiGenerate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (aiBusy) return;
    setAiBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await jsonRequest<{ success: boolean; count: number; questions: QuizBankQuestion[] }>("/api/ai/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonKey: lesson.id,
          kind: "quiz",
          count: aiCount,
          apiKey: userApiKey.trim() || undefined,
        }),
      });
      const updated = [...questions, ...result.questions];
      setQuestions(updated);
      if (userId) clientCache.set(`quiz:bank:${lesson.id}:${userId}`, updated);
      playCorrectSound();
      setNotice(`Gemini đã tạo thêm ${result.count} câu hỏi trắc nghiệm cho Bài ${lesson.number}. Hãy kiểm tra đáp án trước khi học.`);
      setAiModalOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không tạo được câu hỏi từ AI.");
    } finally {
      setAiBusy(false);
    }
  }

  async function startQuiz() {
    if (busy) return;
    setBusy(true); setError(""); setNotice(""); setSummary(null); setShowConfetti(false);
    try {
      const result = await jsonRequest<{ session: QuizSession }>("/api/quiz/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonKey: lesson.id }),
      });
      setSession(result.session);
      setIndex(Math.max(0, result.session.questions.findIndex(q =>
        !result.session.attempts.some(attempt => attempt.question_id === q.id))));
      setAnswer(""); setFeedback(null); setAnimClass(""); startedAt.current = Date.now();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không bắt đầu được Quiz.");
    } finally { setBusy(false); }
  }

  const submitAnswer = useCallback(async () => {
    const q = session?.questions[index];
    if (!q || !answer.trim() || busy || feedback) return;
    setBusy(true); setError("");
    try {
      const result = await jsonRequest<AnswerResult>("/api/quiz/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session!.id,
          questionId: q.id,
          answer,
          elapsedMs: Math.min(Date.now() - startedAt.current, 86_400_000),
        }),
      });
      setFeedback(result);
      if (result.correct) {
        playCorrectSound();
        setAnimClass("animate-success");
      } else {
        playIncorrectSound();
        setAnimClass("animate-shake");
      }
      setSession(current => current ? {
        ...current,
        attempts: [
          ...current.attempts.filter(attempt => attempt.question_id !== q.id),
          { question_id: q.id, answer: result.answer, is_correct: result.correct },
        ],
      } : current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không lưu được đáp án.");
    } finally { setBusy(false); }
  }, [session, index, answer, busy, feedback]);

  const goToNextQuestion = useCallback(() => {
    if (!session) return;
    const next = session.questions.findIndex((entry, pos) => pos > index && !session.attempts.some(a => a.question_id === entry.id));
    setIndex(next >= 0 ? next : session.questions.findIndex(entry => !session.attempts.some(a => a.question_id === entry.id)));
    setAnswer("");
    setFeedback(null);
    setAnimClass("");
    startedAt.current = Date.now();
  }, [session, index]);

  const finishQuiz = useCallback(async () => {
    if (!session || busy) return;
    setBusy(true); setError("");
    try {
      const result = await jsonRequest<Summary>("/api/quiz/session", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id }),
      });
      setSummary(result);
      setSession(null);
      setFeedback(null);
      setAnswer("");
      setAnimClass("");
      if (result.score >= 70) {
        playVictorySound();
        setShowConfetti(true);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không lưu được tổng kết.");
    } finally { setBusy(false); }
  }, [session, busy]);

  const question = session?.questions[index];
  const answered = session?.attempts.some(attempt => attempt.question_id === question?.id) ?? false;
  const allAnswered = session ? session.questions.every(entry => session.attempts.some(attempt => attempt.question_id === entry.id)) : false;

  useEffect(() => {
    if (!session || !question) return;
    const currentQuestion = question;
    function handleKeyDown(event: KeyboardEvent) {
      if (formOpen || aiModalOpen) return;
      if (event.isComposing || (event as unknown as { keyCode: number }).keyCode === 229) return;
      const isInput = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;

      // Number keys 1, 2, 3, 4 to choose options in multiple-choice
      if (!isInput && !feedback && currentQuestion.question_type === "multiple_choice") {
        const num = parseInt(event.key, 10);
        if (num >= 1 && num <= currentQuestion.options.length) {
          event.preventDefault();
          setAnswer(currentQuestion.options[num - 1]);
          setAnimClass("");
          return;
        }
      }

      // Enter to submit or proceed
      if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
        if (!feedback) {
          if (answer.trim() && !busy) {
            event.preventDefault();
            void submitAnswer();
          }
        } else if (!allAnswered) {
          event.preventDefault();
          goToNextQuestion();
        } else if (allAnswered && !busy) {
          event.preventDefault();
          void finishQuiz();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [session, question, feedback, answered, allAnswered, answer, busy, formOpen, aiModalOpen, submitAnswer, goToNextQuestion, finishQuiz]);

  return (
    <div className="stack">
      {showConfetti && <ConfettiCanvas onDone={() => setShowConfetti(false)} />}
      <div className="lesson">
        <Link className="muted" href={`/lessons/${lesson.id}`}>← Quay lại bài học</Link>
        <button
          className="tag"
          type="button"
          onClick={toggleSound}
          aria-label={soundOn ? "Tắt âm thanh hiệu ứng" : "Bật âm thanh hiệu ứng"}
        >
          {soundOn ? "🔊 Âm thanh: Bật" : "🔇 Âm thanh: Tắt"}
        </button>
      </div>

      <div className="lesson">
        <div>
          <div className="eyebrow">VOLUME {lesson.volume} · BÀI {lesson.number}</div>
          <h1 className="page-title">Quiz cá nhân</h1>
        </div>
        <Link className="btn secondary" href="/quiz">Chọn bài khác</Link>
      </div>

      {hasSupabaseConfig && !authReady && <p className="muted">Đang kiểm tra đăng nhập…</p>}
      {hasSupabaseConfig && authReady && !userId && (
        <div className="stack">
          <p className="muted">Đăng nhập để tự tạo câu hỏi và lưu kết quả.</p>
          <AuthPanel />
          <Link className="btn secondary" href="/quiz?demo=1">Thử Quiz demo</Link>
        </div>
      )}

      {userId && loading && (
        <div className="card stack">
          <div className="skeleton-shimmer" style={{ height: 28, width: "40%" }} />
          <div className="skeleton-shimmer" style={{ height: 20, width: "80%" }} />
          <div className="skeleton-shimmer" style={{ height: 48, width: "100%" }} />
        </div>
      )}

      {error && <p role="alert" style={{ color: "var(--red)" }}>{error}</p>}
      {notice && <p role="status" style={{ color: "var(--green)" }}>{notice}</p>}

      {userId && loadedForUser === userId && !loading && (
        <>
          {summary && (
            <section className="card stack animate-success" aria-live="polite">
              <h2 className="section-title">Kết quả Quiz</h2>
              <strong style={{ fontSize: 32 }}>{summary.correct} / {summary.total} câu · {summary.score}%</strong>
              <p className="muted">
                {summary.score >= 80 ? "Xuất sắc! Bạn nắm rất vững kiến thức bài này." : "Điểm tốt nhất của bài đã được lưu vào tiến độ."}
              </p>
              <button className="btn" type="button" onClick={() => void startQuiz()} disabled={busy}>Làm lại</button>
            </section>
          )}

          {session && (
            <section className={`card stack ${animClass}`}>
              <div className="eyebrow">CÂU {index + 1} / {session.questions.length}</div>
              {question && (() => {
                const promptSpeechText = extractJapaneseForSpeech(question.prompt);
                const hasPromptAudio = isSpeechSupported() && hasJapanese(promptSpeechText);
                const translation = extractTranslation(question.prompt, feedback?.explanation ?? null);
                const cleanExplanation = feedback?.explanation
                  ?.replace(/(?:🇻🇳\s*)?Dịch\s*(?:câu|nghĩa)?:\s*[^\n]+/i, "")
                  .trim();

                const firstAnswer = feedback?.acceptedAnswers[0] ?? "";
                const fullSentenceText = feedback && firstAnswer && /[_＿]{1,}|[（(][\s　_]*[)）]/.test(question.prompt)
                  ? extractJapaneseForSpeech(question.prompt.replace(/[_＿]{1,}|[（(][\s　_]*[)）]/, ` ${firstAnswer} `))
                  : "";
                const hasFullSentenceAudio = isSpeechSupported() && hasJapanese(fullSentenceText);

                return (
                  <>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <h2 className="section-title" style={{ fontSize: "clamp(22px, 2.5vw, 28px)", lineHeight: 1.8, margin: 0, flex: 1 }}>
                        <FuriganaText text={question.prompt} enableTooltip />
                      </h2>
                      {hasPromptAudio && (
                        <button
                          type="button"
                          className="btn secondary"
                          style={{ padding: "8px 14px", fontSize: 15, flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6 }}
                          onClick={() => speakJapanese(promptSpeechText)}
                          title="Nghe câu tiếng Nhật"
                          aria-label="Nghe câu tiếng Nhật"
                        >
                          🔊 Nghe câu
                        </button>
                      )}
                    </div>

                    {question.question_type === "multiple_choice" ? (
                      <div className="stack" style={{ gap: 10 }}>
                        {question.options.map((option, optIdx) => {
                          const isChosen = answer === option;
                          let btnVariant = isChosen ? "" : "secondary";
                          let extraStyle: React.CSSProperties = { fontSize: 16, padding: "14px 18px", justifyContent: "flex-start", textAlign: "left", flex: 1 };

                          if (feedback) {
                            if (feedback.acceptedAnswers.includes(option)) {
                              btnVariant = "green";
                            } else if (isChosen && !feedback.correct) {
                              extraStyle = { ...extraStyle, background: "#fbd8d1", color: "var(--red)", borderColor: "var(--red)" };
                            }
                          }

                          return (
                            <div key={option} style={{ display: "flex", gap: 8, alignItems: "stretch", width: "100%" }}>
                              <button
                                className={`btn ${btnVariant}`}
                                type="button"
                                aria-pressed={isChosen}
                                disabled={answered || busy}
                                style={extraStyle}
                                onClick={() => { setAnswer(option); setAnimClass(""); }}
                              >
                                <span className="tag" style={{ marginRight: 10, opacity: 0.75, fontSize: 13, padding: "2px 8px" }}>
                                  {optIdx + 1}
                                </span>
                                <FuriganaText text={option} enableTooltip />
                              </button>
                              {isSpeechSupported() && hasJapanese(option) && (
                                <button
                                  type="button"
                                  className="btn secondary"
                                  style={{ padding: "0 14px", flexShrink: 0, fontSize: 16 }}
                                  onClick={(e) => { e.stopPropagation(); speakJapanese(option); }}
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
                    ) : (
                      <label className="stack">
                        <span className="eyebrow">CÂU TRẢ LỜI CỦA BẠN</span>
                        <input
                          className="input jp"
                          value={answer}
                          disabled={answered || busy}
                          maxLength={500}
                          onChange={event => { setAnswer(event.target.value); setAnimClass(""); }}
                          placeholder="Nhập đáp án của bạn bằng Japanese IME"
                        />
                      </label>
                    )}

                    {feedback && (
                      <div role="status" aria-live="polite" className="stack" style={{ padding: "16px 20px", borderRadius: 12, background: feedback.correct ? "var(--green-light)" : "var(--red-light)", gap: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                          <strong style={{ color: feedback.correct ? "var(--green)" : "var(--red)", fontSize: 18 }}>
                            {feedback.correct ? "✓ Chính xác!" : "✗ Chưa đúng."}
                          </strong>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {hasFullSentenceAudio && (
                              <button
                                type="button"
                                className="tag"
                                style={{ cursor: "pointer", border: "1px solid var(--border)", background: "var(--surface)", display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 12px", fontSize: 13 }}
                                onClick={() => speakJapanese(fullSentenceText)}
                                title="Nghe cả câu hoàn chỉnh có đáp án"
                              >
                                🔊 Nghe cả câu
                              </button>
                            )}
                            {isSpeechSupported() && firstAnswer && hasJapanese(firstAnswer) && (
                              <button
                                type="button"
                                className="tag"
                                style={{ cursor: "pointer", border: "1px solid var(--border)", background: "var(--surface)", display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 12px", fontSize: 13 }}
                                onClick={() => speakJapanese(firstAnswer)}
                                title="Nghe phát âm đáp án đúng"
                              >
                                🔊 Nghe từ
                              </button>
                            )}
                          </div>
                        </div>

                        <div style={{ fontSize: 16 }}>
                          Đáp án đúng: <strong style={{ color: "var(--green)" }}><FuriganaText text={feedback.acceptedAnswers.join(" / ")} enableTooltip /></strong>
                        </div>

                        {translation && (
                          <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(255, 255, 255, 0.75)", border: "1px solid var(--border)" }}>
                            <span className="eyebrow" style={{ color: "var(--blue)", fontSize: 11 }}>🇻🇳 DỊCH NGHĨA CÂU</span>
                            <p style={{ margin: "4px 0 0", fontSize: 15, fontWeight: 500, color: "var(--text)" }}>{translation}</p>
                          </div>
                        )}

                        {cleanExplanation && (
                          <div className="muted" style={{ whiteSpace: "pre-wrap", margin: "4px 0 0", fontSize: 14 }}>
                            <FuriganaText text={cleanExplanation} enableTooltip />
                          </div>
                        )}
                      </div>
                    )}

                    {!answered && (
                      <button className="btn" type="button" disabled={!answer.trim() || busy} onClick={() => void submitAnswer()} style={{ fontSize: 16, padding: "12px 24px" }}>
                        {busy ? "Đang lưu…" : "Nộp đáp án (Enter ↵)"}
                      </button>
                    )}

                    {answered && !allAnswered && (
                      <button
                        className="btn"
                        type="button"
                        onClick={goToNextQuestion}
                        style={{ fontSize: 16, padding: "12px 24px" }}
                      >
                        Câu tiếp theo → (Enter ↵)
                      </button>
                    )}
                  </>
                );
              })()}

              {allAnswered && (
                <button className="btn green" type="button" disabled={busy} onClick={() => void finishQuiz()} style={{ fontSize: 16, padding: "12px 24px" }}>
                  {busy ? "Đang lưu…" : "Xem tổng kết Quiz (Enter ↵)"}
                </button>
              )}
            </section>
          )}

          {!session && (
            <>
              <div className="lesson">
                <p className="muted">{questions.length} câu hỏi của bạn trong bài {lesson.number}</p>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button className="btn green" type="button" onClick={() => setAiModalOpen(true)} disabled={busy || aiBusy}>
                    ✨ AI tạo câu hỏi
                  </button>
                  <button className="btn secondary" type="button" onClick={startAdd} disabled={busy || aiBusy}>
                    ＋ Thêm thủ công
                  </button>
                </div>
              </div>

              {aiModalOpen && (
                <form className="card stack animate-success" onSubmit={handleAiGenerate}>
                  <div className="lesson">
                    <h2 className="section-title" style={{ margin: 0 }}>✨ Gemini tạo câu hỏi</h2>
                    <span className="tag">Gemini AI</span>
                  </div>
                  <p className="muted" style={{ margin: 0 }}>
                    Tối đa 40 mục từ vựng cùng các mẫu ngữ pháp bạn nhập ở Bài {lesson.number} sẽ được gửi tới Google Gemini để tạo câu hỏi. Hãy kiểm tra câu hỏi và đáp án trước khi học.
                  </p>
                  <div className="grid grid-2">
                    <label className="stack">
                      Số lượng câu hỏi
                      <select className="input" value={aiCount} onChange={e => setAiCount(Number(e.target.value))}>
                        <option value={3}>3 câu hỏi nhanh</option>
                        <option value={5}>5 câu hỏi tiêu chuẩn</option>
                        <option value={10}>10 câu hỏi đầy đủ</option>
                      </select>
                    </label>
                    <label className="stack">
                      Gemini API Key (Nếu chưa cấu hình trong .env.local)
                      <input
                        className="input"
                        type="password"
                        value={userApiKey}
                        onChange={e => setUserApiKey(e.target.value)}
                        placeholder="Dán API Key (tùy chọn)"
                      />
                    </label>
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <button className="btn green" type="submit" disabled={aiBusy}>
                      {aiBusy ? "🤖 Gemini đang tạo câu hỏi..." : "Bắt đầu sinh câu hỏi"}
                    </button>
                    <button className="btn secondary" type="button" disabled={aiBusy} onClick={() => setAiModalOpen(false)}>
                      Đóng
                    </button>
                  </div>
                </form>
              )}

              {formOpen && (
                <form className="card stack" onSubmit={saveQuestion}>
                  <h2 className="section-title">{editingId ? "Sửa câu hỏi" : "Thêm câu hỏi"}</h2>
                  <label className="stack">
                    Loại câu hỏi
                    <select className="input" value={draft.questionType} onChange={event => change("questionType", event.target.value)}>
                      <option value="multiple_choice">Trắc nghiệm</option>
                      <option value="typed">Gõ đáp án</option>
                    </select>
                  </label>
                  <label className="stack">
                    Câu hỏi *
                    <textarea
                      className="input jp"
                      required
                      maxLength={2000}
                      rows={3}
                      value={draft.prompt}
                      onChange={event => change("prompt", event.target.value)}
                      placeholder="Viết câu hỏi từ học liệu (hệ thống tự động hiển thị furigana cho chữ Hán N5)"
                    />
                  </label>
                  {draft.questionType === "multiple_choice" && (
                    <label className="stack">
                      Các lựa chọn, mỗi dòng một đáp án *
                      <textarea
                        className="input jp"
                        required
                        rows={4}
                        value={draft.options}
                        onChange={event => change("options", event.target.value)}
                      />
                    </label>
                  )}
                  <label className="stack">
                    {draft.questionType === "multiple_choice" ? "Đáp án đúng, trùng với một lựa chọn *" : "Đáp án chấp nhận, mỗi dòng một cách viết *"}
                    <textarea
                      className="input jp"
                      required
                      rows={2}
                      value={draft.answers}
                      onChange={event => change("answers", event.target.value)}
                    />
                  </label>
                  <label className="stack">
                    Giải thích sau khi nộp
                    <textarea
                      className="input"
                      maxLength={4000}
                      rows={2}
                      value={draft.explanation}
                      onChange={event => change("explanation", event.target.value)}
                    />
                  </label>
                  <label className="stack">
                    Độ khó (1–5)
                    <input
                      className="input"
                      type="number"
                      min={1}
                      max={5}
                      step={1}
                      required
                      value={draft.difficulty}
                      onChange={event => change("difficulty", event.target.value)}
                    />
                  </label>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button className="btn" type="submit" disabled={busy}>{busy ? "Đang lưu…" : "Lưu câu hỏi"}</button>
                    <button className="btn secondary" type="button" disabled={busy} onClick={() => setFormOpen(false)}>Hủy</button>
                  </div>
                </form>
              )}

              {questions.length === 0 && (
                <div className="card stack">
                  <p className="muted">Bài này chưa có câu hỏi. Hãy tự thêm câu hỏi từ nội dung bạn có quyền sử dụng.</p>
                </div>
              )}

              {questions.length > 0 && (
                <>
                  <button className="btn green" type="button" disabled={busy} onClick={() => void startQuiz()} style={{ fontSize: 16 }}>
                    Bắt đầu Quiz ({questions.length} câu)
                  </button>
                  <div className="stack">
                    {questions.map((entry, position) => (
                      <article className="card stack" key={entry.id}>
                        <div className="lesson">
                          <strong className="jp" style={{ fontSize: 18 }}>
                            Câu {position + 1}: <FuriganaText text={entry.prompt} />
                          </strong>
                          <span className="tag">{entry.question_type === "multiple_choice" ? "Trắc nghiệm" : "Gõ đáp án"}</span>
                        </div>
                        {entry.question_type === "multiple_choice" && (
                          <div className="muted jp" style={{ margin: 0 }}>
                            Lựa chọn: {entry.options.map((opt, i) => (
                              <span key={i}>
                                {i > 0 && " · "}
                                <FuriganaText text={opt} />
                              </span>
                            ))}
                          </div>
                        )}
                        <p style={{ margin: 0 }}>
                          Đáp án: <FuriganaText text={entry.accepted_answers.join(" / ")} />
                        </p>
                        {entry.explanation && (
                          <p className="muted" style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                            <FuriganaText text={entry.explanation} />
                          </p>
                        )}
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                          <button className="btn secondary" type="button" aria-label={`Sửa câu hỏi ${position + 1}`} disabled={busy} onClick={() => startEdit(entry)}>Sửa</button>
                          <button className="btn secondary" type="button" aria-label={`Xóa câu hỏi ${position + 1}`} disabled={busy} onClick={() => void deleteQuestion(entry)}>Xóa</button>
                        </div>
                      </article>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
