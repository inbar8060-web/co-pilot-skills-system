import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppError } from "@/lib/utils";

export interface AuditOptions {
  /**
   * When true the caller's operation must not complete without a trail: a failed
   * write throws AUDIT_FAILED. Use for privileged operations whose only record is
   * this row (exports, rule changes, account provisioning). Wall and prompt
   * operations write their audit rows inside their own SQL transaction instead.
   */
  critical?: boolean;
}

export async function audit(
  actorUserId: string | null,
  action: string,
  target?: { type: string; id: string } | null,
  metadata: Record<string, unknown> = {},
  options: AuditOptions = {},
): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.rpc("admin_write_audit", {
      p_actor: actorUserId ?? undefined,
      p_action: action,
      p_target_type: target?.type,
      p_target_id: target?.id,
      p_metadata: metadata as never,
    });
    if (error) throw error;
    return true;
  } catch (err) {
    console.error("[audit] failed", action, err);
    if (options.critical) throw new AppError("AUDIT_FAILED", "Could not record the audit trail; operation aborted", 503);
    return false;
  }
}
