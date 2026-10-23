"use client";

import Link from "next/link";
import {useEffect, useRef, useState} from "react";
import {AuthPanel} from "@/components/auth-panel";
import {UploadManager} from "@/components/upload-manager";
import {hasSupabaseConfig, supabase} from "@/lib/supabase-client";

type Preferences = {
  volume: number;
  dailyGoal: number;
  timezone: string;
  reviewResetHour: number;
  answerMode: "kana" | "kanji" | "flexible";
};
const defaults: Preferences = {volume: 1, dailyGoal: 20,
  timezone: "Asia/Ho_Chi_Minh", reviewResetHour: 4, answerMode: "flexible"};
const demoKey = "nihongo-demo-preferences";

export function PreferencesPage({view}: {view: "setup" | "settings"}) {
  const authVersion = useRef(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(!hasSupabaseConfig);
  const [preferences, setPreferences] = useState<Preferences>(defaults);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmationText, setConfirmationText] = useState("");

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let active = true;
    const version = authVersion.current;
    void client.auth.getUser().then(({data, error: authError}) => {
      if (!active || authVersion.current !== version) return;
      setUserId(authError ? null : (data.user?.id ?? null));
      setAuthReady(true);
    });
    const {data: {subscription}} = client.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event !== "INITIAL_SESSION") authVersion.current += 1;
      setUserId(session?.user?.id ?? null);
      setAuthReady(true);
    });
    return () => {active = false; subscription.unsubscribe();};
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) return;
      setError(""); setNotice("");
      if (!userId) {
        try {
          const saved = window.localStorage.getItem(demoKey);
          if (saved) setPreferences({...defaults, ...JSON.parse(saved)});
          else setPreferences(defaults);
        } catch {setPreferences(defaults);}
        return;
      }
      setLoading(true);
      try {
        const response = await fetch("/api/preferences", {cache: "no-store"});
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Không tải được cài đặt.");
        if (active) setPreferences(data as Preferences);
      } catch (cause) {if (active) setError(cause instanceof Error ? cause.message : "Không tải được cài đặt.");}
      finally {if (active) setLoading(false);}
    });
    return () => {active = false;};
  }, [userId]);

  function change<K extends keyof Preferences>(field: K, value: Preferences[K]) {
    setPreferences(current => ({...current, [field]: value}));
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (preferences.dailyGoal < 1 || preferences.dailyGoal > 200 ||
        preferences.reviewResetHour < 0 || preferences.reviewResetHour > 23) {
      setError("Mục tiêu hoặc giờ đổi ngày không hợp lệ."); return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      if (userId) {
        const response = await fetch("/api/preferences", {method: "PUT",
          headers: {"Content-Type": "application/json"}, body: JSON.stringify(preferences)});
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Không lưu được cài đặt.");
        setNotice("Đã lưu cài đặt vào tài khoản Supabase.");
      } else {
        new Intl.DateTimeFormat("en-US", {timeZone: preferences.timezone});
        window.localStorage.setItem(demoKey, JSON.stringify(preferences));
        setNotice("Đã lưu lựa chọn demo trên trình duyệt này. Dữ liệu học demo vẫn không đồng bộ.");
      }
    } catch (cause) {setError(cause instanceof Error ? cause.message : "Không lưu được cài đặt.");}
    finally {setBusy(false);}
  }

  async function removeAll() {
    if (!userId || busy || confirmationText !== "XÓA DỮ LIỆU") return;
    if (!window.confirm("Xóa vĩnh viễn toàn bộ học liệu, kết quả và cài đặt đã lưu? Tài khoản đăng nhập vẫn được giữ.")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/account/data", {method: "DELETE",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({confirmation: confirmationText})});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Không xóa được dữ liệu.");
      setPreferences(defaults); setConfirmationText("");
      setNotice("Đã xóa dữ liệu học tập. Tài khoản của bạn vẫn còn và có thể bắt đầu lại.");
    } catch (cause) {setError(cause instanceof Error ? cause.message : "Không xóa được dữ liệu.");}
    finally {setBusy(false);}
  }

  return <div className="stack" style={{maxWidth: 760}}>
    <div><div className="eyebrow">{view === "setup" ? "BẮT ĐẦU HỌC" : "CÁ NHÂN HÓA"}</div><h1 className="page-title">{view === "setup" ? "Thiết lập học tập" : "Cài đặt"}</h1><p className="muted">Chọn mục tiêu và cách ôn phù hợp với lịch của bạn.</p></div>
    {hasSupabaseConfig && !authReady && <p className="muted">Đang kiểm tra đăng nhập…</p>}
    {authReady && !userId && <div className="stack"><p className="muted">Bạn đang ở chế độ demo. Đăng nhập để lưu cài đặt trên Supabase.</p>{hasSupabaseConfig && <AuthPanel/>}</div>}
    {loading && <p className="muted">Đang tải cài đặt…</p>}
    {error && <p role="alert" style={{color: "#a34434"}}>{error}</p>}
    {notice && <p role="status" style={{color: "#526c4a"}}>{notice}</p>}
    {!loading && <form className="card stack" onSubmit={save}>
      <label className="stack">Edition<select className="input" disabled><option>Minna no Nihongo · Edition 2</option></select></label>
      <label className="stack">Volume đang học<select className="input" value={preferences.volume} onChange={event => change("volume", Number(event.target.value))}><option value={1}>Volume I · Bài 1–25</option><option value={2}>Volume II · Bài 26–50</option></select></label>
      <div className="grid grid-2"><label className="stack">Mục tiêu mỗi ngày (phút)<input className="input" type="number" required min={1} max={200} step={1} value={preferences.dailyGoal} onChange={event => change("dailyGoal", Number(event.target.value))}/></label><label className="stack">Giờ đổi ngày học<input className="input" type="number" required min={0} max={23} step={1} value={preferences.reviewResetHour} onChange={event => change("reviewResetHour", Number(event.target.value))}/></label></div>
      <label className="stack">Múi giờ IANA<input className="input" list="nihongo-timezones" required maxLength={100} value={preferences.timezone} onChange={event => change("timezone", event.target.value)} placeholder="Asia/Ho_Chi_Minh"/><datalist id="nihongo-timezones"><option value="Asia/Ho_Chi_Minh"/><option value="Asia/Bangkok"/><option value="Asia/Tokyo"/><option value="UTC"/></datalist></label>
      <label className="stack">Chế độ trả lời Flashcard mặc định<select className="input" value={preferences.answerMode} onChange={event => change("answerMode", event.target.value as Preferences["answerMode"])}><option value="flexible">Flexible · chấp nhận cách viết hợp lệ</option><option value="kana">Kana · gõ cách đọc</option><option value="kanji">Kanji · yêu cầu chữ Hán</option></select></label>
      <button className="btn" type="submit" disabled={busy || !authReady}>{busy ? "Đang lưu…" : userId ? "Lưu vào tài khoản" : "Lưu lựa chọn demo"}</button>
    </form>}
    {view === "settings" && userId && <UploadManager/>}
    {view === "settings" && userId && <section className="card stack"><h2 className="section-title">Dữ liệu của bạn</h2><p className="muted">Xuất dữ liệu dạng JSON trước khi xóa. Bản xuất gồm dữ liệu bảng; tệp đã tải lên Storage không nằm trong JSON.</p><a className="btn secondary" href="/api/account/export" download>Xuất dữ liệu JSON</a><hr style={{width: "100%", border: 0, borderTop: "1px solid var(--line)"}}/><p>Xóa vĩnh viễn học liệu, lịch ôn, kết quả Quiz/Games, tệp cá nhân và cài đặt. Tài khoản đăng nhập được giữ lại.</p><label className="stack">Gõ XÓA DỮ LIỆU để xác nhận<input className="input" value={confirmationText} onChange={event => setConfirmationText(event.target.value)} autoComplete="off"/></label><button className="btn" style={{background: "#a34434"}} type="button" disabled={busy || confirmationText !== "XÓA DỮ LIỆU"} onClick={() => void removeAll()}>Xóa toàn bộ dữ liệu học tập</button></section>}
    <div style={{display: "flex", gap: 10, flexWrap: "wrap"}}><Link className="btn secondary" href="/dashboard">Mở tổng quan →</Link><Link className="btn secondary" href="/lessons">Xem các bài học</Link></div>
  </div>;
}
