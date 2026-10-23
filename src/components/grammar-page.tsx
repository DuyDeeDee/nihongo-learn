"use client";

import Link from "next/link";
import {useEffect, useRef, useState} from "react";
import {AuthPanel} from "@/components/auth-panel";
import type {Lesson} from "@/lib/data";
import {hasSupabaseConfig, supabase} from "@/lib/supabase-client";

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

const emptyDraft: Draft = {
  pattern: "", explanation: "", example_japanese: "", example_meaning: "",
  source_note: "", sort_order: "0",
};
const columns = "id,pattern,explanation,example_japanese,example_meaning,source_note,sort_order,created_at";

function sortItems(items: GrammarItem[]) {
  return [...items].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

function errorMessage(error: unknown) {
  return error && typeof error === "object" && "message" in error && typeof error.message === "string"
    ? error.message : "Không thể kết nối Supabase. Vui lòng thử lại.";
}

export function GrammarPage({lesson}: {lesson: Lesson}) {
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

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let active = true;
    const version = authVersion.current;
    void client.auth.getUser().then(({data, error: authError}) => {
      if (!active || authVersion.current !== version) return;
      const id = authError ? null : (data.user?.id ?? null);
      activeUserId.current = id;
      setUserId(id);
      setAuthReady(true);
    });
    const {data: {subscription}} = client.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event !== "INITIAL_SESSION") authVersion.current += 1;
      const id = session?.user?.id ?? null;
      activeUserId.current = id;
      setUserId(id);
      setAuthReady(true);
    });
    return () => {active = false; subscription.unsubscribe();};
  }, []);

  useEffect(() => {
    const client = supabase;
    let active = true;

    async function load() {
      if (!client || !userId) return;
      try {
        const {data: edition, error: editionError} = await client.from("textbook_editions")
          .select("id").eq("slug", "minna-no-nihongo-shokyu-2e").single();
        if (editionError) throw editionError;
        const {data: volume, error: volumeError} = await client.from("textbook_volumes")
          .select("id").eq("edition_id", edition.id).eq("volume_number", lesson.volume).single();
        if (volumeError) throw volumeError;
        const {data: lessonRow, error: lessonError} = await client.from("lessons")
          .select("id").eq("volume_id", volume.id).eq("lesson_number", lesson.number).eq("is_active", true).single();
        if (lessonError) throw lessonError;
        const {data, error: itemsError} = await client.from("grammar_items")
          .select(columns).eq("user_id", userId).eq("lesson_id", lessonRow.id)
          .order("sort_order").order("created_at").order("id");
        if (itemsError) throw itemsError;
        if (!active) return;
        setLessonId(lessonRow.id);
        setItems((data ?? []) as GrammarItem[]);
        setLoadedForUser(userId);
      } catch (cause) {
        if (active) setError(`Không tải được ngữ pháp của bài ${lesson.number}: ${errorMessage(cause)}`);
      } finally {
        if (active) setLoading(false);
      }
    }

    void Promise.resolve().then(() => {
      if (!active) return;
      setLessonId(null);
      setItems([]);
      setLoadedForUser(null);
      setFormOpen(false);
      setEditingId(null);
      setDraft(emptyDraft);
      setError("");
      setNotice("");
      if (!client || !userId) return;
      setLoading(true);
      void load();
    });
    return () => {active = false;};
  }, [lesson.number, lesson.volume, userId]);

  function change(field: keyof Draft, value: string) {
    setDraft(current => ({...current, [field]: value}));
  }

  function startAdd() {
    const nextOrder = items.reduce((max, item) => Math.max(max, item.sort_order), -1) + 1;
    setDraft({...emptyDraft, sort_order: String(nextOrder)});
    setEditingId(null);
    setFormOpen(true);
    setError("");
    setNotice("");
  }

  function startEdit(item: GrammarItem) {
    setDraft({
      pattern: item.pattern, explanation: item.explanation,
      example_japanese: item.example_japanese ?? "", example_meaning: item.example_meaning ?? "",
      source_note: item.source_note ?? "", sort_order: String(item.sort_order),
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
      setError("Vui lòng nhập mẫu ngữ pháp và giải thích.");
      return;
    }
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 2147483647) {
      setError("Thứ tự phải là số nguyên từ 0 trở lên.");
      return;
    }
    const values = {
      pattern, explanation, sort_order: sortOrder,
      example_japanese: draft.example_japanese.trim() || null,
      example_meaning: draft.example_meaning.trim() || null,
      source_note: draft.source_note.trim() || null,
    };
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = editingId
        ? await client.from("grammar_items").update(values).eq("id", editingId)
            .eq("user_id", userId).eq("lesson_id", lessonId).select(columns).maybeSingle()
        : await client.from("grammar_items").insert({...values, user_id: userId, lesson_id: lessonId})
            .select(columns).single();
      if (result.error) throw result.error;
      if (!result.data) throw new Error("Không tìm thấy ghi chú trong bài này.");
      if (activeUserId.current !== userId) return;
      const saved = result.data as GrammarItem;
      setItems(current => sortItems(editingId
        ? current.map(item => item.id === saved.id ? saved : item)
        : [...current, saved]));
      setFormOpen(false);
      setEditingId(null);
      setDraft(emptyDraft);
      setNotice(editingId ? "Đã cập nhật ngữ pháp." : "Đã thêm ngữ pháp.");
    } catch (cause) {
      if (activeUserId.current === userId) setError(`Không lưu được ngữ pháp: ${errorMessage(cause)}`);
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: GrammarItem) {
    const client = supabase;
    if (!client || !userId || !lessonId || busy) return;
    if (!window.confirm(`Xóa mẫu “${item.pattern}” khỏi bài ${lesson.number}?`)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const {data, error: deleteError} = await client.from("grammar_items")
        .delete().eq("id", item.id).eq("user_id", userId).eq("lesson_id", lessonId)
        .select("id").maybeSingle();
      if (deleteError) throw deleteError;
      if (!data) throw new Error("Không tìm thấy ghi chú trong bài này.");
      if (activeUserId.current !== userId) return;
      setItems(current => current.filter(entry => entry.id !== item.id));
      if (editingId === item.id) {setFormOpen(false); setEditingId(null);}
      setNotice("Đã xóa ngữ pháp.");
    } catch (cause) {
      if (activeUserId.current === userId) setError(`Không xóa được ngữ pháp: ${errorMessage(cause)}`);
    } finally {
      setBusy(false);
    }
  }

  return <div className="stack">
    <Link href={`/lessons/${lesson.id}`} className="muted">← Quay lại bài học</Link>
    <div className="lesson">
      <div><div className="eyebrow">EDITION 2 · VOLUME {lesson.volume} · BÀI {lesson.number}</div><h1 className="page-title">Ngữ pháp</h1></div>
      {userId && loadedForUser === userId && lessonId && <button className="btn" type="button" disabled={busy} onClick={startAdd}>＋ Thêm mẫu</button>}
    </div>
    {!hasSupabaseConfig && <div className="card stack"><p>Để lưu ngữ pháp, hãy cấu hình Supabase trong <code>.env.local</code> rồi khởi động lại ứng dụng.</p><Link href="/settings" className="btn secondary">Xem cài đặt</Link></div>}
    {hasSupabaseConfig && authReady && !userId && <div className="stack"><p className="muted">Đăng nhập để xem và lưu ghi chú ngữ pháp của bạn theo từng bài.</p><AuthPanel/></div>}
    {hasSupabaseConfig && !authReady && <p className="muted">Đang kiểm tra đăng nhập…</p>}
    {userId && loading && <p className="muted">Đang tải ngữ pháp…</p>}
    {error && <p role="alert" style={{color: "#a34434"}}>{error}</p>}
    {notice && <p role="status" style={{color: "#526c4a"}}>{notice}</p>}
    {userId && loadedForUser === userId && lessonId && !loading && <>
      {formOpen && <form className="card stack" onSubmit={save}>
        <h2 className="section-title">{editingId ? "Sửa ngữ pháp" : "Thêm ngữ pháp"}</h2>
        <label className="stack">Mẫu ngữ pháp *<input className="input jp" lang="ja" required maxLength={500} value={draft.pattern} onChange={e => change("pattern", e.target.value)} placeholder="Nhập mẫu ngữ pháp của bạn"/></label>
        <label className="stack">Giải thích *<textarea className="input" required rows={3} maxLength={4000} value={draft.explanation} onChange={e => change("explanation", e.target.value)} placeholder="Giải thích cách dùng bằng lời của bạn"/></label>
        <div className="grid grid-2">
          <label className="stack">Ví dụ tiếng Nhật<textarea className="input jp" lang="ja" rows={2} maxLength={2000} value={draft.example_japanese} onChange={e => change("example_japanese", e.target.value)}/></label>
          <label className="stack">Nghĩa ví dụ<textarea className="input" rows={2} maxLength={2000} value={draft.example_meaning} onChange={e => change("example_meaning", e.target.value)}/></label>
        </div>
        <div className="grid grid-2">
          <label className="stack">Ghi chú nguồn<input className="input" maxLength={1000} value={draft.source_note} onChange={e => change("source_note", e.target.value)}/></label>
          <label className="stack">Thứ tự trong bài<input className="input" type="number" min={0} max={2147483647} step={1} required value={draft.sort_order} onChange={e => change("sort_order", e.target.value)}/></label>
        </div>
        <div style={{display: "flex", gap: 10, flexWrap: "wrap"}}><button className="btn" type="submit" disabled={busy}>{busy ? "Đang lưu…" : editingId ? "Lưu thay đổi" : "Thêm mẫu"}</button><button className="btn secondary" type="button" disabled={busy} onClick={() => {setFormOpen(false); setEditingId(null);}}>Hủy</button></div>
      </form>}
      {items.length === 0 && <div className="card stack"><p className="muted">Bài này chưa có ghi chú ngữ pháp. Hãy nhập nội dung từ nguồn bạn có quyền sử dụng.</p>{!formOpen && <button className="btn" type="button" onClick={startAdd}>＋ Thêm mẫu của bạn</button>}</div>}
      {items.length > 0 && <><p className="muted">{items.length} mẫu ngữ pháp trong bài {lesson.number}</p><div className="stack">{items.map(item => <article className="card stack" key={item.id}>
        <div className="lesson"><strong className="jp" lang="ja" style={{fontSize: 22}}>{item.pattern}</strong><span className="tag">Thứ tự {item.sort_order}</span></div>
        <p style={{whiteSpace: "pre-wrap", margin: 0}}>{item.explanation}</p>
        {item.example_japanese && <p className="jp" lang="ja" style={{whiteSpace: "pre-wrap", margin: 0}}>{item.example_japanese}</p>}
        {item.example_meaning && <p className="muted" style={{whiteSpace: "pre-wrap", margin: 0}}>{item.example_meaning}</p>}
        {item.source_note && <small className="muted">Nguồn: {item.source_note}</small>}
        <div style={{display: "flex", gap: 10, flexWrap: "wrap"}}><button className="btn secondary" type="button" disabled={busy} onClick={() => startEdit(item)}>Sửa</button><button className="btn secondary" type="button" disabled={busy} onClick={() => void remove(item)}>Xóa</button></div>
      </article>)}</div></>}
    </>}
  </div>;
}
