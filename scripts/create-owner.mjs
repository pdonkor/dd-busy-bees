// One-off set-up: creates the school and the owner's account.
// Usage: npm run create-owner -- --school "DD Busy Bees" --name "Full Name" --email you@example.com
// The password is asked for interactively so it never lands in shell history.
import { createClient } from "@supabase/supabase-js";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: { school: { type: "string" }, name: { type: "string" }, email: { type: "string" } },
});
if (!values.school || !values.name || !values.email) {
  console.error('Usage: npm run create-owner -- --school "DD Busy Bees" --name "Full Name" --email you@example.com');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

const { count } = await supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "owner");
if (count) {
  console.error("An owner already exists. Invite further staff from the app.");
  process.exit(1);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const password = await rl.question("Choose a password (12+ characters): ");
rl.close();
if (password.length < 12) {
  console.error("Password must be at least 12 characters.");
  process.exit(1);
}

const { data: school, error: schoolError } = await supabase
  .from("schools")
  .insert({ name: values.school })
  .select("id")
  .single();
if (schoolError) throw schoolError;

const { data: created, error: userError } = await supabase.auth.admin.createUser({
  email: values.email,
  password,
  email_confirm: true,
});
if (userError) throw userError;

const { error: profileError } = await supabase.from("profiles").insert({
  id: created.user.id,
  school_id: school.id,
  role: "owner",
  full_name: values.name,
  email: values.email,
});
if (profileError) throw profileError;

console.log(`Created ${values.school} and owner ${values.email}. Log in with email, then set up your authenticator app.`);
