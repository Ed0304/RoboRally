
import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-border bg-background text-muted">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        {/* Brand and description */}
        <div className="space-y-1">
          <Link
            href="/"
            className="inline-flex items-center gap-2 font-black tracking-wider text-foreground"
          >
            <span className="text-accent">▣</span>
            ROBO<span className="text-accent">RALLY</span>
          </Link>

          <p className="text-xs">
            The Factory Rescue — an AI-powered robotics adventure.
          </p>
        </div>

        {/* System status */}
        <div className="flex items-center gap-2 text-xs">
          <span
            className="h-2 w-2 rounded-full bg-success"
            aria-hidden="true"
          />
          <span>CONTROL SYSTEM STANDBY</span>
        </div>

        {/* Footer links */}
        <div className="flex items-center gap-4 text-xs">
          <Link
            href="/howtoplay"
            className="transition hover:text-accent"
          >
            How to Play
          </Link>

          <span className="text-border">|</span>

          <span>
           © 2026 RoboRally
          </span>
        </div>
      </div>
    </footer>
  );
}
