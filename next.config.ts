import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
// Cloudflare Turnstile (bot check on the public enquiry form) is only allowed when it is set up.
const turnstile = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ? " https://challenges.cloudflare.com" : "";

// Strict browser security headers on every page.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next.js needs inline scripts for hydration; 'unsafe-eval' only in development.
      `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}${turnstile}`,
      `frame-src 'self'${turnstile}`,
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob: ${supabaseUrl}`,
      `connect-src 'self' ${supabaseUrl} ${supabaseUrl.replace("https://", "wss://")}`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Photos are shrunk on the phone first; this leaves room for older phones that can't.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
