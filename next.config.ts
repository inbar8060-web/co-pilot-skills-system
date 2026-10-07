import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// A production build wired to the local Supabase stack (`npm run local:up`) is served over
// plain http://localhost. HTTPS-only directives would make the browser rewrite every asset and
// Supabase request to https:// and break the page, so they apply only to real deployments.
// Evaluated at build time: a Vercel build always points at an https://<ref>.supabase.co URL.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const localStack = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(supabaseUrl);
const httpsOnly = !isDev && !localStack;

// A hosted production build must never bake the local stack into the bundle. `next build` falls
// back to .env.local for anything the host did not set, so a CLI deploy from a dev machine
// (Netlify sets NETLIFY_LOCAL, its CI sets NETLIFY; Vercel sets VERCEL) would silently ship
// http://127.0.0.1 as the Supabase URL. Fail the build instead.
const hostedBuild = process.env.NETLIFY === "true" || process.env.NETLIFY_LOCAL === "true" || process.env.VERCEL === "1";
if (!isDev && hostedBuild && (!supabaseUrl || localStack)) {
  throw new Error(
    `NEXT_PUBLIC_SUPABASE_URL is ${supabaseUrl ? `the local stack (${supabaseUrl})` : "not set"} in a hosted build. ` +
      "Set the hosted project's https://<ref>.supabase.co URL in the host's environment variables (Builds scope).",
  );
}

// Strict, explicit CSP. No third-party scripts are used, so 'self' is enough
// (Next.js dev needs 'unsafe-eval' for HMR and inline styles for the overlay).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseUrl} ${isDev ? "ws: http://localhost:* http://127.0.0.1:*" : ""}`.trim(),
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  ...(httpsOnly ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  ...(httpsOnly ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }] : []),
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The sidebar's account button and the phone tab bar live bottom-left; keep the dev badge out of the way.
  devIndicators: { position: "top-right" },
  serverExternalPackages: ["unpdf"],
  experimental: {
    serverActions: { bodySizeLimit: "1mb" },
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
