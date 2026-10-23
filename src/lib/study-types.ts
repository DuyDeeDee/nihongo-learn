import type {AnswerMode} from "@/lib/answer";

export type LiveCard = {
  sessionCardId: string;
  flashcardId: string;
  position: number;
  japanese: string;
  kana: string | null;
  meaning: string;
  acceptedAnswers: string[];
  graded: boolean;
  correct: boolean | null;
  retryCompleted: boolean;
};

export type LiveSession = {
  id: string;
  lessonId: string | null;
  mode: AnswerMode;
  cards: LiveCard[];
};

export type StudySnapshot = {
  session: LiveSession | null;
  dueCount: number;
  gradingReady: boolean;
};
