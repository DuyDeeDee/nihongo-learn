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

  const title = view === "dashboard" ? "Hôm nay" : view === "progress" ? "Tiến độ" : "Lỗi cần luyện";
  if (!hasSupabaseConfig || (authReady && !userId)) return (
    <div className="stack" style={{ gap: 24 }}>
      <section className="card-hero-quest stack" style={{ gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="badge-streak">⭐ Trải nghiệm Demo</span>
          <span className="muted" style={{ fontSize: 13 }}>50 Bài Minna no Nihongo</span>
        </div>
        <div>
          <h1 className="page-title" style={{ margin: "4px 0 8px" }}>Bắt đầu hành trình tiếng Nhật</h1>
          <p className="muted" style={{ margin: 0, fontSize: 16 }}>
            Học từ vựng, mẫu ngữ pháp và rèn luyện phản xạ với 50 bài chuẩn. Đăng nhập bên dưới để lưu chuỗi học 🔥 và tiến độ lâu dài trên Cloud.
          </p>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 4 }}>
          <Link className="btn" href="/flashcards?demo=1">🚀 Thử Flashcard demo</Link>
          <Link className="btn secondary" href="/lessons">📚 Xem 50 bài học</Link>
        </div>
      </section>

      {view === "dashboard" && (
        <div className="grid grid-3">
          <article className="card card-quest stack"><div className="eyebrow">CHUỖI HỌC · DEMO</div><strong className="big-number" style={{ color: "#ea580c" }}>4 ngày</strong><span className="muted" style={{ fontSize: 13 }}>Tự động ghi nhận khi đăng nhập</span></article>
          <article className="card card-quest stack"><div className="eyebrow">THẺ ĐẾN HẠN · DEMO</div><strong className="big-number" style={{ color: "var(--red)" }}>12 thẻ</strong><span className="muted" style={{ fontSize: 13 }}>Thuật toán FSRS sắp xếp</span></article>
          <article className="card card-quest stack"><div className="eyebrow">TIẾN ĐỘ · DEMO</div><strong className="big-number" style={{ color: "var(--blue)" }}>0 / 50 bài</strong><span className="muted" style={{ fontSize: 13 }}>Level 1 · Minna no Nihongo</span></article>
        </div>
      )}
      {hasSupabaseConfig && <AuthPanel />}
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
    const isDue = snapshot.dueCount > 0;

    return (
      <div className="stack" style={{ gap: 28 }}>
        {/* Daily Quest Hero Card */}
        <section className="card-hero-quest stack" style={{ gap: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <span className="badge-streak">
              🔥 Chuỗi {snapshot.streak} ngày liên tiếp
            </span>
            <span className="muted" style={{ fontSize: 13, fontWeight: 500 }}>
              Ngày đổi lúc {snapshot.resetHour}:00 ({snapshot.timezone})
            </span>
          </div>

          <div>
            <h1 className="page-title" style={{ margin: "4px 0 8px", fontSize: "clamp(26px, 3.5vw, 36px)" }}>
              {isDue ? `Hôm nay bạn có ${snapshot.dueCount} thẻ đến hạn!` : `Tiếp tục hành trình: Bài ${next?.number ?? 1}`}
            </h1>
            <p className="muted" style={{ fontSize: 16, margin: 0 }}>
              {isDue
                ? `Chỉ mất khoảng ${Math.max(2, Math.ceil(snapshot.dueCount * 0.4))} phút ôn lại để duy trì trí nhớ và chuỗi ngày học!`
                : `Khám phá bài học mới, nạp từ vựng và luyện tập phản xạ cùng Nihongo Quest.`}
            </p>
          </div>

          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
            {isDue ? (
              <Link className="btn" style={{ fontSize: 17, padding: "14px 28px" }} href="/review">
                🚀 ÔN {snapshot.dueCount} THẺ NGAY
              </Link>
            ) : (
              <Link className="btn" style={{ fontSize: 17, padding: "14px 28px" }} href={`/lessons/${next?.key ?? lessons[0].id}`}>
                📖 HỌC TIẾP BÀI {next?.number ?? 1} →
              </Link>
            )}
            {isDue && (
              <Link className="btn secondary" href={`/lessons/${next?.key ?? lessons[0].id}`}>
                Học bài {next?.number ?? 1} →
              </Link>
            )}
          </div>
        </section>

        {/* Bento Mini-Stats */}
        <section className="grid grid-3">
          <article className="card card-quest stack">
            <div className="eyebrow">🔥 CHUỖI HỌC</div>
            <strong className="big-number" style={{ color: "#ea580c" }}>{snapshot.streak} ngày</strong>
            <div style={{ display: "flex", gap: 6, alignItems: "center", margin: "4px 0" }}>
              {Array.from({ length: 7 }, (_, i) => {
                const active = i < snapshot.activeDaysLast7;
                return (
                  <div
                    key={i}
                    title={active ? "Ngày có học" : "Chưa học"}
                    style={{
                      flex: 1,
                      height: 8,
                      borderRadius: 4,
                      background: active ? "var(--green)" : "var(--line)",
                    }}
                  />
                );
              })}
            </div>
            <span className="muted" style={{ fontSize: 13 }}>
              {snapshot.activeDaysLast7}/7 ngày có học tuần này
            </span>
          </article>

          <article className="card card-quest stack">
            <div className="eyebrow">🎯 MỤC TIÊU HÔM NAY</div>
            <strong className="big-number">{snapshot.todayMinutes} / {snapshot.dailyGoal} phút</strong>
            <div
              className="progress"
              role="progressbar"
              aria-valuenow={Math.round(Math.min(100, (snapshot.todayMinutes / snapshot.dailyGoal) * 100))}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Tiến độ mục tiêu hôm nay"
            >
              <i
                style={{
                  display: "block",
                  height: "100%",
                  background: "var(--green)",
                  width: `${Math.min(100, (snapshot.todayMinutes / snapshot.dailyGoal) * 100)}%`,
                }}
              />
            </div>
            <span className="muted" style={{ fontSize: 13 }}>
              {snapshot.todayMinutes >= snapshot.dailyGoal ? "✓ Đã đạt chỉ tiêu ngày!" : `Còn ${Math.max(0, snapshot.dailyGoal - snapshot.todayMinutes)} phút nữa`}
            </span>
          </article>

          <article className="card card-quest stack">
            <div className="eyebrow">🏆 LỘ TRÌNH N5</div>
            <strong className="big-number" style={{ color: "var(--blue)" }}>{snapshot.completedLessons} / 50 bài</strong>
            <span className="muted" style={{ fontSize: 13 }}>
              {snapshot.flashcardCount} thẻ SRS trong bộ nhớ
            </span>
            <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
              <Link className="tag" href="/progress" style={{ fontSize: 12 }}>Xem bảng tiến độ →</Link>
            </div>
          </article>
        </section>

        {/* Quick Resume & Mistake Practice */}
        <section className="grid grid-2">
          <article className="card card-quest stack">
            <div className="eyebrow">BÀI ĐANG HỌC</div>
            <h2 className="section-title">Bài {next?.number ?? 1} · Volume {next?.volume ?? 1}</h2>
            <span className="muted">
              {next?.vocabularyCount ?? 0} từ vựng · {next?.grammarCount ?? 0} mẫu ngữ pháp
            </span>
            <Link className="btn secondary" href={`/lessons/${next?.key ?? lessons[0].id}`} style={{ marginTop: "auto" }}>
              Mở nội dung bài {next?.number ?? 1} →
            </Link>
          </article>

          <article className="card card-quest stack">
            <div className="eyebrow">LỖI CẦN LUYỆN</div>
            <h2 className="section-title">{snapshot.mistakes.length} thẻ cần củng cố</h2>
            <span className="muted">
              Các thẻ có lần trả lời gần nhất bị sai, cần ôn lại để lấy lại độ nhớ.
            </span>
            <Link
              className="btn secondary"
              href="/review/mistakes"
              style={{ marginTop: "auto" }}
            >
              {snapshot.mistakes.length > 0 ? "Bắt đầu luyện lỗi →" : "Xem danh sách lỗi"}
            </Link>
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
