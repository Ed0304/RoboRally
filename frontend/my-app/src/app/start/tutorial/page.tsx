"use client";

import AuthGuard from "../../../../components/AuthGuard";
import LevelSelection from "../../../../components/LevelSelection";
import { levels } from "../../../../data/levels";

export default function TutorialModePage() {
  return (
    <AuthGuard>
      <LevelSelection
        title="Tutorial Mode"
        subtitle="Learn the controls, understand hazards, and prepare for unexpected situations."
        levels={levels.filter((level) => level.type === "Tutorial")}
        menuHref="/start"
      />
    </AuthGuard>
  );
}
