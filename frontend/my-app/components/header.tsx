"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useState } from "react";

const publicLinks = [
  { label: "Home", href: "/" },
  { label: "How to Play", href: "/howtoplay" },
];

export default function Header() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);

    try {
      await logout();
    } catch (error) {
      console.error("Logout failed:", error);
    } finally {
      setLoggingOut(false);
    }
  }

  const navLinks = user
    ? [...publicLinks, { label: "Profile", href: "/playerdetails" }]
    : publicLinks;

  const accountLinks = user
    ? [{ label: "Profile", href: "/playerdetails" }]
    : [
        { label: "Login", href: "/login" },
        { label: "Register", href: "/register" },
      ];

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 text-foreground shadow-lg backdrop-blur-md">
      <nav className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        {/* Brand */}
        <Link href="/" className="flex shrink-0 items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-accent/40 bg-accent/10 text-xl">
            🤖
          </span>

          <span className="text-lg font-black tracking-wider sm:text-xl">
            ROBO<span className="text-accent">RALLY</span>
          </span>
        </Link>

        {/* Desktop navigation */}
        <div className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => {
            const active = pathname === link.href;

            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-accent/10 text-accent"
                    : "text-muted hover:bg-white/5 hover:text-foreground"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        {/* Desktop account actions */}
        <div className="hidden shrink-0 items-center gap-2 sm:flex">
          {user ? (
            <>
              <span className="hidden text-sm text-success lg:inline">
                Operator: {user.username}
              </span>

              <button
                type="button"
                onClick={logout}
                className="rounded-lg border border-border px-3 py-2 text-sm font-medium transition hover:border-danger/60 hover:text-danger"
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-lg px-3 py-2 text-sm font-medium text-muted transition hover:text-foreground"
              >
                Log in
              </Link>

              <Link
                href="/register"
                className="rounded-lg border border-border px-3 py-2 text-sm font-medium transition hover:border-accent/60 hover:bg-accent/5"
              >
                Register
              </Link>
            </>
          )}

          <Link
            href="/start"
            className="rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-accent-foreground shadow-md transition hover:bg-accent-hover active:scale-95"
          >
            Start Game
          </Link>
        </div>

        {/* Compact mobile action */}
        <Link
          href="/start"
          className="rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-accent-foreground transition hover:bg-accent-hover sm:hidden"
        >
          Play
        </Link>
      </nav>

      {/* Mobile navigation */}
      <div className="flex gap-2 overflow-x-auto border-t border-border px-4 py-2 md:hidden">
        {[...navLinks, ...accountLinks]
          .filter(
            (link, index, links) =>
              links.findIndex((item) => item.href === link.href) === index
          )
          .map((link) => {
            const active = pathname === link.href;

            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`shrink-0 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                  active
                    ? "bg-accent/10 text-accent"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {link.label}
              </Link>
            );
          })}

        {user && (
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="rounded-lg border border-border px-3 py-2 text-sm font-medium transition hover:border-danger/60 hover:text-danger disabled:opacity-50"
          >
            {loggingOut ? "Logging out..." : "Log out"}
          </button>
        )}
      </div>
    </header>
  );
}
