"use client";

import { useActionState, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { CopyButton } from "@/components/copy-button";
import { Drawer, Modal } from "@/components/overlays";
import { Avatar, Button, Field, Input, Mono, Select, StatusText, TableCard } from "@/components/ui";
import { GENDERS, OPERATIONAL_CATEGORIES } from "@/lib/schemas";
import { CATEGORY_LABELS, ROLE_LABELS } from "@/lib/utils";
import { addUser, updateUser } from "../actions";

interface UserRow { id: string; full_name: string; email: string; role: string; team: string | null; operational_category: string | null; gender: string | null; has_active_report: boolean }

const CategorySelect = ({ defaultValue }: { defaultValue?: string | null }) => (
  <Select name="operational_category" defaultValue={defaultValue ?? ""}>
    <option value="">—</option>
    {OPERATIONAL_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
  </Select>
);
const GenderSelect = ({ defaultValue }: { defaultValue?: string | null }) => (
  <Select name="gender" defaultValue={defaultValue ?? ""}>
    <option value="">—</option>
    {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
  </Select>
);

function AddUserModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [state, action, pending] = useActionState(addUser, null);
  const router = useRouter();
  const created = state?.ok ? state.data : undefined;
  useEffect(() => { if (state?.ok) router.refresh(); }, [state, router]);

  if (created) {
    return (
      <Modal open={open} onClose={onClose} title="Crew member added" description={created.email} footer={<Button type="button" onClick={onClose}>Done</Button>}>
        <div className="flex flex-col gap-2.5 rounded-xl bg-bg p-4">
          <StatusText tone="ok">Account created</StatusText>
          <div className="text-[13px] font-bold text-muted">Temporary password</div>
          <div className="flex items-center justify-between gap-3 rounded-[10px] border border-line bg-card px-3.5 py-2.5">
            <Mono className="text-[15px] font-bold">{created.tempPassword}</Mono>
            <CopyButton text={created.tempPassword} toastText="Password copied" />
          </div>
          <div className="text-[13px] text-muted">Shown once. Not stored anywhere. Share it securely; the user changes it on first sign-in.</div>
        </div>
      </Modal>
    );
  }
  return (
    <Modal open={open} onClose={onClose} title="Add crew member" description="Creates the account with a one-time temporary password.">
      <form action={action} className="flex flex-col gap-3.5">
        <Field label="Full name"><Input name="full_name" required maxLength={120} /></Field>
        <Field label="Work email"><Input name="email" type="email" required maxLength={200} /></Field>
        <Field label="Team / fleet"><Input name="team" maxLength={80} placeholder="e.g. Fleet 787" /></Field>
        <Field label="Category"><CategorySelect /></Field>
        <Field label="Gender" optional="(research only)"><GenderSelect /></Field>
        {state && !state.ok ? <div role="alert" className="rounded-[10px] border border-bad bg-badsoft px-3.5 py-2.5 text-sm font-semibold text-bad">{state.error}</div> : null}
        <div className="flex flex-wrap justify-end gap-2.5 pt-1 [&>*]:max-md:flex-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create account"}</Button>
        </div>
      </form>
    </Modal>
  );
}

export function UsersTable({ users, children }: { users: UserRow[]; children: ReactNode }) {
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [addKey, setAddKey] = useState(0);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5">
        {children}
        <Button type="button" size="md" className="ml-auto h-11 text-[15px] max-md:flex-1" onClick={() => { setAddKey((k) => k + 1); setAdding(true); }}>Add crew member</Button>
      </div>

      <TableCard>
        {users.length ? (
          <table className="dt">
            <thead><tr><th>Member</th><th className="max-md:hidden">Role</th><th className="max-md:hidden">Team</th><th className="max-md:hidden">Category</th><th>Report</th><th /></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar name={u.full_name || u.email} size={36} />
                      <div className="min-w-0"><div className="truncate font-bold">{u.full_name || "—"}</div><div className="truncate text-[13px] text-muted">{u.email}</div></div>
                    </div>
                  </td>
                  <td className="text-muted max-md:hidden">{ROLE_LABELS[u.role] ?? u.role}</td>
                  <td className="max-md:hidden">{u.team ?? "—"}</td>
                  <td className="max-md:hidden">{u.operational_category ? CATEGORY_LABELS[u.operational_category] : "—"}</td>
                  <td><StatusText tone={u.has_active_report ? "ok" : "warn"} hideLabelOnMobile>{u.has_active_report ? "Loaded" : "Missing"}</StatusText></td>
                  <td className="text-right">{u.role === "end_user" ? <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(u)}>Edit</Button> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div className="p-8 text-center font-semibold text-muted">No members match the filters</div>}
      </TableCard>

      <Drawer open={editing !== null} onClose={() => setEditing(null)} title={editing?.full_name || "Crew member"} description={editing?.email}>
        {editing ? (
          <ActionForm key={editing.id} action={updateUser} submitLabel="Save changes" className="flex-1 gap-4" onSuccess={() => setEditing(null)}>
            <input type="hidden" name="user_id" value={editing.id} />
            <Field label="Team / fleet"><Input name="team" defaultValue={editing.team ?? ""} maxLength={80} /></Field>
            <Field label="Category"><CategorySelect defaultValue={editing.operational_category} /></Field>
            <Field label="Gender" optional="(research only)"><GenderSelect defaultValue={editing.gender} /></Field>
            <div className="flex items-center justify-between rounded-[10px] bg-bg px-3.5 py-3 text-sm">
              <span className="text-muted">Report loaded</span>
              <StatusText tone={editing.has_active_report ? "ok" : "warn"}>{editing.has_active_report ? "Yes" : "No"}</StatusText>
            </div>
            <div className="flex-1" />
          </ActionForm>
        ) : null}
      </Drawer>

      <AddUserModal key={addKey} open={adding} onClose={() => setAdding(false)} />
    </>
  );
}
