"use client";

import {useEffect, useState} from "react";

type UploadedFile = {id: string; object_path: string; media_type: string; size_bytes: number; created_at: string};

export function UploadManager() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [selected, setSelected] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    void fetch("/api/account/uploads", {cache: "no-store"}).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Không tải được danh sách tệp.");
      if (active) setFiles(data.files as UploadedFile[]);
    }).catch(cause => {if (active) setError(cause instanceof Error ? cause.message : "Không tải được danh sách tệp.");})
      .finally(() => {if (active) setLoading(false);});
    return () => {active = false;};
  }, []);

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || busy) return;
    if (selected.size > 10 * 1024 * 1024) {setError("Tệp vượt quá 10 MB."); return;}
    setBusy(true); setError(""); setNotice("");
    try {
      const form = new FormData();
      form.set("file", selected);
      const response = await fetch("/api/account/uploads", {method: "POST", body: form});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Không tải được tệp.");
      setFiles(current => [data.file as UploadedFile, ...current]);
      setSelected(null);
      const input = document.getElementById("personal-upload") as HTMLInputElement | null;
      if (input) input.value = "";
      setNotice("Đã lưu tệp vào kho riêng của tài khoản.");
    } catch (cause) {setError(cause instanceof Error ? cause.message : "Không tải được tệp.");}
    finally {setBusy(false);}
  }

  async function openFile(id: string) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/account/uploads?id=${encodeURIComponent(id)}`, {cache: "no-store"});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Không mở được tệp.");
      window.location.assign(data.url as string);
    } catch (cause) {setError(cause instanceof Error ? cause.message : "Không mở được tệp."); setBusy(false);}
  }

  async function removeFile(id: string) {
    if (!window.confirm("Xóa vĩnh viễn tệp này?")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/account/uploads", {method: "DELETE",
        headers: {"Content-Type": "application/json"}, body: JSON.stringify({id})});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Không xóa được tệp.");
      setFiles(current => current.filter(file => file.id !== id));
      setNotice("Đã xóa tệp.");
    } catch (cause) {setError(cause instanceof Error ? cause.message : "Không xóa được tệp.");}
    finally {setBusy(false);}
  }

  return <section className="card stack">
    <h2 className="section-title">Tệp cá nhân</h2>
    <p className="muted">Lưu ảnh hoặc âm thanh của riêng bạn. Chấp nhận JPEG, PNG, WebP, MP3, Ogg, WAV; tối đa 10 MB mỗi tệp. Tệp được giữ riêng cho tài khoản và chưa gắn vào thẻ học.</p>
    <form className="stack" onSubmit={event => void upload(event)}>
      <label className="stack">Chọn tệp<input id="personal-upload" className="input" type="file" accept="image/jpeg,image/png,image/webp,audio/mpeg,audio/ogg,audio/wav" onChange={event => setSelected(event.target.files?.[0] ?? null)}/></label>
      <button className="btn" type="submit" disabled={!selected || busy}>{busy ? "Đang xử lý…" : "Tải tệp lên"}</button>
    </form>
    {error && <p role="alert" style={{color: "#a34434"}}>{error}</p>}
    {notice && <p role="status" style={{color: "#526c4a"}}>{notice}</p>}
    {loading ? <p className="muted">Đang tải tệp…</p> : files.length === 0 ? <p className="muted">Chưa có tệp nào.</p> :
      <div className="stack">{files.map(file => <div className="lesson" key={file.id}>
        <div><strong>{file.media_type.startsWith("image/") ? "Ảnh" : "Âm thanh"} · {new Date(file.created_at).toLocaleString("vi-VN")}</strong><div className="muted">{Math.ceil(file.size_bytes / 1024)} KB · {file.object_path.split("/").at(-1)}</div></div>
        <div style={{display: "flex", gap: 8, flexWrap: "wrap"}}><button className="btn secondary" type="button" aria-label={`Mở tệp ${file.object_path.split("/").at(-1)}`} disabled={busy} onClick={() => void openFile(file.id)}>Mở</button><button className="btn secondary" type="button" aria-label={`Xóa tệp ${file.object_path.split("/").at(-1)}`} disabled={busy} onClick={() => void removeFile(file.id)}>Xóa</button></div>
      </div>)}</div>}
    {files.length >= 100 && <p className="muted">Đang hiển thị 100 tệp mới nhất.</p>}
  </section>;
}
