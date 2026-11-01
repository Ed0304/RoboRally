"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "@/context/AuthContext";
import MazeScene, {
  type CommunityRunStats,
} from "../../../../../components/maze/MazeScene";
import type { LevelData } from "@/lib/levels";
import {
  fetchCommunityLevel,
  fetchEditableCommunityLevel,
  fetchMyCommunityAttempts,
  newAttemptId,
  submitCommunityAttempt,
  type AttemptPrompt,
  type AttemptResult,
  type CommunityLevel,
} from "@/lib/community-api";

type Phase =
  | { name: "loading" }
  | { name: "error"; message: string }
  | { name: "ready"; level: CommunityLevel };

export default function CommunityPlayPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-[calc(100vh-88px)] items-center justify-center px-6 py-12 text-[#F3F0E8]">
          <p className="text-sm text-[#A4A9B4]">Loading community level…</p>
        </main>
      }
    >
      <CommunityPlayContent />
    </Suspense>
  );
}

function CommunityPlayContent() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [phase, setPhase] = useState<Phase>({ name: "loading" });
  const [isOwner, setIsOwner] = useState(false);
  const [prompts, setPrompts] = useState<AttemptPrompt[]>([]);
  const [hasSuccess, setHasSuccess] = useState(false);
  const [submission, setSubmission] = useState<
    | { state: "idle" }
    | { state: "submitting" }
    | { state: "done"; result: AttemptResult; stats: CommunityRunStats }
    | { state: "error"; message: string; stats: CommunityRunStats }
    | { state: "guest"; stats: CommunityRunStats }
  >({ state: "idle" });
  const submittedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setPhase({ name: "loading" });
    setSubmission({ state: "idle" });
    setPrompts([]);
    setIsOwner(false);
    submittedRef.current = false;

    // Owners can test unpublished levels: the public view 404s for
    // those, so fall back to the owner-only editable view.
    fetchCommunityLevel(id)
      .catch(() => (user ? fetchEditableCommunityLevel(id) : Promise.reject(
        new Error("Unable to load level.")
      )))
      .then((level) => {
        if (cancelled) return;
        setPhase({ name: "ready", level });
        setIsOwner(
          !!user && user.username === level.creator_username
        );
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setPhase({
            name: "error",
            message:
              err instanceof Error ? err.message : "Unable to load level.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [id, user]);

  useEffect(() => {
    if (!user) {
      setHasSuccess(false);
      return;
    }
    let cancelled = false;
    fetchMyCommunityAttempts(id)
      .then((attempts) => {
        if (!cancelled) {
          setHasSuccess(
            attempts.some((attempt) => attempt.outcome === "completed")
          );
        }
      })
      .catch(() => {
        if (!cancelled) setHasSuccess(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, user]);

  const mazeLevel: LevelData | null = useMemo(() => {
    if (phase.name !== "ready") return null;
    return {
      id: 0,
      name: phase.level.name,
      description: phase.level.description,
      layout: phase.level.layout,
    };
  }, [phase]);

  const handlePrompt = useCallback(
    (prompt: string, status: "Success" | "Failed") => {
      setPrompts((prev) => [...prev, { prompt, status }]);
    },
    []
  );

  const handleFinish = useCallback(
    async (
      outcome: "completed" | "failed",
      stats: CommunityRunStats
    ) => {
      void outcome;
      if (phase.name !== "ready" || submittedRef.current) return;
      submittedRef.current = true;

      if (!user) {
        setSubmission({ state: "guest", stats });
        return;
      }

      setSubmission({ state: "submitting" });
      try {
        const result = await submitCommunityAttempt(
          phase.level.public_id,
          {
            attempt_id: newAttemptId(),
            version: phase.level.version,
            algorithm: stats.algorithm as
              | "ai"
              | "bfs"
              | "dijkstra"
              | "astar",
            actions: stats.actions,
            prompts,
            exec_ms: stats.execMs,
            plan_ms: stats.planMs,
            plan_count: stats.planCount,
          }
        );
        setSubmission({ state: "done", result, stats });
        if (result.outcome === "completed") {
          setHasSuccess(true);
        }
      } catch (err) {
        setSubmission({
          state: "error",
          message:
            err instanceof Error ? err.message : "Submission failed.",
          stats,
        });
      }
    },
    [phase, user, prompts]
  );

  // The finish callback must see the latest prompts without remounting
  // the game, so it reads from a ref-updated stable closure.
  const finishRef = useRef(handleFinish);
  finishRef.current = handleFinish;
  const stableFinish = useCallback(
    (outcome: "completed" | "failed", stats: CommunityRunStats) =>
      finishRef.current(outcome, stats),
    []
  );

  const community = useMemo(() => {
    if (phase.name !== "ready") return undefined;
    return {
      publicId: phase.level.public_id,
      version: phase.level.version,
      hasSuccess,
      onFinish: stableFinish,
      onPrompt: handlePrompt,
    };
  }, [phase, stableFinish, handlePrompt, hasSuccess]);

  return (
    <main className="min-h-screen px-4 pb-12 pt-6 text-[#F3F0E8] sm:px-6 lg:px-10">
      <div className="mx-auto max-w-[1440px]">
        <Link
          href="/community"
          className="mb-4 inline-flex items-center gap-2 rounded-md border border-[#3B414B] bg-[#191C22] px-4 py-2 text-sm font-semibold text-[#F3F0E8] transition hover:border-[#F2A93B] hover:text-[#F2A93B]"
        >
          <span aria-hidden="true">←</span>
          Community levels
        </Link>

        {phase.name === "loading" && (
          <p className="py-12 text-center text-sm text-[#A4A9B4]">
            Loading community level…
          </p>
        )}

        {phase.name === "error" && (
          <div className="mx-auto w-full max-w-md rounded-xl border border-[#34383F] bg-[#191C22] p-10 text-center shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#9299A6]">
              Unavailable
            </p>
            <h1 className="mt-3 text-2xl font-bold">
              Can&apos;t open this level
            </h1>
            <p className="mt-3 text-sm leading-6 text-[#B5BAC4]">
              {phase.message}
            </p>
          </div>
        )}

        {phase.name === "ready" && mazeLevel && community && (
          <>
            <header className="mb-5 rounded-xl border border-[#34383F] bg-[#191C22] p-5 shadow-lg sm:p-7">
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em]">
                <span className="text-[#F2A93B]">Community</span>
                <span className="text-[#626875]">/</span>
                <span className="text-[#9299A6]">
                  v{phase.level.version} · {phase.level.width}×
                  {phase.level.height}
                </span>
              </div>
              <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
                {phase.level.name}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#ADB2BD]">
                {phase.level.description || "No description."} by{" "}
                {phase.level.creator_username}
              </p>
              {isOwner && phase.level.status !== "published" && (
                <p
                  role="status"
                  className="mt-3 rounded-lg border border-[#F2A93B]/50 bg-[#F2A93B]/10 p-3 text-sm text-[#F2A93B]"
                >
                  Test mode — only you can see this level until you
                  publish it.
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href={`/community/${phase.level.public_id}/leaderboard`}
                  className="inline-flex items-center gap-2 rounded-md border border-[#3B414B] bg-[#22262D] px-4 py-2 text-sm font-semibold transition hover:border-[#F2A93B]"
                >
                  View leaderboard
                </Link>
                {isOwner && (
                  <Link
                    href={`/community/edit/${phase.level.public_id}`}
                    className="inline-flex items-center gap-2 rounded-md border border-[#3B414B] bg-[#22262D] px-4 py-2 text-sm font-semibold transition hover:border-[#F2A93B]"
                  >
                    Edit level
                  </Link>
                )}
              </div>
            </header>

            {submission.state === "submitting" && (
              <p
                role="status"
                className="mb-5 rounded-xl border border-[#34383F] bg-[#191C22] p-4 text-sm text-[#ADB2BD]"
              >
                Verifying your run on the server…
              </p>
            )}

            {submission.state === "done" && (
              <div className="mb-5 rounded-xl border border-[#65D982]/40 bg-[#191C22] p-4">
                <p className="font-bold text-[#65D982]">
                  Run recorded — {submission.result.outcome}.
                </p>
                <p className="mt-1 text-sm text-[#ADB2BD]">
                  Verified: {submission.result.moves} moves ·{" "}
                  {submission.result.cost}% battery ·{" "}
                  {submission.result.remaining}% remaining
                  {submission.result.duplicate ? " (already counted)" : ""}.
                </p>
                <Link
                  href={`/community/${phase.level.public_id}/leaderboard`}
                  className="mt-3 inline-flex items-center gap-2 rounded-md bg-[#F2A93B] px-4 py-2 text-sm font-bold text-[#17191D] transition hover:bg-[#FFC15B]"
                >
                  See where you rank →
                </Link>
              </div>
            )}

            {submission.state === "guest" && (
              <div className="mb-5 rounded-xl border border-accent/40 bg-[#191C22] p-4">
                <p className="font-bold text-[#F2A93B]">
                  Nice run — sign in to record it.
                </p>
                <p className="mt-1 text-sm text-[#ADB2BD]">
                  Unverified local tally: {submission.stats.moves} moves ·{" "}
                  {submission.stats.remaining}% battery left.
                </p>
                <Link
                  href="/login"
                  className="mt-3 inline-flex items-center gap-2 rounded-md border border-[#3B414B] px-4 py-2 text-sm font-semibold transition hover:border-[#F2A93B]"
                >
                  Sign in
                </Link>
              </div>
            )}

            {submission.state === "error" && (
              <p
                role="alert"
                className="mb-5 rounded-xl border border-[#FF7979]/40 bg-[#191C22] p-4 text-sm text-[#FF7979]"
              >
                Recording failed: {submission.message} Your run is not
                lost — restart and try again.
              </p>
            )}

            <section className="overflow-hidden rounded-xl border border-[#3B414B] bg-[#191C22] shadow-2xl">
              <div className="p-2 sm:p-4 lg:p-5">
                <MazeScene
                  level={mazeLevel}
                  tutorialMode={false}
                  community={community}
                />
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
