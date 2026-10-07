-- Redesign (Sept 2026): "Training" becomes a first-class crew routine alongside
-- simulator / flight / debrief. It uses the briefing prompt family.
alter table public.consent_requests drop constraint if exists consent_requests_routine_type_check;
alter table public.consent_requests add constraint consent_requests_routine_type_check
  check (routine_type in ('simulator', 'flight', 'debrief', 'training'));

alter table public.routine_sessions drop constraint if exists routine_sessions_routine_code_check;
alter table public.routine_sessions add constraint routine_sessions_routine_code_check
  check (routine_code in ('simulator', 'flight', 'debrief', 'training', 'coaching'));
