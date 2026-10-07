"use client";

import { useCallback, useEffect, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { setCanvasView } from "@/app/app/canvas-actions";
import { signOut } from "@/app/login/actions";
import { BrandMark, Icon, type IconName } from "@/components/icons";
import { Scrim, useTheme, useToast, type Theme } from "@/components/overlays";
import { Avatar, Dot, type Tone } from "@/components/ui";
import { cn } from "@/lib/utils";

export interface ShellUser { name: string; email: string; roleLabel: string }
export interface NavItem { href: string; label: string; icon: IconName; badge?: number; dot?: boolean }
export interface SwitchLink { href: string; label: string; icon: IconName }

function useActive(items: NavItem[]) {
  const pathname = usePathname();
  // Longest matching prefix wins, so "/app" does not light up on "/app/routines".
  const match = [...items].sort((a, b) => b.href.length - a.href.length).find((n) => pathname === n.href || pathname.startsWith(n.href + "/"));
  return match?.href ?? null;
}

function useCloseOnNavigate(close: () => void) {
  const pathname = usePathname();
  useEffect(() => { close(); }, [pathname, close]);
}

/* ------------------------------------------------------------------ account menu */
function MenuButton({ onClick, children, trailing, danger }: { onClick?: () => void; children: ReactNode; trailing?: ReactNode; danger?: boolean }) {
  return (
    <button type={onClick ? "button" : "submit"} onClick={onClick} className={cn("flex min-h-11 w-full items-center justify-between rounded-lg border-0 bg-transparent px-3 text-left font-semibold", danger ? "font-bold text-bad hover:bg-badsoft" : "text-ink hover:bg-bg")}>
      {children}
      {trailing ? <span className="text-[13px] text-muted">{trailing}</span> : null}
    </button>
  );
}

function AccountMenu({ user, theme, onToggleTheme, links, onClose, className, extra }: {
  user: ShellUser; theme: Theme; onToggleTheme: () => void; links: Array<{ href: string; label: string }>; onClose: () => void; className: string; extra?: ReactNode;
}) {
  return (
    <>
      <div aria-hidden="true" onClick={onClose} className="fixed inset-0 z-20" />
      <div role="menu" className={cn("fixed z-[21] w-[280px] animate-sheet-in overflow-hidden rounded-[14px] border border-line bg-card shadow-[0_16px_40px_rgba(0,0,0,0.18)]", className)}>
        <div className="border-b border-line px-[18px] py-4">
          <div className="font-extrabold">{user.name}</div>
          <div className="truncate text-[13px] text-muted">{user.email}</div>
          <span className="mt-2 inline-flex rounded-full bg-accsoft px-[9px] py-[3px] text-xs font-bold text-ink">{user.roleLabel}</span>
        </div>
        <div className="flex flex-col p-1.5">
          <MenuButton onClick={onToggleTheme} trailing={theme === "dark" ? "Dark" : "Light"}>Appearance</MenuButton>
          {extra}
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="flex min-h-11 items-center rounded-lg px-3 font-semibold text-ink hover:bg-bg">{l.label}</Link>
          ))}
          <form action={signOut}><MenuButton danger>Sign out</MenuButton></form>
        </div>
      </div>
    </>
  );
}

