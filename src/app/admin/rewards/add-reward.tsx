"use client";

import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { Modal } from "@/components/overlays";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { createReward } from "../actions";

export function AddReward() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="secondary" size="sm" className="h-10 bg-card px-4 text-sm" onClick={() => setOpen(true)}>Add reward</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add reward" description="Published immediately to your organization's catalog.">
        <ActionForm action={createReward} submitLabel="Publish reward" className="gap-3.5" onSuccess={() => setOpen(false)}>
          <Field label="Title"><Input name="title" required maxLength={120} /></Field>
          <Field label="Description"><Textarea name="description" rows={2} maxLength={1000} /></Field>
          <Field label="Cost in credits"><Input type="number" name="cost_in_credits" min={1} max={100000} required /></Field>
          <Field label="Inventory" optional="(empty = unlimited)"><Input type="number" name="inventory_count" min={0} max={100000} /></Field>
        </ActionForm>
      </Modal>
    </>
  );
}
