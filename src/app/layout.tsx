import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import { cookies } from "next/headers";
import { ToastProvider } from "@/components/overlays";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-manrope", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Cognitive Copilot", template: "%s · Cognitive Copilot" },
  description: "Just-in-time CRM/TEM copilot and personal CRM for high-risk crews.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Theme lives in a cookie so the server renders the right palette: no flash, no inline script.
  const theme = (await cookies()).get("theme")?.value === "dark" ? "dark" : "light";
  return (
    <html lang="en" data-theme={theme} className={manrope.variable}>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
