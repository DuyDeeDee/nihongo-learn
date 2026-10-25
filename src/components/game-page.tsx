"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AuthPanel } from "@/components/auth-panel";
import { ParticlePractice, SentenceBuilder } from "@/components/practice";
import { FuriganaText } from "@/components/furigana-text";
import { ConfettiCanvas } from "@/components/confetti";
import { playCorrectSound, playIncorrectSound, playVictorySound } from "@/lib/audio-feedback";
import { clientCache } from "@/lib/cache";
import { lessons } from "@/lib/data";
import type { QuizQuestion } from "@/lib/quiz-domain";
import { hasSupabaseConfig, supabase } from "@/lib/supabase-client";

type Kind = "ordering" | "particle";
type GameQuestion = QuizQuestion & { question_type: Kind };
type Draft = { prompt: string; options: string; answers: string; explanation: string; difficulty: string };
type Feedback = { correct: boolean; score: number; acceptedAnswers: string[]; explanation: string | null };
const emptyDraft: Draft = { prompt: "", options: "", answers: "", explanation: "", difficulty: "3" };

function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch {
      // Fallback
    }
  }
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c =>
    (
      +c ^
      ((typeof crypto !== "undefined" && crypto.getRandomValues
        ? crypto.getRandomValues(new Uint8Array(1))[0]
        : Math.floor(Math.random() * 256)) &
        (15 >> (+c / 4)))
    ).toString(16)
  );
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Yêu cầu không thành công.");
  return data as T;
}

export function GamePage({ kind, lessonKey, demo = false }: { kind: Kind; lessonKey?: string; demo?: boolean }) {
  const title = kind === "ordering" ? "Sentence Builder" : "Particle Master";
  const path = kind === "ordering" ? "/games/sentence-builder" : "/games/particle-master";
  if (demo || !hasSupabaseConfig) return (
    <div className="stack">
      <h1 className="page-title">{title} · demo</h1>
      <p className="muted">Câu mẫu tự biên; kết quả demo không được lưu.</p>
      {kind === "ordering" ? <SentenceBuilder /> : <ParticlePractice />}
    </div>
  );
  const lesson = lessons.find(entry => entry.id === lessonKey);
  if (!lesson) return (
    <div className="stack">
      <h1 className="page-title">{title}</h1>
      <p className="muted">Chọn bài để thêm câu của bạn và luyện tập.</p>
      <div className="grid grid-3">
        {lessons.map(entry => (
          <Link className="card card-interactive stack" key={entry.id} href={`${path}?lesson=${entry.id}`}>
            <span className="tag">Volume {entry.volume}</span>
            <strong style={{ fontSize: 18 }}>Bài {entry.number}</strong>
            <span className="muted">Mở trò chơi →</span>
          </Link>
        ))}
      </div>
    </div>
  );
  return <LessonGame key={`${kind}-${lesson.id}`} kind={kind} lesson={lesson} path={path} title={title} />;
}

