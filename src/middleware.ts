import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy, makeNonce } from "@/lib/csp";

const PUBLIC_PATHS = ["/sw.js", "/manifest.webmanifest", "/login", "/invite", "/api/hooks", "/api/cron", "/api/webhooks", "/enquire"];

/**
 * Keeps the login session fresh on every request and sends logged-out visitors to /login.
 * Role checks happen in each area's layout (see src/lib/auth.ts) and again in the database.
 */
export async function middleware(request: NextRequest) {
  // A new script nonce for every page load (see src/lib/csp.ts). Next.js reads it from
  // the request's CSP header and puts it on the scripts it renders.
  const nonce = makeNonce();
  const csp = contentSecurityPolicy(nonce, {
    dev: process.env.NODE_ENV === "development",
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    turnstile: !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  });
  request.headers.set("x-nonce", nonce);
  request.headers.set("content-security-policy", csp);
  const next = () => {
    const res = NextResponse.next({ request: { headers: request.headers } });
    res.headers.set("content-security-policy", csp);
    return res;
  };
  let response = next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = next();
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"],
};
