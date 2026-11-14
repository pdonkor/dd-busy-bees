import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, makeNonce } from "./csp";

describe("content security policy", () => {
  it("allows scripts only by nonce in production", () => {
    const csp = contentSecurityPolicy("abc", { dev: false, supabaseUrl: "https://x.supabase.co", turnstile: false });
    const script = csp.split("; ").find((d) => d.startsWith("script-src"))!;
    expect(script).toBe("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("connect-src 'self' https://x.supabase.co wss://x.supabase.co");
    expect(csp).toContain("object-src 'none'");
  });

  it("makes a different nonce each time", () => {
    const a = makeNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(makeNonce()).not.toBe(a);
  });
});
