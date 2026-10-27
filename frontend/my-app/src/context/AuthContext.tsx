
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { apiRequest } from "@/lib/api";

type User = {
  id: string;
  username: string;
  email: string;
};

type AuthContextType = {
  user: User | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  register: (
    username: string,
    email: string,
    password: string
  ) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore the session when the app loads or refreshes.
  useEffect(() => {
    let active = true;

    apiRequest<User>("/auth/me")
      .then((currentUser) => {
        if (active) setUser(currentUser);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(
    async (identifier: string, password: string) => {
      const loggedInUser = await apiRequest<User>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ identifier, password }),
      });

      setUser(loggedInUser);
    },
    []
  );

  const register = useCallback(
    async (username: string, email: string, password: string) => {
      const newUser = await apiRequest<User>("/auth/register", {
        method: "POST",
        body: JSON.stringify({ username, email, password }),
      });

      setUser(newUser);
    },
    []
  );

  const logout = useCallback(async () => {
    await apiRequest<{ message: string }>("/auth/logout", {
      method: "POST",
    });

    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
