"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AuthPanel } from "@/components/auth-panel";
import { FlashcardSession } from "@/components/flashcard-session";
import { FuriganaText } from "@/components/furigana-text";
import { ConfettiCanvas } from "@/components/confetti";
import { checkAnswer, type AnswerMode } from "@/lib/answer";
import { playCorrectSound, playIncorrectSound, playVictorySound } from "@/lib/audio-feedback";
import { lessons } from "@/lib/data";
import { hasSupabaseConfig, supabase } from "@/lib/supabase-client";
import type { LiveCard, LiveSession, StudySnapshot } from "@/lib/study-types";

type QueueEntry = { card: LiveCard; retry: boolean };
type Step = "prompt" | "meaning" | "recall" | "result" | "done";
type GradeResult = { correct: boolean; rating: string; dueAt: string };

function initialQueue(session: LiveSession): QueueEntry[] {
  return [
    ...session.cards.filter(card => !card.graded).map(card => ({ card, retry: false })),
    ...session.cards.filter(card => card.graded && !card.correct && !card.retryCompleted)
      .map(card => ({ card, retry: true })),
  ];
}

async function readResponse<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Yêu cầu không thành công.");
  return data as T;
}

export function FlashcardExperience({ lessonKey, demo = false }: { lessonKey?: string; demo?: boolean }) {
  const authVersion = useRef(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(!hasSupabaseConfig);
  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let active = true;
    const version = authVersion.current;
    void client.auth.getUser().then(({ data, error }) => {
      if (active && authVersion.current === version) { setUserId(error ? null : (data.user?.id ?? null)); setAuthReady(true); }
    });
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if (active) { if (event !== "INITIAL_SESSION") authVersion.current += 1; setUserId(session?.user?.id ?? null); setAuthReady(true); }
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  if (demo || !hasSupabaseConfig) return <FlashcardSession />;
  if (!authReady) return <p className="muted">Đang kiểm tra đăng nhập…</p>;
  if (!userId) return <div className="stack"><h1 className="page-title">Flashcard</h1><p className="muted">Đăng nhập để học và lưu lịch ôn từ từ vựng của bạn.</p><AuthPanel /><Link className="btn secondary" href="/flashcards?demo=1">Thử phiên demo</Link></div>;
  return <LiveFlashcards key={`${userId}:${lessonKey ?? "all"}`} lessonKey={lessonKey} />;
}

function LiveFlashcards({ lessonKey }: { lessonKey?: string }) {
  const [snapshot, setSnapshot] = useState<StudySnapshot | null>(null);
  const [session, setSession] = useState<LiveSession | null>(null);
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [index, setIndex] = useState(0);
  const [step, setStep] = useState<Step>("prompt");
  const [mode, setMode] = useState<AnswerMode>("flexible");
  const [answer, setAnswer] = useState("");
  const [correct, setCorrect] = useState(false);
  const [saved, setSaved] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [recallStartedAt, setRecallStartedAt] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [animClass, setAnimClass] = useState("");
  const [showConfetti, setShowConfetti] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input whenever entering recall step
  useEffect(() => {
    if (step === "recall") {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 40);
      return () => clearTimeout(timer);
    }
  }, [step, index]);

  const handlersRef = useRef<{
    advance: () => void;
    rate: (rating: "hard" | "good" | "easy") => Promise<void>;
    reveal: () => void;
    showPrompt: () => void;
    hide: () => void;
    resetCard: () => void;
  }>({
    advance: () => {},
    rate: () => Promise.resolve(),
    reveal: () => {},
    showPrompt: () => {},
    hide: () => {},
    resetCard: () => {},
  });

  // Global keyboard shortcuts (Enter to reveal, hide, and advance smoothly)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
        return;
      }
      const curEntry = queue[index];

      // Mũi tên ← / → để lật qua lại giữa từ tiếng Nhật và nghĩa tiếng Việt
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        if (step === "prompt") {
          e.preventDefault();
          handlersRef.current.reveal();
        } else if (step === "meaning") {
          e.preventDefault();
          handlersRef.current.showPrompt();
        }
        return;
      }

      // Enter hoặc Space:
      // - Khi đang ở prompt hoặc meaning: chuyển sang bước gõ từ (recall)
      // - Khi ở result: chấm điểm hoặc chuyển câu tiếp theo
      if (e.key === "Enter" || e.key === " ") {
        if (e.key === " ") e.preventDefault();
        if (step === "prompt" || step === "meaning") {
          e.preventDefault();
          handlersRef.current.hide();
        } else if (step === "result") {
          e.preventDefault();
          if (correct && saved && !busy) {
            handlersRef.current.advance();
          } else if (correct && !curEntry?.retry && !saved && !busy) {
            void handlersRef.current.rate("good");
          } else if (!correct && !curEntry?.retry && saved) {
            setQueue(current => [...current, { card: curEntry.card, retry: true }]);
            setIndex(current => current + 1);
            handlersRef.current.resetCard();
          } else if (!correct && curEntry?.retry) {
            setStep("recall");
            setAnswer("");
            setAnimClass("");
            setRecallStartedAt(Date.now());
          }
        }
      } else if (step === "result" && correct && !curEntry?.retry && !saved && !busy) {
        if (e.key === "1") { e.preventDefault(); void handlersRef.current.rate("hard"); }
        else if (e.key === "2") { e.preventDefault(); void handlersRef.current.rate("good"); }
        else if (e.key === "3") { e.preventDefault(); void handlersRef.current.rate("easy"); }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [step, correct, saved, busy, index, queue]);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const query = lessonKey ? `?lessonKey=${encodeURIComponent(lessonKey)}` : "";
        const [response, preferencesResponse] = await Promise.all([
          fetch(`/api/study${query}`, { signal: controller.signal, cache: "no-store" }),
          fetch("/api/preferences", { signal: controller.signal, cache: "no-store" }),
        ]);
        const result = await readResponse<StudySnapshot>(response);
        if (controller.signal.aborted) return;
        setSnapshot(result);
        if (result.session) {
          setSession(result.session);
          setQueue(initialQueue(result.session));
          setMode(result.session.mode);
        } else if (preferencesResponse.ok) {
          const preferences = await preferencesResponse.json() as { answerMode?: AnswerMode };
          if (!controller.signal.aborted && (preferences.answerMode === "kana" || preferences.answerMode === "kanji" || preferences.answerMode === "flexible")) {
            setMode(preferences.answerMode);
          }
        }
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Không tải được phiên học.");
      }
    }
    void load();
    return () => controller.abort();
  }, [lessonKey]);

  function resetCard() {
    setStep("prompt");
    setAnswer("");
    setCorrect(false);
    setSaved(false);
    setNote("");
    setError("");
    setAnimClass("");
  }

  async function start() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/study", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonKey, mode }),
      });
      const result = await readResponse<StudySnapshot>(response);
      setSnapshot(result);
      if (result.session) {
        setSession(result.session);
        setQueue(initialQueue(result.session));
        setIndex(0);
        setMode(result.session.mode);
        resetCard();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không bắt đầu được phiên học.");
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    if (!supabase || !session || busy) return;
    setBusy(true);
    setError("");
    const { error: finishError } = await supabase.rpc("finish_flashcard_session", { p_session_id: session.id });
    if (finishError) {
      setError(finishError.message);
    } else {
      playVictorySound();
      setShowConfetti(true);
      setStep("done");
    }
    setBusy(false);
  }

  function advance() {
    if (index + 1 >= queue.length) { void finish(); return; }
    setIndex(current => current + 1);
    resetCard();
  }

  function showPrompt() { setStep("prompt"); }
  function reveal() { setStep("meaning"); }
  function hide() { setStep("recall"); setAnswer(""); setAnimClass(""); setRecallStartedAt(Date.now()); }

  async function submit() {
    const entry = queue[index];
    if (!entry || !session || !answer.trim() || busy) return;
    const elapsed = Math.min(Math.max(Date.now() - recallStartedAt, 0), 86_400_000);
    setElapsedMs(elapsed);
    setBusy(true);
    setError("");
    try {
      if (entry.retry) {
        const response = await fetch("/api/study/retry", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionCardId: entry.card.sessionCardId, answer }),
        });
        const result = await readResponse<{ correct: boolean }>(response);
        setCorrect(result.correct);
        setSaved(true);
        if (result.correct) {
          playCorrectSound();
          setAnimClass("animate-success");
          setNote("Đúng ở lượt luyện lại. Lịch ôn không bị tính thêm.");
        } else {
          playIncorrectSound();
          setAnimClass("animate-shake");
          setNote("Chưa đúng. Hãy gõ lại từ này.");
        }
      } else {
        const ok = checkAnswer(answer, entry.card.acceptedAnswers, session.mode);
        setCorrect(ok);
        if (ok) {
          playCorrectSound();
          setAnimClass("animate-success");
          setSaved(false);
          setNote("Đúng rồi. Chọn mức độ nhớ để lưu lịch ôn.");
        } else {
          playIncorrectSound();
          setAnimClass("animate-shake");
          const response = await fetch("/api/study/grade", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionCardId: entry.card.sessionCardId, answer, rating: "again", elapsedMs: elapsed }),
          });
          const result = await readResponse<GradeResult>(response);
          setSaved(true);
          setNote(`Đã lưu Again · ôn tiếp ${new Date(result.dueAt).toLocaleString("vi-VN")}.`);
        }
      }
      setStep("result");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không lưu được kết quả.");
    } finally {
      setBusy(false);
    }
  }

  async function rate(rating: "hard" | "good" | "easy") {
    const entry = queue[index];
    if (!entry || busy || saved) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/study/grade", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionCardId: entry.card.sessionCardId, answer, rating, elapsedMs }),
      });
      const result = await readResponse<GradeResult>(response);
      setSaved(true);
      setNote(`Đã lưu ${result.rating.toUpperCase()} · ôn tiếp ${new Date(result.dueAt).toLocaleString("vi-VN")}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không lưu được lịch ôn.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    handlersRef.current = { advance, rate, reveal, showPrompt, hide, resetCard };
  });

  const currentLesson = lessonKey ? lessons.find(l => l.id === lessonKey) : null;
  const entry = queue[index];

  async function leaveSession() {
    if (!window.confirm("Bạn có chắc muốn rời và kết thúc phiên học này không?")) return;
    try {
      if (session) {
        await fetch("/api/study/abandon", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: session.id }),
        });
      }
    } catch {}
    window.location.href = currentLesson ? `/lessons/${currentLesson.id}` : "/dashboard";
  }

  if (!snapshot && !error) return <p className="muted">Đang tải Flashcard…</p>;
  if (snapshot && !snapshot.gradingReady) return <div className="card stack"><h1 className="page-title">Flashcard cá nhân</h1><p>Máy chủ chưa có <code>SUPABASE_SERVICE_ROLE_KEY</code> để chấm an toàn.</p><Link href="/flashcards?demo=1" className="btn secondary">Học thử bản demo</Link></div>;
  if (!session) return <div className="stack">
    <div>
      <div className="eyebrow">{currentLesson ? `BÀI ${currentLesson.number} · MINNA NO NIHONGO` : "ÔN TẬP TỔNG HỢP"}</div>
      <h1 className="page-title">{currentLesson ? `Flashcard Bài ${currentLesson.number}` : "Flashcard đến hạn"}</h1>
    </div>
    {error && <p role="alert" style={{ color: "var(--red)" }}>{error}</p>}
    {snapshot?.gradingReady && snapshot.dueCount === 0 && <div className="card stack"><p className="muted">Chưa có thẻ đến hạn{currentLesson ? ` trong Bài ${currentLesson.number}` : " thuộc các bài đang học"}. Hãy thêm từ vựng hoặc quay lại khi thẻ đến hạn.</p><Link href="/lessons" className="btn secondary">Mở bài học</Link></div>}
    {snapshot?.gradingReady && snapshot.dueCount > 0 && <div className="card stack">
      <p>{snapshot.dueCount} thẻ đến hạn{currentLesson ? ` trong Bài ${currentLesson.number}` : " (ngẫu nhiên các bài đang học)"}. Mỗi phiên học tối đa 20 thẻ.</p>
      <label className="stack">Chế độ trả lời<select className="input" value={mode} onChange={event => setMode(event.target.value as AnswerMode)}><option value="flexible">Flexible</option><option value="kana">Kana</option><option value="kanji">Kanji</option></select></label>
      <button className="btn" disabled={busy} onClick={() => void start()}>{busy ? "Đang bắt đầu…" : "Bắt đầu ôn"}</button>
    </div>}
  </div>;
  if (step === "done") return (
    <div className="card flashcard animate-success">
      {showConfetti && <ConfettiCanvas onDone={() => setShowConfetti(false)} />}
      <h1 className="page-title">Hoàn thành phiên học</h1>
      <p className="muted">Toàn bộ thẻ trong phiên đã được ghi nhận vào Supabase!</p>
      <Link className="btn" href={currentLesson ? `/lessons/${currentLesson.id}` : "/dashboard"}>
        {currentLesson ? `Về Bài ${currentLesson.number}` : "Về tổng quan"}
      </Link>
    </div>
  );
  if (!entry) return <div className="card stack"><h1 className="page-title">Các thẻ đã hoàn tất</h1><p className="muted">Xác nhận kết thúc phiên học.</p>{error && <p role="alert">{error}</p>}<button className="btn" disabled={busy} onClick={() => void finish()}>Hoàn tất phiên</button></div>;

  const card = entry.card;
  const percent = Math.round(index / queue.length * 100);
  return <div className="stack">
    {showConfetti && <ConfettiCanvas onDone={() => setShowConfetti(false)} />}
    <div className="lesson">
      <div>
        <div className="eyebrow">{entry.retry ? "LUYỆN LẠI" : currentLesson ? `BÀI ${currentLesson.number}` : "FLASHCARD CÁ NHÂN"}</div>
        <h1 className="page-title">{currentLesson ? `Flashcard Bài ${currentLesson.number}` : "Luyện nhớ chủ động"}</h1>
      </div>
      <button type="button" className="tag" style={{ cursor: "pointer", border: "none" }} onClick={() => void leaveSession()}>
        Rời phiên
      </button>
    </div>
    <div className="lesson"><span className="muted">Thẻ {index + 1} / {queue.length}</span><span className="muted">{session.mode.toUpperCase()} · Nhật → nghĩa → gõ lại</span></div>
    <div className="progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Tiến độ phiên học"><i style={{ width: `${percent}%` }} /></div>
    <article className={`card flashcard ${animClass}`}>
      {step === "prompt" && <>
        <div className="eyebrow">TỪ TIẾNG NHẬT</div>
        <div className="jp" lang="ja" style={{ fontSize: 52, lineHeight: 1.8 }}>
          <FuriganaText japanese={card.japanese} kana={card.kana} />
        </div>
        {card.kana && card.japanese !== card.kana && <div className="jp muted" lang="ja" style={{ fontSize: 20 }}>{card.kana}</div>}
        <p className="muted" style={{ fontSize: 14 }}>
          Bấm <strong>← / →</strong> để xem nghĩa, nhấn <strong>Enter</strong> để gõ từ.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", width: "100%", marginTop: 8 }}>
          <button type="button" className="btn secondary" onClick={reveal} style={{ flex: 1, minWidth: 140 }}>
            Xem nghĩa tiếng Việt →
          </button>
          <button type="button" className="btn" onClick={hide} style={{ flex: 1, minWidth: 160 }}>
            Bắt đầu gõ từ (Enter ↵)
          </button>
        </div>
      </>}
      {step === "meaning" && <>
        <div className="eyebrow">NGHĨA TIẾNG VIỆT</div>
        <div style={{ fontSize: 32, fontWeight: 700, margin: "14px 0" }}>{card.meaning}</div>
        <p className="muted" style={{ fontSize: 14 }}>
          Bấm <strong>← / →</strong> để xem lại từ tiếng Nhật, nhấn <strong>Enter</strong> để gõ từ.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", width: "100%", marginTop: 8 }}>
          <button type="button" className="btn secondary" onClick={showPrompt} style={{ flex: 1, minWidth: 140 }}>
            ← Xem lại tiếng Nhật
          </button>
          <button type="button" className="btn" onClick={hide} style={{ flex: 1, minWidth: 160 }}>
            Ẩn từ và gõ lại (Enter ↵)
          </button>
        </div>
      </>}
      {step === "recall" && <>
        <div className="eyebrow">GÕ LẠI TỪ TIẾNG NHẬT</div>
        <p className="muted">Dùng Japanese IME. Từ gốc đã được ẩn.</p>
        <form onSubmit={event => { event.preventDefault(); void submit() }} style={{ width: "100%" }}>
          <label htmlFor="live-recall" className="eyebrow">ĐÁP ÁN CỦA BẠN</label>
          <input
            ref={inputRef}
            id="live-recall"
            className="input jp"
            lang="ja"
            autoFocus
            autoComplete="off"
            autoCapitalize="off"
            value={answer}
            onChange={event => { setAnswer(event.target.value); setAnimClass(""); }}
            onKeyDown={event => {
              if (event.key === "Enter") {
                if (event.nativeEvent.isComposing || (event.nativeEvent as unknown as { isComposing?: boolean }).isComposing || event.keyCode === 229) {
                  return;
                }
                event.preventDefault();
                if (answer.trim() && !busy) {
                  void submit();
                }
              }
            }}
          />
          <button className="btn" style={{ width: "100%", marginTop: 12 }} disabled={busy || !answer.trim()}>
            {busy ? "Đang kiểm tra…" : "Kiểm tra đáp án (hoặc nhấn Enter ↵)"}
          </button>
        </form>
      </>}
      {step === "result" && <>
        <span className="tag" role="status" aria-live="polite" style={{ background: correct ? "var(--green-light)" : "var(--red-light)", color: correct ? "var(--green)" : "var(--red)", fontSize: 14 }}>
          {correct ? "✓ CHÍNH XÁC" : "✗ CHƯA ĐÚNG"}
        </span>
        <div className="jp" lang="ja" style={{ fontSize: 44, lineHeight: 1.8 }}>
          <FuriganaText japanese={card.japanese} kana={card.kana} />
        </div>
        {card.kana && card.japanese !== card.kana && <span className="jp muted" lang="ja" style={{ fontSize: 18 }}>{card.kana}</span>}
        <div style={{ fontSize: 24, fontWeight: 600 }}>{card.meaning}</div>
        <p className="muted" role="status" aria-live="polite">{note}</p>
        {correct && !entry.retry && !saved && <div className="rating-group"><button className="btn secondary" disabled={busy} onClick={() => void rate("hard")}>Hard</button><button className="btn green" disabled={busy} onClick={() => void rate("good")}>Good</button><button className="btn" disabled={busy} onClick={() => void rate("easy")}>Easy</button></div>}
        {!correct && !entry.retry && saved && <button className="btn" onClick={() => { setQueue(current => [...current, { card, retry: true }]); setIndex(current => current + 1); resetCard() }}>Again · luyện lại cuối phiên</button>}
        {!correct && entry.retry && <button className="btn" onClick={() => { setStep("recall"); setAnswer(""); setAnimClass(""); setRecallStartedAt(Date.now()) }}>Gõ lại lần nữa</button>}
        {correct && saved && <button className="btn green" disabled={busy} onClick={advance}>Tiếp tục</button>}
      </>}
    </article>
    {error && <p role="alert" style={{ color: "var(--red)" }}>{error}</p>}
    <p className="muted" style={{ textAlign: "center", fontSize: 13 }}>Phiên này được lưu vào tài khoản Supabase của bạn.</p>
  </div>;
}
