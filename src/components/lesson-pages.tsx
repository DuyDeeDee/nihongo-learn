"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Lesson } from "@/lib/data";
import { lessons } from "@/lib/data";
import type { LessonProgress, ProgressSnapshot } from "@/lib/progress";
import { supabase } from "@/lib/supabase-client";

function useLessonProgress() {
  const [userId, setUserId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<ProgressSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let active = true;
    void client.auth.getUser().then(({ data }) => { if (active) setUserId(data.user?.id ?? null); });
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      if (active) setUserId(session?.user?.id ?? null);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) return;
      setSnapshot(null);
      setError("");
      if (!userId) return;
      setLoading(true);
      try {
        const response = await fetch("/api/progress", { cache: "no-store" });
        if (!response.ok) throw new Error("Không tải được tiến độ.");
        const data = await response.json() as ProgressSnapshot;
        if (active) setSnapshot(data);
      } catch {
        if (active) setError("Không tải được tiến độ. Vui lòng tải lại trang.");
      } finally {
        if (active) setLoading(false);
      }
    });
    return () => { active = false; };
  }, [userId]);
  return { snapshot, loading, error, signedIn: Boolean(userId) };
}

function label(status: LessonProgress["status"]) {
  return status === "completed" ? "Hoàn thành" : status === "in_progress" ? "Đang học" : "Chưa học";
}

