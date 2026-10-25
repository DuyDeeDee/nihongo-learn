export type AnswerMode = "kana" | "kanji" | "flexible";

export function normalizeAnswer(value: string, mode: AnswerMode) {
  let answer = value
    .normalize("NFKC")
    .trim()
    .replace(/[~〜～\u301C\uFF5E\u007E]/g, "") // Strip all wave dashes and tildes
    .replace(/^[-―–—−]+|[-―–—−]+$/g, "")     // Strip leading/trailing hyphens/dashes
    .replace(/\s+/g, "");                    // Strip whitespace
  if (mode === "kana") {
    answer = answer.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
  }
  return answer;
}

export function checkAnswer(value: string, accepted: string[], mode: AnswerMode) {
  const answer = normalizeAnswer(value, mode);
  if (answer.length === 0) return false;

  let choices = accepted;
  if (mode === "kana") {
    choices = accepted.filter(item => /^[ぁ-ゖー]+$/u.test(normalizeAnswer(item, "kana")));
  }
  if (mode === "kanji") {
    choices = accepted.filter(item => /\p{Script=Han}/u.test(item));
  }

  return choices.some(item => {
    const norm = normalizeAnswer(item, mode);
    if (norm === answer) return true;
    // Also support stripping parentheses e.g. "(お)金" -> "金" or "お金"
    const withoutParens = normalizeAnswer(item.replace(/\([^)]*\)|（[^）]*）/g, ""), mode);
    if (withoutParens === answer) return true;
    const withInnerOnly = normalizeAnswer(item.replace(/[()（）]/g, ""), mode);
    if (withInnerOnly === answer) return true;
    return false;
  });
}

