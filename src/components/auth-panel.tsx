"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { hasSupabaseConfig, supabase } from "@/lib/supabase-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AuthPanel() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"password" | "magiclink">("password");
  const [isRegister, setIsRegister] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.search.includes("error")) {
      const params = new URLSearchParams(window.location.search);
      const desc = params.get("error_description");
      if (desc) {
        setMessage(
          desc.includes("expired") || desc.includes("invalid")
            ? "Liên kết đăng nhập đã hết hạn hoặc đã được sử dụng. Vui lòng đăng nhập bằng mật khẩu hoặc yêu cầu liên kết mới."
            : desc
        );
      }
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) =>
      setUser(session?.user ?? null)
    );
    return () => subscription.unsubscribe();
  }, []);

  async function handlePasswordAuth(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setMessage("");
    try {
      if (isRegister) {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data.session) {
          setMessage("Đăng ký thành công!");
        } else {
          setMessage("Đã đăng ký tài khoản thành công! Vui lòng đăng nhập.");
          setIsRegister(false);
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setMessage("Đăng nhập thành công!");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Đã có lỗi xảy ra.";
      setMessage(msg === "Invalid login credentials" ? "Sai email hoặc mật khẩu." : msg);
    } finally {
      setBusy(false);
    }
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setMessage("");
    const targetPath = location.pathname.startsWith("/auth") ? "/dashboard" : location.pathname;
    const cleanSearch = location.search.includes("error") ? "" : location.search;
    const next = encodeURIComponent(`${targetPath}${cleanSearch}` || "/dashboard");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback?next=${next}` },
    });
    setMessage(error ? error.message : "Đã gửi liên kết đăng nhập tới email của bạn. Vui lòng kiểm tra email mới nhất!");
    setBusy(false);
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setMessage("Đã đăng xuất.");
  }

  return (
    <section className="card stack">
      <div className="eyebrow">TÀI KHOẢN VÀ ĐỒNG BỘ</div>
      {!hasSupabaseConfig ? (
        <>
          <p className="muted">
            Đang dùng demo cục bộ. Điền URL và anon key của project Supabase trong `.env.local`, rồi khởi động lại để bật đăng nhập và lưu dữ liệu.
          </p>
          <span className="tag">Chưa kết nối Supabase</span>
        </>
      ) : user ? (
        <>
          <p>
            Đã đăng nhập: <strong>{user.email}</strong>
          </p>
          <Button variant="secondary" onClick={signOut}>
            Đăng xuất
          </Button>
        </>
      ) : (
        <div className="stack">
          <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
            <button
              type="button"
              className={`tag ${mode === "password" ? "active" : ""}`}
              style={{
                cursor: "pointer",
                padding: "6px 14px",
                borderRadius: 8,
                background: mode === "password" ? "var(--accent)" : "rgba(0,0,0,0.05)",
                color: mode === "password" ? "#fff" : "inherit",
                border: "none",
                fontWeight: 600,
              }}
              onClick={() => { setMode("password"); setMessage(""); }}
            >
              Mật khẩu (Khuyên dùng)
            </button>
            <button
              type="button"
              className={`tag ${mode === "magiclink" ? "active" : ""}`}
              style={{
                cursor: "pointer",
                padding: "6px 14px",
                borderRadius: 8,
                background: mode === "magiclink" ? "var(--accent)" : "rgba(0,0,0,0.05)",
                color: mode === "magiclink" ? "#fff" : "inherit",
                border: "none",
                fontWeight: 600,
              }}
              onClick={() => { setMode("magiclink"); setMessage(""); }}
            >
              Gửi qua Email
            </button>
          </div>

          {mode === "password" ? (
            <form className="stack" onSubmit={handlePasswordAuth}>
              <label className="muted">
                Email
                <Input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="duysonghan@gmail.com"
                />
              </label>
              <label className="muted">
                Mật khẩu
                <Input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Nhập mật khẩu"
                />
              </label>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <Button disabled={busy}>
                  {busy ? "Đang xử lý…" : isRegister ? "Tạo tài khoản" : "Đăng nhập ngay"}
                </Button>
                <button
                  type="button"
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--accent)",
                    cursor: "pointer",
                    fontSize: 13,
                    textDecoration: "underline",
                  }}
                  onClick={() => { setIsRegister(!isRegister); setMessage(""); }}
                >
                  {isRegister ? "Đã có tài khoản? Đăng nhập" : "Chưa có tài khoản? Đăng ký"}
                </button>
              </div>
            </form>
          ) : (
            <form className="stack" onSubmit={handleMagicLink}>
              <label className="muted">
                Email đăng nhập
                <Input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ban@example.com"
                />
              </label>
              <Button disabled={busy}>
                {busy ? "Đang gửi…" : "Gửi liên kết đăng nhập"}
              </Button>
            </form>
          )}
        </div>
      )}
      {message && (
        <p className="muted" role="status" aria-live="polite" style={{ color: message.includes("thành công") ? "#526c4a" : "#a34434" }}>
          {message}
        </p>
      )}
    </section>
  );
}