export function LessonDirectory() {
  const { snapshot, error, signedIn } = useLessonProgress();
  const [volume, setVolume] = useState("all");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const stats = new Map(snapshot?.lessons.map(lesson => [lesson.key, lesson]) ?? []);

  // Find the first in_progress or not completed lesson for pinned hero
  const currentStat = snapshot?.lessons.find(l => l.status === "in_progress") ?? snapshot?.lessons.find(l => l.status !== "completed");
  const currentLesson = currentStat ? lessons.find(l => l.id === currentStat.key) : lessons[0];

  const visible = lessons.filter(lesson => {
    const status = stats.get(lesson.id)?.status ?? (lesson.status === "Đang học" ? "in_progress" : "not_started");
    return (volume === "all" || String(lesson.volume) === volume) &&
      (filter === "all" || status === filter) &&
      (!query.trim() || String(lesson.number).includes(query.trim()) || lesson.title.toLowerCase().includes(query.trim().toLowerCase()));
  });

  if (signedIn && !snapshot) {
    return (
      <div className="stack" style={{ gap: 20 }}>
        <h1 className="page-title">50 bài học</h1>
        {error ? (
          <p className="muted" role="alert">{error}</p>
        ) : (
          <div className="grid grid-3">
            <div className="card skeleton-shimmer" style={{ height: 130 }} />
            <div className="card skeleton-shimmer" style={{ height: 130 }} />
            <div className="card skeleton-shimmer" style={{ height: 130 }} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 28 }}>
      <div>
        <div className="eyebrow">HÀNH TRÌNH CHINH PHỤC · MINNA NO NIHONGO</div>
        <h1 className="page-title">50 bài học</h1>
        <p className="muted" style={{ margin: 0, fontSize: 16 }}>
          Volume I (N5 · Bài 1–25) và Volume II (N4 · Bài 26–50). {signedIn ? "Tiến độ học tập được lưu tự động trên tài khoản của bạn." : "Chế độ xem demo."}
        </p>
      </div>

      {/* Pinned Active Lesson Card */}
      {currentLesson && (
        <section className="card-hero-quest stack" style={{ gap: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="badge-streak">📍 BÀI ĐANG HỌC DỞ</span>
            <span className="tag" style={{ background: "var(--red)", color: "#fff", fontWeight: 700 }}>
              Bài {currentLesson.number}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14 }}>
            <div>
              <h2 className="section-title" style={{ margin: "4px 0", fontSize: 24 }}>
                Bài {currentLesson.number} · Volume {currentLesson.volume}
              </h2>
              <p className="muted" style={{ margin: 0, fontSize: 15 }}>
                {currentStat ? `${currentStat.vocabularyCount} từ vựng · ${currentStat.grammarCount} mẫu ngữ pháp` : "Mở học liệu bài học"}
              </p>
            </div>
            <Link className="btn" style={{ fontSize: 16, padding: "12px 24px" }} href={`/lessons/${currentLesson.id}`}>
              Tiếp tục học bài này →
            </Link>
          </div>
        </section>
      )}

      {/* Filter Tabs & Search */}
      <div className="card-quest stack" style={{ gap: 16 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className="tag"
            style={{
              cursor: "pointer",
              padding: "8px 16px",
              background: volume === "all" ? "var(--red)" : "var(--surface-alt)",
              color: volume === "all" ? "#fff" : "inherit",
              border: "none",
              fontWeight: 700,
            }}
            onClick={() => setVolume("all")}
          >
            Tất cả (50 bài)
          </button>
          <button
            type="button"
            className="tag"
            style={{
              cursor: "pointer",
              padding: "8px 16px",
              background: volume === "1" ? "var(--red)" : "var(--surface-alt)",
              color: volume === "1" ? "#fff" : "inherit",
              border: "none",
              fontWeight: 700,
            }}
            onClick={() => setVolume("1")}
          >
            🌟 Volume I · N5 (Bài 1–25)
          </button>
          <button
            type="button"
            className="tag"
            style={{
              cursor: "pointer",
              padding: "8px 16px",
              background: volume === "2" ? "var(--red)" : "var(--surface-alt)",
              color: volume === "2" ? "#fff" : "inherit",
              border: "none",
              fontWeight: 700,
            }}
            onClick={() => setVolume("2")}
          >
            🚀 Volume II · N4 (Bài 26–50)
          </button>
        </div>

        <div className="grid grid-2">
          <label className="stack" style={{ gap: 6 }}>
            <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>Lọc theo trạng thái</span>
            <select className="input" value={filter} onChange={event => setFilter(event.target.value)}>
              <option value="all">Tất cả trạng thái</option>
              <option value="not_started">Chưa học</option>
              <option value="in_progress">Đang học</option>
              <option value="completed">Đã hoàn thành</option>
            </select>
          </label>
          <label className="stack" style={{ gap: 6 }}>
            <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>Tìm số bài</span>
            <input className="input" inputMode="numeric" value={query} onChange={event => setQuery(event.target.value)} placeholder="Nhập số bài (ví dụ: 12)..." />
          </label>
        </div>
      </div>

      {visible.length === 0 && (
        <div className="card-quest" style={{ textAlign: "center", padding: 36 }}>
          <p className="muted" style={{ fontSize: 16 }}>Không tìm thấy bài nào khớp với bộ lọc của bạn.</p>
          <button className="btn secondary" type="button" onClick={() => { setVolume("all"); setFilter("all"); setQuery(""); }}>
            Đặt lại bộ lọc
          </button>
        </div>
      )}

      {/* Quest Lesson Cards Grid */}
      <div className="grid grid-3">
        {visible.map(lesson => {
          const stat = stats.get(lesson.id);
          const status = stat?.status ?? (lesson.status === "Đang học" ? "in_progress" : "not_started");
          return (
            <Link className="card-quest stack" key={lesson.id} href={`/lessons/${lesson.id}`} style={{ position: "relative" }}>
              <div className="lesson">
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 36,
                    height: 36,
                    borderRadius: 12,
                    background: status === "completed" ? "var(--green)" : status === "in_progress" ? "var(--red)" : "var(--surface-alt)",
                    color: status === "not_started" ? "var(--muted)" : "#fff",
                    fontWeight: 800,
                    fontSize: 15,
                  }}
                >
                  {lesson.number < 10 ? `0${lesson.number}` : lesson.number}
                </span>

                <span
                  className="tag"
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    background: status === "completed" ? "var(--green-light)" : status === "in_progress" ? "var(--red-light)" : "var(--surface-alt)",
                    color: status === "completed" ? "var(--green)" : status === "in_progress" ? "var(--red)" : "var(--muted)",
                  }}
                >
                  {label(status)}
                </span>
              </div>

              <div>
                <h2 className="section-title" style={{ margin: "6px 0 2px", fontSize: 19 }}>Bài {lesson.number}</h2>
                <span className="muted" style={{ fontSize: 13 }}>Volume {lesson.volume}</span>
              </div>

              <span className="muted" style={{ fontSize: 14 }}>
                {stat ? `${stat.vocabularyCount} từ · ${stat.grammarCount} ngữ pháp` : "Mở học liệu bài học"}
              </span>

              <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="muted" style={{ fontSize: 12 }}>
                  {stat?.quizBestScore !== null && stat?.quizBestScore !== undefined ? `Quiz: ${stat.quizBestScore}%` : "Chưa làm Quiz"}
                </span>
                <strong style={{ color: "var(--red)", fontSize: 14 }}>Vào học →</strong>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function LessonOverview({ lesson }: { lesson: Lesson }) {
  const { snapshot, error, signedIn } = useLessonProgress();
  const [chosenStatus, setChosenStatus] = useState<LessonProgress["status"] | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [saveError, setSaveError] = useState("");
  const stat = snapshot?.lessons.find(entry => entry.key === lesson.id);
  const status = chosenStatus ?? stat?.status ?? "not_started";
  const activatedRef = useRef(false);

  useEffect(() => {
    if (signedIn && stat && stat.status === "not_started" && !chosenStatus && !activatedRef.current) {
      activatedRef.current = true;
      setChosenStatus("in_progress");
      void fetch("/api/lessons/progress", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonKey: lesson.id, status: "in_progress" }),
      });
    }
  }, [signedIn, stat, chosenStatus, lesson.id]);

  async function saveStatus() {
    if (!signedIn || saving) return;
    setSaving(true); setSaveError(""); setNotice("");
    try {
      const response = await fetch("/api/lessons/progress", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonKey: lesson.id, status }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Không lưu được trạng thái.");
      setChosenStatus(data.status as LessonProgress["status"]);
      setNotice("Đã lưu trạng thái bài học.");
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : "Không lưu được trạng thái.");
    } finally {
      setSaving(false);
    }
  }

  if (signedIn && !snapshot) {
    return (
      <div className="stack" style={{ gap: 20 }}>
        <Link className="muted" href="/lessons">← Tất cả bài học</Link>
        <h1 className="page-title">Bài {lesson.number}</h1>
        {error ? (
          <p className="muted" role="alert">{error}</p>
        ) : (
          <div className="card skeleton-shimmer" style={{ height: 160 }} />
        )}
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 28 }}>
      <Link className="muted" href="/lessons" style={{ fontWeight: 600 }}>← Quay lại danh sách 50 bài</Link>

      {/* Header Lesson Hero Card */}
      <section className="card-hero-quest stack" style={{ gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="badge-streak">MINNA NO NIHONGO · VOLUME {lesson.volume}</span>
          <span
            className="tag"
            style={{
              background: status === "completed" ? "var(--green)" : status === "in_progress" ? "var(--red)" : "var(--surface-alt)",
              color: status === "not_started" ? "inherit" : "#fff",
              fontWeight: 700,
            }}
          >
            {label(status)}
          </span>
        </div>

        <div>
          <h1 className="page-title" style={{ margin: "4px 0 8px" }}>Bài {lesson.number}</h1>
          <p className="muted" style={{ margin: 0, fontSize: 16 }}>
            {stat ? `${stat.vocabularyCount} từ vựng · ${stat.grammarCount} mẫu ngữ pháp · Điểm Quiz cao nhất: ${stat.quizBestScore === null ? "Chưa làm" : `${stat.quizBestScore}%`}` : "Học liệu và tiến độ của bạn được đồng bộ tự động."}
          </p>
        </div>

        {signedIn && (
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600 }}>
              Đổi trạng thái:
              <select className="input" style={{ width: "auto", padding: "8px 12px" }} value={status} onChange={event => setChosenStatus(event.target.value as LessonProgress["status"])}>
                <option value="not_started">Chưa học</option>
                <option value="in_progress">Đang học</option>
                <option value="completed">Đã hoàn thành</option>
              </select>
            </label>
            <button className="btn secondary" type="button" disabled={saving} onClick={() => void saveStatus()} style={{ minHeight: 38, padding: "6px 14px" }}>
              {saving ? "Đang lưu…" : "Lưu trạng thái"}
            </button>
          </div>
        )}
        {notice && <p role="status" style={{ color: "var(--green)", margin: 0 }}>{notice}</p>}
        {saveError && <p role="alert" style={{ color: "var(--red)", margin: 0 }}>{saveError}</p>}
      </section>

      {/* Trạm 1: Nạp kiến thức */}
      <div className="stack" style={{ gap: 12 }}>
        <div className="eyebrow" style={{ color: "var(--blue)", display: "flex", alignItems: "center", gap: 6 }}>
          <span>📖</span> TRẠM 1 · NẠP KIẾN THỨC BÀI HỌC
        </div>
        <div className="grid grid-2">
          <Link className="card-quest stack" href={`/lessons/${lesson.id}/vocabulary`}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="tag" style={{ background: "var(--blue-light)", color: "var(--blue)", fontWeight: 700 }}>01 · TỪ VỰNG</span>
              <span className="muted" style={{ fontSize: 13 }}>{stat ? `${stat.vocabularyCount} từ` : "Chi tiết"}</span>
            </div>
            <h2 className="section-title">Kho từ vựng</h2>
            <p className="muted" style={{ margin: 0 }}>
              Từ vựng kèm Furigana, chữ Hán Kanji, âm đọc Hiragana và giải nghĩa tiếng Việt chuẩn.
            </p>
            <strong style={{ color: "var(--blue)", marginTop: "auto" }}>Mở danh sách từ vựng →</strong>
          </Link>

          <Link className="card-quest stack" href={`/lessons/${lesson.id}/grammar`}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="tag" style={{ background: "#fef08a", color: "#ca8a04", fontWeight: 700 }}>02 · NGỮ PHÁP</span>
              <span className="muted" style={{ fontSize: 13 }}>{stat ? `${stat.grammarCount} mẫu` : "Chi tiết"}</span>
            </div>
            <h2 className="section-title">Mẫu câu & Ngữ pháp</h2>
            <p className="muted" style={{ margin: 0 }}>
              Cấu trúc ngữ pháp, quy tắc kết hợp và các câu hội thoại ví dụ thực tế.
            </p>
            <strong style={{ color: "#ca8a04", marginTop: "auto" }}>Mở danh sách ngữ pháp →</strong>
          </Link>
        </div>
      </div>

      {/* Trạm 2: Luyện phản xạ & Quiz */}
      <div className="stack" style={{ gap: 12 }}>
        <div className="eyebrow" style={{ color: "var(--green)", display: "flex", alignItems: "center", gap: 6 }}>
          <span>⚡</span> TRẠM 2 · LUYỆN PHẢN XẠ & TRẮC NGHIỆM
        </div>
        <div className="grid grid-2">
          <Link className="card-quest stack" href={`/flashcards?lesson=${lesson.id}`}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="tag" style={{ background: "var(--green-light)", color: "var(--green)", fontWeight: 700 }}>🎴 FLASHCARD SRS</span>
              <span className="muted" style={{ fontSize: 13 }}>Lặp lại ngắt quãng</span>
            </div>
            <h2 className="section-title">Luyện Flashcard bài này</h2>
            <p className="muted" style={{ margin: 0 }}>
              Luyện ghi nhớ thẻ từ vựng với thuật toán FSRS. Tự gõ câu trả lời để kích hoạt trí nhớ chủ động.
            </p>
            <div style={{ marginTop: "auto" }}>
              <span className="btn green" style={{ width: "fit-content" }}>Vào luyện Flashcard →</span>
            </div>
          </Link>

          <Link className="card-quest stack" href={`/quiz?lesson=${lesson.id}`}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="tag" style={{ background: "var(--red-light)", color: "var(--red)", fontWeight: 700 }}>⚡ QUIZ TRẮC NGHIỆM</span>
              <span className="muted" style={{ fontSize: 13 }}>{stat?.quizBestScore === null ? "Chưa làm" : `${stat?.quizBestScore}%`}</span>
            </div>
            <h2 className="section-title">Kiểm tra trắc nghiệm</h2>
            <p className="muted" style={{ margin: 0 }}>
              Bộ câu hỏi kiểm tra từ vựng, ngữ pháp và ngữ cảnh giao tiếp của bài học.
            </p>
            <div style={{ marginTop: "auto" }}>
              <span className="btn" style={{ width: "fit-content" }}>Làm bài kiểm tra Quiz →</span>
            </div>
          </Link>
        </div>
      </div>

      {/* Trạm 3: Đấu trường Mini Game */}
      <div className="stack" style={{ gap: 12 }}>
        <div className="eyebrow" style={{ color: "#9333ea", display: "flex", alignItems: "center", gap: 6 }}>
          <span>🎮</span> TRẠM 3 · ĐẤU TRƯỜNG MINI GAME
        </div>
        <div className="grid grid-2">
          <Link className="card-quest stack" href={`/games/sentence-builder?lesson=${lesson.id}`}>
            <span className="tag" style={{ background: "#f3e8ff", color: "#9333ea", fontWeight: 700, width: "fit-content" }}>
              🧩 SENTENCE BUILDER
            </span>
            <h2 className="section-title">Ghép câu tiếng Nhật</h2>
            <p className="muted" style={{ margin: 0 }}>
              Sắp xếp các mảnh ghép từ vựng thành câu hoàn chỉnh theo đúng ngữ pháp bài học.
            </p>
            <strong style={{ color: "#9333ea", marginTop: "auto" }}>Vào chơi ghép câu →</strong>
          </Link>

          <Link className="card-quest stack" href={`/games/particle-master?lesson=${lesson.id}`}>
            <span className="tag" style={{ background: "#ffedd5", color: "#ea580c", fontWeight: 700, width: "fit-content" }}>
              🎯 PARTICLE MASTER
            </span>
            <h2 className="section-title">Bậc thầy trợ từ</h2>
            <p className="muted" style={{ margin: 0 }}>
              Luyện chọn trợ từ chính xác (は, を, に, で, が...) cho từng ngữ cảnh cụ thể.
            </p>
            <strong style={{ color: "#ea580c", marginTop: "auto" }}>Vào luyện trợ từ →</strong>
          </Link>
        </div>
      </div>
    </div>
  );
}
