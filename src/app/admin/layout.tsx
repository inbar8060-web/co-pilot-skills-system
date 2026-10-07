import { ConsoleShell, type NavItem, type SwitchLink } from "@/components/shell";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getTheme } from "@/lib/theme";
import { ROLE_LABELS } from "@/lib/utils";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("org_admin", "super_admin");
  const supabase = await createClient();
  const [theme, org, open] = await Promise.all([
    getTheme(),
    user.organizationId ? supabase.from("organizations").select("name").eq("id", user.organizationId).maybeSingle() : Promise.resolve({ data: null }),
    user.organizationId
      ? supabase.from("reward_redemptions").select("id", { count: "exact", head: true }).eq("organization_id", user.organizationId).in("status", ["requested", "approved"])
      : Promise.resolve({ count: 0 }),
  ]);

  const nav: NavItem[] = [
    { href: "/admin", label: "Dashboard", icon: "gauge" },
    { href: "/admin/users", label: "Users & crews", icon: "users" },
    { href: "/admin/ingest", label: "Report ingestion", icon: "upload" },
    { href: "/admin/coaching", label: "Feedback coaching", icon: "message" },
    { href: "/admin/rewards", label: "Rewards", icon: "award", badge: open.count ?? 0 },
  ];
  const switchLinks: SwitchLink[] = [
    ...(user.role === "super_admin" ? [{ href: "/super", label: "Switch to console", icon: "terminal" as const }] : []),
    { href: "/app", label: "Switch to crew app", icon: "plane" },
  ];

  return (
    <ConsoleShell
      user={{ name: user.fullName || user.email, email: user.email, roleLabel: ROLE_LABELS[user.role] }}
      brandSub={`${org.data?.name ?? "No organization"} · Admin`}
      nav={nav}
      switchLinks={switchLinks}
      theme={theme}
    >
      {children}
    </ConsoleShell>
  );
}