function LessonGame({ kind, lesson, path, title }: { kind: Kind; lesson: (typeof lessons)[number]; path: string; title: string }) {
  const authVersion = useRef(0);
  const startedAt = useRef(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [loadedForUser, setLoadedForUser] = useState<string | null>(null);
  const [questions, setQuestions] = useState<GameQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [playing, setPlaying] = useState(false);
  const [index, setIndex] = useState(0);
  const [attemptKey, setAttemptKey] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [choice, setChoice] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [animClass, setAnimClass] = useState("");
  const [showConfetti, setShowConfetti] = useState(false);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiCount, setAiCount] = useState(5);
  const [userApiKey, setUserApiKey] = useState("");
  const [aiBusy, setAiBusy] = useState(false);

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
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event !== "INITIAL_SESSION") authVersion.current += 1;
      setUserId(session?.user?.id ?? null);
      setAuthReady(true);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) return;
      setLoadedForUser(null);
      setPlaying(false);
      setFormOpen(false);
      setError("");
      if (!userId) {
        setQuestions([]);
        return;
      }

      const cacheKey = `game:${kind}:${lesson.id}:${userId}`;
      const cached = clientCache.get<GameQuestion[]>(cacheKey);
      if (cached) {
        setQuestions(cached);
        setLoadedForUser(userId);
      } else {
        setLoading(true);
      }

      try {
        const result = await requestJson<{ questions: GameQuestion[] }>(
          `/api/quiz/questions?lessonKey=${encodeURIComponent(lesson.id)}&kind=${kind}`
        );
        if (active) {
          setQuestions(result.questions);
          clientCache.set(cacheKey, result.questions);
          setLoadedForUser(userId);
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Không tải được trò chơi.");
      } finally {
        if (active) setLoading(false);
      }
    });
    return () => { active = false; };
  }, [kind, lesson.id, userId]);

  function startAdd() {
    setDraft(emptyDraft);
    setEditingId(null);
    setFormOpen(true);
    setError("");
    setNotice("");
  }

  function startEdit(question: GameQuestion) {
    setDraft({
      prompt: question.prompt,
      options: question.options.join("\n"),
      answers: question.accepted_answers.join("\n"),
      explanation: question.explanation ?? "",
      difficulty: String(question.difficulty ?? 3),
    });
    setEditingId(question.id);
    setFormOpen(true);
    setError("");
    setNotice("");
  }

  function change(field: keyof Draft, value: string) {
    setDraft(current => ({ ...current, [field]: value }));
  }

  async function saveQuestion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const payload = {
      lessonKey: lesson.id,
      prompt: draft.prompt.trim(),
      questionType: kind,
      options: draft.options.split("\n").map(line => line.trim()).filter(Boolean),
      acceptedAnswers: draft.answers.split("\n").map(line => line.trim()).filter(Boolean),
      explanation: draft.explanation.trim(),
      difficulty: Number(draft.difficulty),
    };
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await requestJson<{ question: GameQuestion }>("/api/quiz/questions", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId ? { id: editingId, question: payload } : payload),
      });
      const updated = editingId
        ? questions.map(q => q.id === result.question.id ? result.question : q)
        : [...questions, result.question];
      setQuestions(updated);
      if (userId) clientCache.set(`game:${kind}:${lesson.id}:${userId}`, updated);
      setFormOpen(false);
      setEditingId(null);
      setDraft(emptyDraft);
      setNotice(editingId ? "Đã sửa câu chơi." : "Đã thêm câu chơi.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không lưu được câu chơi.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteQuestion(question: GameQuestion) {
    if (busy || !window.confirm(`Xóa câu chơi “${question.prompt}”?`)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await requestJson("/api/quiz/questions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: question.id, lessonKey: lesson.id }),
      });
      const updated = questions.filter(entry => entry.id !== question.id);
      setQuestions(updated);
      if (userId) clientCache.set(`game:${kind}:${lesson.id}:${userId}`, updated);
      setNotice("Đã xóa câu chơi.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không xóa được câu chơi.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAiGenerate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (aiBusy) return;
    setAiBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await requestJson<{ success: boolean; count: number; questions: GameQuestion[] }>("/api/ai/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonKey: lesson.id,
          kind,
          count: aiCount,
          apiKey: userApiKey.trim() || undefined,
        }),
      });
      const updated = [...questions, ...result.questions];
      setQuestions(updated);
      if (userId) clientCache.set(`game:${kind}:${lesson.id}:${userId}`, updated);
      playCorrectSound();
      setNotice(`Gemini đã tạo thêm ${result.count} câu chơi cho Bài ${lesson.number}. Hãy kiểm tra đáp án trước khi học.`);
      setAiModalOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không tạo được câu chơi từ AI.");
    } finally {
      setAiBusy(false);
    }
  }

  function startGame() {
    if (!questions.length) return;
    setPlaying(true);
    setIndex(0);
    setAttemptKey(generateUUID());
    setSelected([]);
    setChoice("");
    setFeedback(null);
    setCorrectCount(0);
    setAnimClass("");
    setShowConfetti(false);
    setError("");
    setNotice("");
    startedAt.current = Date.now();
  }

  async function submit() {
    const question = questions[index];
    if (!question || busy || feedback) return;
    const answer = kind === "ordering" ? selected.map(position => question.options[position]) : choice;
    if (kind === "ordering" && selected.length !== question.options.length) return;
    if (kind === "particle" && !choice) return;
    const activeKey = attemptKey || generateUUID();
    if (!attemptKey) setAttemptKey(activeKey);
    setBusy(true);
    setError("");
    try {
      const saved = await requestJson<Feedback>("/api/games/attempt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attemptKey: activeKey,
          questionId: question.id,
          gameType: kind === "ordering" ? "sentence_builder" : "particle_master",
          answer,
          elapsedMs: Math.min(Date.now() - startedAt.current, 86_400_000),
        }),
      });
      setFeedback(saved);
      if (saved.correct) {
        setCorrectCount(count => count + 1);
        playCorrectSound();
        setAnimClass("animate-success");
      } else {
        playIncorrectSound();
        setAnimClass("animate-shake");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không lưu được lượt chơi.");
    } finally {
      setBusy(false);
    }
  }

  function next() {
    const nextIndex = index + 1;
    if (nextIndex >= questions.length) {
      setIndex(nextIndex);
      if (correctCount + 1 >= Math.ceil(questions.length * 0.7)) {
        playVictorySound();
        setShowConfetti(true);
      }
      return;
    }
    setIndex(nextIndex);
    setAttemptKey(generateUUID());
    setSelected([]);
    setChoice("");
    setFeedback(null);
    setAnimClass("");
    setError("");
    startedAt.current = Date.now();
  }

  const current = questions[index];
  return (
    <div className="stack">
      {showConfetti && <ConfettiCanvas onDone={() => setShowConfetti(false)} />}
      <Link className="muted" href={`/lessons/${lesson.id}`}>← Quay lại bài học</Link>
      <div className="lesson">
        <div>
          <div className="eyebrow">VOLUME {lesson.volume} · BÀI {lesson.number}</div>
          <h1 className="page-title">{title}</h1>
        </div>
        <Link className="btn secondary" href={path}>Chọn bài khác</Link>
      </div>

      {!authReady && <p className="muted">Đang kiểm tra đăng nhập…</p>}
      {authReady && !userId && (
        <div className="stack">
          <p className="muted">Đăng nhập để tạo câu chơi và lưu lượt luyện.</p>
          <AuthPanel />
          <Link className="btn secondary" href={`${path}?demo=1`}>Thử bản demo</Link>
        </div>
      )}

      {userId && loading && questions.length === 0 && (
        <div className="card stack">
          <div className="skeleton-shimmer" style={{ height: 26, width: "35%" }} />
          <div className="skeleton-shimmer" style={{ height: 18, width: "70%" }} />
          <div className="skeleton-shimmer" style={{ height: 44, width: "100%" }} />
        </div>
      )}

      {error && <p role="alert" style={{ color: "var(--red)" }}>{error}</p>}
      {notice && <p role="status" style={{ color: "var(--green)" }}>{notice}</p>}

      {userId && loadedForUser === userId && !loading && (
        <>
          {playing && index >= questions.length && (
            <section className="card stack animate-success" aria-live="polite">
              <h2 className="section-title">Đã hoàn tất trò chơi</h2>
              <strong style={{ fontSize: 28 }}>{correctCount} / {questions.length} câu đúng</strong>
              <p className="muted">Từng lượt chơi đã được lưu vào tài khoản của bạn.</p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button className="btn" type="button" onClick={startGame}>Chơi lại</button>
                <button className="btn secondary" type="button" onClick={() => setPlaying(false)}>Quản lý câu chơi</button>
              </div>
            </section>
          )}

          {playing && current && (
            <section className={`card stack ${animClass}`}>
              <div className="eyebrow">CÂU {index + 1} / {questions.length}</div>
              <h2 className="section-title jp" style={{ fontSize: 24, lineHeight: 1.8 }}>
                <FuriganaText text={current.prompt} />
              </h2>

              {kind === "ordering" ? (
                <>
                  <div className="card jp" lang="ja" style={{ minHeight: 68, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    {selected.length === 0 && <span className="muted" style={{ fontSize: 16 }}>Chọn các mảnh ghép bên dưới theo thứ tự đúng...</span>}
                    {selected.map((position, chosenIndex) => (
                      <button
                        className="tag jp"
                        type="button"
                        key={`${position}-${chosenIndex}`}
                        aria-label={`Bỏ chọn ${current.options[position]}`}
                        disabled={Boolean(feedback)}
                        style={{ fontSize: 18, padding: "8px 14px", cursor: "pointer" }}
                        onClick={() => {
                          setSelected(values => values.filter((_, idx) => idx !== chosenIndex));
                          setAnimClass("");
                        }}
                      >
                        <FuriganaText text={current.options[position]} /> ✕
                      </button>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {current.options.map((token, position) => (
                      <button
                        className="btn secondary jp"
                        type="button"
                        key={position}
                        aria-label={`Chọn ${token}`}
                        style={{ fontSize: 18 }}
                        disabled={selected.includes(position) || Boolean(feedback)}
                        onClick={() => {
                          setSelected(values => [...values, position]);
                          setAnimClass("");
                        }}
                      >
                        <FuriganaText text={token} />
                      </button>
                    ))}
                  </div>
                  <button
                    className="btn secondary"
                    type="button"
                    disabled={Boolean(feedback) || selected.length === 0}
                    onClick={() => { setSelected([]); setAnimClass(""); }}
                  >
                    Làm lại câu
                  </button>
                </>
              ) : (
                <>
                  <div className="jp" lang="ja" style={{ fontSize: 28, lineHeight: 1.8 }}>
                    <FuriganaText text={current.prompt.replace("＿", choice ? `[${choice}]` : "＿")} />
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {current.options.map(option => (
                      <button
                        className={`btn ${choice === option ? "" : "secondary"} jp`}
                        type="button"
                        key={option}
                        style={{ minWidth: 64, fontSize: 20 }}
                        aria-pressed={choice === option}
                        aria-label={`Trợ từ ${option}`}
                        disabled={Boolean(feedback)}
                        onClick={() => { setChoice(option); setAnimClass(""); }}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {feedback && (
                <div role="status" aria-live="polite" className="stack" style={{ padding: "14px 18px", borderRadius: 12, background: feedback.correct ? "var(--green-light)" : "var(--red-light)" }}>
                  <strong style={{ color: feedback.correct ? "var(--green)" : "var(--red)", fontSize: 17 }}>
                    {feedback.correct ? "✓ Chính xác!" : "✗ Chưa đúng."}
                  </strong>
                  <span>
                    Đáp án: <FuriganaText text={kind === "ordering" ? feedback.acceptedAnswers.join(" ") : feedback.acceptedAnswers.join(" / ")} />
                  </span>
                  {feedback.explanation && (
                    <p className="muted" style={{ whiteSpace: "pre-wrap", margin: "4px 0 0" }}>
                      <FuriganaText text={feedback.explanation} />
                    </p>
                  )}
                </div>
              )}

              {!feedback && (
                <button
                  className="btn"
                  type="button"
                  disabled={busy || (kind === "ordering" ? selected.length !== current.options.length : !choice)}
                  onClick={() => void submit()}
                >
                  {busy ? "Đang lưu…" : "Kiểm tra"}
                </button>
              )}

              {error && <p role="alert" style={{ color: "var(--red)", margin: "4px 0 0" }}>{error}</p>}

              {feedback && (
                <button className="btn" type="button" onClick={next}>
                  {index === questions.length - 1 ? "Xem tổng kết" : "Câu tiếp theo →"}
                </button>
              )}
            </section>
          )}

          {!playing && (
            <>
              <div className="lesson">
                <p className="muted">{questions.length} câu của bạn trong bài {lesson.number}</p>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button className="btn green" type="button" onClick={() => setAiModalOpen(true)} disabled={busy || aiBusy}>
                    ✨ AI tạo câu chơi
                  </button>
                  <button className="btn secondary" type="button" disabled={busy || aiBusy} onClick={startAdd}>
                    ＋ Thêm thủ công
                  </button>
                </div>
              </div>

              {aiModalOpen && (
                <form className="card stack animate-success" onSubmit={handleAiGenerate}>
                  <div className="lesson">
                    <h2 className="section-title" style={{ margin: 0 }}>✨ Gemini tạo câu {kind === "ordering" ? "Xếp câu" : "Trợ từ"}</h2>
                    <span className="tag">Gemini AI</span>
                  </div>
                  <p className="muted" style={{ margin: 0 }}>
                    Tối đa 40 mục từ vựng cùng các mẫu ngữ pháp bạn nhập ở Bài {lesson.number} sẽ được gửi tới Google Gemini để tạo câu {kind === "ordering" ? "sắp xếp" : "luyện trợ từ"}. Hãy kiểm tra câu hỏi và đáp án trước khi học.
                  </p>
                  <div className="grid grid-2">
                    <label className="stack">
                      Số lượng câu hỏi
                      <select className="input" value={aiCount} onChange={e => setAiCount(Number(e.target.value))}>
                        <option value={3}>3 câu hỏi nhanh</option>
                        <option value={5}>5 câu hỏi tiêu chuẩn</option>
                        <option value={8}>8 câu hỏi đầy đủ</option>
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
                      {aiBusy ? "🤖 Gemini đang tạo câu chơi..." : "Bắt đầu sinh câu chơi"}
                    </button>
                    <button className="btn secondary" type="button" disabled={aiBusy} onClick={() => setAiModalOpen(false)}>
                      Đóng
                    </button>
                  </div>
                </form>
              )}

              {formOpen && (
                <form className="card stack" onSubmit={saveQuestion}>
                  <h2 className="section-title">{editingId ? "Sửa câu chơi" : "Thêm câu chơi"}</h2>
                  <label className="stack">
                    {kind === "ordering" ? "Gợi ý hoặc nghĩa câu *" : "Câu có chỗ trống ＿ *"}
                    <textarea
                      className="input"
                      required
                      maxLength={2000}
                      rows={2}
                      value={draft.prompt}
                      onChange={event => change("prompt", event.target.value)}
                    />
                  </label>
                  <label className="stack">
                    {kind === "ordering" ? "Các mảnh câu tiếng Nhật, mỗi dòng một mảnh *" : "Các trợ từ lựa chọn, mỗi dòng một trợ từ *"}
                    <textarea
                      className="input jp"
                      lang="ja"
                      required
                      rows={4}
                      value={draft.options}
                      onChange={event => change("options", event.target.value)}
                    />
                  </label>
                  <label className="stack">
                    {kind === "ordering" ? "Thứ tự đúng, mỗi dòng một mảnh *" : "Trợ từ đúng *"}
                    <textarea
                      className="input jp"
                      lang="ja"
                      required
                      rows={4}
                      value={draft.answers}
                      onChange={event => change("answers", event.target.value)}
                    />
                  </label>
                  <label className="stack">
                    Giải thích sau khi kiểm tra
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
                    <button className="btn" type="submit" disabled={busy}>{busy ? "Đang lưu…" : "Lưu câu chơi"}</button>
                    <button className="btn secondary" type="button" disabled={busy} onClick={() => setFormOpen(false)}>Hủy</button>
                  </div>
                </form>
              )}

              {questions.length === 0 && (
                <div className="card stack">
                  <p className="muted">Bài này chưa có câu chơi. Hãy tự nhập nội dung từ nguồn bạn có quyền sử dụng.</p>
                </div>
              )}

              {questions.length > 0 && (
                <>
                  <button className="btn green" type="button" onClick={startGame} style={{ fontSize: 16 }}>
                    Bắt đầu luyện ({questions.length} câu)
                  </button>
                  <div className="stack">
                    {questions.map((q, position) => (
                      <article className="card stack card-interactive" key={q.id}>
                        <div className="lesson">
                          <strong className="jp" style={{ fontSize: 18 }}>
                            Câu {position + 1}: <FuriganaText text={q.prompt} />
                          </strong>
                        </div>
                        <p className="muted jp" style={{ margin: 0 }}>
                          Mảnh/lựa chọn: {q.options.map((opt, i) => (
                            <span key={i}>
                              {i > 0 && " · "}
                              <FuriganaText text={opt} />
                            </span>
                          ))}
                        </p>
                        <p style={{ margin: 0 }}>
                          Đáp án: <FuriganaText text={q.accepted_answers.join(kind === "ordering" ? " → " : " / ")} />
                        </p>
                        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                          <button className="btn secondary" type="button" aria-label={`Sửa câu ${position + 1}`} disabled={busy} onClick={() => startEdit(q)}>Sửa</button>
                          <button className="btn secondary" type="button" aria-label={`Xóa câu ${position + 1}`} disabled={busy} onClick={() => void deleteQuestion(q)}>Xóa</button>
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
