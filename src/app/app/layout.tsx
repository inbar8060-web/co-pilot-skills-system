import { CanvasShell } from "@/components/canvas-shell";
import { CrewShell, type NavItem, type SwitchLink } from "@/components/shell";
import { requireUser } from "@/lib/auth";
import { getCanvasState } from "@/lib/canvas/server";
import { createClient } from "@/lib/supabase/server";
import { getTheme } from "@/lib/theme";
import { ROLE_LABELS } from "@/lib/utils";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const supabase = await createClient();
  const [theme, pending, canvas] = await Promise.all([
    getTheme(),
    supabase.from("consent_requests").select("id", { count: "exact", head: true }).eq("target_user_id", user.id).eq("status", "pending").gt("expires_at", new Date().toISOString()),
    getCanvasState(user),
  ]);
  const pendingCount = pending.count ?? 0;
  const shellUser = { name: user.fullName || user.email, email: user.email, roleLabel: ROLE_LABELS[user.role] };
  const reportStatus = user.hasActiveReport ? { tone: "ok" as const, label: "Report verified" } : { tone: "warn" as const, label: "Report missing" };
  const switchLinks: SwitchLink[] = [
    ...(user.role === "super_admin" ? [{ href: "/super", label: "Switch to console", icon: "terminal" as const }] : []),
    ...(user.role !== "end_user" ? [{ href: "/admin", label: "Switch to org admin", icon: "building" as const }] : []),
  ];

  // Organizations piloting the canvas get the new shell (bottom main bar) on every crew page.
  if (canvas.active) {
    return (
      <CanvasShell user={shellUser} theme={theme} switchLinks={switchLinks} pendingReview={pendingCount} reportStatus={reportStatus}>
        {children}
      </CanvasShell>
    );
  }

  const nav: NavItem[] = [
    { href: "/app", label: "Overview", icon: "gauge" },
    { href: "/app/routines", label: "Routines", icon: "plane" },
    { href: "/app/consents", label: "Sharing", icon: "users", dot: pendingCount > 0 },
    { href: "/app/report", label: "My report", icon: "upload" },
    { href: "/app/rewards", label: "Rewards", icon: "award" },
    { href: "/app/settings", label: "Settings", icon: "more" },
  ];
  const tabs = [nav[0], nav[1], nav[2], nav[4]];

  return (
    <CrewShell
      user={shellUser}
      nav={nav}
      tabs={tabs}
      reportStatus={reportStatus}
      switchLinks={switchLinks}
      canvasAvailable={canvas.available}
      theme={theme}
    >
      {children}
    </CrewShell>
  );
}
