export type QuizQuestion = {
  id: string;
  prompt: string;
  question_type: "multiple_choice" | "typed" | "ordering" | "particle";
  options: string[];
  accepted_answers: string[];
  explanation: string | null;
  difficulty: number | null;
  created_at: string;
};

export function normalizeQuizAnswer(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase();
}

export function gradeQuizAnswer(question: Pick<QuizQuestion, "question_type" | "options" | "accepted_answers">, answer: string) {
  const normalized = normalizeQuizAnswer(answer);
  if (!normalized) return false;
  if (question.question_type === "multiple_choice" && !question.options.includes(answer)) return false;
  return question.accepted_answers.some(expected => normalizeQuizAnswer(expected) === normalized);
}
