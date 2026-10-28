"use client";

import { AuthProvider } from "@/context/AuthContext";
import FlashMessage from "./FlashMessage";

export default function AuthWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthProvider>
    <FlashMessage />
    {children}
    </AuthProvider>;
}