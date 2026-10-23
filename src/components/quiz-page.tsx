"use client";

import Link from "next/link";
import {useEffect, useRef, useState} from "react";
import {AuthPanel} from "@/components/auth-panel";
import {QuizPractice} from "@/components/practice";
import {lessons} from "@/lib/data";
import type {QuizQuestion} from "@/lib/quiz-domain";
import {hasSupabaseConfig, supabase} from "@/lib/supabase-client";

type PublicQuestion = Pick<QuizQuestion, "id" | "prompt" | "question_type" | "options" | "difficulty">;
type QuizBankQuestion = QuizQuestion & {question_type: "multiple_choice" | "typed"};
type Attempt = {question_id: string; answer: string; is_correct: boolean};
type QuizSession = {id: string; questions: PublicQuestion[]; attempts: Attempt[]};
type AnswerResult = {correct: boolean; answer: string; acceptedAnswers: string[]; explanation: string | null};
type Summary = {correct: number; total: number; score: number};
type Draft = {
  prompt: string;
  questionType: "multiple_choice" | "typed";
  options: string;
  answers: string;
  explanation: string;
  difficulty: string;
};
const emptyDraft: Draft = {prompt: "", questionType: "multiple_choice", options: "", answers: "", explanation: "", difficulty: "3"};

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {...init, cache: "no-store"});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Yêu cầu không thành công.");
  return data as T;
}

export function QuizPage({lessonKey, demo = false}: {lessonKey?: string; demo?: boolean}) {
  if (demo || !hasSupabaseConfig) return <div className="stack"><h1 className="page-title">Quiz demo</h1><p className="muted">Câu mẫu tự biên. Kết quả demo không được lưu.</p><QuizPractice/>{hasSupabaseConfig && <Link className="btn secondary" href="/quiz">Mở Quiz cá nhân</Link>}</div>;
  const lesson = lessons.find(entry => entry.id === lessonKey);
  if (!lesson) return <div className="stack"><h1 className="page-title">Kiểm tra nhanh</h1><p className="muted">Chọn bài học để tự tạo câu hỏi và làm Quiz.</p><div className="grid grid-3">{lessons.map(entry => <Link className="card stack" key={entry.id} href={`/quiz?lesson=${entry.id}`}><span className="tag">Volume {entry.volume}</span><strong>Bài {entry.number}</strong><span className="muted">Mở Quiz →</span></Link>)}</div></div>;
  return <LessonQuiz key={lesson.id} lesson={lesson}/>;
}

