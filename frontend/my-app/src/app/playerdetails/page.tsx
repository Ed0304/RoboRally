
"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

export default function PlayerInfoPage() {
  const { user } = useAuth();

  const username = user?.username ?? "Guest Operator";
  const email = "Not connected yet";

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
              <p className="mt-2 break-words font-semibold">{email}</p>
              <p className="mt-1 text-xs text-muted">
                Email will appear here once connected to the account API.
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-surface p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold">Completed Levels</h2>
              <span className="rounded-md border border-warning/30 bg-warning/10 px-2 py-1 text-xs font-bold text-warning">
                Placeholder
              </span>
            </div>

            <p className="mt-4 text-4xl font-black text-accent">—</p>
            <p className="mt-2 text-sm leading-6 text-muted">
              Your completed missions and level results will appear here once
              game progress tracking is implemented.
            </p>

            <div className="mt-5 rounded-lg border border-dashed border-border p-4 text-sm text-muted">
              No level records available yet.
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold">Prompt History</h2>
              <span className="rounded-md border border-warning/30 bg-warning/10 px-2 py-1 text-xs font-bold text-warning">
                Placeholder
              </span>
            </div>

            <p className="mt-4 text-sm leading-6 text-muted">
              Review the goals and instructions you previously gave your AI
              agent. Prompt history will be available after history storage is
              implemented.
            </p>

            <div className="mt-5 rounded-lg border border-dashed border-border p-4 text-sm text-muted">
              No prompts recorded yet.
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
