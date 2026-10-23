// Explicit live smoke test. Creates two temporary users and deletes them in finally.
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {scheduleReview, Rating} from "../src/lib/srs.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) throw new Error("Missing Supabase configuration");

const admin = createClient(url, serviceKey, {auth: {persistSession: false, autoRefreshToken: false}});
const userIds = [];
function value(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

async function createTestUser() {
  const email = `nihongo-smoke-${randomUUID()}@example.com`;
  const password = `${randomUUID()}Aa1!`;
  const created = value(await admin.auth.admin.createUser({email, password, email_confirm: true}), "Create test user");
  userIds.push(created.user.id);
  const client = createClient(url, anonKey, {auth: {persistSession: false, autoRefreshToken: false}});
  value(await client.auth.signInWithPassword({email, password}), "Sign in test user");
  return {id: created.user.id, client};
}

try {
  const owner = await createTestUser();
  const stranger = await createTestUser();
  const edition = value(await owner.client.from("textbook_editions")
    .select("id").eq("slug", "minna-no-nihongo-shokyu-2e").single(), "Edition");
  const volume = value(await owner.client.from("textbook_volumes")
    .select("id").eq("edition_id", edition.id).eq("volume_number", 1).single(), "Volume");
  const lesson = value(await owner.client.from("lessons")
    .select("id").eq("volume_id", volume.id).eq("lesson_number", 1).single(), "Lesson");

  const vocabulary = value(await owner.client.from("vocabulary_items")
    .insert({user_id: owner.id, lesson_id: lesson.id, japanese: "水", kana: "みず", meaning: "nước"})
    .select("id").single(), "Create vocabulary");
  const card = value(await owner.client.from("flashcards")
    .select("id,due_at,reps,accepted_answers").eq("vocabulary_id", vocabulary.id).single(), "Generated card");
  assert.deepEqual(card.accepted_answers, ["水", "みず"]);

  const otherWords = value(await stranger.client.from("vocabulary_items")
    .select("id").eq("id", vocabulary.id), "Cross-account read");
  assert.equal(otherWords.length, 0);
  const otherUpdates = value(await stranger.client.from("vocabulary_items")
    .update({meaning: "changed"}).eq("id", vocabulary.id).select("id"), "Cross-account update");
  assert.equal(otherUpdates.length, 0);
  const otherCards = value(await stranger.client.from("flashcards")
    .select("id").eq("id", card.id), "Cross-account card read");
  assert.equal(otherCards.length, 0);

  const grammar = value(await owner.client.from("grammar_items")
    .insert({user_id: owner.id, lesson_id: lesson.id, pattern: "〜です", explanation: "Mẫu tự viết", sort_order: 1})
    .select("id,lesson_id,pattern,sort_order").single(), "Create grammar");
  assert.equal(grammar.lesson_id, lesson.id);
  const otherGrammar = value(await stranger.client.from("grammar_items")
    .select("id").eq("id", grammar.id), "Cross-account grammar read");
  assert.equal(otherGrammar.length, 0);
  const otherGrammarUpdate = value(await stranger.client.from("grammar_items")
    .update({explanation: "changed"}).eq("id", grammar.id).select("id"), "Cross-account grammar update");
  assert.equal(otherGrammarUpdate.length, 0);
  const otherGrammarDelete = value(await stranger.client.from("grammar_items")
    .delete().eq("id", grammar.id).select("id"), "Cross-account grammar delete");
  assert.equal(otherGrammarDelete.length, 0);
  const updatedGrammar = value(await owner.client.from("grammar_items")
    .update({explanation: "Giải thích đã sửa", sort_order: 2}).eq("id", grammar.id)
    .select("explanation,sort_order").single(), "Update grammar");
  assert.equal(updatedGrammar.explanation, "Giải thích đã sửa");
  assert.equal(updatedGrammar.sort_order, 2);

  const question = value(await owner.client.from("quiz_questions")
    .insert({user_id: owner.id, lesson_id: lesson.id, prompt: "Câu hỏi tự biên?",
      question_type: "typed", accepted_answers: ["はい"]})
    .select("id").single(), "Create quiz question");
  const otherQuestions = value(await stranger.client.from("quiz_questions")
    .select("id").eq("id", question.id), "Cross-account question read");
  assert.equal(otherQuestions.length, 0);
  const otherQuestionUpdate = value(await stranger.client.from("quiz_questions")
    .update({prompt: "changed"}).eq("id", question.id).select("id"), "Cross-account question update");
  assert.equal(otherQuestionUpdate.length, 0);
  const gameAttempt = value(await admin.from("game_attempts").insert({
    user_id: owner.id, lesson_id: lesson.id, game_type: "particle_master",
    payload: {answer: "は"}, is_correct: true, score: 100,
  }).select("id").single(), "Create server game attempt");
  const otherGameAttempts = value(await stranger.client.from("game_attempts")
    .select("id").eq("id", gameAttempt.id), "Cross-account game result read");
  assert.equal(otherGameAttempts.length, 0);
  const directGameWrite = await owner.client.from("game_attempts").insert({
    user_id: owner.id, lesson_id: lesson.id, game_type: "particle_master",
    payload: {}, is_correct: true, score: 100,
  });
  assert.ok(directGameWrite.error, "Browser must not submit its own game score");

  const sessionId = value(await owner.client.rpc("start_flashcard_session", {
    p_lesson_id: lesson.id, p_answer_mode: "flexible",
  }), "Start session");
  assert.ok(sessionId);
  const sessionCard = value(await owner.client.from("session_cards")
    .select("id").eq("session_id", sessionId).single(), "Session card");
  const scheduled = scheduleReview(undefined, Rating.Again);
  const gradeArgs = {
    p_user_id: owner.id, p_session_card_id: sessionCard.id, p_rating: "again",
    p_answer: "まちがい", p_is_correct: false, p_elapsed_ms: 1000,
    p_scheduled_days: scheduled.scheduledDays, p_expected_due_at: card.due_at,
    p_expected_reps: card.reps, p_next_due_at: scheduled.nextDue.toISOString(),
    p_fsrs_state: scheduled.card,
  };
  const logId = value(await admin.rpc("grade_session_card_trusted", gradeArgs), "Grade card");
  const repeatedLogId = value(await admin.rpc("grade_session_card_trusted", gradeArgs), "Repeat grade");
  assert.equal(repeatedLogId, logId);
  const gradedCard = value(await owner.client.from("flashcards")
    .select("reps,lapses,due_at").eq("id", card.id).single(), "Graded card");
  assert.equal(gradedCard.reps, 1);
  assert.equal(gradedCard.lapses, 1);
  const directCardWrite = await owner.client.from("flashcards")
    .update({meaning: "unauthorized edit"}).eq("id", card.id);
  assert.ok(directCardWrite.error, "Owner must not bypass the trusted card write path");
  const directGrade = await owner.client.rpc("grade_session_card_trusted", gradeArgs);
  assert.ok(directGrade.error, "Browser role must not execute trusted grading");
  const logs = value(await owner.client.from("review_logs")
    .select("id").eq("session_card_id", sessionCard.id), "Review logs");
  assert.equal(logs.length, 1);
  const otherLogs = value(await stranger.client.from("review_logs")
    .select("id").eq("id", logId), "Cross-account review read");
  assert.equal(otherLogs.length, 0);

  const directRetry = await owner.client.rpc("record_flashcard_retry_trusted", {
    p_user_id: owner.id, p_session_card_id: sessionCard.id, p_answer: "みず", p_is_correct: true,
  });
  assert.ok(directRetry.error, "Browser role must not mark retries correct");
  value(await admin.rpc("record_flashcard_retry_trusted", {
    p_user_id: owner.id, p_session_card_id: sessionCard.id, p_answer: "みず", p_is_correct: true,
  }), "Retry card");
  value(await owner.client.rpc("finish_flashcard_session", {p_session_id: sessionId}), "Finish session");
  const completed = value(await owner.client.from("study_sessions")
    .select("status,cards_seen,correct_count").eq("id", sessionId).single(), "Completed session");
  assert.equal(completed.status, "completed");
  assert.equal(completed.cards_seen, 1);
  assert.equal(completed.correct_count, 0);

  value(await owner.client.from("vocabulary_items").delete().eq("id", vocabulary.id), "Delete vocabulary");
  const suspended = value(await owner.client.from("flashcards")
    .select("suspended_at").eq("id", card.id).single(), "Suspended card");
  assert.ok(suspended.suspended_at);
  const retainedLog = value(await owner.client.from("review_logs")
    .select("id").eq("id", logId).single(), "Retained review log");
  assert.equal(retainedLog.id, logId);

  const deletedGrammar = value(await owner.client.from("grammar_items")
    .delete().eq("id", grammar.id).select("id").single(), "Delete grammar");
  assert.equal(deletedGrammar.id, grammar.id);

  process.stdout.write("Live smoke passed: vocabulary, grammar, Quiz/Game two-user RLS, idempotent grade, retry and retained history.\n");
} finally {
  for (const userId of userIds) {
    const {error} = await admin.auth.admin.deleteUser(userId);
    if (error) process.stderr.write(`Could not remove temporary test user: ${error.message}\n`);
  }
}
