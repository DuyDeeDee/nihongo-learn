"use client";

import Link from "next/link";
import {useEffect, useRef, useState} from "react";
import {AuthPanel} from "@/components/auth-panel";
import {ParticlePractice, SentenceBuilder} from "@/components/practice";
import {lessons} from "@/lib/data";
import type {QuizQuestion} from "@/lib/quiz-domain";
import {hasSupabaseConfig, supabase} from "@/lib/supabase-client";

type Kind = "ordering" | "particle";
type GameQuestion = QuizQuestion & {question_type: Kind};
type Draft = {prompt: string; options: string; answers: string; explanation: string; difficulty: string};
type Feedback = {correct: boolean; score: number; acceptedAnswers: string[]; explanation: string | null};
const emptyDraft: Draft = {prompt: "", options: "", answers: "", explanation: "", difficulty: "3"};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {...init, cache: "no-store"});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Yêu cầu không thành công.");
  return data as T;
}

export function GamePage({kind, lessonKey, demo = false}: {kind: Kind; lessonKey?: string; demo?: boolean}) {
  const title = kind === "ordering" ? "Sentence Builder" : "Particle Master";
  const path = kind === "ordering" ? "/games/sentence-builder" : "/games/particle-master";
  if (demo || !hasSupabaseConfig) return <div className="stack"><h1 className="page-title">{title} · demo</h1><p className="muted">Câu mẫu tự biên; kết quả demo không được lưu.</p>{kind === "ordering" ? <SentenceBuilder/> : <ParticlePractice/>}</div>;
  const lesson = lessons.find(entry => entry.id === lessonKey);
  if (!lesson) return <div className="stack"><h1 className="page-title">{title}</h1><p className="muted">Chọn bài để thêm câu của bạn và luyện tập.</p><div className="grid grid-3">{lessons.map(entry => <Link className="card stack" key={entry.id} href={`${path}?lesson=${entry.id}`}><span className="tag">Volume {entry.volume}</span><strong>Bài {entry.number}</strong><span className="muted">Mở trò chơi →</span></Link>)}</div></div>;
  return <LessonGame key={`${kind}-${lesson.id}`} kind={kind} lesson={lesson} path={path} title={title}/>;
}

