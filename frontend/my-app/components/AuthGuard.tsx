
"use client";

import { useEffect, useRef, type ReactNode } from "react";
import {
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { setFlashMessage } from "@/lib/flash";

export default function AuthGuard({
  children,
}: {
  children: ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const query = searchParams.toString();
  const currentPath = query ? `${pathname}?${query}` : pathname;
  const redirecting = useRef(false);

  useEffect(() => {
    if (loading || user || redirecting.current) return;

    redirecting.current = true;

    setFlashMessage({
        type: "error",
        message: "You must be logged in to access Story Mode.",
    });

    router.replace(
        `/login?next=${encodeURIComponent(currentPath)}`
    );
    }, [loading, user, currentPath, router]);

  if (loading) {
    return (
      <div
        role="status"
        className="flex min-h-48 items-center justify-center"
      >
        Checking your session...
      </div>
    );
  }

  if (!user) return null;

  return <>{children}</>;
}
