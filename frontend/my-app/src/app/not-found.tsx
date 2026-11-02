import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center bg-background px-4 py-10 text-foreground sm:px-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-10 text-center shadow-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted">
          Off the map
        </p>
        <h1 className="mt-3 text-2xl font-bold">
          This sector doesn&apos;t exist
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          The page you followed isn&apos;t part of the factory. Head
          back and pick a mission.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-accent px-5 py-3 text-sm font-bold text-accent-foreground transition hover:bg-accent-hover"
        >
          ← Back to base
        </Link>
      </div>
    </main>
  );
}
