import { ActionForm } from "@/components/action-form";
import { ChipChecks, Field, Input, Mono, PageHero, Panel, Select, SideCard, StatusText, TableCard, Textarea, type StatusItem } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import { PROMPT_FAMILIES } from "@/lib/schemas";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDay } from "@/lib/utils";
import { activatePrompt, createPromptVersion } from "../actions";
import { Playground } from "./playground";

export default async function PromptsPage() {
  await requireRole("super_admin");
  const { data: prompts } = await createAdminClient().from("system_prompts").select("*").order("routine_type").order("version", { ascending: false });
  const env = serverEnv();
  const list = prompts ?? [];
  const active = Object.fromEntries(list.filter((p) => p.is_active).map((p) => [p.routine_type, p.content]));
  const mock = env.AI_MODE === "mock";

  const status: StatusItem[] = [
    { tone: mock ? "warn" : "ok", label: mock ? "Mock mode · no model calls" : `Live · ${env.ANTHROPIC_MODEL}` },
    { tone: "acc", label: `Effort ${env.ANTHROPIC_EFFORT}` },
    { tone: "neutral", label: `${PROMPT_FAMILIES.length} families · ${list.length} versions` },
  ];

  return (
    <>
      <PageHero title="System prompts & AI engine" description="Versioned prompts per routine family. Activating a version switches production immediately; previous versions stay for rollback." status={status} />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-6">
          <TableCard title="Versions">
            <table className="dt">
              <thead><tr><th>Family</th><th>Version</th><th className="max-md:hidden">Notes</th><th>Status</th><th /></tr></thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id}>
                    <td><Mono className="font-bold">{p.routine_type}</Mono></td>
                    <td className="font-bold tabular-nums">v{p.version}</td>
                    <td className="max-w-[280px] truncate text-muted max-md:hidden">{p.notes ?? "—"} · {formatDay(p.created_at)}</td>
                    <td><StatusText tone={p.is_active ? "ok" : "neutral"}>{p.is_active ? "Active" : "Archived"}</StatusText></td>
                    <td className="text-right">
                      {!p.is_active ? (
                        <ActionForm action={activatePrompt} submitLabel="Activate" size="sm" variant="secondary" inline
                          confirm={{ title: `Activate ${p.routine_type} v${p.version}?`, body: "Production switches to this version immediately. The current version stays available for rollback.", confirmLabel: "Activate" }}>
                          <input type="hidden" name="prompt_id" value={p.id} />
                        </ActionForm>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableCard>
          <Panel title="Prompt playground" description="Test a draft against two demo personas before saving.">
            <Playground activePrompts={active} />
          </Panel>
        </div>

        <SideCard title="New version" className="rounded-[14px]">
          <ActionForm action={createPromptVersion} submitLabel="Save version" footer="plain" fullWidthSubmit size="lg" resetOnSuccess className="gap-3.5">
            <Field label="Routine family">
              <Select name="routine_type" defaultValue="briefing">{PROMPT_FAMILIES.map((f) => <option key={f} value={f}>{f}</option>)}</Select>
            </Field>
            <Field label="Notes"><Input name="notes" maxLength={500} placeholder="What changed and why" /></Field>
            <Field label="System prompt"><Textarea name="content" rows={10} required minLength={20} maxLength={20000} className="font-mono text-[13px]" /></Field>
            <ChipChecks name="activate" options={[{ value: "on", label: "Activate immediately" }]} defaultValues={[]} />
          </ActionForm>
        </SideCard>
      </div>
    </>
  );
}