/* ================================================================== CREW APP */
export function CrewShell({ user, nav, tabs, reportStatus, switchLinks, canvasAvailable = false, theme: initialTheme, children }: {
  user: ShellUser;
  nav: NavItem[];                       // desktop/tablet top navigation (6)
  tabs: NavItem[];                      // mobile tab bar (4) + "More"
  reportStatus: { tone: Tone; label: string };
  switchLinks: Array<{ href: string; label: string }>;
  /** The organization pilots the canvas and this user switched back to classic: offer the way back. */
  canvasAvailable?: boolean;
  theme: Theme;
  children: ReactNode;
}) {
  const active = useActive(nav);
  const router = useRouter();
  const toast = useToast();
  const [switching, startSwitch] = useTransition();
  const toCanvas = () => startSwitch(async () => {
    const res = await setCanvasView("canvas");
    if (!res.ok) { toast(res.error, { tone: "bad" }); return; }
    toast(res.message ?? "Switched.");
    router.push("/app");
    router.refresh();
  });
  const [theme, toggleTheme] = useTheme(initialTheme);
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const closeAll = useCallback(() => { setMenuOpen(false); setMoreOpen(false); }, []);
  useCloseOnNavigate(closeAll);

  const moreActive = active !== null && !tabs.some((t) => t.href === active);

  return (
    <div className="flex h-dvh flex-col bg-bg text-ink">
      {/* Phone header */}
      <header className="flex shrink-0 items-center justify-between px-5 pb-3 pt-4 md:hidden">
        <Link href="/app" className="flex items-center gap-2 text-[15px] font-extrabold"><BrandMark height={26} />Copilot</Link>
        <button type="button" onClick={() => setMenuOpen((v) => !v)} aria-label="Account" className="rounded-full border-0 bg-transparent p-0"><Avatar name={user.name} size={36} tone="ink" /></button>
      </header>

      {/* Tablet / desktop header */}
      <header className="hidden h-[60px] shrink-0 items-center justify-between gap-6 border-b border-line bg-card px-7 md:flex">
        <Link href="/app" className="flex items-center gap-2.5 text-[15px] font-extrabold"><BrandMark height={26} />Cognitive Copilot</Link>
        <nav className="flex h-full items-stretch gap-6" aria-label="Primary">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} aria-current={active === n.href ? "page" : undefined}
              className={cn("flex items-center gap-1.5 border-b-2 text-sm font-bold", active === n.href ? "border-acc text-ink" : "border-transparent text-muted hover:text-ink")}>
              {n.label}
              {n.dot ? <Dot tone="warn" size={7} /> : null}
            </Link>
          ))}
        </nav>
        <button type="button" onClick={() => setMenuOpen((v) => !v)} aria-label="Account" className="rounded-full border-0 bg-transparent p-0"><Avatar name={user.name} size={36} tone="ink" /></button>
      </header>

      {menuOpen ? (
        <AccountMenu user={user} theme={theme} onToggleTheme={toggleTheme} onClose={closeAll} className="right-4 top-[60px] md:top-14"
          links={[{ href: "/app/settings", label: "Settings" }, ...switchLinks]}
          extra={canvasAvailable ? <MenuButton onClick={toCanvas} trailing={switching ? "…" : "New"}>Canvas view</MenuButton> : undefined} />
      ) : null}

      <main className="min-h-0 flex-1 overflow-auto px-5 pb-[120px] pt-2 md:px-8 md:pb-12 md:pt-9 xl:px-10 xl:pb-14 xl:pt-12">
        <div className="mx-auto flex max-w-[960px] flex-col gap-5 md:gap-7">{children}</div>
      </main>

      {/* Phone tab bar */}
      <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-5 border-t border-line bg-card px-2 pb-[max(10px,env(safe-area-inset-bottom))] pt-2.5 md:hidden">
        {tabs.map((t) => {
          const on = active === t.href;
          return (
            <Link key={t.href} href={t.href} aria-current={on ? "page" : undefined} className={cn("relative flex min-h-11 flex-col items-center gap-1 text-[11px]", on ? "font-extrabold text-acc" : "font-semibold text-muted")}>
              <Icon name={t.icon} size={24} strokeWidth={on ? 2 : 1.75} />
              {t.label}
              {t.dot ? <Dot tone="warn" className="absolute right-[calc(50%-16px)] top-0" /> : null}
            </Link>
          );
        })}
        <button type="button" onClick={() => setMoreOpen(true)} className={cn("flex min-h-11 flex-col items-center gap-1 border-0 bg-transparent p-0 text-[11px]", moreActive ? "font-extrabold text-acc" : "font-semibold text-muted")}>
          <Icon name="more" size={24} strokeWidth={moreActive ? 2 : 1.75} />
          More
        </button>
      </nav>

      {/* Phone "More" sheet */}
      {moreOpen ? (
        <>
          <Scrim onClose={closeAll} className="z-30 md:hidden" />
          <div className="fixed inset-x-0 bottom-0 z-[31] flex animate-sheet-in flex-col gap-0.5 rounded-t-[20px] bg-card px-3 pb-[34px] pt-2 md:hidden">
            <div className="mx-auto mb-2.5 mt-1 h-1 w-9 rounded-sm bg-line2" />
            <Link href="/app/report" className="flex min-h-[52px] items-center justify-between rounded-[10px] px-3.5 text-base font-bold">
              My report
              <span className="flex items-center gap-2 text-[13px] font-semibold text-muted"><Dot tone={reportStatus.tone} />{reportStatus.label}</span>
            </Link>
            <Link href="/app/settings" className="flex min-h-[52px] items-center rounded-[10px] px-3.5 text-base font-bold">Settings</Link>
            <button type="button" onClick={toggleTheme} className="flex min-h-[52px] items-center justify-between rounded-[10px] border-0 bg-transparent px-3.5 text-left text-base font-bold text-ink">
              Appearance<span className="text-[13px] font-semibold text-muted">{theme === "dark" ? "Dark" : "Light"}</span>
            </button>
            {canvasAvailable ? <button type="button" onClick={toCanvas} className="flex min-h-[52px] items-center rounded-[10px] border-0 bg-transparent px-3.5 text-left text-base font-bold text-ink">Canvas view</button> : null}
            {switchLinks.map((l) => (
              <Link key={l.href} href={l.href} className="flex min-h-[52px] items-center rounded-[10px] px-3.5 text-base font-bold">{l.label}</Link>
            ))}
            <div className="mx-3.5 my-1.5 h-px bg-line" />
            <form action={signOut}>
              <button type="submit" className="flex min-h-[52px] w-full items-center rounded-[10px] border-0 bg-transparent px-3.5 text-left text-base font-bold text-bad">Sign out</button>
            </form>
          </div>
        </>
      ) : null}
    </div>
  );
}

