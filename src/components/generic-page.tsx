"use client";

import Link from "next/link";
import {FlashcardExperience} from "@/components/flashcard-experience";
import {GamePage} from "@/components/game-page";
import {GrammarPage} from "@/components/grammar-page";
import {LessonDirectory, LessonOverview} from "@/components/lesson-pages";
import {PreferencesPage} from "@/components/preferences-page";
import {ProgressExperience} from "@/components/progress-experience";
import {QuizPage} from "@/components/quiz-page";
import {VocabularyPage} from "@/components/vocabulary-page";
import {lessons, routeNames} from "@/lib/data";

export function GenericPage({slug, studyLessonKey, studyDemo}: {
  slug: string[]; studyLessonKey?: string; studyDemo?: boolean;
}) {
  const path = slug.join("/");
  if (path === "flashcards" || path === "review") {
    return <FlashcardExperience lessonKey={studyLessonKey} demo={studyDemo}/>;
  }
  if (path === "review/mistakes") return <ProgressExperience view="mistakes"/>;
  if (path === "progress") return <ProgressExperience view="progress"/>;
  if (path === "quiz") return <QuizPage lessonKey={studyLessonKey} demo={studyDemo}/>;
  if (path === "games/sentence-builder") {
    return <GamePage kind="ordering" lessonKey={studyLessonKey} demo={studyDemo}/>;
  }
  if (path === "games/particle-master") {
    return <GamePage kind="particle" lessonKey={studyLessonKey} demo={studyDemo}/>;
  }
  if (path === "settings" || path === "setup") return <PreferencesPage view={path}/>;
  if (path === "lessons") return <LessonDirectory/>;

  if (slug[0] === "lessons") {
    const lesson = lessons.find(entry => entry.id === slug[1]);
    if (!lesson) return <div className="stack"><Link href="/lessons" className="muted">← Tất cả bài học</Link><h1 className="page-title">Không tìm thấy bài học</h1></div>;
    if (slug.length === 2) return <LessonOverview lesson={lesson}/>;
    if (slug.length === 3 && slug[2] === "vocabulary") return <VocabularyPage key={lesson.id} lesson={lesson}/>;
    if (slug.length === 3 && slug[2] === "grammar") return <GrammarPage key={lesson.id} lesson={lesson}/>;
  }

  const title = routeNames[slug.at(-1) ?? ""] ?? "Nihongo Quest";
  return <div className="stack"><h1 className="page-title">{title}</h1><p className="muted">Không tìm thấy trang này.</p><Link className="btn secondary" href="/lessons">Mở danh sách bài học</Link></div>;
}
