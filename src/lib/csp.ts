/**
 * The Content-Security-Policy for one page load. Scripts run only if they carry this
 * request's nonce (Next.js adds it to its own scripts), or were loaded by one that
 * does ('strict-dynamic'), so an injected <script> tag can't run. Styles still allow
 * inline, which Next.js and Tailwind need and which can't run code.
 */
export function contentSecurityPolicy(nonce: string, opts: { dev: boolean; supabaseUrl: string; turnstile: boolean }) {
  const turnstile = opts.turnstile ? " https://challenges.cloudflare.com" : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${opts.dev ? " 'unsafe-eval'" : ""}${turnstile}`,
    `frame-src 'self'${turnstile}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${opts.supabaseUrl}`,
    `connect-src 'self' ${opts.supabaseUrl} ${opts.supabaseUrl.replace("https://", "wss://")}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

/** A fresh random nonce, base64-encoded (works in the Edge runtime). */
export function makeNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}
