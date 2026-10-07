"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { setCanvasView } from "@/app/app/canvas-actions";
import { signOut } from "@/app/login/actions";
import { BrandMark, Icon, type IconName } from "@/components/icons";
import { Scrim, useTheme, useToast, type Theme } from "@/components/overlays";
import type { ShellUser, SwitchLink } from "@/components/shell";
import { Avatar, Dot, type Tone } from "@/components/ui";
import { cn, shortName } from "@/lib/utils";

/* ------------------------------------------------------------------ bridge to the canvas page */
interface ShellBridge { registerAdd: (fn: () => void) => () => void }
const BridgeContext = createContext<ShellBridge | null>(null);
/** Lets the canvas page plug its widget library into the main bar's "Add" button. */
export const useShellBridge = () => useContext(BridgeContext);

/* ------------------------------------------------------------------ main-bar parts */
interface Dest { href: string; label: string; icon: IconName; match: string; badge?: number }
const START = "/app/routines/new";

function BarLink({ d, active }: { d: Dest; active: boolean }) {
  return (
    <Link href={d.href} aria-current={active ? "page" : undefined} aria-label={d.badge ? `${d.label}, ${d.badge} to review` : d.label}
      className={cn("relative flex h-[3.7em] w-[4.9em] flex-col items-center justify-center gap-[0.15em] rounded-[0.92em] focus-visible:outline-2 focus-visible:outline-acc", active ? "bg-accsoft text-ink" : "text-muted hover:bg-bg hover:text-ink")}>
      <Icon name={d.icon} size="1.7em" strokeWidth={active ? 2 : 1.75} />
      <span className="text-[0.77em] font-bold leading-none">{d.label}</span>
      {d.badge ? <span aria-hidden="true" className="absolute right-[1.08em] top-[0.46em] size-[0.62em] min-h-2 min-w-2 rounded-full border-2 border-card bg-warn" /> : null}
    </Link>
  );
}

function BarButton({ icon, label, onClick, className }: { icon: IconName; label: string; onClick: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick} className={cn("flex h-[3.7em] w-[4.9em] flex-col items-center justify-center gap-[0.15em] rounded-[0.92em] border-0 bg-transparent text-muted hover:bg-bg hover:text-ink focus-visible:outline-2 focus-visible:outline-acc", className)}>
      <Icon name={icon} size="1.7em" />
      <span className="text-[0.77em] font-bold leading-none">{label}</span>
    </button>
  );
}

const Divider = ({ className }: { className?: string }) => <span aria-hidden="true" className={cn("mx-[0.31em] h-[2.15em] w-px shrink-0 bg-line", className)} />;

function MenuItem({ children, onClick, href, trailing, danger }: { children: ReactNode; onClick?: () => void; href?: string; trailing?: ReactNode; danger?: boolean }) {
  const cls = cn("flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border-0 bg-transparent px-3 text-left text-[15px] font-semibold", danger ? "font-bold text-bad hover:bg-badsoft" : "text-ink hover:bg-bg");
  const inner = <>{children}{trailing ? <span className="text-[13px] font-semibold text-muted">{trailing}</span> : null}</>;
  if (href) return <Link href={href} className={cls}>{inner}</Link>;
  return <button type={onClick ? "button" : "submit"} onClick={onClick} className={cls}>{inner}</button>;
}

