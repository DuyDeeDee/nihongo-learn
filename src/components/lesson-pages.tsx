"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
  const visible = lessons.filter(lesson => {
    const status = stats.get(lesson.id)?.status ?? (lesson.status === "Đang học" ? "in_progress" : "not_started");
    return (volume === "all" || String(lesson.volume) === volume) &&
      (filter === "all" || status === filter) &&
      (!query.trim() || String(lesson.number).includes(query.trim()));
  });

  if (signedIn && !snapshot) {
    return (
      <div className="stack">
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
    <div className="stack" style={{ gap: 24 }}>
      <div>
        <div className="eyebrow">LỘ TRÌNH CỦA BẠN · EDITION 2</div>
        <h1 className="page-title">50 bài học</h1>
        <p className="muted">
          Minna no Nihongo N5 (Bài 1–25) & N4 (Bài 26–50). {signedIn ? "Tiến độ học được lưu tự động trên tài khoản của bạn." : "Chế độ xem demo."}
        </p>
      </div>

      <div className="card grid grid-3">
        <label className="stack">
          Volume
          <select className="input" value={volume} onChange={event => setVolume(event.target.value)}>
            <option value="all">Tất cả</option>
            <option value="1">Volume I · N5 (Bài 1–25)</option>
            <option value="2">Volume II · N4 (Bài 26–50)</option>
          </select>
        </label>
        <label className="stack">
          Trạng thái
          <select className="input" value={filter} onChange={event => setFilter(event.target.value)}>
            <option value="all">Tất cả</option>
            <option value="not_started">Chưa học</option>
            <option value="in_progress">Đang học</option>
            <option value="completed">Hoàn thành</option>
          </select>
        </label>
        <label className="stack">
          Tìm số bài
          <input className="input" inputMode="numeric" value={query} onChange={event => setQuery(event.target.value)} placeholder="Ví dụ: 12" />
        </label>
      </div>

      {visible.length === 0 && (
        <div className="card">
          <p className="muted">Không có bài nào khớp bộ lọc.</p>
        </div>
      )}

      <div className="grid grid-3">
        {visible.map(lesson => {
          const stat = stats.get(lesson.id);
          const status = stat?.status ?? (lesson.status === "Đang học" ? "in_progress" : "not_started");
          return (
            <Link className="card card-interactive stack" key={lesson.id} href={`/lessons/${lesson.id}`}>
              <div className="lesson">
                <span className="tag">Volume {lesson.volume}</span>
                <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>{label(status)}</span>
              </div>
              <h2 className="section-title">Bài {lesson.number}</h2>
              <span className="muted">
                {stat ? `${stat.vocabularyCount} từ · ${stat.grammarCount} mẫu ngữ pháp` : "Mở học liệu bài học"}
              </span>
              <strong style={{ color: "var(--red)", marginTop: "auto" }}>Mở bài →</strong>
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
      <div className="stack">
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
    <div className="stack" style={{ gap: 24 }}>
      <Link className="muted" href="/lessons">← Tất cả bài học</Link>
      <div>
        <div className="eyebrow">MINNA NO NIHONGO · VOLUME {lesson.volume}</div>
        <h1 className="page-title">Bài {lesson.number}</h1>
        <p className="muted">
          {signedIn ? "Học liệu và tiến độ của bạn được đồng bộ tự động." : "Bạn đang xem bản demo; đăng nhập để lưu học liệu."}
        </p>
      </div>

      {stat && (
        <div className="card stack">
          <div className="lesson">
            <div>
              <div className="eyebrow">TIẾN ĐỘ BÀI</div>
              <strong style={{ fontSize: 20 }}>{label(status)}</strong>
            </div>
            <span className="muted" style={{ fontSize: 15 }}>
              Quiz tốt nhất: {stat.quizBestScore === null ? "Chưa làm" : `${stat.quizBestScore}%`}
            </span>
          </div>
          {signedIn && (
            <div className="lesson">
              <label className="stack" style={{ flex: 1, minWidth: 200 }}>
                Đánh dấu trạng thái
                <select className="input" value={status} onChange={event => setChosenStatus(event.target.value as LessonProgress["status"])}>
                  <option value="not_started">Chưa học</option>
                  <option value="in_progress">Đang học</option>
                  <option value="completed">Hoàn thành</option>
                </select>
              </label>
              <button className="btn secondary" type="button" disabled={saving} onClick={() => void saveStatus()} style={{ alignSelf: "flex-end" }}>
                {saving ? "Đang lưu…" : "Lưu trạng thái"}
              </button>
            </div>
          )}
          {notice && <p role="status" style={{ color: "var(--green)" }}>{notice}</p>}
          {saveError && <p role="alert" style={{ color: "var(--red)" }}>{saveError}</p>}
        </div>
      )}

      <section className="grid grid-2">
        <Link className="card card-interactive stack" href={`/lessons/${lesson.id}/vocabulary`}>
          <span className="tag">01 · TỪ VỰNG</span>
          <h2 className="section-title">Từ vựng</h2>
          <p className="muted">
            {stat ? `${stat.vocabularyCount} từ vựng kèm cách đọc furigana` : "Xem và quản lý từ vựng của bài này."}
          </p>
          <strong style={{ color: "var(--red)" }}>Mở từ vựng →</strong>
        </Link>
        <Link className="card card-interactive stack" href={`/lessons/${lesson.id}/grammar`}>
          <span className="tag">02 · NGỮ PHÁP</span>
          <h2 className="section-title">Ngữ pháp</h2>
          <p className="muted">
            {stat ? `${stat.grammarCount} mẫu ngữ pháp và câu ví dụ` : "Xem và quản lý mẫu ngữ pháp của bài này."}
          </p>
          <strong style={{ color: "var(--red)" }}>Mở ngữ pháp →</strong>
        </Link>
      </section>

      <div className="grid grid-3">
        <Link className="btn" href={`/flashcards?lesson=${lesson.id}`}>
          Flashcard bài này
        </Link>
        <Link className="btn secondary" href={`/quiz?lesson=${lesson.id}`}>
          Quiz bài này
        </Link>
        <Link className="btn secondary" href={`/games/sentence-builder?lesson=${lesson.id}`}>
          Sentence Builder
        </Link>
        <Link className="btn secondary" href={`/games/particle-master?lesson=${lesson.id}`}>
          Particle Master
        </Link>
      </div>
    </div>
  );
}
