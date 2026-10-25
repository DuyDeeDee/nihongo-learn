"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AuthPanel } from "@/components/auth-panel";
import { FuriganaText } from "@/components/furigana-text";
import { clientCache } from "@/lib/cache";
import type { Lesson } from "@/lib/data";
import { hasSupabaseConfig, supabase } from "@/lib/supabase-client";

type VocabularyItem = {
  id: string;
  japanese: string;
  kana: string | null;
  meaning: string;
  part_of_speech: string | null;
  example_japanese: string | null;
  example_meaning: string | null;
  source_note: string | null;
  created_at: string;
};

type Draft = {
  japanese: string;
  kana: string;
  meaning: string;
  part_of_speech: string;
  example_japanese: string;
  example_meaning: string;
  source_note: string;
};

const emptyDraft: Draft = {
  japanese: "", kana: "", meaning: "", part_of_speech: "",
  example_japanese: "", example_meaning: "", source_note: "",
};

const itemColumns = "id,japanese,kana,meaning,part_of_speech,example_japanese,example_meaning,source_note,created_at";

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Không thể kết nối Supabase. Vui lòng thử lại.";
}

export function VocabularyPage({ lesson }: { lesson: Lesson }) {
  const activeUserId = useRef<string | null>(null);
  const authVersion = useRef(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [loadedForUser, setLoadedForUser] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(!hasSupabaseConfig);
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [items, setItems] = useState<VocabularyItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

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
      if (!client) return;
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
        const { data, error: itemsError } = await client.from("vocabulary_items")
          .select(itemColumns).eq("user_id", userId).eq("lesson_id", lessonRow.id)
          .order("created_at", { ascending: false }).order("id", { ascending: false });
        if (itemsError) throw itemsError;
        if (active) {
          const vocabItems = (data ?? []) as VocabularyItem[];
          setLessonId(lessonRow.id);
          setItems(vocabItems);
          setLoadedForUser(userId);
          if (userId) {
            clientCache.set(`vocab:${lesson.volume}:${lesson.number}:${userId}`, {
              lessonId: lessonRow.id,
              items: vocabItems,
            });
          }
        }
      } catch (cause) {
        if (active) setError(`Không tải được từ vựng của bài ${lesson.number}: ${messageFrom(cause)}`);
      } finally {
        if (active) setLoading(false);
      }
    }

    void Promise.resolve().then(() => {
      if (!active) return;
      setFormOpen(false);
      setEditingId(null);
      setDraft(emptyDraft);
      if (!client || !userId) {
        setItems([]);
        setLessonId(null);
        setLoadedForUser(null);
        return;
      }

      // Check cache first for 0ms transition
      const cacheKey = `vocab:${lesson.volume}:${lesson.number}:${userId}`;
      const cached = clientCache.get<{ lessonId: string; items: VocabularyItem[] }>(cacheKey);
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

      setError("");
      setNotice("");
      void load();
    });
    return () => { active = false; };
  }, [lesson.number, lesson.volume, userId]);

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

  function startEdit(item: VocabularyItem) {
    setDraft({
      japanese: item.japanese, kana: item.kana ?? "", meaning: item.meaning,
      part_of_speech: item.part_of_speech ?? "", example_japanese: item.example_japanese ?? "",
      example_meaning: item.example_meaning ?? "", source_note: item.source_note ?? "",
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
    const japanese = draft.japanese.trim();
    const meaning = draft.meaning.trim();
    if (!japanese || !meaning) {
      setError("Từ tiếng Nhật và nghĩa là bắt buộc.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    const payload = {
      japanese,
      kana: draft.kana.trim() || null,
      meaning,
      part_of_speech: draft.part_of_speech.trim() || null,
      example_japanese: draft.example_japanese.trim() || null,
      example_meaning: draft.example_meaning.trim() || null,
      source_note: draft.source_note.trim() || null,
    };
    try {
      if (editingId) {
        const { data, error: updateError } = await client.from("vocabulary_items")
          .update(payload).eq("id", editingId).eq("user_id", userId).eq("lesson_id", lessonId)
          .select(itemColumns).single();
        if (updateError) throw updateError;
        if (activeUserId.current !== userId) return;
        const updated = items.map(entry => entry.id === editingId ? (data as VocabularyItem) : entry);
        setItems(updated);
        clientCache.set(`vocab:${lesson.volume}:${lesson.number}:${userId}`, { lessonId, items: updated });
        setNotice("Đã cập nhật từ vựng.");
      } else {
        const { data, error: insertError } = await client.from("vocabulary_items")
          .insert({ ...payload, user_id: userId, lesson_id: lessonId })
          .select(itemColumns).single();
        if (insertError) throw insertError;
        if (activeUserId.current !== userId) return;
        const updated = [data as VocabularyItem, ...items];
        setItems(updated);
        clientCache.set(`vocab:${lesson.volume}:${lesson.number}:${userId}`, { lessonId, items: updated });
        setNotice("Đã thêm từ vựng.");
      }
      setFormOpen(false);
      setEditingId(null);
      setDraft(emptyDraft);
    } catch (cause) {
      setError(`Không lưu được từ vựng: ${messageFrom(cause)}`);
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: VocabularyItem) {
    const client = supabase;
    if (!client || !userId || !lessonId || busy) return;
    if (!window.confirm(`Xóa “${item.japanese}” khỏi bài ${lesson.number}?`)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { data, error: deleteError } = await client.from("vocabulary_items")
        .delete().eq("id", item.id).eq("user_id", userId).eq("lesson_id", lessonId)
        .select("id").maybeSingle();
      if (deleteError) throw deleteError;
      if (!data) throw new Error("Không tìm thấy mục từ trong bài này.");
      if (activeUserId.current !== userId) return;
      const updated = items.filter(entry => entry.id !== item.id);
      setItems(updated);
      clientCache.set(`vocab:${lesson.volume}:${lesson.number}:${userId}`, { lessonId, items: updated });
      if (editingId === item.id) { setFormOpen(false); setEditingId(null); }
      setNotice("Đã xóa từ vựng.");
    } catch (cause) {
      setError(`Không xóa được từ vựng: ${messageFrom(cause)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <Link href={`/lessons/${lesson.id}`} className="muted">← Quay lại bài học</Link>
      <div className="lesson">
        <div>
          <div className="eyebrow">EDITION 2 · VOLUME {lesson.volume} · BÀI {lesson.number}</div>
          <h1 className="page-title">Từ vựng</h1>
        </div>
        {userId && loadedForUser === userId && lessonId && (
          <button className="btn" type="button" disabled={busy} onClick={startAdd}>＋ Thêm từ</button>
        )}
      </div>

      {!hasSupabaseConfig && (
        <div className="card stack">
          <p>Để lưu từ vựng, hãy cấu hình Supabase trong <code>.env.local</code> rồi khởi động lại ứng dụng.</p>
          <Link href="/settings" className="btn secondary">Xem cài đặt</Link>
        </div>
      )}

      {hasSupabaseConfig && authReady && !userId && (
        <div className="stack">
          <p className="muted">Đăng nhập để xem và lưu từ vựng của bạn theo từng bài.</p>
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
            <form className="card stack" onSubmit={save}>
              <h2 className="section-title">{editingId ? "Sửa từ vựng" : "Thêm từ vựng"}</h2>
              <div className="grid grid-2">
                <label className="stack">
                  Từ tiếng Nhật *
                  <input
                    className="input jp"
                    lang="ja"
                    required
                    maxLength={500}
                    value={draft.japanese}
                    onChange={e => change("japanese", e.target.value)}
                    placeholder="例: 日本語"
                  />
                </label>
                <label className="stack">
                  Cách đọc (kana)
                  <input
                    className="input jp"
                    lang="ja"
                    maxLength={500}
                    value={draft.kana}
                    onChange={e => change("kana", e.target.value)}
                    placeholder="例: にほんご"
                  />
                </label>
                <label className="stack">
                  Nghĩa tiếng Việt *
                  <input
                    className="input"
                    required
                    maxLength={2000}
                    value={draft.meaning}
                    onChange={e => change("meaning", e.target.value)}
                    placeholder="Nghĩa của từ"
                  />
                </label>
                <label className="stack">
                  Loại từ
                  <input
                    className="input"
                    value={draft.part_of_speech}
                    onChange={e => change("part_of_speech", e.target.value)}
                    placeholder="Danh từ, động từ…"
                  />
                </label>
                <label className="stack">
                  Ví dụ tiếng Nhật
                  <textarea
                    className="input jp"
                    lang="ja"
                    rows={2}
                    maxLength={2000}
                    value={draft.example_japanese}
                    onChange={e => change("example_japanese", e.target.value)}
                  />
                </label>
                <label className="stack">
                  Nghĩa ví dụ
                  <textarea
                    className="input"
                    rows={2}
                    maxLength={2000}
                    value={draft.example_meaning}
                    onChange={e => change("example_meaning", e.target.value)}
                  />
                </label>
              </div>
              <label className="stack">
                Ghi chú nguồn
                <input
                  className="input"
                  maxLength={1000}
                  value={draft.source_note}
                  onChange={e => change("source_note", e.target.value)}
                />
              </label>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button className="btn" type="submit" disabled={busy}>{busy ? "Đang lưu…" : editingId ? "Lưu thay đổi" : "Thêm từ"}</button>
                <button className="btn secondary" type="button" disabled={busy} onClick={() => { setFormOpen(false); setEditingId(null); }}>Hủy</button>
              </div>
            </form>
          )}

          {items.length === 0 && !loading && (
            <div className="card stack">
              <p className="muted">Bài này chưa có từ vựng. Hãy nhập nội dung từ nguồn bạn có quyền sử dụng.</p>
              {!formOpen && <button className="btn" type="button" onClick={startAdd}>＋ Thêm từ của bạn</button>}
            </div>
          )}

          {items.length > 0 && (
            <>
              <div className="lesson">
                <p className="muted">{items.length} mục từ trong bài {lesson.number}</p>
                <Link className="btn secondary" href={`/flashcards?lesson=${lesson.id}`}>Ôn Flashcard bài này</Link>
              </div>
              <div className="stack">
                {items.map(item => (
                  <article className="card stack card-interactive" key={item.id}>
                    <div className="lesson">
                      <div>
                        <strong className="jp" lang="ja" style={{ fontSize: 32, lineHeight: 2.0 }}>
                          <FuriganaText japanese={item.japanese} kana={item.kana} />
                        </strong>
                        {item.kana && item.japanese !== item.kana && (
                          <span className="jp muted" lang="ja" style={{ fontSize: 18 }}> · {item.kana}</span>
                        )}
                      </div>
                      {item.part_of_speech && <span className="tag">{item.part_of_speech}</span>}
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 500 }}>{item.meaning}</div>
                    {item.example_japanese && (
                      <p className="jp" lang="ja" style={{ margin: 0, fontSize: 22, lineHeight: 2.1 }}>
                        <FuriganaText text={item.example_japanese} />
                      </p>
                    )}
                    {item.example_meaning && (
                      <p className="muted" style={{ margin: 0, fontSize: 16.5, lineHeight: 1.6 }}>{item.example_meaning}</p>
                    )}
                    {item.source_note && <small className="muted">Nguồn: {item.source_note}</small>}
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
                      <button className="btn secondary" type="button" aria-label={`Sửa từ ${item.japanese}`} disabled={busy} onClick={() => startEdit(item)}>Sửa</button>
                      <button className="btn secondary" type="button" aria-label={`Xóa từ ${item.japanese}`} disabled={busy} onClick={() => void remove(item)}>Xóa</button>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