/* ================================================================== ADMIN CONSOLES */
function Brand({ sub, compact }: { sub: string; compact?: boolean }) {
  return (
    <div className={cn("flex min-h-11 items-center gap-2.5", compact ? "px-2" : "px-2 pb-2 pt-1")}>
      <span className="flex size-7 shrink-0 items-center justify-center"><BrandMark height={26} /></span>
      <div className={cn("min-w-0", compact && "hidden xl:block")}>
        <div className="whitespace-nowrap text-sm font-extrabold leading-tight">Cognitive Copilot</div>
        <div className="whitespace-nowrap text-xs text-muted">{sub}</div>
      </div>
    </div>
  );
}

function Badge({ n, rail }: { n: number; rail?: boolean }) {
  return (
    <span className={cn("inline-flex items-center justify-center rounded-[9px] bg-warn font-extrabold text-onacc", rail ? "absolute right-1 top-0.5 h-4 min-w-4 px-1 text-[10px] xl:static xl:h-[18px] xl:min-w-[18px] xl:px-[5px] xl:text-[11px]" : "h-[18px] min-w-[18px] px-[5px] text-[11px]")}>
      {n}
    </span>
  );
}

export function ConsoleShell({ user, brandSub, nav, switchLinks, theme: initialTheme, children }: {
  user: ShellUser; brandSub: string; nav: NavItem[]; switchLinks: SwitchLink[]; theme: Theme; children: ReactNode;
}) {
  const active = useActive(nav);
  const [theme, toggleTheme] = useTheme(initialTheme);
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeAll = useCallback(() => { setMenuOpen(false); setDrawerOpen(false); }, []);
  useCloseOnNavigate(closeAll);
  const pageTitle = nav.find((n) => n.href === active)?.label ?? "Console";

  return (
    <div className="flex h-dvh flex-col bg-bg text-ink md:flex-row">
      {/* Sidebar: icon rail 720–1180, full from 1180 */}
      <aside className="hidden w-[76px] shrink-0 flex-col gap-2 border-r border-line bg-side px-2.5 py-4 md:flex xl:w-[248px] xl:px-3">
        <Brand sub={brandSub} compact />
        <nav className="mt-2 flex flex-col gap-0.5" aria-label="Primary">
          {nav.map((n) => {
            const on = active === n.href;
            return (
              <Link key={n.href} href={n.href} title={n.label} aria-current={on ? "page" : undefined}
                className={cn("relative flex min-h-11 items-center justify-center gap-3 rounded-[10px] text-sm font-bold xl:justify-start xl:px-3", on ? "bg-accsoft text-acc" : "text-muted hover:bg-bg")}>
                <Icon name={n.icon} strokeWidth={on ? 2 : 1.75} />
                <span className="hidden flex-1 whitespace-nowrap xl:block">{n.label}</span>
                {n.badge ? <Badge n={n.badge} rail /> : null}
              </Link>
            );
          })}
        </nav>
        <div className="flex-1" />
        {switchLinks.map((l) => (
          <Link key={l.href} href={l.href} title={l.label} className="flex min-h-11 items-center justify-center gap-3 rounded-[10px] border border-line text-[13px] font-bold text-muted hover:bg-bg xl:justify-start xl:px-3">
            <Icon name={l.icon} size={20} />
            <span className="hidden whitespace-nowrap xl:block">{l.label}</span>
          </Link>
        ))}
        <button type="button" onClick={() => setMenuOpen((v) => !v)} className="flex min-h-[52px] items-center justify-center gap-3 rounded-[10px] border-0 bg-transparent text-left text-ink hover:bg-bg xl:justify-start xl:px-3">
          <Avatar name={user.name} size={32} tone="ink" />
          <span className="hidden min-w-0 xl:block">
            <span className="block truncate text-sm font-bold leading-tight">{user.name}</span>
            <span className="block whitespace-nowrap text-xs text-muted">{user.roleLabel}</span>
          </span>
        </button>
      </aside>

      {/* Phone top bar */}
      <header className="flex shrink-0 items-center justify-between border-b border-line bg-side px-5 py-2 md:hidden">
        <button type="button" onClick={() => setDrawerOpen(true)} aria-label="Menu" className="-ml-2.5 flex size-11 items-center justify-center border-0 bg-transparent text-ink"><Icon name="menu" size={24} strokeWidth={2} /></button>
        <div className="text-[15px] font-extrabold">{pageTitle}</div>
        <button type="button" onClick={() => setMenuOpen((v) => !v)} aria-label="Account" className="rounded-full border-0 bg-transparent p-0"><Avatar name={user.name} size={36} tone="ink" /></button>
      </header>

      {drawerOpen ? (
        <>
          <Scrim onClose={closeAll} className="z-30 md:hidden" />
          <aside className="fixed inset-y-0 left-0 z-[31] flex w-[280px] animate-fade-in flex-col gap-0.5 bg-side px-3 pb-6 pt-5 md:hidden">
            <div className="pb-3"><Brand sub={brandSub} /></div>
            {nav.map((n) => {
              const on = active === n.href;
              return (
                <Link key={n.href} href={n.href} className={cn("flex min-h-12 items-center gap-3 rounded-[10px] px-3 text-[15px] font-bold", on ? "bg-accsoft text-acc" : "text-muted")}>
                  <Icon name={n.icon} strokeWidth={on ? 2 : 1.75} />
                  <span className="flex-1">{n.label}</span>
                  {n.badge ? <Badge n={n.badge} /> : null}
                </Link>
              );
            })}
            <div className="flex-1" />
            {switchLinks.map((l) => (
              <Link key={l.href} href={l.href} className="flex min-h-12 items-center gap-3 rounded-[10px] border border-line px-3 text-sm font-bold text-muted"><Icon name={l.icon} size={20} />{l.label}</Link>
            ))}
          </aside>
        </>
      ) : null}

      {menuOpen ? (
        <AccountMenu user={user} theme={theme} onToggleTheme={toggleTheme} onClose={closeAll}
          className="right-4 top-[60px] md:bottom-4 md:left-[88px] md:right-auto md:top-auto xl:left-[260px]"
          links={switchLinks.map((l) => ({ href: l.href, label: l.label }))} />
      ) : null}

      <main className="min-h-0 min-w-0 flex-1 overflow-auto px-5 pb-10 pt-5 md:px-7 md:pb-12 md:pt-9 xl:px-10 xl:pb-14 xl:pt-12">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-5 md:gap-7">{children}</div>
      </main>
    </div>
  );
}
