-- Crew canvas (Oct 2026 "canvas concept"): a per-organization rollout flag and per-user saved layouts.
-- See docs/design/canvas-concept/README.md.

-- Rollout flag. Off by default; a super admin turns it on per organization (/super/organizations).
-- Readable by members through the existing org_select policy; only the service role writes it.
alter table public.organizations add column canvas_enabled boolean not null default false;

-- One saved layout per user, surface and page. The app validates `layout` against the widget
-- registry (src/lib/canvas/layout.ts) before writing; the checks below only bound its shape and size.
create table public.user_canvas_layouts (
  user_id        uuid not null references public.users(id) on delete cascade,
  surface        text not null default 'crew' check (surface in ('crew')),
  page           text not null default 'home' check (page in ('home')),
  layout         jsonb not null default '{}'::jsonb
                 check (jsonb_typeof(layout) = 'object' and pg_column_size(layout) <= 8192),
  layout_version int not null default 1 check (layout_version between 1 and 100),
  updated_at     timestamptz not null default now(),
  primary key (user_id, surface, page)
);
create trigger canvas_layouts_set_updated_at before update on public.user_canvas_layouts
  for each row execute function private.set_updated_at();

alter table public.user_canvas_layouts enable row level security;

-- Owner only. Nobody else (org admins and super admins included) can read someone's layout.
create policy canvas_layout_select on public.user_canvas_layouts for select to authenticated
  using (user_id = (select auth.uid()));
create policy canvas_layout_insert on public.user_canvas_layouts for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy canvas_layout_update on public.user_canvas_layouts for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy canvas_layout_delete on public.user_canvas_layouts for delete to authenticated
  using (user_id = (select auth.uid()));

-- Lockdown: the init migration already strips Supabase's default grants (its LOCKDOWN block); repeat
-- the revoke and grant the minimum explicitly so this file is correct on its own.
revoke all on public.user_canvas_layouts from anon, authenticated;
grant select, insert, update, delete on public.user_canvas_layouts to authenticated;
grant all on public.user_canvas_layouts to service_role;
