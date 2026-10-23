export type LessonProgress = {
  key: string;
  number: number;
  volume: number;
  vocabularyCount: number;
  grammarCount: number;
  status: "not_started" | "in_progress" | "completed";
  quizBestScore: number | null;
};

export type Mistake = {
  flashcardId: string;
  lessonKey: string | null;
  japanese: string;
  kana: string | null;
  meaning: string;
  acceptedAnswers: string[];
  typedAnswer: string | null;
  reviewedAt: string;
};

export type ProgressSnapshot = {
  timezone: string;
  resetHour: number;
  dailyGoal: number;
  todayMinutes: number;
  streak: number;
  activeDaysLast7: number;
  dueCount: number;
  flashcardCount: number;
  newCount: number;
  learningCount: number;
  reviewCount: number;
  flashcardAccuracy: number | null;
  quizAccuracy: number | null;
  gameAccuracy: number | null;
  completedLessons: number;
  lessons: LessonProgress[];
  mistakes: Mistake[];
};

export function previousDayKey(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date - 1)).toISOString().slice(0, 10);
}

export function studyDayKey(value: Date, timezone: string, resetHour: number) {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", hourCycle: "h23",
    });
  } catch {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", hourCycle: "h23",
    });
  }
  const parts = Object.fromEntries(formatter.formatToParts(value).map(part => [part.type, part.value]));
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  return Number(parts.hour) < resetHour ? previousDayKey(day) : day;
}

export function accuracy(correct: number, total: number) {
  return total > 0 ? Math.round(correct * 10000 / total) / 100 : null;
}

export function streakFromDays(days: Set<string>, today: string) {
  let day = days.has(today) ? today : previousDayKey(today);
  let streak = 0;
  while (days.has(day)) {
    streak += 1;
    day = previousDayKey(day);
  }
  return streak;
}
