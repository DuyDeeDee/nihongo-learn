"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AuthPanel } from "@/components/auth-panel";
import { FuriganaText } from "@/components/furigana-text";
import { clientCache } from "@/lib/cache";
import type { Lesson } from "@/lib/data";
import { autoAnnotateFurigana } from "@/lib/furigana-dictionary";
import { isSpeechSupported, speakJapanese } from "@/lib/speech";
import { hasSupabaseConfig, supabase } from "@/lib/supabase-client";

type GrammarItem = {
  id: string;
  pattern: string;
  explanation: string;
  example_japanese: string | null;
  example_meaning: string | null;
  source_note: string | null;
  sort_order: number;
  created_at: string;
};

type Draft = {
  pattern: string;
  explanation: string;
  example_japanese: string;
  example_meaning: string;
  source_note: string;
  sort_order: string;
};

type ExamplePair = {
  japanese: string;
  meaning: string;
};

const emptyDraft: Draft = {
  pattern: "",
  explanation: "",
  example_japanese: "",
  example_meaning: "",
  source_note: "",
  sort_order: "0",
};

const columns = "id,pattern,explanation,example_japanese,example_meaning,source_note,sort_order,created_at";

function sortItems(items: GrammarItem[]) {
  return [...items].sort(
    (a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
  );
}

function errorMessage(error: unknown) {
  return error && typeof error === "object" && "message" in error && typeof error.message === "string"
    ? error.message
    : "Không thể kết nối Supabase. Vui lòng thử lại.";
}

/**
 * Intelligent parser for example sentences:
 * Supports newline-delimited sentences or comma-delimited vocab lists.
 */
function parseExamples(japaneseText: string | null, meaningText: string | null): ExamplePair[] {
  if (!japaneseText) return [];

  // If separated by newlines
  if (japaneseText.includes("\n")) {
    const jpLines = japaneseText.split("\n").map(s => s.trim()).filter(Boolean);
    const viLines = (meaningText ?? "").split("\n").map(s => s.trim()).filter(Boolean);
    return jpLines.map((jp, idx) => ({
      japanese: jp,
      meaning: viLines[idx] ?? viLines[0] ?? "",
    }));
  }

  // If comma-separated list of words (e.g. "書かない、飲まない、食べない、こない。")
  if (japaneseText.includes("、") && (meaningText ?? "").includes(",")) {
    const jpItems = japaneseText.split(/[、,]/).map(s => s.trim().replace(/[。\.]$/, "")).filter(Boolean);
    const viItems = (meaningText ?? "").split(/[,，]/).map(s => s.trim().replace(/[。\.]$/, "")).filter(Boolean);
    if (jpItems.length > 1 && jpItems.length === viItems.length) {
      return jpItems.map((jp, idx) => ({
        japanese: jp,
        meaning: viItems[idx],
      }));
    }
  }

  return [
    {
      japanese: japaneseText,
      meaning: meaningText ?? "",
    },
  ];
}

/**
 * Formats grammar explanations into structured visual cards (e.g. Groups 1, 2, 3)
 * or highlighted bullet points.
 */
function FormattedExplanation({
  text,
  mode,
}: {
  text: string;
  mode: "ruby" | "kanji-only" | "kana-only";
}) {
  const groupRegex = /Nhóm\s*1\s*[:：]/i;
  if (groupRegex.test(text) && text.includes("Nhóm 2")) {
    const n1Idx = text.search(/Nhóm\s*1\s*[:：]/i);
    const n2Idx = text.search(/Nhóm\s*2\s*[:：]/i);
    const n3Idx = text.search(/Nhóm\s*3\s*[:：]/i);

    const prefix = n1Idx > 0 ? text.slice(0, n1Idx).trim() : "";
    const n1Content = n1Idx !== -1 && n2Idx !== -1 ? text.slice(n1Idx + "Nhóm 1:".length, n2Idx).trim() : "";
    const n2Content = n2Idx !== -1 ? (n3Idx !== -1 ? text.slice(n2Idx + "Nhóm 2:".length, n3Idx).trim() : text.slice(n2Idx + "Nhóm 2:".length).trim()) : "";
    const n3Content = n3Idx !== -1 ? text.slice(n3Idx + "Nhóm 3:".length).trim() : "";

    const groups = [
      { title: "Nhóm 1 (五段)", content: n1Content, bg: "var(--blue-light)", border: "var(--blue)", badge: "#0284c7" },
      { title: "Nhóm 2 (一段)", content: n2Content, bg: "var(--green-light)", border: "var(--green)", badge: "#15803d" },
      { title: "Nhóm 3 (Bất quy tắc)", content: n3Content, bg: "#fffbeb", border: "var(--gold)", badge: "#b45309" },
    ].filter(g => g.content.length > 0);

    return (
      <div className="stack" style={{ gap: 12 }}>
        {prefix && (
          <p style={{ margin: 0, fontSize: 16 }}>
            <FuriganaText text={prefix} mode={mode} />
          </p>
        )}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 12,
          }}
        >
          {groups.map(grp => (
            <div
              key={grp.title}
              style={{
                background: grp.bg,
                border: `1.5px solid ${grp.border}`,
                borderRadius: 14,
                padding: "14px 16px",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 13,
                  color: grp.badge,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                {grp.title}
              </div>
              <div style={{ fontSize: 18, lineHeight: 2.0, color: "var(--ink)" }}>
                <FuriganaText text={grp.content} mode={mode} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Regular multi-line formatted explanation
  const lines = text.split("\n");
  return (
    <div className="stack" style={{ gap: 8 }}>
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) return null;
        const isWarning = trimmed.startsWith("⚠️") || trimmed.startsWith("Chú ý:") || trimmed.startsWith("Lưu ý:");
        if (isWarning) {
          return (
            <div
              key={idx}
              style={{
                background: "#fff7ed",
                borderLeft: "4px solid #f97316",
                padding: "10px 14px",
                borderRadius: "0 10px 10px 0",
                fontSize: 15,
                color: "#9a3412",
                lineHeight: 1.7,
              }}
            >
              <FuriganaText text={trimmed} mode={mode} />
            </div>
          );
        }
        return (
          <p key={idx} style={{ margin: 0, fontSize: 17, lineHeight: 1.85 }}>
            <FuriganaText text={line} mode={mode} />
          </p>
        );
      })}
    </div>
  );
}

export function GrammarPage({ lesson }: { lesson: Lesson }) {
  const activeUserId = useRef<string | null>(null);
  const authVersion = useRef(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(!hasSupabaseConfig);
  const [loadedForUser, setLoadedForUser] = useState<string | null>(null);
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [items, setItems] = useState<GrammarItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [readingMode, setReadingMode] = useState<"ruby" | "kana-only" | "kanji-only">("ruby");
  const [speakingText, setSpeakingText] = useState<string | null>(null);

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let active = true;
    const version = authVersion.current;
    void client.auth.getUser().then(({ data, error: authError }) => {
      if (!active || authVersion.current !== version) return;
      const id = authError ? null : (data.user?.id ?? null);
      activeUserId.current = id;
      setUserId(id);
      setAuthReady(true);
    });
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if (active) {
        if (event !== "INITIAL_SESSION") authVersion.current += 1;
        const id = session?.user?.id ?? null;
        activeUserId.current = id;
        setUserId(id);
        setAuthReady(true);
      }
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    const client = supabase;
    let active = true;

    async function load() {
      if (!client || !userId) return;
      try {
        const { data: edition, error: editionError } = await client.from("textbook_editions")
          .select("id").eq("slug", "minna-no-nihongo-shokyu-2e").single();
        if (editionError) throw editionError;
        const { data: volume, error: volumeError } = await client.from("textbook_volumes")
          .select("id").eq("edition_id", edition.id).eq("volume_number", lesson.volume).single();
        if (volumeError) throw volumeError;
        const { data: lessonRow, error: lessonError } = await client.from("lessons")
          .select("id").eq("volume_id", volume.id).eq("lesson_number", lesson.number).eq("is_active", true).single();
        if (lessonError) throw lessonError;
        const { data, error: itemsError } = await client.from("grammar_items")
          .select(columns).eq("user_id", userId).eq("lesson_id", lessonRow.id)
          .order("sort_order").order("created_at").order("id");
        if (itemsError) throw itemsError;
        if (!active) return;
        const grammarItems = (data ?? []) as GrammarItem[];
        setLessonId(lessonRow.id);
        setItems(grammarItems);
        setLoadedForUser(userId);
        if (userId) {
          clientCache.set(`grammar:${lesson.volume}:${lesson.number}:${userId}`, {
            lessonId: lessonRow.id,
            items: grammarItems,
          });
        }
      } catch (cause) {
        if (active) setError(`Không tải được ngữ pháp của bài ${lesson.number}: ${errorMessage(cause)}`);
      } finally {
        if (active) setLoading(false);
      }
    }

    void Promise.resolve().then(() => {
      if (!active) return;
      setFormOpen(false);
      setEditingId(null);
      setDraft(emptyDraft);
      setError("");
      setNotice("");
      if (!client || !userId) {
        setItems([]);
        setLessonId(null);
        setLoadedForUser(null);
        return;
      }

      // Check cache first for 0ms transition
      const cacheKey = `grammar:${lesson.volume}:${lesson.number}:${userId}`;
      const cached = clientCache.get<{ lessonId: string; items: GrammarItem[] }>(cacheKey);
      if (cached) {
        setLessonId(cached.lessonId);
        setItems(cached.items);
        setLoadedForUser(userId);
      } else {
        setLessonId(null);
        setItems([]);
        setLoadedForUser(null);
        setLoading(true);
      }

      void load();
    });
    return () => { active = false; };
  }, [lesson.number, lesson.volume, userId]);

  function change(field: keyof Draft, value: string) {
    setDraft(current => ({ ...current, [field]: value }));
  }

  function handleAutoFurigana() {
    setDraft(curr => ({
      ...curr,
      pattern: autoAnnotateFurigana(curr.pattern),
      explanation: autoAnnotateFurigana(curr.explanation),
      example_japanese: autoAnnotateFurigana(curr.example_japanese),
    }));
    setNotice("Đã tự động gắn Furigana cho các từ Hán!");
  }

  function addExampleLine() {
    setDraft(curr => ({
      ...curr,
      example_japanese: curr.example_japanese ? curr.example_japanese + "\n" : "",
      example_meaning: curr.example_meaning ? curr.example_meaning + "\n" : "",
    }));
  }

  function playSpeech(text: string) {
    setSpeakingText(text);
    speakJapanese(text);
    setTimeout(() => {
      setSpeakingText(null);
    }, 2500);
  }

  function startAdd() {
    const nextOrder = items.reduce((max, item) => Math.max(max, item.sort_order), -1) + 1;
    setDraft({ ...emptyDraft, sort_order: String(nextOrder) });
    setEditingId(null);
    setFormOpen(true);
    setError("");
    setNotice("");
  }

  function startEdit(item: GrammarItem) {
    setDraft({
      pattern: item.pattern,
      explanation: item.explanation,
      example_japanese: item.example_japanese ?? "",
      example_meaning: item.example_meaning ?? "",
      source_note: item.source_note ?? "",
      sort_order: String(item.sort_order),
    });
    setEditingId(item.id);
    setFormOpen(true);
    setError("");
    setNotice("");
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = supabase;
    if (!client || !userId || !lessonId || busy) return;
    const pattern = draft.pattern.trim();
    const explanation = draft.explanation.trim();
    const sortOrder = Number(draft.sort_order);
    if (!pattern || !explanation) {
      setError("Mẫu ngữ pháp và giải thích là bắt buộc.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    const payload = {
      pattern,
      explanation,
      example_japanese: draft.example_japanese.trim() || null,
      example_meaning: draft.example_meaning.trim() || null,
      source_note: draft.source_note.trim() || null,
      sort_order: Number.isFinite(sortOrder) ? Math.max(0, Math.floor(sortOrder)) : 0,
    };
    try {
      if (editingId) {
        const { data, error: updateError } = await client
          .from("grammar_items")
          .update(payload)
          .eq("id", editingId)
          .eq("user_id", userId)
          .eq("lesson_id", lessonId)
          .select(columns)
          .single();
        if (updateError) throw updateError;
        if (activeUserId.current !== userId) return;
        const updated = sortItems(items.map(entry => entry.id === editingId ? (data as GrammarItem) : entry));
        setItems(updated);
        clientCache.set(`grammar:${lesson.volume}:${lesson.number}:${userId}`, { lessonId, items: updated });
        setNotice("Đã cập nhật ngữ pháp.");
      } else {
        const { data, error: insertError } = await client
          .from("grammar_items")
          .insert({ ...payload, user_id: userId, lesson_id: lessonId })
          .select(columns)
          .single();
        if (insertError) throw insertError;
        if (activeUserId.current !== userId) return;
        const updated = sortItems([data as GrammarItem, ...items]);
        setItems(updated);
        clientCache.set(`grammar:${lesson.volume}:${lesson.number}:${userId}`, { lessonId, items: updated });
        setNotice("Đã thêm ngữ pháp.");
      }
      setFormOpen(false);
      setEditingId(null);
      setDraft(emptyDraft);
    } catch (cause) {
      setError(`Không lưu được ngữ pháp: ${errorMessage(cause)}`);
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: GrammarItem) {
    const client = supabase;
    if (!client || !userId || !lessonId || busy) return;
    if (!window.confirm(`Xóa “${item.pattern}” khỏi bài ${lesson.number}?`)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { data, error: deleteError } = await client
        .from("grammar_items")
        .delete()
        .eq("id", item.id)
        .eq("user_id", userId)
        .eq("lesson_id", lessonId)
        .select("id")
        .maybeSingle();
      if (deleteError) throw deleteError;
      if (!data) throw new Error("Không tìm thấy mục ngữ pháp trong bài này.");
      if (activeUserId.current !== userId) return;
      const updated = items.filter(entry => entry.id !== item.id);
      setItems(updated);
      clientCache.set(`grammar:${lesson.volume}:${lesson.number}:${userId}`, { lessonId, items: updated });
      if (editingId === item.id) {
        setFormOpen(false);
        setEditingId(null);
      }
      setNotice("Đã xóa ngữ pháp.");
    } catch (cause) {
      setError(`Không xóa được ngữ pháp: ${errorMessage(cause)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 20 }}>
      <Link href={`/lessons/${lesson.id}`} className="muted">
        ← Quay lại bài học
      </Link>
      <div className="lesson" style={{ alignItems: "flex-start", gap: 16 }}>
        <div>
          <div className="eyebrow">EDITION 2 · VOLUME {lesson.volume} · BÀI {lesson.number}</div>
          <h1 className="page-title" style={{ margin: "4px 0 0" }}>Ngữ pháp</h1>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          {/* Furigana Mode Switcher */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              background: "var(--surface)",
              border: "1px solid var(--line)",
              padding: "3px 4px",
              borderRadius: 12,
            }}
          >
            <span style={{ fontSize: 13, color: "var(--muted)", padding: "0 6px" }}>Furigana:</span>
            <button
              type="button"
              className="btn secondary"
              style={{
                padding: "4px 10px",
                fontSize: 13,
                height: "auto",
                background: readingMode === "ruby" ? "var(--blue)" : "transparent",
                color: readingMode === "ruby" ? "#fff" : "var(--ink)",
                border: "none",
                fontWeight: readingMode === "ruby" ? 600 : 400,
              }}
              onClick={() => setReadingMode("ruby")}
            >
              Chuẩn
            </button>
            <button
              type="button"
              className="btn secondary"
              style={{
                padding: "4px 10px",
                fontSize: 13,
                height: "auto",
                background: readingMode === "kana-only" ? "var(--blue)" : "transparent",
                color: readingMode === "kana-only" ? "#fff" : "var(--ink)",
                border: "none",
                fontWeight: readingMode === "kana-only" ? 600 : 400,
              }}
              onClick={() => setReadingMode("kana-only")}
            >
              Hiragana
            </button>
            <button
              type="button"
              className="btn secondary"
              style={{
                padding: "4px 10px",
                fontSize: 13,
                height: "auto",
                background: readingMode === "kanji-only" ? "var(--blue)" : "transparent",
                color: readingMode === "kanji-only" ? "#fff" : "var(--ink)",
                border: "none",
                fontWeight: readingMode === "kanji-only" ? 600 : 400,
              }}
              onClick={() => setReadingMode("kanji-only")}
            >
              Ẩn
            </button>
          </div>

          {userId && loadedForUser === userId && lessonId && (
            <button className="btn" type="button" disabled={busy} onClick={startAdd}>
              ＋ Thêm mẫu
            </button>
          )}
        </div>
      </div>

      {!hasSupabaseConfig && (
        <div className="card stack">
          <p>Để lưu ngữ pháp, hãy cấu hình Supabase trong <code>.env.local</code> rồi khởi động lại ứng dụng.</p>
          <Link href="/settings" className="btn secondary">Xem cài đặt</Link>
        </div>
      )}

      {hasSupabaseConfig && authReady && !userId && (
        <div className="stack">
          <p className="muted">Đăng nhập để xem và lưu ghi chú ngữ pháp của bạn theo từng bài.</p>
          <AuthPanel />
        </div>
      )}

      {hasSupabaseConfig && !authReady && <p className="muted">Đang kiểm tra đăng nhập…</p>}

      {userId && loading && items.length === 0 && (
        <div className="card stack">
          <div className="skeleton-shimmer" style={{ height: 26, width: "35%" }} />
          <div className="skeleton-shimmer" style={{ height: 18, width: "70%" }} />
          <div className="skeleton-shimmer" style={{ height: 44, width: "100%" }} />
        </div>
      )}

      {error && <p role="alert" style={{ color: "var(--red)" }}>{error}</p>}
      {notice && <p role="status" style={{ color: "var(--green)" }}>{notice}</p>}

      {userId && loadedForUser === userId && lessonId && (
        <>
          {formOpen && (
            <form className="card stack" onSubmit={save} style={{ border: "2px solid var(--blue)" }}>
              <div className="lesson">
                <h2 className="section-title" style={{ margin: 0 }}>
                  {editingId ? "Sửa mẫu ngữ pháp" : "Thêm mẫu ngữ pháp mới"}
                </h2>
                <button
                  type="button"
                  className="btn secondary"
                  style={{ fontSize: 13, padding: "6px 12px", background: "var(--blue-light)", color: "var(--blue-shadow)" }}
                  onClick={handleAutoFurigana}
                >
                  ✨ Tự động gắn Furigana
                </button>
              </div>

              <label className="stack">
                <span style={{ fontWeight: 600 }}>Mẫu ngữ pháp / Cấu trúc *</span>
                <input
                  className="input jp"
                  lang="ja"
                  required
                  maxLength={500}
                  value={draft.pattern}
                  onChange={e => change("pattern", e.target.value)}
                  placeholder="Ví dụ: Vないで ください (Xin đừng làm V)"
                />
              </label>

              <label className="stack">
                <span style={{ fontWeight: 600 }}>Giải thích cách dùng & Quy tắc chia *</span>
                <textarea
                  className="input"
                  required
                  rows={4}
                  maxLength={4000}
                  value={draft.explanation}
                  onChange={e => change("explanation", e.target.value)}
                  placeholder="Giải thích cách dùng, phân nhóm (Nhóm 1, Nhóm 2, Nhóm 3) hoặc lưu ý..."
                />
              </label>

              <div className="stack" style={{ gap: 10 }}>
                <div className="lesson">
                  <span style={{ fontWeight: 600 }}>Danh sách ví dụ câu thực tế</span>
                  <button
                    type="button"
                    className="btn secondary"
                    style={{ fontSize: 12, padding: "4px 8px" }}
                    onClick={addExampleLine}
                  >
                    ＋ Thêm dòng ví dụ
                  </button>
                </div>
                <div className="grid grid-2">
                  <label className="stack">
                    <span className="muted" style={{ fontSize: 13 }}>Tiếng Nhật (mỗi câu một dòng):</span>
                    <textarea
                      className="input jp"
                      lang="ja"
                      rows={4}
                      maxLength={2000}
                      value={draft.example_japanese}
                      onChange={e => change("example_japanese", e.target.value)}
                      placeholder="Câu 1&#10;Câu 2&#10;Câu 3"
                    />
                  </label>
                  <label className="stack">
                    <span className="muted" style={{ fontSize: 13 }}>Nghĩa tiếng Việt (tương ứng từng dòng):</span>
                    <textarea
                      className="input"
                      rows={4}
                      maxLength={2000}
                      value={draft.example_meaning}
                      onChange={e => change("example_meaning", e.target.value)}
                      placeholder="Dịch câu 1&#10;Dịch câu 2&#10;Dịch câu 3"
                    />
                  </label>
                </div>
              </div>

              <div className="grid grid-2">
                <label className="stack">
                  <span>Ghi chú nguồn</span>
                  <input
                    className="input"
                    maxLength={1000}
                    value={draft.source_note}
                    onChange={e => change("source_note", e.target.value)}
                    placeholder="Minna no Nihongo I - Bài 17"
                  />
                </label>
                <label className="stack">
                  <span>Thứ tự hiển thị</span>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    max={2147483647}
                    step={1}
                    required
                    value={draft.sort_order}
                    onChange={e => change("sort_order", e.target.value)}
                  />
                </label>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                <button className="btn" type="submit" disabled={busy}>
                  {busy ? "Đang lưu…" : editingId ? "Lưu thay đổi" : "Thêm mẫu"}
                </button>
                <button
                  className="btn secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setFormOpen(false);
                    setEditingId(null);
                  }}
                >
                  Hủy
                </button>
              </div>
            </form>
          )}

          {items.length === 0 && !loading && (
            <div className="card stack">
              <p className="muted">Bài này chưa có ghi chú ngữ pháp. Hãy nhập nội dung từ nguồn bạn có quyền sử dụng.</p>
              {!formOpen && (
                <button className="btn" type="button" onClick={startAdd}>
                  ＋ Thêm mẫu của bạn
                </button>
              )}
            </div>
          )}

          {items.length > 0 && (
            <>
              <p className="muted" style={{ margin: "4px 0" }}>
                {items.length} mẫu ngữ pháp trong bài {lesson.number}
              </p>
              <div className="stack" style={{ gap: 20 }}>
                {items.map(item => {
                  const examples = parseExamples(item.example_japanese, item.example_meaning);

                  return (
                    <article
                      className="card stack card-interactive"
                      key={item.id}
                      style={{
                        padding: "24px 26px",
                        borderRadius: "var(--radius-card)",
                        gap: 16,
                        boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                        border: "1.5px solid var(--line)",
                      }}
                    >
                      {/* Card Header */}
                      <div className="lesson" style={{ alignItems: "flex-start" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                          <span
                            style={{
                              background: "var(--blue-light)",
                              color: "var(--blue-shadow)",
                              padding: "4px 10px",
                              borderRadius: 8,
                              fontSize: 12,
                              fontWeight: 700,
                              letterSpacing: "0.5px",
                            }}
                          >
                            MẪU #{item.sort_order}
                          </span>
                          <strong
                            className="jp"
                            lang="ja"
                            style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.7, color: "var(--ink)" }}
                          >
                            <FuriganaText text={item.pattern} mode={readingMode} />
                          </strong>
                          {isSpeechSupported() && /[\u3040-\u30ff\u4e00-\u9faf]/.test(item.pattern) && (
                            <button
                              type="button"
                              className="btn-icon"
                              style={{
                                background: "transparent",
                                border: "none",
                                fontSize: 18,
                                padding: "4px",
                                cursor: "pointer",
                                opacity: speakingText === item.pattern ? 1 : 0.65,
                                transform: speakingText === item.pattern ? "scale(1.15)" : "none",
                                transition: "all 0.15s ease",
                              }}
                              onClick={() => playSpeech(item.pattern)}
                              title="Nghe phát âm mẫu"
                            >
                              🔊
                            </button>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                          <button
                            className="btn secondary"
                            type="button"
                            aria-label={`Sửa mẫu ${item.pattern}`}
                            disabled={busy}
                            style={{ fontSize: 13, padding: "5px 12px" }}
                            onClick={() => startEdit(item)}
                          >
                            Sửa
                          </button>
                          <button
                            className="btn secondary"
                            type="button"
                            aria-label={`Xóa mẫu ${item.pattern}`}
                            disabled={busy}
                            style={{ fontSize: 13, padding: "5px 12px" }}
                            onClick={() => void remove(item)}
                          >
                            Xóa
                          </button>
                        </div>
                      </div>

                      {/* Explanation Block (structured with group boxes or bullets) */}
                      <div style={{ background: "var(--surface)", borderRadius: 12 }}>
                        <FormattedExplanation text={item.explanation} mode={readingMode} />
                      </div>

                      {/* Multi-examples Showcase */}
                      {examples.length > 0 && (
                        <div className="stack" style={{ gap: 10, marginTop: 4 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                              Ví dụ minh họa ({examples.length})
                            </span>
                          </div>
                          <div className="stack" style={{ gap: 8 }}>
                            {examples.map((ex, exIdx) => (
                              <div
                                key={exIdx}
                                style={{
                                  display: "flex",
                                  gap: 14,
                                  alignItems: "flex-start",
                                  background: "var(--paper)",
                                  padding: "14px 18px",
                                  borderRadius: 14,
                                  border: "1.5px solid var(--line)",
                                }}
                              >
                                {isSpeechSupported() && (
                                  <button
                                    type="button"
                                    className="btn-icon"
                                    style={{
                                      background: "var(--surface)",
                                      border: "1px solid var(--line)",
                                      borderRadius: 10,
                                      fontSize: 18,
                                      width: 36,
                                      height: 36,
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      cursor: "pointer",
                                      flexShrink: 0,
                                      boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                                      transform: speakingText === ex.japanese ? "scale(1.15)" : "none",
                                      transition: "transform 0.15s ease",
                                      marginTop: 4,
                                    }}
                                    onClick={() => playSpeech(ex.japanese)}
                                    title="Phát âm câu này"
                                  >
                                    🔊
                                  </button>
                                )}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  {/* Câu tiếng Nhật (phóng to rõ ràng) */}
                                  <div
                                    className="jp"
                                    lang="ja"
                                    style={{
                                      fontSize: 24,
                                      lineHeight: 2.1,
                                      fontWeight: 600,
                                      color: "var(--ink)",
                                    }}
                                  >
                                    <FuriganaText text={ex.japanese} mode={readingMode} enableTooltip />
                                  </div>
                                  {/* Câu tiếng Việt giải thích đặt ngay dưới câu tiếng Nhật */}
                                  {ex.meaning && (
                                    <div
                                      style={{
                                        color: "#334155",
                                        fontSize: 17.5,
                                        marginTop: 8,
                                        lineHeight: 1.65,
                                        fontWeight: 500,
                                        background: "var(--surface)",
                                        borderLeft: "3.5px solid var(--blue)",
                                        padding: "8px 14px",
                                        borderRadius: "0 8px 8px 0",
                                      }}
                                    >
                                      {ex.meaning}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Source Note Footer */}
                      {item.source_note && (
                        <div style={{ marginTop: 2, paddingTop: 8, borderTop: "1px solid var(--line)" }}>
                          <small className="muted">Nguồn tham khảo: {item.source_note}</small>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