/* ================================================================== CANVAS SHELL (crew, pilot orgs) */
export function CanvasShell({ user, theme: initialTheme, switchLinks, pendingReview, reportStatus, children }: {
  user: ShellUser;
  theme: Theme;
  switchLinks: SwitchLink[];
  /** Sharing requests waiting for this user's answer (badge on "Sharing"). */
  pendingReview: number;
  reportStatus: { tone: Tone; label: string };
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();
  const [theme, toggleTheme] = useTheme(initialTheme);
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [addFn, setAddFn] = useState<(() => void) | null>(null);
  const [switching, startSwitch] = useTransition();
  const home = pathname === "/app";

  const closeAll = useCallback(() => { setMenuOpen(false); setMoreOpen(false); }, []);
  // Close menus on navigation (state adjusted during render, not in an effect).
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setMenuOpen(false);
    setMoreOpen(false);
  }
  useEffect(() => {
    if (!menuOpen && !moreOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeAll(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen, moreOpen, closeAll]);

  const bridge = useMemo<ShellBridge>(() => ({
    registerAdd: (fn) => { setAddFn(() => fn); return () => setAddFn(null); },
  }), []);
  const add = addFn ? () => { closeAll(); addFn(); } : null;

  const toClassic = () => startSwitch(async () => {
    const res = await setCanvasView("classic");
    if (!res.ok) { toast(res.error, { tone: "bad" }); return; }
    closeAll();
    toast(res.message ?? "Switched.");
    router.push("/app");
    router.refresh();
  });

  const dests: Dest[] = [
    { href: "/app/routines", label: "History", icon: "clock", match: "/app/routines" },
    { href: "/app/consents", label: "Sharing", icon: "users", match: "/app/consents", badge: pendingReview || undefined },
    { href: "/app/report", label: "Report", icon: "upload", match: "/app/report" },
    { href: "/app/rewards", label: "Rewards", icon: "award", match: "/app/rewards" },
  ];
  // The briefing form belongs to Start routine, not to History.
  const starting = pathname === START || pathname.startsWith(START + "/");
  const isActive = (d: Dest) => !(d.match === "/app/routines" && starting) && (pathname === d.match || pathname.startsWith(d.match + "/"));
  const phoneDests = dests.filter((d) => d.label !== "Report");

  const menu = (desktop: boolean) => (
    <>
      <div className="border-b border-line px-[18px] py-4">
        <div className="font-extrabold">{user.name}</div>
        <div className="truncate text-[13px] text-muted">{user.email}</div>
        <span className="mt-2 inline-flex rounded-full bg-accsoft px-[9px] py-[3px] text-xs font-bold text-ink">{user.roleLabel}</span>
      </div>
      <div className="flex flex-col p-1.5">
        <MenuItem onClick={toggleTheme} trailing={theme === "dark" ? "Dark" : "Light"}>Appearance</MenuItem>
        {desktop ? <MenuItem href="/app/insights">Weekly insights</MenuItem> : null}
        <MenuItem href="/app/settings">Settings</MenuItem>
        <MenuItem onClick={toClassic} trailing={switching ? "…" : undefined}>Classic overview</MenuItem>
        {switchLinks.map((l) => <MenuItem key={l.href} href={l.href}>{l.label}</MenuItem>)}
        <form action={signOut}><MenuItem danger>Sign out</MenuItem></form>
      </div>
    </>
  );

  return (
    <BridgeContext.Provider value={bridge}>
      {/* Pages that render a canvas ([data-canvas-root]) get the dot grid and the full width; full views
          ([data-full-view]) get the same frame width so their left bar sits where the canvas's does. */}
      <div data-canvas-shell className="min-h-dvh bg-bg text-ink has-[[data-canvas-root]]:dot-grid">
        {/* Phone header row: logo + account */}
        <header className="flex items-center justify-between px-5 pb-2 pt-[max(16px,env(safe-area-inset-top))] md:hidden">
          <Link href="/app" aria-label="Home" className="flex items-center gap-2"><BrandMark height={30} /><span className="text-[15px] font-extrabold">Copilot</span></Link>
          <button type="button" onClick={() => setMenuOpen((v) => !v)} aria-label={`Account: ${user.name}`} aria-expanded={menuOpen} className="rounded-full border-0 bg-transparent p-0"><Avatar name={user.name} size={36} tone="ink" /></button>
        </header>

        <main className="min-w-0 px-5 pb-[130px] pt-2 md:pt-5 has-[[data-canvas-root]]:max-md:pb-[240px]">
          <div className="mx-auto flex max-w-[1000px] flex-col gap-5 md:gap-7 md:px-3 md:pt-4 xl:pt-7 has-[[data-canvas-root]]:max-w-none has-[[data-canvas-root]]:gap-5 has-[[data-canvas-root]]:p-0 has-[[data-full-view]]:max-w-[1480px] has-[[data-full-view]]:gap-5 has-[[data-full-view]]:p-0">
            {children}
          </div>
        </main>

        {/* Click-away layer for the account menu (outside the bar: its transform would trap a fixed child). */}
        {menuOpen ? <div aria-hidden="true" onClick={closeAll} className="fixed inset-0 z-[29]" /> : null}

        {/* Main bar (tablet and desktop): destinations, global tools, account */}
        <nav aria-label="Main" className="tb fixed bottom-5 left-1/2 z-30 hidden max-w-[calc(100%-40px)] -translate-x-1/2 items-center gap-[0.31em] rounded-[0.92em] border border-line bg-card p-[0.62em] shadow-float md:flex">
          <Link href="/app" aria-label="Home" aria-current={home ? "page" : undefined} className="flex size-[3.4em] shrink-0 items-center justify-center rounded-[0.92em] hover:bg-bg focus-visible:outline-2 focus-visible:outline-acc">
            <BrandMark height={30} className="h-[2.4em] w-auto" />
          </Link>
          <Divider />
          <Link href={START} aria-current={starting ? "page" : undefined} className="flex h-[3.4em] shrink-0 items-center gap-[0.62em] rounded-[0.92em] bg-brand pl-[0.92em] pr-[1.23em] text-[1em] font-extrabold text-onbrand hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acc">
            <Icon name="play" size="1.4em" />Start routine
          </Link>
          {dests.map((d) => <BarLink key={d.label} d={d} active={isActive(d)} />)}
          <Divider className="max-xl:hidden" />
          {add ? <BarButton icon="plus" label="Add" onClick={add} className="max-xl:hidden" /> : null}
          <BarButton icon="moon" label="Theme" onClick={toggleTheme} className="max-xl:hidden" />
          {switchLinks.map((l) => (
            <Link key={l.href} href={l.href} className="flex h-[3.7em] w-[4.9em] flex-col items-center justify-center gap-[0.15em] rounded-[0.92em] text-muted hover:bg-bg hover:text-ink max-xl:hidden">
              <Icon name={l.icon} size="1.7em" />
              <span className="whitespace-nowrap text-[0.77em] font-bold leading-none">{l.href === "/super" ? "Console" : "Org admin"}</span>
            </Link>
          ))}
          <Divider />
          <div className="relative">
            <button type="button" onClick={() => setMenuOpen((v) => !v)} aria-label={`Account: ${user.name}, ${user.roleLabel}`} aria-expanded={menuOpen}
              className="flex h-[3.4em] items-center gap-2.5 rounded-[0.92em] border-0 bg-transparent pl-[0.31em] pr-[0.92em] text-left text-ink hover:bg-bg">
              <Avatar name={user.name} size={36} tone="ink" />
              <span className="hidden leading-[1.15] xl:block">
                <span className="block text-[1em] font-extrabold">{shortName(user.name).split(" ")[0]}</span>
                <span className="block whitespace-nowrap text-[0.85em] text-muted">{user.roleLabel}</span>
              </span>
            </button>
            {menuOpen ? (
              <div role="menu" className="absolute bottom-[calc(100%+14px)] right-0 w-[290px] animate-sheet-in overflow-hidden rounded-xl border border-line bg-card text-[15px] shadow-float">{menu(true)}</div>
            ) : null}
          </div>
        </nav>

        {/* Phone account menu (opened from the header avatar) */}
        {menuOpen ? (
          <div role="menu" className="fixed right-4 top-[64px] z-[31] w-[290px] animate-sheet-in overflow-hidden rounded-xl border border-line bg-card shadow-float md:hidden">{menu(false)}</div>
        ) : null}

        {/* Phone main bar: Start is the big one; More holds the rest */}
        <nav aria-label="Main" className="fixed inset-x-5 bottom-[max(20px,env(safe-area-inset-bottom))] z-30 flex items-center gap-0.5 rounded-xl border border-line bg-card p-1.5 shadow-float md:hidden">
          <Link href={START} aria-label="Start routine" aria-current={starting ? "page" : undefined} className="flex h-[52px] w-14 shrink-0 items-center justify-center rounded-xl bg-brand text-onbrand"><Icon name="play" size={22} /></Link>
          {phoneDests.map((d) => {
            const on = isActive(d);
            return (
              <Link key={d.label} href={d.href} aria-current={on ? "page" : undefined} aria-label={d.badge ? `${d.label}, ${d.badge} to review` : d.label}
                className={cn("relative flex h-[52px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl", on ? "bg-accsoft text-ink" : "text-muted")}>
                <Icon name={d.icon} size={22} strokeWidth={on ? 2 : 1.75} />
                <span className="text-[10px] font-bold leading-none">{d.label}</span>
                {d.badge ? <span aria-hidden="true" className="absolute right-4 top-[7px] size-2.5 rounded-full border-2 border-card bg-warn" /> : null}
              </Link>
            );
          })}
          <button type="button" onClick={() => setMoreOpen(true)} aria-expanded={moreOpen} className="flex h-[52px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl border-0 bg-transparent text-muted">
            <Icon name="more" size={22} />
            <span className="text-[10px] font-bold leading-none">More</span>
          </button>
        </nav>

        {moreOpen ? (
          <div className="md:hidden">
            <Scrim onClose={closeAll} className="z-40" />
            <div role="dialog" aria-modal="true" aria-label="More" className="fixed inset-x-0 bottom-0 z-[41] flex animate-sheet-in flex-col gap-0.5 rounded-t-[20px] bg-card px-3 pb-[max(24px,env(safe-area-inset-bottom))] pt-2">
              <div className="mx-auto mb-2.5 mt-1 h-1 w-9 rounded-sm bg-line2" />
              <Link href="/app/report" className="flex min-h-[52px] items-center justify-between rounded-[10px] px-3.5 text-base font-bold">
                My report<span className="flex items-center gap-2 text-[13px] font-semibold text-muted"><Dot tone={reportStatus.tone} />{reportStatus.label}</span>
              </Link>
              {add ? <button type="button" onClick={add} className="flex min-h-[52px] items-center rounded-[10px] border-0 bg-transparent px-3.5 text-left text-base font-bold text-ink">Add widget</button> : null}
              <Link href="/app/insights" className="flex min-h-[52px] items-center rounded-[10px] px-3.5 text-base font-bold">Insights</Link>
              <Link href="/app/settings" className="flex min-h-[52px] items-center rounded-[10px] px-3.5 text-base font-bold">Settings</Link>
              <button type="button" onClick={toggleTheme} className="flex min-h-[52px] items-center justify-between rounded-[10px] border-0 bg-transparent px-3.5 text-left text-base font-bold text-ink">
                Appearance<span className="text-[13px] font-semibold text-muted">{theme === "dark" ? "Dark" : "Light"}</span>
              </button>
              <button type="button" onClick={toClassic} className="flex min-h-[52px] items-center rounded-[10px] border-0 bg-transparent px-3.5 text-left text-base font-bold text-ink">Classic overview</button>
              {switchLinks.map((l) => <Link key={l.href} href={l.href} className="flex min-h-[52px] items-center rounded-[10px] px-3.5 text-base font-bold">{l.label}</Link>)}
              <div className="mx-3.5 my-1.5 h-px bg-line" />
              <form action={signOut}>
                <button type="submit" className="flex min-h-[52px] w-full items-center rounded-[10px] border-0 bg-transparent px-3.5 text-left text-base font-bold text-bad">Sign out</button>
              </form>
            </div>
          </div>
        ) : null}
      </div>
    </BridgeContext.Provider>
  );
}
