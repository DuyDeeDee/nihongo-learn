"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { FuriganaText } from "@/components/furigana-text";
import { ConfettiCanvas } from "@/components/confetti";
import { sampleWords } from "@/lib/data";
import { checkAnswer, type AnswerMode } from "@/lib/answer";
import { playCorrectSound, playIncorrectSound, playVictorySound } from "@/lib/audio-feedback";
import { scheduleReview, Rating, type Card } from "@/lib/srs";

type Step = "prompt" | "meaning" | "recall" | "result" | "done";

function initialDemoMode(): AnswerMode {
  if (typeof window === "undefined") return "flexible";
  try {
    const saved = JSON.parse(localStorage.getItem("nihongo-demo-preferences") ?? "null");
    if (saved?.answerMode === "kana" || saved?.answerMode === "kanji" || saved?.answerMode === "flexible") return saved.answerMode;
  } catch {
    return "flexible";
  }
  return "flexible";
}

export function FlashcardSession() {
  const [queue, setQueue] = useState([0, 1, 2, 3]);
  const [index, setIndex] = useState(0);
  const [step, setStep] = useState<Step>("prompt");
  const [mode, setMode] = useState<AnswerMode>(initialDemoMode);
  const [answer, setAnswer] = useState("");
  const [correct, setCorrect] = useState(false);
  const [retry, setRetry] = useState(false);
  const [retried, setRetried] = useState<number[]>([]);
  const [graded, setGraded] = useState<number[]>([]);
  const [cards, setCards] = useState<Record<number, Card>>({});
  const [note, setNote] = useState("");
  const [animClass, setAnimClass] = useState("");
  const [showConfetti, setShowConfetti] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const current = queue[index];
  const word = sampleWords[current];
  const done = index >= queue.length;
  const percent = done ? 100 : Math.round((index / queue.length) * 100);

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
    rate: (rating: Rating) => void;
    reveal: () => void;
    showPrompt: () => void;
    hide: () => void;
  }>({
    advance: () => {},
    rate: () => {},
    reveal: () => {},
    showPrompt: () => {},
    hide: () => {},
  });

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
        return;
      }
      // ArrowLeft / ArrowRight to toggle between Japanese word and Vietnamese meaning
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

      if (e.key === "Enter" || e.key === " ") {
        if (e.key === " ") e.preventDefault();
        if (step === "prompt" || step === "meaning") {
          e.preventDefault();
          handlersRef.current.hide();
        } else if (step === "result") {
          e.preventDefault();
          if (correct && !retry && !graded.includes(current)) {
            handlersRef.current.rate(Rating.Good);
          } else {
            handlersRef.current.advance();
          }
        }
      } else if (step === "result" && correct && !retry && !graded.includes(current)) {
        if (e.key === "1") { e.preventDefault(); handlersRef.current.rate(Rating.Hard); }
        else if (e.key === "2") { e.preventDefault(); handlersRef.current.rate(Rating.Good); }
        else if (e.key === "3") { e.preventDefault(); handlersRef.current.rate(Rating.Easy); }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [step, correct, retry, graded, current]);

  const label = useMemo(
    () => (mode === "kana" ? "Kana · nhập Hiragana/Katakana" : mode === "kanji" ? "Kanji · nhập cách viết có Kanji" : "Flexible · chấp nhận Kana hoặc Kanji"),
    [mode]
  );

  function showPrompt() {
    setStep("prompt");
  }

  function reveal() {
    setStep("meaning");
  }

  function hide() {
    setStep("recall");
    setAnswer("");
    setAnimClass("");
  }

  function submit() {
    if (!answer.trim()) return;
    const ok = checkAnswer(answer, word.accepted, mode);
    setCorrect(ok);
    setStep("result");

    if (ok) {
      playCorrectSound();
      setAnimClass("animate-success");
      if (!retry && !graded.includes(current)) {
        setNote("Chính xác! Chọn mức độ nhớ để lên lịch ôn.");
      } else {
        setNote("Đúng ở lượt luyện lại · không tạo lịch ôn trùng.");
      }
    } else {
      playIncorrectSound();
      setAnimClass("animate-shake");
      if (!graded.includes(current)) {
        const scheduled = scheduleReview(cards[current], Rating.Again);
        setCards(v => ({ ...v, [current]: scheduled.card }));
        setGraded(v => [...v, current]);
        setNote(`Đã ghi Again · lịch ôn kế tiếp: ${scheduled.nextDue.toLocaleDateString("vi-VN")}`);
      } else {
        setNote("Lượt luyện lại · lịch Again đã được ghi ở lần đầu.");
      }
    }
  }

  function rate(rating: Rating) {
    const scheduled = scheduleReview(cards[current], rating);
    setCards(v => ({ ...v, [current]: scheduled.card }));
    setGraded(v => [...v, current]);
    setNote(`Đã lưu ${rating === Rating.Hard ? "Hard" : rating === Rating.Good ? "Good" : "Easy"} · lần ôn tới ${scheduled.nextDue.toLocaleDateString("vi-VN")}`);
    advance();
  }

  function advance() {
    const next = index + 1;
    if (next >= queue.length) {
      setIndex(next);
      setStep("done");
      playVictorySound();
      setShowConfetti(true);
      return;
    }
    setIndex(next);
    setStep("prompt");
    setAnswer("");
    setAnimClass("");
    setRetry(retried.includes(queue[next]));
    setNote("");
  }

  useEffect(() => {
    handlersRef.current = { advance, rate, reveal, showPrompt, hide };
  });

  function again() {
    if (!retry && !retried.includes(current)) {
      setQueue(q => [...q, current]);
      setRetried(v => [...v, current]);
    }
    advance();
  }

  if (done || step === "done") {
    return (
      <section className="card flashcard animate-success">
        {showConfetti && <ConfettiCanvas onDone={() => setShowConfetti(false)} />}
        <div className="tag" style={{ margin: "0 auto" }}>HOÀN THÀNH PHIÊN</div>
        <h1 className="page-title jp" lang="ja">おつかれさま!</h1>
        <p className="muted">Bạn đã xem {queue.length} lượt thẻ, gồm cả lượt luyện lại. Thẻ sai chỉ được tính Again một lần.</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <Link className="btn" href="/review">Quay về ôn tập</Link>
          <Link className="btn secondary" href="/dashboard">Về tổng quan</Link>
        </div>
      </section>
    );
  }

  return (
    <div className="stack">
      {showConfetti && <ConfettiCanvas onDone={() => setShowConfetti(false)} />}
      <div className="lesson">
        <div>
          <div className="eyebrow">FLASHCARD · BÀI 1 (DEMO)</div>
          <h1 className="page-title">Luyện nhớ chủ động</h1>
        </div>
        <Link className="tag" href="/dashboard" onClick={e => { if (!window.confirm("Bạn có chắc muốn thoát phiên học hiện tại?")) e.preventDefault(); }}>
          Thoát phiên
        </Link>
      </div>
      <div className="lesson">
        <span className="muted">Thẻ {index + 1} / {queue.length}{retry ? " · Luyện lại" : ""}</span>
        <span className="muted">Nhật → nghĩa → gõ lại</span>
      </div>
      <div className="progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Tiến độ phiên học">
        <i style={{ width: `${percent}%` }} />
      </div>
      <article className={`card flashcard ${animClass}`}>
        {step === "prompt" && (
          <>
            <div className="eyebrow">TỪ TIẾNG NHẬT</div>
            <div className="jp" lang="ja" style={{ fontSize: 56, fontWeight: 750, lineHeight: 1.8 }}>
              <FuriganaText japanese={word.kanji} kana={word.jp} />
            </div>
            {word.jp && word.kanji !== word.jp && <div className="jp muted" lang="ja" style={{ fontSize: 22 }}>{word.jp}</div>}
            <p className="muted" style={{ fontSize: 14 }}>
              Bấm <strong>← / →</strong> để xem nghĩa, nhấn <strong>Enter</strong> để bắt đầu gõ từ.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", width: "100%", marginTop: 8 }}>
              <button type="button" className="btn secondary" onClick={reveal} style={{ flex: 1, minWidth: 140 }}>
                Xem nghĩa tiếng Việt →
              </button>
              <button type="button" className="btn" onClick={hide} style={{ flex: 1, minWidth: 160 }}>
                Bắt đầu gõ từ (Enter ↵)
              </button>
            </div>
          </>
        )}
        {step === "meaning" && (
          <>
            <div className="eyebrow">NGHĨA TIẾNG VIỆT</div>
            <div style={{ fontSize: 32, fontWeight: 700, margin: "14px 0" }}>{word.meaning}</div>
            <p className="jp muted" lang="ja" style={{ fontSize: 22 }}>{word.jp}</p>
            <p className="muted" style={{ fontSize: 14 }}>
              Bấm <strong>← / →</strong> để xem lại từ tiếng Nhật, nhấn <strong>Enter</strong> để bắt đầu gõ từ.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", width: "100%", marginTop: 8 }}>
              <button type="button" className="btn secondary" onClick={showPrompt} style={{ flex: 1, minWidth: 140 }}>
                ← Xem lại tiếng Nhật
              </button>
              <button type="button" className="btn" onClick={hide} style={{ flex: 1, minWidth: 160 }}>
                Ẩn từ và gõ lại (Enter ↵)
              </button>
            </div>
          </>
        )}
        {step === "recall" && (
          <>
            <div className="eyebrow">ĐỪNG NHÌN ĐÁP ÁN · HÃY GÕ LẠI</div>
            <p className="muted">Mở Japanese IME trên thiết bị, rồi nhập từ tiếng Nhật.</p>
            <div className="grid grid-2" style={{ textAlign: "left" }}>
              <label className="muted">
                Chế độ nhập
                <select className="input" value={mode} onChange={e => setMode(e.target.value as AnswerMode)}>
                  <option value="kana">Kana</option>
                  <option value="kanji">Kanji</option>
                  <option value="flexible">Flexible</option>
                </select>
              </label>
              <div className="tag" style={{ alignSelf: "end", justifyContent: "center", minHeight: 48 }}>{label}</div>
            </div>
            <form onSubmit={e => { e.preventDefault(); submit(); }}>
              <label htmlFor="recall" className="eyebrow" style={{ display: "block", textAlign: "left", margin: "14px 0 7px" }}>
                ĐÁP ÁN CỦA BẠN
              </label>
              <input
                ref={inputRef}
                id="recall"
                className="input jp"
                lang="ja"
                autoFocus
                autoComplete="off"
                autoCapitalize="off"
                value={answer}
                onChange={e => { setAnswer(e.target.value); setAnimClass(""); }}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    if (e.nativeEvent.isComposing || (e.nativeEvent as unknown as { isComposing?: boolean }).isComposing || e.keyCode === 229) {
                      return;
                    }
                    e.preventDefault();
                    if (answer.trim()) {
                      submit();
                    }
                  }
                }}
                placeholder="日本語で入力…"
              />
              <button className="btn" style={{ marginTop: 14, width: "100%" }} disabled={!answer.trim()}>
                Kiểm tra đáp án (hoặc nhấn Enter ↵)
              </button>
            </form>
          </>
        )}
        {step === "result" && (
          <>
            <div
              className="tag"
              role="status"
              aria-live="polite"
              style={{
                margin: "0 auto",
                background: correct ? "var(--green-light)" : "var(--red-light)",
                color: correct ? "var(--green)" : "var(--red)",
                fontSize: 14,
              }}
            >
              {correct ? "✓ CHÍNH XÁC" : "✗ THỬ LẠI SAU"}
            </div>
            <div className="jp" lang="ja" style={{ fontSize: 44, lineHeight: 1.8 }}>
              <FuriganaText japanese={word.kanji} kana={word.jp} />
            </div>
            {word.jp && word.kanji !== word.jp && <div className="jp muted" lang="ja" style={{ fontSize: 20 }}>{word.jp}</div>}
            <div style={{ fontSize: 24, fontWeight: 600 }}>{word.meaning}</div>
            <p className="muted" role="status" aria-live="polite">{note}</p>
            {!correct && <button className="btn" onClick={again}>Again · đưa thẻ về cuối phiên</button>}
            {correct && !retry && (
              <div className="rating-group">
                <button className="btn secondary" onClick={() => rate(Rating.Hard)}>Hard</button>
                <button className="btn green" onClick={() => rate(Rating.Good)}>Good</button>
                <button className="btn" onClick={() => rate(Rating.Easy)}>Easy</button>
              </div>
            )}
            {correct && retry && <button className="btn green" onClick={advance}>Tiếp tục · không ghi SRS lần hai</button>}
          </>
        )}
      </article>
      <p className="muted" style={{ textAlign: "center", fontSize: 13 }}>
        Chế độ demo · dữ liệu học được làm mới khi tải lại trang.
      </p>
    </div>
  );
}
