
"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";

export default function RegisterPage() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    setMessage(
      "Registration UI is ready. Connect your FastAPI endpoint next."
    );
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-background px-4 py-12 text-foreground">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl sm:p-8">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-xl border border-accent/40 bg-accent/10 text-3xl">
            🤖
          </div>

          <p className="mb-2 text-xs font-bold uppercase tracking-[0.3em] text-accent">
            RoboRally // Operator Registration
          </p>

          <h1 className="text-3xl font-black tracking-tight">
            Join the Rally
          </h1>

          <p className="mt-3 text-sm leading-6 text-muted">
            Create your operator account and prepare for your first mission.
          </p>
        </div>

        <div className="mb-6 flex items-center gap-3 border-y border-border py-3">
          <span
            className="h-2 w-2 rounded-full bg-accent"
            aria-hidden="true"
          />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">
            New operator enrollment
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="username"
              className="mb-2 block text-sm font-semibold text-foreground"
            >
              Username
            </label>

            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
              minLength={3}
              className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground outline-none transition placeholder:text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/20"
              placeholder="Choose a username"
            />
          </div>

          <div>
            <label
              htmlFor="email"
              className="mb-2 block text-sm font-semibold text-foreground"
            >
              Email
            </label>

            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground outline-none transition placeholder:text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/20"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-2 block text-sm font-semibold text-foreground"
            >
              Password
            </label>

            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
              className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground outline-none transition placeholder:text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/20"
              placeholder="At least 8 characters"
            />
          </div>

          <div>
            <label
              htmlFor="confirmPassword"
              className="mb-2 block text-sm font-semibold text-foreground"
            >
              Confirm Password
            </label>

            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              minLength={8}
              className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground outline-none transition placeholder:text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/20"
              placeholder="Re-enter your password"
            />
          </div>

          {message && (
            <p
              role="status"
              className={`rounded-lg border px-4 py-3 text-sm ${
                message === "Passwords do not match."
                  ? "border-danger/30 bg-danger/10 text-danger"
                  : "border-accent/30 bg-accent/10 text-accent"
              }`}
            >
              {message}
            </p>
          )}

          <button
            type="submit"
            className="w-full rounded-lg bg-accent px-4 py-3.5 font-bold text-accent-foreground shadow-md transition hover:bg-accent-hover active:scale-[0.98]"
          >
            Create Account
            <span className="ml-2" aria-hidden="true">
              →
            </span>
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted">
          Already registered?{" "}
          <Link
            href="/login"
            className="font-semibold text-accent transition hover:underline"
          >
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}
