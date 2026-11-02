import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    // Same-origin API proxy: browsers call this Next.js server, which
    // forwards /api/* and /auth/* to the backend. BACKEND_INTERNAL_URL resolves at
    // build time (never baked into client JavaScript, but the server
    // build embeds it — rebuild after changing it).
    const backend =
      process.env.BACKEND_INTERNAL_URL ?? "http://localhost:8000";
    return [
      { source: "/api/:path*", destination: `${backend}/api/:path*` },
      { source: "/auth/:path*", destination: `${backend}/auth/:path*` },
    ];
  },
};

export default nextConfig;
