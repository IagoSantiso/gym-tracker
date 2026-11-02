import type { NextConfig } from "next";

const supabase = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin : "";
  } catch {
    return "";
  }
})();

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' https://world.openfoodfacts.org${supabase ? ` ${supabase} ${supabase.replace("https://", "wss://")}` : ""}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://flow.polar.com",
  "frame-ancestors 'none'",
].join("; ");

const security = [
  ...(process.env.NODE_ENV === "production" ? [{ key: "Content-Security-Policy", value: csp }] : []),
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), payment=()" },
];

/** Identificador de versión: commit en Vercel o marca de tiempo local. */
const BUILD_ID = (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 10) || `local-${Date.now().toString(36)}`;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: { NEXT_PUBLIC_BUILD_ID: BUILD_ID },
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: security },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      { source: "/exercises/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default nextConfig;
