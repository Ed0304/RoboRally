
"use client";

import AuthGuard from "../../../../components/AuthGuard";
import LevelSelection from "../../../../components/LevelSelection";
import { levels } from "../../../../data/levels";

export default function StoryModePage() {
  return (
    <AuthGuard>
      <LevelSelection
        title="Story Mode"
        subtitle="Take on factory missions and put your navigation skills to the test."
        levels={levels.filter((level) => level.type === "Story")}
        menuHref="/start"
      />
    </AuthGuard>
  );
}
