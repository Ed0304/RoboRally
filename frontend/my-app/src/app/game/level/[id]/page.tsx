
"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import MazeScene from "../../../../../components/maze/MazeScene";
import type { ApiLevel } from "../../../../lib/apilevels";
import {
  isLevelUnlocked,
  loadProgress,
} from "../../../../lib/progress";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";


export default function GameLevelPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-[calc(100vh-88px)] items-center justify-center px-6 py-12 text-[#F3F0E8]">
          <p className="text-sm text-[#A4A9B4]">Loading factory level...</p>
        </main>
      }
    >
      <GameLevelContent />
    </Suspense>
  );
}

function GameLevelContent() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [level, setLevel] = useState<ApiLevel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function fetchLevel() {
      setLoading(true);
      setError("");
      setLevel(null);

      try {
        const response = await fetch(
          `${API_URL}/api/levels/${id}`,
          { signal: controller.signal }
        );

        if (!response.ok) {
          if (response.status === 404) {
            throw new Error(`Level ${id} was not found.`);
          }

          throw new Error(`Failed to load level (${response.status}).`);
        }

        const data = (await response.json()) as ApiLevel;

        if (
          data.id !== Number(id) ||
          !Array.isArray(data.layout) ||
          !data.layout.every((row) => typeof row === "string")
        ) {
          throw new Error("The server returned invalid level data.");
        }

        setLevel(data);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;

        setError(
          err instanceof Error ? err.message : "Unable to load level."
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    fetchLevel();

    return () => controller.abort();
  }, [id]);

  if (loading) {
    return (
      <main className="flex min-h-[calc(100vh-88px)] items-center justify-center px-6 py-12 text-[#F3F0E8]">
        <div className="w-full max-w-md rounded-xl border border-[#34383F] bg-[#191C22] p-10 text-center shadow-2xl">
          <div className="mx-auto mb-5 h-10 w-10 animate-spin rounded-full border-4 border-[#393D45] border-t-[#F2A93B]" />

          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#F2A93B]">
            RoboRally Operations
          </p>

          <h1 className="mt-3 text-xl font-bold">
            Loading factory level
          </h1>

          <p className="mt-2 text-sm text-[#A4A9B4]">
            Retrieving mission data...
          </p>
        </div>
      </main>
    );
  }

  if (error || !level) {
    return (
      <main className="flex min-h-[calc(100vh-88px)] items-center justify-center px-6 py-12 text-[#F3F0E8]">
        <div className="w-full max-w-lg rounded-xl border border-[#49343A] bg-[#191C22] p-8 shadow-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#F2A93B]">
            Mission Control
          </p>

          <h1 className="mt-3 text-2xl font-bold">
            Unable to load level
          </h1>

          <p className="mt-3 text-sm leading-6 text-[#B5BAC4]">
            {error || "Level data is unavailable."}
          </p>

          <button
            onClick={() => window.location.reload()}
            className="mt-6 rounded-lg bg-[#F2A93B] px-5 py-3 font-semibold text-[#17191D] transition hover:bg-[#FFC15B]"
          >
            Retry connection
          </button>
        </div>
      </main>
    );
  }

  const menuHref =
    level.type === "Tutorial" ? "/start/tutorial" : "/start/story";
  const locked = !isLevelUnlocked(loadProgress(userId), level.id);

  return (
    <main className="min-h-screen px-4 pb-12 pt-6 text-[#F3F0E8] sm:px-6 lg:px-10">
      <div className="mx-auto max-w-[1440px]">
        <Link
          href={menuHref}
          className="mb-4 inline-flex items-center gap-2 rounded-md border border-[#3B414B] bg-[#191C22] px-4 py-2 text-sm font-semibold text-[#F3F0E8] transition hover:border-[#F2A93B] hover:text-[#F2A93B] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#F2A93B]"
        >
          <span aria-hidden="true">←</span>
          Back to Menu
        </Link>

        {/* Mission briefing */}
        <header className="mb-5 flex flex-col gap-5 rounded-xl border border-[#34383F] bg-[#191C22] p-5 shadow-lg sm:p-7 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em]">
              <span className="text-[#F2A93B]">
                {level.type} Mission
              </span>

              <span className="text-[#626875]">/</span>

              <span className="text-[#9299A6]">
                Sector {String(level.id).padStart(2, "0")}
              </span>
            </div>

            <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
              {level.name}
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#ADB2BD] sm:text-base">
              {level.description}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap gap-3 lg:justify-end">
            <div className="min-w-28 rounded-lg border border-[#3A3E46] bg-[#22262D] px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9299A6]">
                Difficulty
              </p>

              <p className="mt-1 font-semibold text-[#F2A93B]">
                {level.difficulty}
              </p>
            </div>

            <div className="min-w-36 rounded-lg border border-[#3A3E46] bg-[#22262D] px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9299A6]">
                Objective
              </p>

              <p className="mt-1 text-sm font-semibold">
                {level.goal}
              </p>
            </div>
          </div>
        </header>

        {/* Game area */}
        <section className="overflow-hidden rounded-xl border border-[#3B414B] bg-[#191C22] shadow-2xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#34383F] bg-[#20242B] px-5 py-3">
            <div className="flex items-center gap-3">
              <span className="h-2.5 w-2.5 rounded-full bg-[#F2A93B] shadow-[0_0_10px_rgba(242,169,59,0.45)]" />

              <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[#E7E8EA]">
                Factory Simulation
              </h2>
            </div>

            <span className="text-xs text-[#9299A6]">
              LEVEL {String(level.id).padStart(2, "0")}
            </span>
          </div>

          {locked ? (
            <div className="p-8 text-center sm:p-12">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#9299A6]">
                Mission Locked
              </p>

              <h3 className="mt-3 text-xl font-bold">
                Complete the previous mission first
              </h3>

              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#ADB2BD]">
                This sector is still sealed. Work through the earlier
                missions to unlock it.
              </p>

              <Link
                href={menuHref}
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[#F2A93B] px-5 py-3 font-semibold text-[#17191D] transition hover:bg-[#FFC15B] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F2A93B]"
              >
                <span aria-hidden="true">←</span>
                Back to Menu
              </Link>
            </div>
          ) : (
            <div className="p-2 sm:p-4 lg:p-5">
              <MazeScene level={level} />
            </div>
          )}

          <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[#34383F] bg-[#20242B] px-5 py-3">
            <p className="text-xs text-[#9299A6]">
              ROBORALLY <span className="mx-2 text-[#555B65]">/</span>
              FACTORY RESCUE
            </p>

            <p className="text-xs text-[#9299A6]">
              Mission {level.id} of 6
            </p>
          </footer>
        </section>
      </div>
    </main>
  );
}
