
"use client";

import { Suspense, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import AuthGuard from "../../../../components/AuthGuard";
import LevelSelection from "../../../../components/LevelSelection";
import { levels } from "../../../../data/levels";
import {
  getDefaultProgress,
  loadProgress,
  syncProgress,
  type LevelProgress,
} from "@/lib/progress";

export default function StoryModePage() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [progress, setProgress] = useState<LevelProgress>(
    () => getDefaultProgress()
  );

  useEffect(() => {
    let active = true;
    setProgress(loadProgress(userId));
    syncProgress(userId)
      .then((merged) => {
        if (active) setProgress(merged);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [userId]);

  return (
    <Suspense
      fallback={
        <div className="flex min-h-48 items-center justify-center">
          Loading...
        </div>
      }
    >
      <AuthGuard>
      <LevelSelection
        title="Story Mode"
        subtitle="Take on factory missions and put your navigation skills to the test."
        levels={levels.filter((level) => level.type === "Story")}
        menuHref="/start"
        unlockedIds={progress.unlocked}
        completedIds={progress.completed}
      />
      </AuthGuard>
    </Suspense>
  );
}
