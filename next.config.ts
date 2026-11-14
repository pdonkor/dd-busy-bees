import type { NextConfig } from "next";

// Strict browser security headers on every page. The Content-Security-Policy is set per
// request in src/middleware.ts, because it carries a fresh script nonce each time.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Photos are shrunk on the phone first; this leaves room for older phones that can't.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Phones must always check for a new service worker, or old app code lingers.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] },
    ];
  },
};

export default nextConfig;
