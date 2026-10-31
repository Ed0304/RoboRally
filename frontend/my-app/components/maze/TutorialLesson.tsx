"use client";

import Link from "next/link";
import { lessonForLevel } from "@/lib/tutorials";

export default function TutorialLesson({ levelId }: { levelId: number }) {
  const lesson = lessonForLevel(levelId);
  if (!lesson) return null;
  return (
    <div className="rounded-md border border-cyan-400/30 bg-[#22262E] p-3">
      <div className="text-cyan-300 font-semibold text-sm mb-2">
        {lesson.title}
      </div>
      {lesson.body.map((line) => (
        <p key={line.slice(0, 32)} className="text-[#ADB2BD] text-sm mb-1.5">
          {line}
        </p>
      ))}
      {levelId === 1 && (
        <Link
          href="/learn/bfs"
          className="inline-block mt-1 text-sm text-cyan-300 hover:text-cyan-200 underline"
        >
          Open the interactive BFS lab
        </Link>
      )}
    </div>
  );
}
