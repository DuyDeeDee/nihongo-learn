// Run against a local production server (default port 3105). Temporary user is removed in finally.
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createServerClient} from "@supabase/ssr";
import {createClient} from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appUrl = process.env.STUDY_SMOKE_APP_URL ?? "http://127.0.0.1:3105";
if (!url || !anonKey || !serviceKey) throw new Error("Missing Supabase configuration");
const admin = createClient(url, serviceKey, {auth: {persistSession: false, autoRefreshToken: false}});
const cookies = new Map();
const client = createServerClient(url, anonKey, {
  cookies: {
    getAll: () => [...cookies].map(([name, value]) => ({name, value})),
    setAll: values => values.forEach(({name, value}) => cookies.set(name, value)),
  },
});
function value(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}
async function api(path, options = {}) {
  const response = await fetch(`${appUrl}${path}`, {
    ...options,
    headers: {
      Cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join("; "),
      ...(options.body && !(options.body instanceof FormData) ? {"Content-Type": "application/json"} : {}),
    },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}: ${data.error ?? "Unknown error"}`);
  return data;
}

let testUserId;
try {
  const email = `nihongo-api-smoke-${randomUUID()}@example.com`;
  const password = `${randomUUID()}Aa1!`;
  const created = value(await admin.auth.admin.createUser({email, password, email_confirm: true}), "Create user");
  testUserId = created.user.id;
  value(await client.auth.signInWithPassword({email, password}), "Sign in");
  assert.ok(cookies.size > 0);
  const edition = value(await client.from("textbook_editions")
    .select("id").eq("slug", "minna-no-nihongo-shokyu-2e").single(), "Edition");
  const volume = value(await client.from("textbook_volumes")
    .select("id").eq("edition_id", edition.id).eq("volume_number", 1).single(), "Volume");
  const lesson = value(await client.from("lessons")
    .select("id").eq("volume_id", volume.id).eq("lesson_number", 1).single(), "Lesson");
  value(await client.from("vocabulary_items")
    .insert({user_id: testUserId, lesson_id: lesson.id, japanese: "水", kana: "みず", meaning: "nước"}), "Add word");

  const before = await api("/api/study?lessonKey=minna-2e-1-1");
  assert.equal(before.gradingReady, true);
  assert.equal(before.dueCount, 1);
  const started = await api("/api/study", {
    method: "POST", body: JSON.stringify({lessonKey: "minna-2e-1-1", mode: "flexible"}),
  });
  assert.equal(started.session.cards.length, 1);
  const cardId = started.session.cards[0].sessionCardId;
  const graded = await api("/api/study/grade", {
    method: "POST", body: JSON.stringify({sessionCardId: cardId, answer: "ちがう", rating: "again", elapsedMs: 700}),
  });
  assert.equal(graded.correct, false);
  const repeated = await api("/api/study/grade", {
    method: "POST", body: JSON.stringify({sessionCardId: cardId, answer: "ちがう", rating: "again", elapsedMs: 700}),
  });
  assert.equal(repeated.logId, graded.logId);
  const resumed = await api("/api/study");
  assert.equal(resumed.session.cards[0].graded, true);
  assert.equal(resumed.session.cards[0].retryCompleted, false);
  const retry = await api("/api/study/retry", {
    method: "POST", body: JSON.stringify({sessionCardId: cardId, answer: "みず"}),
  });
  assert.equal(retry.correct, true);
  value(await client.rpc("finish_flashcard_session", {p_session_id: started.session.id}), "Finish session");

  const question = (await api("/api/quiz/questions", {
    method: "POST", body: JSON.stringify({lessonKey: "minna-2e-1-1", prompt: "Nghĩa của 水 là gì?",
      questionType: "multiple_choice", options: ["nước", "lửa"], acceptedAnswers: ["nước"],
      explanation: "Câu hỏi tự biên cho smoke test.", difficulty: 1}),
  })).question;
  const bank = await api("/api/quiz/questions?lessonKey=minna-2e-1-1");
  assert.equal(bank.questions.length, 1);
  assert.equal(bank.questions[0].id, question.id);
  const quiz = await api("/api/quiz/session", {
    method: "POST", body: JSON.stringify({lessonKey: "minna-2e-1-1"}),
  });
  assert.equal(quiz.session.questions.length, 1);
  assert.equal(quiz.session.questions[0].accepted_answers, undefined);
  const directAttempt = await client.from("quiz_attempts").insert({
    user_id: testUserId, session_id: quiz.session.id, question_id: question.id,
    answer: "lửa", is_correct: true,
  });
  assert.ok(directAttempt.error, "Browser must not submit its own quiz grade");
  const answered = await api("/api/quiz/answer", {
    method: "POST", body: JSON.stringify({sessionId: quiz.session.id, questionId: question.id,
      answer: "nước", elapsedMs: 800}),
  });
  assert.equal(answered.correct, true);
  const duplicate = await api("/api/quiz/answer", {
    method: "POST", body: JSON.stringify({sessionId: quiz.session.id, questionId: question.id,
      answer: "lửa", elapsedMs: 800}),
  });
  assert.equal(duplicate.correct, true);
  assert.equal(duplicate.answer, "nước");
  const attempts = value(await client.from("quiz_attempts")
    .select("id").eq("session_id", quiz.session.id), "Quiz attempts");
  assert.equal(attempts.length, 1);
  const finishedQuiz = await api("/api/quiz/session", {
    method: "PATCH", body: JSON.stringify({sessionId: quiz.session.id}),
  });
  assert.equal(finishedQuiz.score, 100);
  const progress = value(await client.from("user_lesson_progress")
    .select("quiz_best_score").eq("lesson_id", lesson.id).single(), "Quiz progress");
  assert.equal(Number(progress.quiz_best_score), 100);

  const ordering = (await api("/api/quiz/questions", {method: "POST", body: JSON.stringify({
    lessonKey: "minna-2e-1-1", prompt: "Sắp xếp câu tự biên", questionType: "ordering",
    options: ["を", "のみます", "コーヒー"], acceptedAnswers: ["コーヒー", "を", "のみます"],
    explanation: "Đưa tân ngữ trước động từ.", difficulty: 2,
  })})).question;
  const particle = (await api("/api/quiz/questions", {method: "POST", body: JSON.stringify({
    lessonKey: "minna-2e-1-1", prompt: "きょう ＿ あめがふっています。", questionType: "particle",
    options: ["は", "を"], acceptedAnswers: ["は"], explanation: "Chọn trợ từ phù hợp.", difficulty: 1,
  })})).question;
  const orderingBank = await api("/api/quiz/questions?lessonKey=minna-2e-1-1&kind=ordering");
  assert.equal(orderingBank.questions.length, 1);
  const particleBank = await api("/api/quiz/questions?lessonKey=minna-2e-1-1&kind=particle");
  assert.equal(particleBank.questions.length, 1);
  const gameKey = randomUUID();
  const ordered = await api("/api/games/attempt", {method: "POST", body: JSON.stringify({
    attemptKey: gameKey, questionId: ordering.id, gameType: "sentence_builder",
    answer: ["コーヒー", "を", "のみます"], elapsedMs: 900,
  })});
  assert.equal(ordered.correct, true);
  const repeatedGame = await api("/api/games/attempt", {method: "POST", body: JSON.stringify({
    attemptKey: gameKey, questionId: ordering.id, gameType: "sentence_builder",
    answer: ["を", "コーヒー", "のみます"], elapsedMs: 900,
  })});
  assert.equal(repeatedGame.correct, true);
  const directGame = await client.from("game_attempts").insert({
    user_id: testUserId, session_id: gameKey, game_type: "sentence_builder",
    lesson_id: lesson.id, payload: {}, is_correct: true, score: 100,
  });
  assert.ok(directGame.error, "Browser must not submit its own game score");
  const particleResult = await api("/api/games/attempt", {method: "POST", body: JSON.stringify({
    attemptKey: randomUUID(), questionId: particle.id, gameType: "particle_master",
    answer: "を", elapsedMs: 700,
  })});
  assert.equal(particleResult.correct, false);
  const gameAttempts = value(await client.from("game_attempts")
    .select("id").eq("user_id", testUserId), "Game attempts");
  assert.equal(gameAttempts.length, 2);
  const snapshot = await api("/api/progress");
  assert.equal(snapshot.lessons.length, 50);
  assert.equal(snapshot.quizAccuracy, 100);
  assert.equal(snapshot.gameAccuracy, 50);
  assert.equal(snapshot.mistakes.length, 1);
  assert.equal(snapshot.mistakes[0].japanese, "水");
  const savedPreferences = await api("/api/preferences", {method: "PUT", body: JSON.stringify({
    volume: 2, dailyGoal: 15, timezone: "Asia/Tokyo", reviewResetHour: 5, answerMode: "kana",
  })});
  assert.equal(savedPreferences.answerMode, "kana");
  const loadedPreferences = await api("/api/preferences");
  assert.equal(loadedPreferences.volume, 2);
  assert.equal(loadedPreferences.dailyGoal, 15);
  const updatedSnapshot = await api("/api/progress");
  assert.equal(updatedSnapshot.timezone, "Asia/Tokyo");
  assert.equal(updatedSnapshot.dailyGoal, 15);
  const lessonStatus = await api("/api/lessons/progress", {method: "PATCH", body: JSON.stringify({
    lessonKey: "minna-2e-1-1", status: "completed",
  })});
  assert.equal(lessonStatus.status, "completed");
  const completedSnapshot = await api("/api/progress");
  assert.equal(completedSnapshot.completedLessons, 1);
  assert.equal(completedSnapshot.lessons[0].quizBestScore, 100);
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lH8AAAAASUVORK5CYII=", "base64");
  const form = new FormData();
  form.set("file", new File([png], "pixel.png", {type: "image/png"}));
  const uploaded = await api("/api/account/uploads", {method: "POST", body: form});
  assert.equal(uploaded.file.media_type, "image/png");
  const listed = await api("/api/account/uploads");
  assert.equal(listed.files.length, 1);
  const signed = await api(`/api/account/uploads?id=${uploaded.file.id}`);
  const image = await fetch(signed.url);
  assert.equal(image.status, 200);
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
  const forgedPath = await client.from("user_uploads").insert({
    user_id: testUserId, bucket: "user-content", object_path: `${randomUUID()}/forged.png`,
    media_type: "image/png", size_bytes: png.length,
  });
  assert.ok(forgedPath.error, "Upload metadata cannot reference another user's Storage prefix");
  const deletedFile = await api("/api/account/uploads", {
    method: "DELETE", body: JSON.stringify({id: uploaded.file.id}),
  });
  assert.equal(deletedFile.deleted, true);
  assert.equal((await api("/api/account/uploads")).files.length, 0);
  const uploadedAgain = await api("/api/account/uploads", {method: "POST", body: form});
  assert.ok(uploadedAgain.file.id);
  const exported = await api("/api/account/export");
  assert.equal(exported.format, "nihongo-quest-export-v1");
  assert.equal(exported.tables.vocabulary_items.length, 1);
  assert.equal(exported.tables.quiz_questions.length, 3);
  assert.equal(exported.tables.game_attempts.length, 2);
  assert.equal(exported.tables.user_uploads.length, 1);
  const removed = await api("/api/account/data", {
    method: "DELETE", body: JSON.stringify({confirmation: "XÓA DỮ LIỆU"}),
  });
  assert.equal(removed.deleted, true);
  assert.equal(removed.removedFiles, 1);
  const filesAfterDeletion = await api("/api/account/uploads");
  assert.equal(filesAfterDeletion.files.length, 0);
  const cleared = await api("/api/progress");
  assert.equal(cleared.flashcardCount, 0);
  assert.equal(cleared.quizAccuracy, null);
  assert.equal(cleared.gameAccuracy, null);
  const profile = value(await client.from("profiles")
    .select("id").eq("id", testUserId).single(), "Profile survives data deletion");
  assert.equal(profile.id, testUserId);
  process.stdout.write("API smoke passed: Flashcard, Quiz, Games, Progress, Preferences, Storage, export and confirmed data deletion.\n");
} finally {
  if (testUserId) {
    const {error} = await admin.auth.admin.deleteUser(testUserId);
    if (error) process.stderr.write(`Could not remove temporary test user: ${error.message}\n`);
  }
}
