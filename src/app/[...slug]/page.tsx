import type { Metadata } from "next";
import { GenericPage } from "@/components/generic-page";
import { lessons, routeNames } from "@/lib/data";

type PageProps = {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<{ lesson?: string; demo?: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const path = slug.join("/");
  const routeTitles: Record<string, string> = {
    "review/mistakes": "Lỗi cần luyện",
    "games/sentence-builder": "Sentence Builder",
    "games/particle-master": "Particle Master",
  };

  let title = routeTitles[path] ?? routeNames[path];
  if (slug[0] === "lessons" && slug[1]) {
    const lesson = lessons.find((entry) => entry.id === slug[1]);
    if (lesson) {
      const section = slug[2] === "vocabulary" ? "Từ vựng" : slug[2] === "grammar" ? "Ngữ pháp" : slug[2] === "vocab-quiz" ? "Quiz Từ vựng" : "Bài học";
      title = `${section} · Bài ${lesson.number}`;
    }
  }

  return { title: `${title ?? "Không tìm thấy trang"} | Nihongo Quest` };
}

export default async function CatchAllPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const query = await searchParams;
  return <GenericPage slug={slug} studyLessonKey={query.lesson} studyDemo={query.demo === "1"} />;
}