function LessonGame({kind, lesson, path, title}: {kind: Kind; lesson: (typeof lessons)[number]; path: string; title: string}) {
  const authVersion = useRef(0);
  const startedAt = useRef(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [loadedForUser, setLoadedForUser] = useState<string | null>(null);
  const [questions, setQuestions] = useState<GameQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [playing, setPlaying] = useState(false);
  const [index, setIndex] = useState(0);
  const [attemptKey, setAttemptKey] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [choice, setChoice] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [correctCount, setCorrectCount] = useState(0);

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
      setLoadedForUser(null); setQuestions([]); setPlaying(false); setFormOpen(false); setError("");
      if (!userId) return;
      setLoading(true);
      try {
        const result = await requestJson<{questions: GameQuestion[]}>(
          `/api/quiz/questions?lessonKey=${encodeURIComponent(lesson.id)}&kind=${kind}`);
        if (active) {setQuestions(result.questions); setLoadedForUser(userId);}
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Không tải được trò chơi.");
      } finally {if (active) setLoading(false);}
    });
    return () => {active = false;};
  }, [kind, lesson.id, userId]);

  function startAdd() {setDraft(emptyDraft); setEditingId(null); setFormOpen(true); setError(""); setNotice("");}
  function startEdit(question: GameQuestion) {
    setDraft({prompt: question.prompt, options: question.options.join("\n"),
      answers: question.accepted_answers.join("\n"), explanation: question.explanation ?? "",
      difficulty: String(question.difficulty ?? 3)});
    setEditingId(question.id); setFormOpen(true); setError(""); setNotice("");
  }
  function change(field: keyof Draft, value: string) {setDraft(current => ({...current, [field]: value}));}

  async function saveQuestion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const payload = {lessonKey: lesson.id, prompt: draft.prompt.trim(), questionType: kind,
      options: draft.options.split("\n").map(line => line.trim()).filter(Boolean),
      acceptedAnswers: draft.answers.split("\n").map(line => line.trim()).filter(Boolean),
      explanation: draft.explanation.trim(), difficulty: Number(draft.difficulty)};
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await requestJson<{question: GameQuestion}>("/api/quiz/questions", {
        method: editingId ? "PATCH" : "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify(editingId ? {id: editingId, question: payload} : payload),
      });
      setQuestions(current => editingId
        ? current.map(question => question.id === result.question.id ? result.question : question)
        : [...current, result.question]);
      setFormOpen(false); setEditingId(null); setDraft(emptyDraft);
      setNotice(editingId ? "Đã sửa câu chơi." : "Đã thêm câu chơi.");
    } catch (cause) {setError(cause instanceof Error ? cause.message : "Không lưu được câu chơi.");}
    finally {setBusy(false);}
  }

  async function deleteQuestion(question: GameQuestion) {
    if (busy || !window.confirm(`Xóa câu chơi “${question.prompt}”?`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await requestJson("/api/quiz/questions", {method: "DELETE", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({id: question.id, lessonKey: lesson.id})});
      setQuestions(current => current.filter(entry => entry.id !== question.id));
      setNotice("Đã xóa câu chơi.");
    } catch (cause) {setError(cause instanceof Error ? cause.message : "Không xóa được câu chơi.");}
    finally {setBusy(false);}
  }

  function startGame() {
    if (!questions.length) return;
    setPlaying(true); setIndex(0); setAttemptKey(crypto.randomUUID()); setSelected([]);
    setChoice(""); setFeedback(null); setCorrectCount(0); setError(""); setNotice("");
    startedAt.current = Date.now();
  }

  async function submit() {
    const question = questions[index];
    if (!question || busy || feedback || !attemptKey) return;
    const answer = kind === "ordering" ? selected.map(position => question.options[position]) : choice;
    if (kind === "ordering" && selected.length !== question.options.length) return;
    if (kind === "particle" && !choice) return;
    setBusy(true); setError("");
    try {
      const saved = await requestJson<Feedback>("/api/games/attempt", {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({attemptKey, questionId: question.id,
          gameType: kind === "ordering" ? "sentence_builder" : "particle_master",
          answer, elapsedMs: Math.min(Date.now() - startedAt.current, 86_400_000)}),
      });
      setFeedback(saved);
      if (saved.correct) setCorrectCount(count => count + 1);
    } catch (cause) {setError(cause instanceof Error ? cause.message : "Không lưu được lượt chơi.");}
    finally {setBusy(false);}
  }

  function next() {
    setIndex(current => current + 1); setAttemptKey(crypto.randomUUID()); setSelected([]);
    setChoice(""); setFeedback(null); setError(""); startedAt.current = Date.now();
  }

  const current = questions[index];
  return <div className="stack">
    <Link className="muted" href={`/lessons/${lesson.id}`}>← Quay lại bài học</Link>
    <div className="lesson"><div><div className="eyebrow">VOLUME {lesson.volume} · BÀI {lesson.number}</div><h1 className="page-title">{title}</h1></div><Link className="btn secondary" href={path}>Chọn bài khác</Link></div>
    {!authReady && <p className="muted">Đang kiểm tra đăng nhập…</p>}
    {authReady && !userId && <div className="stack"><p className="muted">Đăng nhập để tạo câu chơi và lưu lượt luyện.</p><AuthPanel/><Link className="btn secondary" href={`${path}?demo=1`}>Thử bản demo</Link></div>}
    {userId && loading && <p className="muted">Đang tải câu chơi…</p>}
    {error && <p role="alert" style={{color: "#a34434"}}>{error}</p>}
    {notice && <p role="status" style={{color: "#526c4a"}}>{notice}</p>}
    {userId && loadedForUser === userId && !loading && <>
      {playing && index >= questions.length && <section className="card stack" aria-live="polite"><h2 className="section-title">Đã hoàn tất</h2><strong>{correctCount} / {questions.length} câu đúng</strong><p className="muted">Từng lượt chơi đã được lưu vào tài khoản của bạn.</p><button className="btn" type="button" onClick={() => setPlaying(false)}>Quản lý câu chơi</button><button className="btn secondary" type="button" onClick={startGame}>Chơi lại</button></section>}
      {playing && current && <section className="card stack"><div className="eyebrow">CÂU {index + 1} / {questions.length}</div><h2 className="section-title">{current.prompt}</h2>
        {kind === "ordering" ? <><div className="card jp" lang="ja" style={{minHeight: 64, display: "flex", gap: 8, flexWrap: "wrap"}}>{selected.map((position, chosenIndex) => <button className="tag jp" type="button" key={`${position}-${chosenIndex}`} disabled={Boolean(feedback)} onClick={() => setSelected(values => values.filter((_, index) => index !== chosenIndex))}>{current.options[position]}</button>)}</div><div style={{display: "flex", gap: 8, flexWrap: "wrap"}}>{current.options.map((token, position) => <button className="btn secondary jp" type="button" key={position} disabled={selected.includes(position) || Boolean(feedback)} onClick={() => setSelected(values => [...values, position])}>{token}</button>)}</div><button className="btn secondary" type="button" disabled={Boolean(feedback)} onClick={() => setSelected([])}>Làm lại câu</button></>
          : <><p className="jp" lang="ja" style={{fontSize: 22}}>{current.prompt.replace("＿", choice || "＿")}</p><div style={{display: "flex", gap: 8, flexWrap: "wrap"}}>{current.options.map(option => <button className={`btn ${choice === option ? "" : "secondary"} jp`} type="button" key={option} disabled={Boolean(feedback)} onClick={() => setChoice(option)}>{option}</button>)}</div></>}
        {feedback && <div role="status" className="stack"><strong>{feedback.correct ? "Chính xác!" : "Chưa đúng."}</strong><span>Đáp án: {kind === "ordering" ? feedback.acceptedAnswers.join(" ") : feedback.acceptedAnswers.join(" / ")}</span>{feedback.explanation && <p className="muted" style={{whiteSpace: "pre-wrap"}}>{feedback.explanation}</p>}</div>}
        {!feedback && <button className="btn" type="button" disabled={busy || (kind === "ordering" ? selected.length !== current.options.length : !choice)} onClick={() => void submit()}>{busy ? "Đang lưu…" : "Kiểm tra"}</button>}
        {feedback && <button className="btn" type="button" onClick={next}>{index === questions.length - 1 ? "Xem tổng kết" : "Câu tiếp theo →"}</button>}
      </section>}
      {!playing && <><div className="lesson"><p className="muted">{questions.length} câu của bạn trong bài {lesson.number}</p><button className="btn" type="button" disabled={busy} onClick={startAdd}>＋ Thêm câu</button></div>
        {formOpen && <form className="card stack" onSubmit={saveQuestion}><h2 className="section-title">{editingId ? "Sửa câu chơi" : "Thêm câu chơi"}</h2>
          <label className="stack">{kind === "ordering" ? "Gợi ý hoặc nghĩa câu *" : "Câu có chỗ trống ＿ *"}<textarea className="input" required maxLength={2000} rows={2} value={draft.prompt} onChange={event => change("prompt", event.target.value)}/></label>
          <label className="stack">{kind === "ordering" ? "Các mảnh câu tiếng Nhật, mỗi dòng một mảnh *" : "Các trợ từ lựa chọn, mỗi dòng một trợ từ *"}<textarea className="input jp" lang="ja" required rows={4} value={draft.options} onChange={event => change("options", event.target.value)}/></label>
          <label className="stack">{kind === "ordering" ? "Thứ tự đúng, mỗi dòng một mảnh *" : "Trợ từ đúng *"}<textarea className="input jp" lang="ja" required rows={4} value={draft.answers} onChange={event => change("answers", event.target.value)}/></label>
          <label className="stack">Giải thích sau khi kiểm tra<textarea className="input" maxLength={4000} rows={2} value={draft.explanation} onChange={event => change("explanation", event.target.value)}/></label>
          <label className="stack">Độ khó (1–5)<input className="input" type="number" min={1} max={5} step={1} required value={draft.difficulty} onChange={event => change("difficulty", event.target.value)}/></label>
          <div style={{display: "flex", gap: 10, flexWrap: "wrap"}}><button className="btn" type="submit" disabled={busy}>{busy ? "Đang lưu…" : "Lưu câu chơi"}</button><button className="btn secondary" type="button" disabled={busy} onClick={() => setFormOpen(false)}>Hủy</button></div>
        </form>}
        {questions.length === 0 && <div className="card stack"><p className="muted">Bài này chưa có câu chơi. Hãy tự nhập nội dung từ nguồn bạn có quyền sử dụng.</p></div>}
        {questions.length > 0 && <><button className="btn green" type="button" onClick={startGame}>Bắt đầu luyện</button><div className="stack">{questions.map((question, position) => <article className="card stack" key={question.id}><strong>Câu {position + 1}: {question.prompt}</strong><p className="muted" style={{margin: 0}}>Mảnh/lựa chọn: {question.options.join(" · ")}</p><p style={{margin: 0}}>Đáp án: {question.accepted_answers.join(kind === "ordering" ? " → " : " / ")}</p><div style={{display: "flex", gap: 10}}><button className="btn secondary" type="button" disabled={busy} onClick={() => startEdit(question)}>Sửa</button><button className="btn secondary" type="button" disabled={busy} onClick={() => void deleteQuestion(question)}>Xóa</button></div></article>)}</div></>}
      </>}
    </>}
  </div>;
}