function LessonQuiz({lesson}: {lesson: (typeof lessons)[number]}) {
  const authVersion = useRef(0);
  const startedAt = useRef(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(!hasSupabaseConfig);
  const [loadedForUser, setLoadedForUser] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuizBankQuestion[]>([]);
  const [session, setSession] = useState<QuizSession | null>(null);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<AnswerResult | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

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
    const {data: {subscription}} = client.auth.onAuthStateChange((event, authSession) => {
      if (!active) return;
      if (event !== "INITIAL_SESSION") authVersion.current += 1;
      setUserId(authSession?.user?.id ?? null);
      setAuthReady(true);
    });
    return () => {active = false; subscription.unsubscribe();};
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) return;
      setLoadedForUser(null);
      setQuestions([]);
      setSession(null);
      setSummary(null);
      setFormOpen(false);
      setError("");
      if (!userId) return;
      setLoading(true);
      try {
        const [bank, current] = await Promise.all([
          jsonRequest<{questions: QuizBankQuestion[]}>(`/api/quiz/questions?lessonKey=${encodeURIComponent(lesson.id)}`),
          jsonRequest<{session: QuizSession | null}>(`/api/quiz/session?lessonKey=${encodeURIComponent(lesson.id)}`),
        ]);
        if (!active) return;
        setQuestions(bank.questions);
        setSession(current.session);
        startedAt.current = Date.now();
        if (current.session) setIndex(Math.max(0, current.session.questions.findIndex(question =>
          !current.session?.attempts.some(attempt => attempt.question_id === question.id))));
        setLoadedForUser(userId);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Không tải được Quiz.");
      } finally {
        if (active) setLoading(false);
      }
    });
    return () => {active = false;};
  }, [lesson.id, userId]);

  function change(field: keyof Draft, value: string) {
    setDraft(current => ({...current, [field]: value}));
  }

  function startAdd() {
    setDraft(emptyDraft);
    setEditingId(null);
    setFormOpen(true);
    setError("");
    setNotice("");
  }

  function startEdit(question: QuizBankQuestion) {
    setDraft({
      prompt: question.prompt, questionType: question.question_type,
      options: question.options.join("\n"), answers: question.accepted_answers.join("\n"),
      explanation: question.explanation ?? "", difficulty: String(question.difficulty ?? 3),
    });
    setEditingId(question.id);
    setFormOpen(true);
    setError("");
    setNotice("");
  }

  async function saveQuestion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const payload = {
      lessonKey: lesson.id,
      prompt: draft.prompt.trim(), questionType: draft.questionType,
      options: draft.questionType === "multiple_choice" ? draft.options.split("\n").map(line => line.trim()).filter(Boolean) : [],
      acceptedAnswers: draft.answers.split("\n").map(line => line.trim()).filter(Boolean),
      explanation: draft.explanation.trim(), difficulty: Number(draft.difficulty),
    };
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await jsonRequest<{question: QuizBankQuestion}>("/api/quiz/questions", {
        method: editingId ? "PATCH" : "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(editingId ? {id: editingId, question: payload} : payload),
      });
      setQuestions(current => editingId
        ? current.map(question => question.id === result.question.id ? result.question : question)
        : [...current, result.question]);
      setFormOpen(false);
      setEditingId(null);
      setDraft(emptyDraft);
      setNotice(editingId ? "Đã sửa câu hỏi." : "Đã thêm câu hỏi.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không lưu được câu hỏi.");
    } finally {setBusy(false);}
  }

  async function deleteQuestion(question: QuizBankQuestion) {
    if (busy || !window.confirm(`Xóa câu hỏi “${question.prompt}”? Kết quả cũ của câu này cũng sẽ bị xóa.`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await jsonRequest("/api/quiz/questions", {
        method: "DELETE", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({id: question.id, lessonKey: lesson.id}),
      });
      setQuestions(current => current.filter(entry => entry.id !== question.id));
      setNotice("Đã xóa câu hỏi.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không xóa được câu hỏi.");
    } finally {setBusy(false);}
  }

  async function startQuiz() {
    if (busy) return;
    setBusy(true); setError(""); setNotice(""); setSummary(null);
    try {
      const result = await jsonRequest<{session: QuizSession}>("/api/quiz/session", {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({lessonKey: lesson.id}),
      });
      setSession(result.session);
      setIndex(Math.max(0, result.session.questions.findIndex(question =>
        !result.session.attempts.some(attempt => attempt.question_id === question.id))));
      setAnswer(""); setFeedback(null); startedAt.current = Date.now();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không bắt đầu được Quiz.");
    } finally {setBusy(false);}
  }

  async function submitAnswer() {
    const question = session?.questions[index];
    if (!question || !answer.trim() || busy || feedback) return;
    setBusy(true); setError("");
    try {
      const result = await jsonRequest<AnswerResult>("/api/quiz/answer", {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({sessionId: session!.id, questionId: question.id,
          answer, elapsedMs: Math.min(Date.now() - startedAt.current, 86_400_000)}),
      });
      setFeedback(result);
      setSession(current => current ? {...current, attempts: [...current.attempts.filter(attempt => attempt.question_id !== question.id),
        {question_id: question.id, answer: result.answer, is_correct: result.correct}]} : current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không lưu được đáp án.");
    } finally {setBusy(false);}
  }

  async function finishQuiz() {
    if (!session || busy) return;
    setBusy(true); setError("");
    try {
      const result = await jsonRequest<Summary>("/api/quiz/session", {
        method: "PATCH", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({sessionId: session.id}),
      });
      setSummary(result); setSession(null); setFeedback(null); setAnswer("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không lưu được tổng kết.");
    } finally {setBusy(false);}
  }

  const question = session?.questions[index];
  const answered = session?.attempts.some(attempt => attempt.question_id === question?.id) ?? false;
  const allAnswered = session ? session.questions.every(entry => session.attempts.some(attempt => attempt.question_id === entry.id)) : false;

  return <div className="stack">
    <Link className="muted" href={`/lessons/${lesson.id}`}>← Quay lại bài học</Link>
    <div className="lesson"><div><div className="eyebrow">VOLUME {lesson.volume} · BÀI {lesson.number}</div><h1 className="page-title">Quiz cá nhân</h1></div>
      <Link className="btn secondary" href="/quiz">Chọn bài khác</Link></div>
    {hasSupabaseConfig && !authReady && <p className="muted">Đang kiểm tra đăng nhập…</p>}
    {hasSupabaseConfig && authReady && !userId && <div className="stack"><p className="muted">Đăng nhập để tự tạo câu hỏi và lưu kết quả.</p><AuthPanel/><Link className="btn secondary" href="/quiz?demo=1">Thử Quiz demo</Link></div>}
    {userId && loading && <p className="muted">Đang tải Quiz…</p>}
    {error && <p role="alert" style={{color: "#a34434"}}>{error}</p>}
    {notice && <p role="status" style={{color: "#526c4a"}}>{notice}</p>}
    {userId && loadedForUser === userId && !loading && <>
      {summary && <section className="card stack" aria-live="polite"><h2 className="section-title">Kết quả Quiz</h2><strong style={{fontSize: 28}}>{summary.correct} / {summary.total} câu · {summary.score}%</strong><p className="muted">Điểm tốt nhất của bài đã được lưu vào tiến độ.</p><button className="btn" type="button" onClick={() => void startQuiz()} disabled={busy}>Làm lại</button></section>}
      {session && <section className="card stack">
        <div className="eyebrow">CÂU {index + 1} / {session.questions.length}</div>
        {question && <><h2 className="section-title">{question.prompt}</h2>
          {question.question_type === "multiple_choice" ? <div className="stack">{question.options.map(option => <button className={`btn ${answer === option ? "" : "secondary"}`} key={option} type="button" disabled={answered || busy} onClick={() => setAnswer(option)}>{option}</button>)}</div>
            : <label className="stack">Câu trả lời<input className="input" value={answer} disabled={answered || busy} maxLength={500} onChange={event => setAnswer(event.target.value)} placeholder="Nhập đáp án của bạn"/></label>}
          {feedback && <div role="status" className="stack"><strong>{feedback.correct ? "Chính xác!" : "Chưa đúng."}</strong><span>Đáp án: {feedback.acceptedAnswers.join(" / ")}</span>{feedback.explanation && <p className="muted" style={{whiteSpace: "pre-wrap"}}>{feedback.explanation}</p>}</div>}
          {!answered && <button className="btn" type="button" disabled={!answer.trim() || busy} onClick={() => void submitAnswer()}>{busy ? "Đang lưu…" : "Nộp đáp án"}</button>}
          {answered && !allAnswered && <button className="btn" type="button" onClick={() => {
            const next = session.questions.findIndex((entry, position) => position > index && !session.attempts.some(attempt => attempt.question_id === entry.id));
            setIndex(next >= 0 ? next : session.questions.findIndex(entry => !session.attempts.some(attempt => attempt.question_id === entry.id)));
            setAnswer(""); setFeedback(null); startedAt.current = Date.now();
          }}>Câu tiếp theo →</button>}
        </>}
        {allAnswered && <button className="btn" type="button" disabled={busy} onClick={() => void finishQuiz()}>{busy ? "Đang lưu…" : "Xem tổng kết"}</button>}
      </section>}
      {!session && <>
        <div className="lesson"><p className="muted">{questions.length} câu hỏi của bạn trong bài {lesson.number}</p><button className="btn" type="button" onClick={startAdd} disabled={busy}>＋ Thêm câu hỏi</button></div>
        {formOpen && <form className="card stack" onSubmit={saveQuestion}>
          <h2 className="section-title">{editingId ? "Sửa câu hỏi" : "Thêm câu hỏi"}</h2>
          <label className="stack">Loại câu hỏi<select className="input" value={draft.questionType} onChange={event => change("questionType", event.target.value)}><option value="multiple_choice">Trắc nghiệm</option><option value="typed">Gõ đáp án</option></select></label>
          <label className="stack">Câu hỏi *<textarea className="input" required maxLength={2000} rows={3} value={draft.prompt} onChange={event => change("prompt", event.target.value)} placeholder="Viết câu hỏi từ học liệu của bạn"/></label>
          {draft.questionType === "multiple_choice" && <label className="stack">Các lựa chọn, mỗi dòng một đáp án *<textarea className="input" required rows={4} value={draft.options} onChange={event => change("options", event.target.value)}/></label>}
          <label className="stack">{draft.questionType === "multiple_choice" ? "Đáp án đúng, trùng với một lựa chọn *" : "Đáp án chấp nhận, mỗi dòng một cách viết *"}<textarea className="input" required rows={2} value={draft.answers} onChange={event => change("answers", event.target.value)}/></label>
          <label className="stack">Giải thích sau khi nộp<textarea className="input" maxLength={4000} rows={2} value={draft.explanation} onChange={event => change("explanation", event.target.value)}/></label>
          <label className="stack">Độ khó (1–5)<input className="input" type="number" min={1} max={5} step={1} required value={draft.difficulty} onChange={event => change("difficulty", event.target.value)}/></label>
          <div style={{display: "flex", gap: 10, flexWrap: "wrap"}}><button className="btn" type="submit" disabled={busy}>{busy ? "Đang lưu…" : "Lưu câu hỏi"}</button><button className="btn secondary" type="button" disabled={busy} onClick={() => setFormOpen(false)}>Hủy</button></div>
        </form>}
        {questions.length === 0 && <div className="card stack"><p className="muted">Bài này chưa có câu hỏi. Hãy tự thêm câu hỏi từ nội dung bạn có quyền sử dụng.</p></div>}
        {questions.length > 0 && <><button className="btn green" type="button" disabled={busy} onClick={() => void startQuiz()}>Bắt đầu Quiz · tối đa 20 câu</button><div className="stack">{questions.map((entry, position) => <article className="card stack" key={entry.id}>
          <div className="lesson"><strong>Câu {position + 1}: {entry.prompt}</strong><span className="tag">{entry.question_type === "multiple_choice" ? "Trắc nghiệm" : "Gõ đáp án"}</span></div>
          {entry.question_type === "multiple_choice" && <p className="muted" style={{margin: 0}}>Lựa chọn: {entry.options.join(" · ")}</p>}
          <p style={{margin: 0}}>Đáp án: {entry.accepted_answers.join(" / ")}</p>
          {entry.explanation && <p className="muted" style={{margin: 0, whiteSpace: "pre-wrap"}}>{entry.explanation}</p>}
          <div style={{display: "flex", gap: 10, flexWrap: "wrap"}}><button className="btn secondary" type="button" disabled={busy} onClick={() => startEdit(entry)}>Sửa</button><button className="btn secondary" type="button" disabled={busy} onClick={() => void deleteQuestion(entry)}>Xóa</button></div>
        </article>)}</div></>}
      </>}
    </>}
  </div>;
}
