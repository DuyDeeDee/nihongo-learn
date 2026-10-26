import test from "node:test";
import assert from "node:assert/strict";
import {checkAnswer} from "../src/lib/answer.ts";
import {scheduleReview, Rating} from "../src/lib/srs.ts";
import {studyDayKey, streakFromDays} from "../src/lib/progress.ts";
import {gradeQuizAnswer} from "../src/lib/quiz-domain.ts";
import {autoAnnotateFurigana} from "../src/lib/furigana-dictionary.ts";
import {cleanJapaneseForSpeech, extractJapaneseForSpeech} from "../src/lib/speech.ts";
import {generateVocabQuestions} from "../src/lib/vocab-quiz-domain.ts";

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

test("autoAnnotateFurigana annotates verb conjugations and leaves existing brackets intact", () => {
  assert.equal(autoAnnotateFurigana("書かないでください"), "[書]{か}かないでください");
  assert.equal(autoAnnotateFurigana("薬を飲まなければなりません"), "[薬]{くすり}を[飲]{の}まなければなりません");
  assert.equal(autoAnnotateFurigana("ここで [写真]{しゃしん}を 撮らないで ください。"), "ここで [写真]{しゃしん}を [撮]{と}らないで ください。");
  assert.equal(autoAnnotateFurigana("吸あない"), "[吸]{す}あない");
  assert.equal(autoAnnotateFurigana("飲みなくても いいです"), "[飲]{の}みなくても いいです");
});

test("cleanJapaneseForSpeech strips bracket tokens for natural TTS", () => {
  assert.equal(cleanJapaneseForSpeech("[写真]{しゃしん}を [撮]{と}らないで ください。"), "写真を 撮らないで ください。");
  assert.equal(cleanJapaneseForSpeech("～[食]{た}べない"), "食べない");
});

test("extractJapaneseForSpeech isolates Japanese text and strips Vietnamese instructions", () => {
  assert.equal(
    extractJapaneseForSpeech("Chọn đáp án đúng điền vào chỗ trống: わたし _____ マイク・ミラーです。"),
    "わたし マイク・ミラーです。"
  );
  assert.equal(
    extractJapaneseForSpeech("「わたしは がくせい _____ ありません。」 Điền từ phủ định phù hợp vào chỗ trống:"),
    "わたしは がくせい ありません。"
  );
  assert.equal(
    extractJapaneseForSpeech("ミラーさんは IMC ___ 社員です。 (Anh/Chị Miller là nhân viên của IMC.)"),
    "ミラーさんは 社員です。"
  );
  assert.equal(
    extractJapaneseForSpeech("Chia thể ない của động từ nhóm 1 「吸います (hút)」:"),
    "吸います"
  );
  assert.equal(
    extractJapaneseForSpeech("Chọn mẫu câu 'Xin đừng làm mất hộ chiếu':"),
    ""
  );
});

test("Tilde and wave dash prefix/suffix normalization allows typing with or without ~", () => {
  assert.equal(checkAnswer("さん", ["～さん"], "flexible"), true);
  assert.equal(checkAnswer("～さん", ["～さん"], "flexible"), true);
  assert.equal(checkAnswer("〜さん", ["～さん"], "flexible"), true);
  assert.equal(checkAnswer("~さん", ["～さん"], "flexible"), true);
  assert.equal(checkAnswer("さん", ["～さん"], "kana"), true);
  assert.equal(checkAnswer("じん", ["～人", "～じん"], "kana"), true);
  assert.equal(checkAnswer("人", ["～人", "～じん"], "kanji"), true);
  assert.equal(checkAnswer("こちらはさんです", ["こちらは ～さんです"], "flexible"), true);
});

test("generateVocabQuestions generates valid multiple choice questions for ja_to_vi and vi_to_ja", () => {
  const sampleItems = [
    { id: "1", japanese: "わたし", kana: "わたし", meaning: "tôi" },
    { id: "2", japanese: "あなた", kana: "あなた", meaning: "bạn" },
    { id: "3", japanese: "先生", kana: "せんせい", meaning: "thầy cô giáo" },
    { id: "4", japanese: "学生", kana: "がくせい", meaning: "học sinh" },
    { id: "5", japanese: "会社員", kana: "かいしゃいん", meaning: "nhân viên công ty" },
  ];

  const questions = generateVocabQuestions(sampleItems, 10, "mixed");
  assert.equal(questions.length, 5); // clamped to items length
  for (const q of questions) {
    assert.ok(q.options.length >= 2);
    assert.ok(q.options.includes(q.correctAnswer));
    if (q.type === "ja_to_vi") {
      assert.ok(sampleItems.some(it => it.japanese === q.promptDisplay));
    } else {
      assert.ok(sampleItems.some(it => it.meaning === q.promptDisplay));
    }
  }

  // ja_to_vi direction
  const jaQuestions = generateVocabQuestions(sampleItems, 3, "ja_to_vi");
  assert.equal(jaQuestions.length, 3);
  assert.ok(jaQuestions.every(q => q.type === "ja_to_vi"));

  // vi_to_ja direction
  const viQuestions = generateVocabQuestions(sampleItems, 3, "vi_to_ja");
  assert.equal(viQuestions.length, 3);
  assert.ok(viQuestions.every(q => q.type === "vi_to_ja"));
});



