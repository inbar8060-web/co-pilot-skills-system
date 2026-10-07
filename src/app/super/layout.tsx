import { ConsoleShell, type NavItem } from "@/components/shell";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTheme } from "@/lib/theme";
import { ROLE_LABELS } from "@/lib/utils";

export default async function SuperLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("super_admin");
  const [theme, unlinked] = await Promise.all([getTheme(), createAdminClient().rpc("admin_wall_unlinked_profiles", {})]);

  const nav: NavItem[] = [
    { href: "/super", label: "Overview", icon: "gauge" },
    { href: "/super/mapping", label: "Identity mapping", icon: "link", badge: unlinked.data?.length ?? 0 },
    { href: "/super/analytics", label: "Research analytics", icon: "chart" },
    { href: "/super/prompts", label: "System prompts", icon: "terminal" },
    { href: "/super/rules", label: "Gamification rules", icon: "award" },
    { href: "/super/organizations", label: "Organizations", icon: "building" },
  ];

  return (
    <ConsoleShell
      user={{ name: user.fullName || user.email, email: user.email, roleLabel: ROLE_LABELS[user.role] }}
      brandSub="Super admin console"
      nav={nav}
      switchLinks={[{ href: "/admin", label: "Switch to org admin", icon: "users" }, { href: "/app", label: "Switch to crew app", icon: "plane" }]}
      theme={theme}
    >
      {children}
    </ConsoleShell>
  );
}
