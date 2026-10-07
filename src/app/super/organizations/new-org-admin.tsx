"use client";

import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { CopyButton } from "@/components/copy-button";
import { Modal } from "@/components/overlays";
import { Button, Field, Input, Mono, Select, StatusText } from "@/components/ui";
import { createOrgAdmin } from "../actions";

export function NewOrgAdmin({ orgs }: { orgs: Array<{ id: string; name: string }> }) {
  const [created, setCreated] = useState<{ tempPassword: string; email: string } | null>(null);
  return (
    <>
      <ActionForm action={createOrgAdmin} submitLabel="Create admin account" footer="plain" fullWidthSubmit resetOnSuccess className="gap-3" onSuccess={(r) => setCreated(r.data ?? null)}>
        <Field label="Organization">
          <Select name="organization_id" required defaultValue="">
            <option value="" disabled>Select…</option>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>
        </Field>
        <Field label="Full name"><Input name="full_name" required maxLength={120} /></Field>
        <Field label="Work email"><Input name="email" type="email" required maxLength={200} /></Field>
      </ActionForm>
      <Modal open={created !== null} onClose={() => setCreated(null)} title="Admin account created" description={created?.email} footer={<Button type="button" onClick={() => setCreated(null)}>Done</Button>}>
        <div className="flex flex-col gap-2.5 rounded-xl bg-bg p-4">
          <StatusText tone="ok">Admin account created</StatusText>
          <div className="flex items-center justify-between gap-3 rounded-[10px] border border-line bg-card px-3.5 py-2.5">
            <Mono className="text-[15px] font-bold">{created?.tempPassword}</Mono>
            <CopyButton text={created?.tempPassword ?? ""} toastText="Password copied" />
          </div>
          <div className="text-[13px] text-muted">Temporary password, shown once. Not stored anywhere.</div>
        </div>
      </Modal>
    </>
  );
}
