#!/usr/bin/env node
/**
 * End-to-end smoke test of a deployed (or locally served) build, over plain HTTP.
 *
 *   node --env-file=.env.demo scripts/smoke-deploy.mjs https://<site>.netlify.app [--with-upload]
 *   node --env-file=.env.local scripts/smoke-deploy.mjs http://localhost:4000
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY for the target's Supabase
 * project, and DEMO_PASSWORD (falls back to the local README password). Signs in through the
 * real login form, visits every page per role, checks the proxy/API guards, and with
 * --with-upload ingests one generated sample PDF (adds one anonymous profile to that org).
 */
import { readFileSync } from "node:fs";

const APP = (process.argv[2] ?? "").replace(/\/$/, "");
const WITH_UPLOAD = process.argv.includes("--with-upload");
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!/^https?:\/\//.test(APP) || !SUPABASE_URL || !PUBLISHABLE) {
  console.error("usage: node --env-file=<env> scripts/smoke-deploy.mjs <base-url> [--with-upload]");
  process.exit(1);
}
const PASSWORD = process.env.DEMO_PASSWORD ?? readFileSync(new URL("../README.md", import.meta.url), "utf8").match(/password for all: `([^`]+)`/)?.[1];

const H = { "accept-encoding": "identity" }; // `netlify serve` mislabels compressed bodies locally
const get = (path, opts = {}) => fetch(`${APP}${path}`, { redirect: "manual", ...opts, headers: { ...H, ...(opts.headers ?? {}) } });
let failures = 0;
const check = (name, ok, detail = "") => { if (!ok) failures++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`); };
const decode = (v) => v.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

async function formLogin(email, next) {
  const qs = next ? `?next=${encodeURIComponent(next)}` : "";
  const html = await (await get(`/login${qs}`)).text();
  const fd = new FormData();
  for (const m of html.matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
    const name = m[0].match(/name="([^"]*)"/)?.[1];
    if (name) fd.append(name, decode(m[0].match(/value="([^"]*)"/)?.[1] ?? ""));
  }
  fd.append("email", email);
  fd.append("password", PASSWORD);
  const res = await get(`/login${qs}`, { method: "POST", body: fd, headers: { origin: APP } });
  const cookie = res.headers.getSetCookie().filter((c) => c.startsWith("sb-copilot-auth-token")).map((c) => c.split(";")[0]).join("; ");
  return { res, cookie };
}

async function tokenLogin(email) {
  const t = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: PUBLISHABLE, "content-type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD }) });
  if (!t.ok) throw new Error(`sign-in failed for ${email}: HTTP ${t.status}`);
  return `sb-copilot-auth-token=base64-${Buffer.from(JSON.stringify(await t.json())).toString("base64url")}`;
}

function samplePdf() {
  const lines = ["MBTI Step II Interpretive Report", "Preference: Introversion, Sensing, Thinking, Judging (ISTJ)", "Personality preference clarity: clear on all four dichotomies.", ...Array.from({ length: 12 }, (_, i) => `Facet note ${i}: practical, structured, detail-oriented communication preference.`)];
  const text = `BT /F1 11 Tf 50 780 Td 14 TL ${lines.map((l) => `(${l}) Tj T*`).join(" ")} ET`;
  const objs = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>", `<< /Length ${text.length} >>\nstream\n${text}\nendstream`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  let out = "%PDF-1.4\n"; const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  return new Blob([out], { type: "application/pdf" });
}

// Anonymous gating (proxy)
let r = await get("/app/routines");
check("anon /app/routines -> /login?next=", r.status === 307 && (r.headers.get("location") ?? "").includes("/login?next=%2Fapp%2Froutines"), `${r.status} ${r.headers.get("location")}`);
r = await get("/api/generate-routine-insight", { method: "POST", headers: { "content-type": "application/json", origin: APP }, body: "{}" });
check("anon API write -> 401", r.status === 401, `${r.status}`);
r = await get("/api/health");
check("/api/health", r.status === 200, `${r.status} ${(await r.text()).slice(0, 60)}`);

// Real login form as a crew member, honouring next=
const { res: login, cookie: crew } = await formLogin("dana.captain@skyline.local", "/app/rewards");
check("login form -> 303 /app/rewards with session cookie", login.status === 303 && login.headers.get("location") === "/app/rewards" && crew.length > 0, `${login.status} ${login.headers.get("location")}`);
const { res: evil } = await formLogin("yoav.fo@skyline.local", "/.//evil.example.com/x");
check("open-redirect next= stays on site", evil.status === 303 && /^\/(?!\/)/.test(evil.headers.get("location") ?? ""), `${evil.status} ${evil.headers.get("location")}`);

// Every page per role
const admin = await tokenLogin("admin@skyline.local");
const sup = await tokenLogin("super@copilot.local");
const surfaces = [
  [crew, ["/app", "/app/routines", "/app/consents", "/app/report", "/app/rewards", "/app/settings"]],
  [admin, ["/admin", "/admin/users", "/admin/ingest", "/admin/coaching", "/admin/rewards"]],
  [sup, ["/super", "/super/organizations", "/super/mapping", "/super/analytics", "/super/prompts", "/super/rules"]],
];
for (const [cookie, paths] of surfaces) for (const p of paths) {
  r = await get(p, { headers: { cookie } });
  const body = r.status === 200 ? await r.text() : "";
  check(`GET ${p}`, r.status === 200 && !/Something went wrong/.test(body), `${r.status}`);
}
r = await get("/super", { headers: { cookie: admin } });
check("org admin kept out of /super", r.status === 307, `${r.status} ${r.headers.get("location")}`);

// API guards
r = await get("/api/generate-routine-insight", { method: "POST", headers: { cookie: crew, origin: "https://evil.example", "content-type": "application/json" }, body: "{}" });
check("cross-origin API write -> 403", r.status === 403, `${r.status}`);
r = await get("/api/generate-routine-insight", { method: "POST", headers: { cookie: crew, origin: APP, "sec-fetch-site": "same-origin", "content-type": "application/json" }, body: JSON.stringify({ routineType: "nope" }) });
check("same-origin API write reaches the handler (400 validation)", r.status === 400, `${r.status}`);

if (WITH_UPLOAD) {
  const fd = new FormData();
  fd.set("mode", "batch");
  fd.append("file", samplePdf(), "smoke-sample-report.pdf");
  r = await get("/api/reports/upload", { method: "POST", body: fd, headers: { cookie: admin, origin: APP, "sec-fetch-site": "same-origin" } });
  const json = await r.json().catch(() => null);
  check("batch upload of 1 sample PDF", r.status === 200 && json?.results?.[0]?.ok === true, `${r.status} ${JSON.stringify(json?.results?.[0] ?? json).slice(0, 120)}`);
}

console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll smoke checks passed.");
process.exit(failures ? 1 : 0);
