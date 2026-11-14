import "server-only";
import { serverEnv } from "@/lib/env";

export type Email = { to: string; subject: string; text: string; html: string };

/**
 * Sends one email through Resend. In local development without an API key the email
 * is printed to the server log instead; in production a missing key is an error,
 * because invite emails carry sign-up links.
 */
export async function sendEmail(email: Email): Promise<void> {
  const env = serverEnv();
  if (!env.RESEND_API_KEY) {
    if (process.env.NODE_ENV === "production") throw new Error("RESEND_API_KEY is not set");
    console.info(`[email:dev] to ${email.to}: ${email.subject}\n${email.text}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [email.to], subject: email.subject, text: email.text, html: email.html }),
  });
  if (!res.ok) throw new Error(`Email send failed with status ${res.status}`);
}

const escapes: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escapes text for HTML, so names typed by users can't inject markup into an email. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => escapes[c]);
}

/**
 * A plain, readable email: a heading, paragraphs and an optional table of rows and
 * button. Every string is escaped here, so callers pass plain text only.
 */
export function simpleEmail(opts: {
  school: string;
  heading: string;
  paragraphs: string[];
  rows?: [string, string][];
  button?: { label: string; url: string };
  footer?: string;
}): { text: string; html: string } {
  const text = [
    opts.heading,
    "",
    ...opts.paragraphs.flatMap((p) => [p, ""]),
    ...(opts.rows ?? []).map(([k, v]) => `${k}: ${v}`),
    ...(opts.rows?.length ? [""] : []),
    ...(opts.button ? [`${opts.button.label}: ${opts.button.url}`, ""] : []),
    opts.footer ?? opts.school,
  ].join("\n");

  const rows = opts.rows?.length
    ? `<table style="border-collapse:collapse;margin:16px 0;font-size:15px">${opts.rows
        .map(
          ([k, v]) =>
            `<tr><td style="padding:4px 16px 4px 0;color:#57534e">${escapeHtml(k)}</td><td style="padding:4px 0;font-weight:600">${escapeHtml(v)}</td></tr>`,
        )
        .join("")}</table>`
    : "";
  const button = opts.button
    ? `<p style="margin:24px 0"><a href="${escapeHtml(opts.button.url)}" style="background:#b45309;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(opts.button.label)}</a></p><p style="font-size:13px;color:#78716c">Or copy this link: ${escapeHtml(opts.button.url)}</p>`
    : "";
  const html = `<!doctype html><html><body style="margin:0;background:#fafaf9;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#1c1917">
<div style="max-width:520px;margin:0 auto;padding:24px 16px">
<p style="font-weight:700;color:#b45309;margin:0 0 16px">${escapeHtml(opts.school)}</p>
<div style="background:#fff;border:1px solid #e7e5e4;border-radius:12px;padding:24px">
<h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(opts.heading)}</h1>
${opts.paragraphs.map((p) => `<p style="font-size:15px;line-height:1.5;margin:0 0 12px">${escapeHtml(p)}</p>`).join("")}
${rows}${button}
</div>
<p style="font-size:12px;color:#a8a29e;margin-top:16px">${escapeHtml(opts.footer ?? opts.school)}</p>
</div></body></html>`;
  return { text, html };
}
