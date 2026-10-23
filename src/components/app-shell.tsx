"use client";

import Link from "next/link";
import {usePathname} from "next/navigation";
import {useEffect, useState} from "react";
import {navItems} from "@/lib/data";
import {hasSupabaseConfig, supabase} from "@/lib/supabase-client";

export function AppShell({children}: {children: React.ReactNode}) {
  const path = usePathname();
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let active = true;
    void client.auth.getUser().then(({data}) => {if (active) setSignedIn(Boolean(data.user));});
    const {data: {subscription}} = client.auth.onAuthStateChange((_event, session) => {
      if (active) setSignedIn(Boolean(session?.user));
    });
    return () => {active = false; subscription.unsubscribe();};
  }, []);

  return <div className="shell">
    <aside className="sidebar">
      <Link href="/dashboard" className="brand">にほんご<span> QUEST</span></Link>
      <div className="eyebrow">KHÔNG GIAN CỦA BẠN</div>
      <nav className="nav" aria-label="Điều hướng chính">{navItems.map(item => <Link key={item.href} className={path.startsWith(item.href) ? "active" : ""} href={item.href}><span aria-hidden="true" style={{display: "inline-block", width: 26}}>{item.icon}</span>{item.label}</Link>)}</nav>
      <div className="card stack" style={{marginTop: "auto", padding: 16}}><div className="eyebrow">MỤC TIÊU HỌC</div><p className="muted" style={{margin: 0}}>Xem thời gian học và thẻ đến hạn từ dữ liệu đã lưu.</p><Link className="btn secondary" href="/dashboard">Mở tổng quan</Link></div>
    </aside>
    <div className="main"><header className="topbar"><strong className="brand" style={{fontSize: 17}}>にほんご<span> QUEST</span></strong><div className="top-extra muted" style={{fontSize: 13}}>Minna no Nihongo · Edition 2 · Volume I & II</div><Link className="tag" href="/settings">{hasSupabaseConfig && signedIn ? "Đã đăng nhập" : "Bản demo"}</Link></header><main className="content">{children}</main></div>
    <nav className="bottom-nav" aria-label="Điều hướng trên điện thoại">{navItems.slice(0, 5).map(item => <Link key={item.href} href={item.href}><div aria-hidden="true">{item.icon}</div>{item.label}</Link>)}</nav>
  </div>;
}
