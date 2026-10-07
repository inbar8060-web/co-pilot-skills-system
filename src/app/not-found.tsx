import { LinkButton } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-4 p-10">
      <h1 className="m-0 text-[28px] font-extrabold tracking-[-0.025em]">Page not found</h1>
      <p className="m-0 text-muted">The page you requested does not exist or you do not have access to it.</p>
      <div><LinkButton href="/">Back to home</LinkButton></div>
    </div>
  );
}
