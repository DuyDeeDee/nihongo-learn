export type VocabItem = {
  id: string;
  japanese: string;
  kana: string | null;
  meaning: string;
  part_of_speech?: string | null;
};

export type VocabDirection = "mixed" | "ja_to_vi" | "vi_to_ja";
export type VocabQuestionCount = 10 | 20 | "all";

export type VocabQuizQuestion = {
  id: string;
  type: "ja_to_vi" | "vi_to_ja";
  target: VocabItem;
  promptLabel: string;
  promptDisplay: string;
  promptReading: string;
  options: string[];
  correctAnswer: string;
};

function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Generates interactive multiple-choice vocabulary questions
 * from a list of vocabulary items.
 */
export function generateVocabQuestions(
  items: VocabItem[],
  count: VocabQuestionCount = 20,
  direction: VocabDirection = "mixed"
): VocabQuizQuestion[] {
  if (!items || items.length < 2) return [];

  // Filter out any invalid items
  const validItems = items.filter(it => it.japanese && it.meaning);
  if (validItems.length < 2) return [];

  // Shuffle items to randomize question targets
  const shuffledItems = shuffleArray(validItems);

  // Determine number of questions
  const totalCount = count === "all" ? shuffledItems.length : Math.min(count, shuffledItems.length);
  const targets = shuffledItems.slice(0, totalCount);

  return targets.map((target, idx) => {
    // Determine question direction
    let type: "ja_to_vi" | "vi_to_ja";
    if (direction === "mixed") {
      // Alternate or random
      type = idx % 2 === 0 ? "ja_to_vi" : "vi_to_ja";
    } else {
      type = direction;
    }

    if (type === "ja_to_vi") {
      // Question: Japanese word -> Options: Vietnamese meanings
      const correctAnswer = target.meaning;
      // Pick 3 distractors with different meanings
      const otherMeanings = validItems
        .filter(it => it.id !== target.id && it.meaning !== target.meaning)
        .map(it => it.meaning);
      const uniqueDistractors = Array.from(new Set(otherMeanings));
      const chosenDistractors = shuffleArray(uniqueDistractors).slice(0, 3);

      const options = shuffleArray([correctAnswer, ...chosenDistractors]);

      return {
        id: `vq-${target.id}-${idx}`,
        type: "ja_to_vi",
        target,
        promptLabel: "Chọn nghĩa tiếng Việt của từ sau:",
        promptDisplay: target.japanese,
        promptReading: target.kana || target.japanese,
        options,
        correctAnswer,
      };
    } else {
      // Question: Vietnamese meaning -> Options: Japanese words
      const correctAnswer = target.japanese;
      // Pick 3 distractors with different japanese words
      const otherWords = validItems
        .filter(it => it.id !== target.id && it.japanese !== target.japanese)
        .map(it => it.japanese);
      const uniqueDistractors = Array.from(new Set(otherWords));
      const chosenDistractors = shuffleArray(uniqueDistractors).slice(0, 3);

      const options = shuffleArray([correctAnswer, ...chosenDistractors]);

      return {
        id: `vq-${target.id}-${idx}`,
        type: "vi_to_ja",
        target,
        promptLabel: "Chọn từ tiếng Nhật tương ứng với nghĩa:",
        promptDisplay: target.meaning,
        promptReading: target.kana || target.japanese,
        options,
        correctAnswer,
      };
    }
  });
}
