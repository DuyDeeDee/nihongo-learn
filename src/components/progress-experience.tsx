"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AuthPanel } from "@/components/auth-panel";
import { FuriganaText } from "@/components/furigana-text";
import { checkAnswer } from "@/lib/answer";
import { lessons } from "@/lib/data";
import type { Mistake, ProgressSnapshot } from "@/lib/progress";
import { hasSupabaseConfig, supabase } from "@/lib/supabase-client";

type View = "dashboard" | "progress" | "mistakes";
type Practice = { card: Mistake; step: "show" | "reveal" | "recall" | "result"; answer: string; correct: boolean | null };

export function ProgressExperience({ view }: { view: View }) {
  const authVersion = useRef(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(!hasSupabaseConfig);
  const [snapshot, setSnapshot] = useState<ProgressSnapshot | null>(null);
  const [loadedForUser, setLoadedForUser] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [volume, setVolume] = useState("all");
  const [practice, setPractice] = useState<Practice | null>(null);

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
      setSnapshot(null); setLoadedForUser(null); setPractice(null); setError("");
      if (!userId) return;
      setLoading(true);
      try {
        const response = await fetch("/api/progress", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Không tải được tiến độ.");
        if (active) { setSnapshot(data as ProgressSnapshot); setLoadedForUser(userId); }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Không tải được tiến độ.");
      } finally { if (active) setLoading(false); }
    });
    return () => { active = false; };
  }, [userId]);

  const title = view === "dashboard" ? "Tổng quan" : view === "progress" ? "Tiến độ" : "Lỗi cần luyện";
  if (!hasSupabaseConfig || (authReady && !userId)) return (
    <div className="stack">
      <div>
        <div className="eyebrow">BẢN DEMO</div>
        <h1 className="page-title">{title}</h1>
        <p className="muted">Đăng nhập để xem số liệu đã lưu. Bản demo không đồng bộ qua Supabase.</p>
      </div>
      {view === "dashboard" && (
        <div className="grid grid-3">
          <article className="card card-interactive stack"><div className="eyebrow">CHUỖI HỌC · DEMO</div><strong className="big-number">4 ngày</strong></article>
          <article className="card card-interactive stack"><div className="eyebrow">THẺ ĐẾN HẠN · DEMO</div><strong className="big-number">12 thẻ</strong></article>
          <article className="card card-interactive stack"><div className="eyebrow">TIẾN ĐỘ · DEMO</div><strong className="big-number">0 / 50 bài</strong></article>
        </div>
      )}
      {hasSupabaseConfig && <AuthPanel />}
      <div className="grid grid-2">
        <Link className="btn" href="/flashcards?demo=1">Thử Flashcard demo</Link>
        <Link className="btn secondary" href="/lessons">Xem 50 bài học</Link>
      </div>
    </div>
  );

  if (!authReady || loading || (userId && loadedForUser !== userId && !error)) return (
    <div className="stack">
      <div className="skeleton-shimmer" style={{ height: 32, width: "30%" }} />
      <div className="grid grid-3">
        <div className="card skeleton-shimmer" style={{ height: 110 }} />
        <div className="card skeleton-shimmer" style={{ height: 110 }} />
        <div className="card skeleton-shimmer" style={{ height: 110 }} />
      </div>
    </div>
  );

  if (error) return (
    <div className="stack">
      <h1 className="page-title">{title}</h1>
      <p role="alert" style={{ color: "var(--red)" }}>{error}</p>
      <button className="btn secondary" type="button" onClick={() => location.reload()}>Thử lại</button>
    </div>
  );

  if (!snapshot) return null;

  if (view === "dashboard") {
    const next = snapshot.lessons.find(lesson => lesson.status !== "completed") ?? snapshot.lessons[0];
    return (
      <div className="stack" style={{ gap: 24 }}>
        <div>
          <div className="eyebrow">NHỊP HỌC CỦA BẠN · ĐÃ LƯU</div>
          <h1 className="page-title">Tổng quan</h1>
          <p className="muted">Ngày học đổi lúc {snapshot.resetHour}:00 theo múi giờ {snapshot.timezone}.</p>
        </div>
        <section className="grid grid-3">
          <article className="card card-interactive stack">
            <div className="eyebrow">CHUỖI HỌC</div>
            <strong className="big-number">{snapshot.streak} ngày</strong>
            <span className="muted">{snapshot.activeDaysLast7} ngày có luyện tập trong 7 ngày gần đây</span>
          </article>
          <article className="card card-interactive stack">
            <div className="eyebrow">THẺ ĐẾN HẠN</div>
            <strong className="big-number">{snapshot.dueCount} thẻ</strong>
            <Link className="btn" href="/review">Bắt đầu ôn tập</Link>
          </article>
          <article className="card card-interactive stack">
            <div className="eyebrow">MỤC TIÊU HÔM NAY</div>
            <strong className="big-number">{snapshot.todayMinutes} / {snapshot.dailyGoal} phút</strong>
            <div className="progress" role="progressbar" aria-valuenow={Math.round(Math.min(100, (snapshot.todayMinutes / snapshot.dailyGoal) * 100))} aria-valuemin={0} aria-valuemax={100} aria-label="Tiến độ mục tiêu hôm nay">
              <i style={{ display: "block", height: "100%", background: "var(--green)", width: `${Math.min(100, (snapshot.todayMinutes / snapshot.dailyGoal) * 100)}%` }} />
            </div>
            <small className="muted">Chỉ tính thời gian trả lời đã được ghi.</small>
          </article>
        </section>
        <section className="grid grid-2">
          <article className="card card-interactive stack">
            <div className="eyebrow">HỌC TIẾP</div>
            <h2 className="section-title">Bài {next?.number ?? 1} · Volume {next?.volume ?? 1}</h2>
            <span className="muted">{next?.vocabularyCount ?? 0} từ vựng · {next?.grammarCount ?? 0} mẫu ngữ pháp</span>
            <Link className="btn" href={`/lessons/${next?.key ?? lessons[0].id}`}>Mở bài học →</Link>
          </article>
          <article className="card card-interactive stack">
            <div className="eyebrow">LỘ TRÌNH</div>
            <strong className="big-number">{snapshot.completedLessons} / 50 bài</strong>
            <span className="muted">{snapshot.mistakes.length} thẻ có lần ôn gần nhất bị sai</span>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
              <Link className="btn secondary" href="/progress">Xem tiến độ</Link>
              <Link className="btn secondary" href="/review/mistakes">Luyện lỗi</Link>
            </div>
          </article>
        </section>
      </div>
    );
  }

  if (view === "progress") {
    const visible = snapshot.lessons.filter(lesson => volume === "all" || String(lesson.volume) === volume);
    const percent = (value: number | null) => (value === null ? "Chưa có lượt" : `${value}%`);
    return (
      <div className="stack" style={{ gap: 24 }}>
        <div>
          <div className="eyebrow">SỐ LIỆU ĐÃ LƯU</div>
          <h1 className="page-title">Tiến độ</h1>
          <p className="muted">Độ chính xác dựa trên lượt đã nộp; thẻ đến hạn dựa trên lịch FSRS hiện tại.</p>
        </div>
        <section className="grid grid-3">
          <article className="card card-interactive stack">
            <div className="eyebrow">HOÀN THÀNH</div>
            <strong className="big-number">{snapshot.completedLessons} / 50</strong>
            <span className="muted">bài học</span>
          </article>
          <article className="card card-interactive stack">
            <div className="eyebrow">FLASHCARD</div>
            <strong className="big-number">{percent(snapshot.flashcardAccuracy)}</strong>
            <span className="muted">đúng trên tổng lượt chấm chính</span>
          </article>
          <article className="card card-interactive stack">
            <div className="eyebrow">QUIZ / GAMES</div>
            <strong className="big-number">{percent(snapshot.quizAccuracy)} / {percent(snapshot.gameAccuracy)}</strong>
            <span className="muted">tỷ lệ đúng Quiz / trò chơi</span>
          </article>
        </section>
        <section className="card stack">
          <h2 className="section-title">Phân bố thẻ ôn</h2>
          <p>{snapshot.newCount} mới · {snapshot.learningCount} đang học · {snapshot.reviewCount} đã ôn nhiều lần · {snapshot.dueCount} đến hạn</p>
          <small className="muted">Nhóm “đã ôn nhiều lần” tính từ 3 lượt chấm chính trở lên; không bao gồm thẻ tạm dừng.</small>
        </section>
        <label className="stack">
          Lọc volume
          <select className="input" value={volume} onChange={event => setVolume(event.target.value)}>
            <option value="all">Tất cả</option>
            <option value="1">Volume I (N5)</option>
            <option value="2">Volume II (N4)</option>
          </select>
        </label>
        <div className="grid grid-3">
          {visible.map(lesson => (
            <Link className="card card-interactive stack" key={lesson.key} href={`/lessons/${lesson.key}`}>
              <div className="lesson">
                <strong style={{ fontSize: 18 }}>Bài {lesson.number}</strong>
                <span className="tag">{lesson.status === "completed" ? "Hoàn thành" : lesson.status === "in_progress" ? "Đang học" : "Chưa học"}</span>
              </div>
              <span className="muted">{lesson.vocabularyCount} từ · {lesson.grammarCount} mẫu ngữ pháp</span>
              <span className="muted">Quiz tốt nhất: {percent(lesson.quizBestScore)}</span>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  function submitPractice(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!practice || practice.step !== "recall" || !practice.answer.trim()) return;
    setPractice({
      ...practice,
      step: "result",
      correct: checkAnswer(practice.answer, practice.card.acceptedAnswers, "flexible"),
    });
  }

  return (
    <div className="stack">
      <div>
        <div className="eyebrow">LẦN ÔN GẦN NHẤT BỊ SAI</div>
        <h1 className="page-title">Lỗi cần luyện</h1>
        <p className="muted">Luyện lại ở đây không chấm FSRS lần nữa. Thẻ vẫn theo lịch ôn đã lưu.</p>
      </div>
      {snapshot.mistakes.length === 0 && (
        <div className="card stack">
          <p className="muted">Hiện chưa có thẻ cần luyện lại.</p>
          <Link className="btn secondary" href="/review">Xem thẻ đến hạn</Link>
        </div>
      )}
      {practice && (
        <section className="card stack">
          <div className="eyebrow">LUYỆN LẠI · KHÔNG ĐỔI LỊCH ÔN</div>
          {practice.step === "show" && (
            <>
              <div className="jp" lang="ja" style={{ fontSize: 36, lineHeight: 1.8 }}>
                <FuriganaText text={practice.card.japanese} />
              </div>
              <button className="btn" type="button" onClick={() => setPractice({ ...practice, step: "reveal" })}>
                Hiện nghĩa
              </button>
            </>
          )}
          {practice.step === "reveal" && (
            <>
              <div className="jp" lang="ja" style={{ fontSize: 36, lineHeight: 1.8 }}>
                <FuriganaText text={practice.card.japanese} />
              </div>
              <p style={{ fontSize: 20 }}>{practice.card.meaning}</p>
              <button className="btn" type="button" onClick={() => setPractice({ ...practice, step: "recall" })}>
                Ẩn từ Nhật và gõ lại
              </button>
            </>
          )}
          {practice.step === "recall" && (
            <form className="stack" onSubmit={submitPractice}>
              <p style={{ fontSize: 20 }}>{practice.card.meaning}</p>
              <label className="stack">
                Gõ lại từ tiếng Nhật
                <input
                  className="input jp"
                  lang="ja"
                  value={practice.answer}
                  onChange={event => setPractice({ ...practice, answer: event.target.value })}
                />
              </label>
              <button className="btn" disabled={!practice.answer.trim()}>Kiểm tra</button>
            </form>
          )}
          {practice.step === "result" && (
            <div role="status" className="stack">
              <strong>{practice.correct ? "Đã nhớ đúng!" : "Chưa đúng, thử lại nhé."}</strong>
              <div className="jp" lang="ja" style={{ fontSize: 22, lineHeight: 1.8 }}>
                Đáp án: <FuriganaText text={practice.card.acceptedAnswers.join(" / ")} />
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn secondary" type="button" onClick={() => setPractice({ ...practice, step: "show", answer: "", correct: null })}>
                  Luyện lại
                </button>
                <button className="btn" type="button" onClick={() => setPractice(null)}>Xong</button>
              </div>
            </div>
          )}
        </section>
      )}
      <div className="stack">
        {snapshot.mistakes.map(mistake => (
          <article className="card card-interactive stack" key={mistake.flashcardId}>
            <div className="lesson">
              <strong className="jp" lang="ja" style={{ fontSize: 26, lineHeight: 1.8 }}>
                <FuriganaText text={mistake.japanese} />
              </strong>
              {mistake.lessonKey && (
                <span className="tag">
                  Bài {lessons.find(lesson => lesson.id === mistake.lessonKey)?.number}
                </span>
              )}
            </div>
            <div style={{ fontSize: 17 }}>{mistake.meaning}</div>
            <span className="muted">Bạn đã gõ: {mistake.typedAnswer || "(trống)"}</span>
            <div style={{ marginTop: 4 }}>
              <button
                className="btn secondary"
                type="button"
                onClick={() => setPractice({ card: mistake, step: "show", answer: "", correct: null })}
              >
                Luyện lại từ này
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
