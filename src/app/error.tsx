"use client";

import { Button } from "@/components/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-4 p-10">
      <h1 className="m-0 text-[28px] font-extrabold tracking-[-0.025em]">Something went wrong</h1>
      <p className="m-0 text-muted">The page could not be rendered.{error.digest ? <span className="font-mono text-xs"> Ref: {error.digest}</span> : null}</p>
      <div><Button variant="secondary" onClick={() => reset()}>Try again</Button></div>
    </div>
  );
}
