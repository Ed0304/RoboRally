
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  fetchUserProfile,
  type UserProfile,
} from "@/lib/user";
import { levels } from "../../../data/levels";

const levelNames = new Map(
  levels.map((level) => [level.id, level.name])
);

export default function PlayerInfoPage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setError("");
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError("");

    fetchUserProfile()
      .then((data) => {
        if (active) setProfile(data);
      })
      .catch(() => {
        if (active) {
          setError(
            "Could not load your records. Check your connection and try again."
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user]);

  const username = profile?.username ?? user?.username ?? "Guest Operator";
  const email = profile?.email ?? user?.email ?? null;
  const completed = profile?.completed_levels ?? [];
  const history = profile?.prompt_history ?? [];

  return (
    <main className="flex flex-1 justify-center bg-background px-4 py-10 text-foreground sm:px-6">
      <div className="w-full max-w-5xl space-y-8">
        <header>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-accent">
            RoboRally // Operator Records
          </p>
          <h1 className="mt-3 text-3xl font-black sm:text-4xl">
            Player Details
          </h1>
          <p className="mt-3 text-muted">
            Review your operator information, mission progress, and activity.
          </p>
        </header>

        <section className="rounded-2xl border border-border bg-surface p-6 sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-accent/40 bg-accent/10 text-3xl">
              🤖
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-wider text-muted">
                Operator profile
              </p>
              <h2 className="mt-1 break-words text-2xl font-bold">
                {username}
              </h2>
              <p className="mt-1 text-sm text-muted">
                {user ? "Operator account loaded" : "No authenticated session"}
              </p>
            </div>

            <Link
              href="/start"
              className="inline-flex items-center justify-center rounded-lg bg-accent px-5 py-3 font-bold text-accent-foreground transition hover:bg-accent-hover"
            >
              Start Mission →
            </Link>
          </div>

          <div className="mt-8 grid gap-4 border-t border-border pt-6 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-background p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-muted">
                Username
              </p>
              <p className="mt-2 break-words font-semibold">{username}</p>
            </div>

            <div className="rounded-xl border border-border bg-background p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-muted">
                Email
              </p>
              <p className="mt-2 break-words font-semibold">
                {email ?? "Sign in to view your email"}
              </p>
            </div>
          </div>
        </section>

        {loading && (
          <p role="status" className="text-sm text-muted">
            Loading your records...
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"
          >
            {error}
          </p>
        )}

        {!loading && !error && (
          <section className="grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-border bg-surface p-6">
              <h2 className="text-lg font-bold">Completed Levels</h2>

              <p className="mt-4 text-4xl font-black text-accent">
                {user ? completed.length : "—"}
              </p>

              {!user ? (
                <p className="mt-2 text-sm leading-6 text-muted">
                  Sign in to track your completed missions across
                  sessions and devices.
                </p>
              ) : completed.length === 0 ? (
                <p className="mt-2 text-sm leading-6 text-muted">
                  No missions completed yet. Finish a level to record
                  it here.
                </p>
              ) : (
                <ul className="mt-4 space-y-2">
                  {completed.map((id) => (
                    <li
                      key={id}
                      className="flex items-center gap-2 text-sm text-muted"
                    >
                      <span
                        aria-hidden="true"
                        className="font-bold text-success"
                      >
                        ✓
                      </span>
                      Mission {String(id).padStart(2, "0")}
                      {levelNames.has(id)
                        ? ` — ${levelNames.get(id)}`
                        : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-2xl border border-border bg-surface p-6">
              <h2 className="text-lg font-bold">Prompt History</h2>
              <p className="mt-1 text-xs leading-5 text-muted">
                Whether each mission prompt produced an executable plan.
                Completing the mission itself is tracked under
                Completed Levels.
              </p>

              {!user ? (
                <p className="mt-4 text-sm leading-6 text-muted">
                  Sign in to review the goals and instructions you
                  gave your AI agent.
                </p>
              ) : history.length === 0 ? (
                <p className="mt-4 text-sm leading-6 text-muted">
                  No prompts recorded yet. Request a plan during a
                  mission to start your history.
                </p>
              ) : (
                <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto">
                  {history
                    .slice()
                    .reverse()
                    .map((entry, index) => (
                      <li
                        key={`${entry.prompt}-${index}`}
                        className="rounded-lg border border-border bg-background p-3"
                      >
                        <p className="break-words text-sm font-medium">
                          {entry.prompt}
                        </p>
                        <p
                          className={`mt-1 text-xs font-bold uppercase tracking-wider ${
                            entry.status === "Success"
                              ? "text-success"
                              : "text-warning"
                          }`}
                        >
                          {entry.status}
                        </p>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
