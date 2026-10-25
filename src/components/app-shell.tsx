"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { setAudioFeedbackEnabled, useAudioFeedbackEnabled } from "@/lib/audio-feedback";
import { navItems } from "@/lib/data";
import { hasSupabaseConfig, supabase } from "@/lib/supabase-client";

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [signedIn, setSignedIn] = useState(false);
  const soundOn = useAudioFeedbackEnabled();

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let active = true;
    void client.auth.getUser().then(({ data }) => { if (active) setSignedIn(Boolean(data.user)); });
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      if (active) setSignedIn(Boolean(session?.user));
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  function toggleSound() {
    setAudioFeedbackEnabled(!soundOn);
  }

  return (
    <div className="shell">
      <a href="#main-content" className="skip-link">Chuyển đến nội dung chính</a>
      <aside className="sidebar">
        <Link href="/dashboard" className="brand">にほんご<span> QUEST</span></Link>
        <div className="eyebrow">KHÔNG GIAN CỦA BẠN</div>
        <nav className="nav" aria-label="Điều hướng chính">
          {navItems.map(item => (
            <Link
              key={item.href}
              className={path.startsWith(item.href) ? "active" : ""}
              aria-current={path.startsWith(item.href) ? "page" : undefined}
              href={item.href}
            >
              <span aria-hidden="true" style={{ display: "inline-block", width: 26 }}>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="card stack" style={{ marginTop: "auto", padding: 18, background: "var(--surface)", border: "2px solid #fed7cc" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 20 }}>🔥</span>
            <strong style={{ fontSize: 14, color: "var(--red)" }}>CHINH PHỤC N5</strong>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
            Luyện tập 15 phút mỗi ngày để mở khóa phản xạ tiếng Nhật tự nhiên!
          </p>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <strong className="brand" style={{ fontSize: 18 }}>にほんご<span> QUEST</span></strong>
          <div className="top-extra muted" style={{ fontSize: 14 }}>
            Minna no Nihongo · Volume I & II
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              className="tag"
              type="button"
              onClick={toggleSound}
              aria-label={soundOn ? "Tắt âm thanh hiệu ứng" : "Bật âm thanh hiệu ứng"}
              title={soundOn ? "Tắt âm thanh" : "Bật âm thanh"}
              style={{ cursor: "pointer" }}
            >
              {soundOn ? "🔊 Âm thanh" : "🔇 Tắt tiếng"}
            </button>
            <Link className="tag" href="/settings" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span>⚙️</span>
              {hasSupabaseConfig && signedIn ? "Tài khoản" : "Cài đặt · Demo"}
            </Link>
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="content">
          {children}
        </main>
      </div>

      <nav className="bottom-nav" aria-label="Điều hướng trên điện thoại">
        {navItems.map(item => (
          <Link
            key={item.href}
            className={path.startsWith(item.href) ? "active" : ""}
            aria-current={path.startsWith(item.href) ? "page" : undefined}
            href={item.href}
          >
            <div aria-hidden="true" style={{ fontSize: 18 }}>{item.icon}</div>
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
