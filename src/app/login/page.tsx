import type { Metadata } from "next";
import { BrandMark } from "@/components/icons";
import { singleParams, type SearchParams } from "@/lib/utils";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { next, reason } = singleParams(await searchParams);
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg p-5">
      <div className="flex w-full max-w-[400px] flex-col gap-6">
        <div className="flex items-center gap-2.5">
          <BrandMark height={32} />
          <span className="text-base font-extrabold">Cognitive Copilot</span>
        </div>
        <div>
          <h1 className="m-0 text-[28px] font-extrabold leading-[1.15] tracking-[-0.025em]">Sign in</h1>
          <p className="mt-1.5 text-[15px] text-muted">Use your organization account. Accounts are created by your administrator.</p>
        </div>
        {reason === "session" ? (
          <div role="status" className="rounded-[10px] border border-warn bg-warnsoft px-3.5 py-2.5 text-sm font-semibold text-ink">
            Your session is no longer valid. Please sign in again.
          </div>
        ) : null}
        <LoginForm next={next} />
      </div>
    </div>
  );
}
