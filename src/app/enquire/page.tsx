import type { Metadata } from "next";
import { headers } from "next/headers";
import Script from "next/script";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/form-status";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { submitEnquiry } from "./actions";

export const metadata: Metadata = {
  title: "Enquire about a place · DD Busy Bees",
  description: "Ask about a place for your child at DD Busy Bees Montessori.",
};

export default async function EnquirePage() {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  // The bot-check script needs this page's nonce to pass the Content-Security-Policy.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <p className="text-sm font-semibold uppercase tracking-wide text-amber-700">DD Busy Bees Montessori</p>
      <h1 className="mt-1 text-3xl font-semibold text-stone-900">Ask about a place</h1>
      <p className="mt-2 text-stone-600">
        Tell us a little about your child and we&apos;ll call you to arrange a visit. It only takes a minute.
      </p>
      <div className="mt-6 rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <ActionForm action={submitEnquiry}>
          <fieldset className="space-y-3">
            <legend className="mb-1 font-semibold">About you</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Your name">
                <Input name="parent_name" required maxLength={120} autoComplete="name" />
              </Field>
              <Field label="You are the child's…">
                <Select name="relationship" defaultValue="mother">
                  <option value="mother">Mother</option>
                  <option value="father">Father</option>
                  <option value="guardian">Guardian</option>
                  <option value="other">Other</option>
                </Select>
              </Field>
              <Field label="Mobile number">
                <Input name="phone" type="tel" inputMode="tel" required placeholder="024 123 4567" autoComplete="tel" />
              </Field>
              <Field label="Email (optional)">
                <Input name="email" type="email" maxLength={200} autoComplete="email" />
              </Field>
            </div>
          </fieldset>
          <fieldset className="space-y-3 pt-2">
            <legend className="mb-1 font-semibold">About your child</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="First name">
                <Input name="child_first_name" required maxLength={80} />
              </Field>
              <Field label="Surname">
                <Input name="child_last_name" required maxLength={80} />
              </Field>
              <Field label="Date of birth">
                <Input name="child_dob" type="date" required />
              </Field>
              <Field label="Preferred start date (optional)">
                <Input name="start_date" type="date" />
              </Field>
            </div>
            <Field label="Sessions wanted (optional)">
              <Select name="sessions" defaultValue="">
                <option value="">Not sure yet</option>
                <option value="Full day, 5 days">Full day, 5 days a week</option>
                <option value="Half day, 5 days">Half day, 5 days a week</option>
                <option value="Part week">Some days of the week</option>
              </Select>
            </Field>
            <Field label="Anything else? (optional)">
              <Textarea name="message" maxLength={2000} />
            </Field>
          </fieldset>
          {/* Honeypot: hidden from people, filled in by bots. */}
          <div aria-hidden="true" className="absolute left-[-9999px]">
            <label>
              Website
              <input name="website" tabIndex={-1} autoComplete="off" />
            </label>
          </div>
          {siteKey && <div className="cf-turnstile" data-sitekey={siteKey} />}
          <SubmitButton pendingText="Sending…">Send enquiry</SubmitButton>
          <p className="text-xs text-stone-500">
            We use these details only to contact you about a place, as required by Ghana&apos;s Data Protection Act, 2012.
          </p>
        </ActionForm>
      </div>
      {siteKey && <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" nonce={nonce} async defer />}
    </main>
  );
}
