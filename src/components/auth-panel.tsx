"use client";
import {useEffect,useState} from "react";import type {User} from "@supabase/supabase-js";import {hasSupabaseConfig,supabase} from "@/lib/supabase-client";import {Button} from "@/components/ui/button";import {Input} from "@/components/ui/input";
export function AuthPanel(){const [email,setEmail]=useState("");const [user,setUser]=useState<User|null>(null);const [message,setMessage]=useState("");const [busy,setBusy]=useState(false);
useEffect(()=>{
  if(typeof window!=="undefined"&&window.location.search.includes("error")){
    const params=new URLSearchParams(window.location.search);
    const desc=params.get("error_description");
    if(desc){
      setMessage(desc.includes("expired")||desc.includes("invalid")
        ?"Liên kết đăng nhập đã hết hạn hoặc đã được sử dụng. Vui lòng gửi liên kết mới."
        :desc);
    }
    window.history.replaceState({},document.title,window.location.pathname);
  }
  if(!supabase)return;
  supabase.auth.getUser().then(({data})=>setUser(data.user));
  const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>setUser(session?.user??null));
  return()=>subscription.unsubscribe();
},[]);
async function signIn(e:React.FormEvent){
  e.preventDefault();
  if(!supabase)return;
  setBusy(true);
  const targetPath=location.pathname.startsWith("/auth")?"/dashboard":location.pathname;
  const cleanSearch=location.search.includes("error")?"":location.search;
  const next=encodeURIComponent(`${targetPath}${cleanSearch}`||"/dashboard");
  const {error}=await supabase.auth.signInWithOtp({email,options:{emailRedirectTo:`${location.origin}/auth/callback?next=${next}`}});
  setMessage(error?error.message:"Đã gửi liên kết đăng nhập tới email của bạn. Vui lòng kiểm tra email mới nhất!");
  setBusy(false);
}
async function signOut(){if(!supabase)return;await supabase.auth.signOut();setMessage("Đã đăng xuất.")}
return <section className="card stack"><div className="eyebrow">TÀI KHOẢN VÀ ĐỒNG BỘ</div>{!hasSupabaseConfig?<><p className="muted">Đang dùng demo cục bộ. Điền URL và anon key của project Supabase trong `.env.local`, rồi khởi động lại để bật đăng nhập và lưu dữ liệu.</p><span className="tag">Chưa kết nối Supabase</span></>:user?<><p>Đã đăng nhập: <strong>{user.email}</strong></p><Button variant="secondary" onClick={signOut}>Đăng xuất</Button></>:<form className="stack" onSubmit={signIn}><label className="muted">Email đăng nhập<Input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="ban@example.com"/></label><Button disabled={busy}>{busy?"Đang gửi…":"Gửi liên kết đăng nhập"}</Button></form>}{message&&<p className="muted" aria-live="polite">{message}</p>}</section>}
