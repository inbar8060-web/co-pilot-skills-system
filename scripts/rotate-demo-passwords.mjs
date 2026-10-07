#!/usr/bin/env node
/**
 * Gives the seeded demo accounts a fresh, random shared password on a HOSTED Supabase project,
 * so a public demo never accepts the password committed in supabase/seed.sql.
 *
 *   node --env-file=.env.demo scripts/rotate-demo-passwords.mjs
 *
 * .env.demo (gitignored via .env*) needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY of the
 * hosted project. The new password is printed once and stored nowhere; run again to rotate.
 *
 * Flags (used by scripts/share-tunnel.sh for the local stack):
 *   --allow-local        permit the local Supabase stack
 *   --out <file>         write SHARE_PASSWORD=<password> to <file> (mode 600) instead of printing it
 *   --restore-readme     local only: set the README demo password back instead of a random one
 */
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { randomInt } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const DEMO_EMAILS = [
  "super@copilot.local",
  "admin@skyline.local",
  "dana.captain@skyline.local",
  "yoav.fo@skyline.local",
  "noa.pilot@skyline.local",
];

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (e.g. node --env-file=.env.demo ...).");
  process.exit(1);
}
if (/^http:\/\/(localhost|127\.0\.0\.1)/.test(url) && !process.argv.includes("--allow-local")) {
  console.error(`Refusing to rotate passwords on the local stack (${url}); the local demo keeps the README password. Pass --allow-local to override.`);
  process.exit(1);
}

const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const outFile = arg("--out");
const restoreReadme = process.argv.includes("--restore-readme");
const isLocal = /^http:\/\/(localhost|127\.0\.0\.1)/.test(url);
if (restoreReadme && !isLocal) {
  console.error("--restore-readme only applies to the local stack.");
  process.exit(1);
}

// Unambiguous alphabet (no 0/O/1/I/L), grouped for reading aloud: Demo-XXXX-XXXX-XXXX (~60 bits).
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const group = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
const password = restoreReadme
  ? readFileSync(new URL("../README.md", import.meta.url), "utf8").match(/password for all: `([^`]+)`/)?.[1]
  : `Demo-${group()}-${group()}-${group()}`;
if (!password) throw new Error("README demo password not found");

const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

const found = new Map();
for (let page = 1; found.size < DEMO_EMAILS.length; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
  if (error) throw error;
  for (const u of data.users) if (u.email && DEMO_EMAILS.includes(u.email)) found.set(u.email, u.id);
  if (data.users.length < 200) break;
}

const missing = DEMO_EMAILS.filter((e) => !found.has(e));
if (missing.length) {
  console.error(`Demo accounts not found (was supabase/seed.sql applied?): ${missing.join(", ")}`);
  process.exit(1);
}

for (const email of DEMO_EMAILS) {
  const id = found.get(email);
  const { error } = await admin.auth.admin.updateUserById(id, { password });
  if (error) throw new Error(`${email}: ${error.message}`);
}

if (restoreReadme) {
  console.log(`Demo accounts on ${new URL(url).host} are back on the README password.`);
} else if (outFile) {
  writeFileSync(outFile, `SHARE_PASSWORD=${password}\n`, { mode: 0o600 });
  chmodSync(outFile, 0o600);
  console.log(`Demo password rotated for ${DEMO_EMAILS.length} accounts on ${new URL(url).host}; written to ${outFile}.`);
} else {
  console.log(`\nDemo password rotated for ${DEMO_EMAILS.length} accounts on ${new URL(url).host}.\n`);
  console.log(`  Password (all demo accounts): ${password}\n`);
  for (const email of DEMO_EMAILS) console.log(`  ${email}`);
  console.log("\nShare it with your client over a private channel. It is not stored anywhere.\n");
}
