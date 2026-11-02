// Base URL for backend calls. Empty means same-origin through the
// Next.js /api rewrite (local dev and production default). Set
// NEXT_PUBLIC_API_URL to an absolute backend origin, without a
// trailing slash, only for deployments without the proxy. Rebuild
// after changing any NEXT_PUBLIC_* variable: values bake into the
// client bundle at build time and never update at runtime.
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "";

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.detail ?? `Request failed (${response.status})`,
    );
  }

  return data as T;
}