import test from "node:test";
import assert from "node:assert/strict";
import {checkAnswer} from "../src/lib/answer.ts";
import {scheduleReview, Rating} from "../src/lib/srs.ts";
import {studyDayKey, streakFromDays} from "../src/lib/progress.ts";
import {gradeQuizAnswer} from "../src/lib/quiz-domain.ts";

test("Kana accepts hiragana and katakana, but not kanji", () => {
  assert.equal(checkAnswer("カタカナ", ["かたかな", "片仮名"], "kana"), true);
  assert.equal(checkAnswer("片仮名", ["かたかな", "片仮名"], "kana"), false);
  assert.equal(checkAnswer("水", ["水"], "kana"), false);
});

test("Kanji does not fall back to kana when a card has no kanji spelling", () => {
  assert.equal(checkAnswer("水", ["みず", "水"], "kanji"), true);
  assert.equal(checkAnswer("みず", ["みず", "水"], "kanji"), false);
  assert.equal(checkAnswer("みず", ["みず"], "kanji"), false);
});

test("FSRS state can be stored as JSON and resumed for another grade", () => {
  const first = scheduleReview(undefined, Rating.Good, new Date("2026-10-24T00:00:00Z"));
  const saved = JSON.parse(JSON.stringify(first.card));
  const restored = {
    ...saved,
    due: new Date(saved.due),
    last_review: saved.last_review ? new Date(saved.last_review) : undefined,
  };
  const second = scheduleReview(restored, Rating.Good, new Date(first.nextDue));
  assert.equal(second.card.reps, 2);
  assert.ok(second.nextDue.getTime() > first.nextDue.getTime());
});

test("Study day changes at the configured hour in the learner's timezone", () => {
  assert.equal(studyDayKey(new Date("2026-10-24T20:00:00Z"), "Asia/Ho_Chi_Minh", 4), "2026-10-24");
  assert.equal(studyDayKey(new Date("2026-10-24T21:00:00Z"), "Asia/Ho_Chi_Minh", 4), "2026-10-25");
  assert.equal(streakFromDays(new Set(["2026-10-22", "2026-10-23", "2026-10-24"]), "2026-10-25"), 3);
});

test("Quiz grading normalizes typed answers and rejects choices outside the bank", () => {
  assert.equal(gradeQuizAnswer({question_type: "typed", options: [], accepted_answers: ["Ａ Ｂ"]}, "a   b"), true);
  assert.equal(gradeQuizAnswer({question_type: "multiple_choice", options: ["nước", "lửa"], accepted_answers: ["nước"]}, "nước"), true);
  assert.equal(gradeQuizAnswer({question_type: "multiple_choice", options: ["nước", "lửa"], accepted_answers: ["nước"]}, "NƯỚC"), false);
});
