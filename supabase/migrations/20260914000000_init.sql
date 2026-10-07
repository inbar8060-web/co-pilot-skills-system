-- ============================================================================
-- Cognitive Copilot & Personal CRM — initial schema
--
-- Design principles
--  * `public`  : application tables, exposed through the Data API, RLS on every table,
--                explicit GRANTs (Supabase no longer exposes tables automatically).
--  * `wall`    : THE ANONYMITY WALL. Psychometric content and the identity<->token
--                mapping. NOT exposed through the Data API, no grants to anon/authenticated.
--                Reachable only through `public.admin_*` SECURITY DEFINER functions that are
--                executable by `service_role` alone (server-side code, after app-level authz).
--  * `private` : RLS helper functions and internal state (rate limits).
-- ============================================================================

set check_function_bodies = off;

create extension if not exists pgcrypto with schema extensions;

-- ----------------------------------------------------------------------------
-- Schemas & baseline privileges
-- ----------------------------------------------------------------------------
create schema if not exists private;
create schema if not exists wall;

revoke all on schema private from public;
revoke all on schema wall from public;
grant usage on schema private to authenticated;          -- needed to *call* whitelisted helpers
grant usage on schema private to service_role;
grant usage on schema wall to service_role;

alter default privileges in schema private revoke execute on functions from public;
alter default privileges in schema wall   revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from public;

-- ----------------------------------------------------------------------------
-- Generic helpers
-- ----------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ----------------------------------------------------------------------------
-- Organizations & users
-- ----------------------------------------------------------------------------
create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique check (slug ~ '^[a-z0-9-]{2,64}$'),
  created_at  timestamptz not null default now()
);

create table public.users (
  id                   uuid primary key references auth.users(id) on delete cascade,
  organization_id      uuid references public.organizations(id) on delete set null,
  full_name            text not null default '',
  email                text not null unique,
  role                 text not null default 'end_user'
                       check (role in ('end_user', 'org_admin', 'super_admin')),
  gender               text check (gender in ('male', 'female', 'other')),
  operational_category text check (operational_category in
                       ('military_pilot', 'civilian_pilot', 'management', 'first_officer', 'captain', 'other')),
  team                 text,
  has_active_report    boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index users_org_idx on public.users(organization_id);
create trigger users_set_updated_at before update on public.users
  for each row execute function private.set_updated_at();

-- RLS helpers (SECURITY DEFINER so they can read public.users without recursion)
create or replace function private.current_user_role()
returns text language sql stable security definer set search_path = '' as $$
  select u.role from public.users u where u.id = auth.uid()
$$;
create or replace function private.current_org_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select u.organization_id from public.users u where u.id = auth.uid()
$$;
create or replace function private.is_super_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select u.role = 'super_admin' from public.users u where u.id = auth.uid()), false)
$$;
create or replace function private.is_org_admin_of(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select u.role = 'org_admin' and u.organization_id = p_org
                   from public.users u where u.id = auth.uid()), false)
$$;
grant execute on function private.current_user_role() to authenticated;
grant execute on function private.current_org_id()    to authenticated;
grant execute on function private.is_super_admin()    to authenticated;
grant execute on function private.is_org_admin_of(uuid) to authenticated;

-- Is p_user a crew member (end_user) of organization p_org? Used by RLS on consent requests,
-- where the caller cannot see other users' rows directly.
create or replace function private.is_crew_member_of(p_user uuid, p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.users u
                  where u.id = p_user and u.organization_id = p_org and u.role = 'end_user')
$$;
grant execute on function private.is_crew_member_of(uuid, uuid) to authenticated;

-- Minimal directory of the caller's organization for partner pickers: no emails, no roles,
-- no demographics. Everything else about colleagues stays invisible to crew members.
create or replace function public.crew_directory()
returns table (id uuid, full_name text, team text, has_active_report boolean)
language sql stable security definer set search_path = '' as $$
  select u.id, u.full_name, u.team, u.has_active_report
  from public.users u
  where auth.uid() is not null
    and u.role = 'end_user'
    and u.organization_id = (select x.organization_id from public.users x where x.id = auth.uid())
  order by u.full_name
$$;
revoke execute on function public.crew_directory() from public;
grant execute on function public.crew_directory() to authenticated;

-- auth.users -> public.users bootstrap (+ preferences + gamification rows)
create or replace function private.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_role text := coalesce(new.raw_app_meta_data->>'role', 'end_user');
  v_org  uuid := nullif(new.raw_app_meta_data->>'organization_id', '')::uuid;
begin
  if v_role not in ('end_user', 'org_admin', 'super_admin') then v_role := 'end_user'; end if;
  insert into public.users (id, email, full_name, role, organization_id)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''), v_role, v_org)
  on conflict (id) do nothing;
  insert into public.user_preferences_and_consent (user_id) values (new.id) on conflict do nothing;
  insert into public.user_gamification_status (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

-- public.users(role, organization_id) -> auth.users.raw_app_meta_data (JWT claims for coarse routing)
create or replace function private.sync_role_to_auth()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                             || jsonb_build_object('role', new.role, 'organization_id', new.organization_id)
   where id = new.id;
  return new;
end $$;
create trigger users_sync_role_to_auth
  after insert or update of role, organization_id on public.users
  for each row execute function private.sync_role_to_auth();

-- ----------------------------------------------------------------------------
-- Preferences / notification settings
-- ----------------------------------------------------------------------------
create table public.user_preferences_and_consent (
  user_id                    uuid primary key references public.users(id) on delete cascade,
  sharing_level              text not null default 'level_1_blind_synergy'
                             check (sharing_level in ('level_0_private', 'level_1_blind_synergy', 'level_2_full')),
  allowed_scenarios          text[] not null default '{simulator,flight,debrief}',
  notification_frequency     text not null default 'medium'
                             check (notification_frequency in ('high', 'medium', 'low', 'off')),
  notification_focus         text[] not null default '{briefing_prep,stress_management,debrief_reflection}',
  max_notifications_per_week int not null default 3 check (max_notifications_per_week between 0 and 21),
  quiet_hours_start          time,
  quiet_hours_end            time,
  updated_at                 timestamptz not null default now()
);
create trigger prefs_set_updated_at before update on public.user_preferences_and_consent
  for each row execute function private.set_updated_at();

-- ----------------------------------------------------------------------------
-- Consent requests (ad-hoc sharing)
-- ----------------------------------------------------------------------------
create table public.consent_requests (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  requester_user_id uuid not null references public.users(id) on delete cascade,
  target_user_id    uuid not null references public.users(id) on delete cascade,
  routine_type      text not null check (routine_type in ('simulator', 'flight', 'debrief')),
  status            text not null default 'pending'
                    check (status in ('pending', 'approved', 'declined', 'expired')),
  requested_at      timestamptz not null default now(),
  responded_at      timestamptz,
  expires_at        timestamptz not null default now() + interval '14 days',
  valid_until       timestamptz,               -- set on approval; the single source of the approval window
  check (requester_user_id <> target_user_id)
);
create index consent_valid_idx on public.consent_requests(requester_user_id, target_user_id, routine_type, valid_until)
  where status = 'approved';
create index consent_target_idx on public.consent_requests(target_user_id, status);
create index consent_requester_idx on public.consent_requests(requester_user_id, status);
create unique index consent_one_pending_idx on public.consent_requests(requester_user_id, target_user_id, routine_type)
  where status = 'pending';

-- Does the target currently allow sharing for this routine? (sharing level + allowed scenarios)
create or replace function private.partner_allows(p_target uuid, p_routine text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select p.sharing_level <> 'level_0_private' and p_routine = any(p.allowed_scenarios)
    from public.user_preferences_and_consent p where p.user_id = p_target), true)
$$;
grant execute on function private.partner_allows(uuid, text) to authenticated;

-- Guard: only status may change; pending -> approved/declined/expired; expired rows cannot be
-- approved; approval stamps valid_until (the ONLY definition of the approval window).
create or replace function private.consent_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.requester_user_id <> old.requester_user_id
     or new.target_user_id <> old.target_user_id
     or new.routine_type <> old.routine_type
     or new.organization_id <> old.organization_id
     or new.requested_at <> old.requested_at
     or new.expires_at <> old.expires_at
     or new.valid_until is distinct from old.valid_until then
    raise exception 'CONSENT_IMMUTABLE_FIELDS';
  end if;
  if old.status <> 'pending' then
    raise exception 'CONSENT_ALREADY_RESOLVED';
  end if;
  if new.status = 'pending' then
    raise exception 'CONSENT_INVALID_TRANSITION';
  end if;
  if old.expires_at < now() and new.status <> 'expired' then
    raise exception 'CONSENT_EXPIRED';
  end if;
  if new.status = 'approved' then
    if not private.partner_allows(old.target_user_id, old.routine_type) then
      raise exception 'CONSENT_NOT_ALLOWED_BY_PREFERENCES';
    end if;
    new.valid_until := now() + interval '30 days';
  end if;
  new.responded_at := now();
  return new;
end $$;
create trigger consent_guard before update on public.consent_requests
  for each row execute function private.consent_guard();

-- Expire stale pending requests in the caller's organization (idempotent; callable by any member
-- so the UI never disagrees with the unique-pending index between cron runs).
create or replace function public.expire_stale_consents()
returns int language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  with upd as (
    update public.consent_requests set status = 'expired', responded_at = now()
     where status = 'pending' and expires_at < now()
       and organization_id = private.current_org_id()
    returning 1)
  select count(*) into v_n from upd;
  return v_n;
end $$;
revoke execute on function public.expire_stale_consents() from public;
grant execute on function public.expire_stale_consents() to authenticated;

-- ----------------------------------------------------------------------------
-- Routine sessions (AI output) and reflections
-- ----------------------------------------------------------------------------
create table public.routine_sessions (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid references public.organizations(id) on delete set null,
  routine_code        text not null check (routine_code in ('simulator', 'flight', 'debrief', 'coaching')),
  primary_user_id     uuid not null references public.users(id) on delete cascade,
  partner_user_id     uuid references public.users(id) on delete set null,
  scenario_context    jsonb not null default '{}'::jsonb,
  ai_generated_output jsonb not null,
  model               text,
  prompt_version      int,
  input_tokens        int,
  output_tokens       int,
  created_at          timestamptz not null default now()
);
create index routine_sessions_primary_idx on public.routine_sessions(primary_user_id, created_at desc);
create index routine_sessions_org_idx on public.routine_sessions(organization_id, created_at desc);

create table public.reflections (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  session_id    uuid references public.routine_sessions(id) on delete set null,
  routine_type  text not null check (routine_type in ('simulator', 'flight', 'debrief', 'training')),
  what_worked   text not null check (char_length(what_worked) between 1 and 4000),
  what_to_change text not null check (char_length(what_to_change) between 1 and 4000),
  created_at    timestamptz not null default now()
);
create index reflections_user_idx on public.reflections(user_id, created_at desc);

-- Weekly insights (curated tips) + acknowledgements
create table public.weekly_insights (
  id          uuid primary key default gen_random_uuid(),
  week_index  int not null unique,          -- rotates by ISO week
  title       text not null,
  body        text not null,
  focus       text not null check (focus in ('briefing_prep', 'stress_management', 'debrief_reflection'))
);
create table public.insight_acknowledgements (
  user_id         uuid not null references public.users(id) on delete cascade,
  insight_id      uuid not null references public.weekly_insights(id) on delete cascade,
  iso_week        text not null,            -- e.g. 2026-W37
  acknowledged_at timestamptz not null default now(),
  primary key (user_id, iso_week)
);

-- ----------------------------------------------------------------------------
-- Gamification
-- ----------------------------------------------------------------------------
create table public.gamification_rules (
  action_type    text primary key,
  label          text not null,
  credits        int not null check (credits between 0 and 10000),
  cooldown_kind  text not null check (cooldown_kind in ('once', 'per_day', 'per_week')),
  cooldown_limit int not null default 1 check (cooldown_limit between 1 and 100),
  description    text,
  is_active      boolean not null default true,
  updated_at     timestamptz not null default now()
);
create trigger rules_set_updated_at before update on public.gamification_rules
  for each row execute function private.set_updated_at();

create table public.readiness_tiers (
  tier        text primary key check (tier in ('bronze', 'silver', 'gold', 'platinum')),
  label       text not null,
  min_credits int not null check (min_credits >= 0),
  sort_order  int not null unique
);

-- Recompute every stored tier from the catalog (used when thresholds change).
create or replace function private.recompute_all_tiers()
returns void language sql security definer set search_path = '' as $$
  update public.user_gamification_status s
     set readiness_tier = coalesce((select t.tier from public.readiness_tiers t
                                     where t.min_credits <= s.total_credits_earned
                                     order by t.min_credits desc limit 1), 'bronze')
$$;
create or replace function private.on_tiers_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.recompute_all_tiers();
  return null;
end $$;
create trigger tiers_recompute after update on public.readiness_tiers
  for each statement execute function private.on_tiers_changed();

create table public.user_gamification_status (
  user_id              uuid primary key references public.users(id) on delete cascade,
  total_credits_earned int not null default 0 check (total_credits_earned >= 0),
  current_balance      int not null default 0 check (current_balance >= 0),
  readiness_tier       text not null default 'bronze' references public.readiness_tiers(tier),
  current_streak_weeks int not null default 0,
  last_action_at       timestamptz
);

create table public.gamification_logs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,
  action_type     text not null,
  credits_awarded int not null,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index gamification_logs_user_action_idx on public.gamification_logs(user_id, action_type, created_at desc);

create table public.organization_rewards (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title           text not null check (char_length(title) between 1 and 120),
  description     text,
  cost_in_credits int not null check (cost_in_credits between 1 and 100000),
  inventory_count int not null default -1 check (inventory_count >= -1),   -- -1 = unlimited
  is_active       boolean not null default true,
  created_by      uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index org_rewards_org_idx on public.organization_rewards(organization_id, is_active);

create table public.reward_redemptions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references public.users(id) on delete cascade,
  reward_id       uuid not null references public.organization_rewards(id) on delete restrict,
  credits_spent   int not null check (credits_spent > 0),
  reward_title    text not null default '',          -- snapshot: survives reward deactivation
  stock_decremented boolean not null default false,  -- refund restocks only what was taken
  status          text not null default 'requested'
                  check (status in ('requested', 'approved', 'delivered', 'cancelled')),
  created_at      timestamptz not null default now(),
  processed_at    timestamptz
);
create index redemptions_org_idx on public.reward_redemptions(organization_id, status);
create index redemptions_user_idx on public.reward_redemptions(user_id, created_at desc);

-- Redemption status guard: forward-only transitions; cancellation refunds credits + restocks.
create or replace function private.redemption_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.user_id <> old.user_id or new.reward_id <> old.reward_id
     or new.credits_spent <> old.credits_spent or new.organization_id <> old.organization_id then
    raise exception 'REDEMPTION_IMMUTABLE_FIELDS';
  end if;
  if old.status in ('delivered', 'cancelled') and new.status <> old.status then
    raise exception 'REDEMPTION_ALREADY_FINAL';
  end if;
  if new.status <> old.status then
    new.processed_at := now();
    if new.status = 'cancelled' then
      update public.user_gamification_status
         set current_balance = current_balance + old.credits_spent
       where user_id = old.user_id;
      if old.stock_decremented then
        update public.organization_rewards
           set inventory_count = inventory_count + 1
         where id = old.reward_id and inventory_count >= 0;
      end if;
      insert into public.gamification_logs (user_id, action_type, credits_awarded, metadata)
      values (old.user_id, 'redemption_refund', old.credits_spent, jsonb_build_object('redemption_id', old.id));
    end if;
  end if;
  return new;
end $$;
create trigger redemption_guard before update on public.reward_redemptions
  for each row execute function private.redemption_guard();

-- Atomic redemption for the calling user (balance + inventory checked under row locks).
create or replace function public.redeem_reward(p_reward_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := auth.uid();
  v_org    uuid;
  v_reward public.organization_rewards%rowtype;
  v_status public.user_gamification_status%rowtype;
  v_id     uuid;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select organization_id into v_org from public.users where id = v_uid;

  select * into v_reward from public.organization_rewards where id = p_reward_id for update;
  if not found or not v_reward.is_active or v_reward.organization_id is distinct from v_org then
    raise exception 'REWARD_UNAVAILABLE';
  end if;
  if v_reward.inventory_count = 0 then raise exception 'OUT_OF_STOCK'; end if;

  select * into v_status from public.user_gamification_status where user_id = v_uid for update;
  if not found or v_status.current_balance < v_reward.cost_in_credits then
    raise exception 'INSUFFICIENT_CREDITS';
  end if;

  update public.user_gamification_status
     set current_balance = current_balance - v_reward.cost_in_credits
   where user_id = v_uid;
  if v_reward.inventory_count > 0 then
    update public.organization_rewards set inventory_count = inventory_count - 1 where id = p_reward_id;
  end if;

  insert into public.reward_redemptions (organization_id, user_id, reward_id, credits_spent, reward_title, stock_decremented)
  values (v_org, v_uid, p_reward_id, v_reward.cost_in_credits, v_reward.title, v_reward.inventory_count > 0)
  returning id into v_id;

  insert into public.gamification_logs (user_id, action_type, credits_awarded, metadata)
  values (v_uid, 'redemption', -v_reward.cost_in_credits, jsonb_build_object('redemption_id', v_id, 'reward_id', p_reward_id));

  return v_id;
end $$;
revoke execute on function public.redeem_reward(uuid) from public;
grant execute on function public.redeem_reward(uuid) to authenticated;

-- Credit engine: enforces rules + cooldowns + streaks + tiers atomically. Service role only.
create or replace function public.admin_award_credits(p_user_id uuid, p_action text, p_metadata jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_rule         public.gamification_rules%rowtype;
  v_status       public.user_gamification_status%rowtype;
  v_count        int;
  v_window_start timestamptz;
  v_tier         text;
  v_now          timestamptz := now();
  v_this_week    date := date_trunc('week', now())::date;
  v_last_week    date;
  v_streak       int;
  v_bonus        jsonb := null;
begin
  select * into v_rule from public.gamification_rules where action_type = p_action and is_active;
  if not found then
    return jsonb_build_object('awarded', false, 'reason', 'UNKNOWN_ACTION');
  end if;

  insert into public.user_gamification_status (user_id) values (p_user_id) on conflict do nothing;
  select * into v_status from public.user_gamification_status where user_id = p_user_id for update;

  v_window_start := case v_rule.cooldown_kind
                      when 'per_day'  then date_trunc('day',  v_now)
                      when 'per_week' then date_trunc('week', v_now)
                      else '-infinity'::timestamptz
                    end;

  select count(*) into v_count from public.gamification_logs
   where user_id = p_user_id and action_type = p_action and created_at >= v_window_start;
  if v_count >= v_rule.cooldown_limit then
    return jsonb_build_object('awarded', false, 'reason', 'COOLDOWN',
                              'balance', v_status.current_balance, 'tier', v_status.readiness_tier);
  end if;

  insert into public.gamification_logs (user_id, action_type, credits_awarded, metadata)
  values (p_user_id, p_action, v_rule.credits, coalesce(p_metadata, '{}'::jsonb));

  v_last_week := date_trunc('week', v_status.last_action_at)::date;
  v_streak := case
                when v_status.last_action_at is null then 1
                when v_last_week = v_this_week     then greatest(v_status.current_streak_weeks, 1)
                when v_last_week = v_this_week - 7 then v_status.current_streak_weeks + 1
                else 1
              end;

  update public.user_gamification_status
     set total_credits_earned = total_credits_earned + v_rule.credits,
         current_balance      = current_balance + v_rule.credits,
         current_streak_weeks = v_streak,
         last_action_at       = v_now
   where user_id = p_user_id
   returning * into v_status;

  select tier into v_tier from public.readiness_tiers
   where min_credits <= v_status.total_credits_earned
   order by min_credits desc limit 1;
  v_tier := coalesce(v_tier, 'bronze');
  update public.user_gamification_status set readiness_tier = v_tier where user_id = p_user_id;

  if p_action <> 'streak_bonus' and v_streak >= 3 and v_streak % 3 = 0 then
    v_bonus := public.admin_award_credits(p_user_id, 'streak_bonus', jsonb_build_object('streak_weeks', v_streak));
  end if;

  return jsonb_build_object(
    'awarded', true,
    'credits', v_rule.credits,
    'balance', v_status.current_balance + coalesce((v_bonus->>'credits')::int, 0),
    'tier', coalesce(v_bonus->>'tier', v_tier),
    'streak_weeks', v_streak,
    'bonus', v_bonus
  );
end $$;
revoke execute on function public.admin_award_credits(uuid, text, jsonb) from public;
grant execute on function public.admin_award_credits(uuid, text, jsonb) to service_role;

-- ----------------------------------------------------------------------------
-- System prompts (versioned, super-admin managed) & audit log
-- ----------------------------------------------------------------------------
create table public.system_prompts (
  id           uuid primary key default gen_random_uuid(),
  routine_type text not null check (routine_type in ('briefing', 'debrief', 'coaching', 'normalize_report')),
  version      int not null,
  content      text not null check (char_length(content) between 20 and 20000),
  notes        text,
  is_active    boolean not null default false,
  created_by   uuid references public.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (routine_type, version)
);
create unique index system_prompts_one_active_idx on public.system_prompts(routine_type) where is_active;

create table public.audit_log (
  id            bigserial primary key,
  actor_user_id uuid references public.users(id) on delete set null,
  action        text not null,
  target_type   text,
  target_id     text,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index audit_log_created_idx on public.audit_log(created_at desc);

create or replace function public.admin_write_audit(p_actor uuid default null, p_action text default null, p_target_type text default null, p_target_id text default null, p_metadata jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_log (actor_user_id, action, target_type, target_id, metadata)
  values (p_actor, coalesce(p_action, 'unknown'), p_target_type, p_target_id, coalesce(p_metadata, '{}'::jsonb));
$$;
revoke execute on function public.admin_write_audit(uuid, text, text, text, jsonb) from public;
grant execute on function public.admin_write_audit(uuid, text, text, text, jsonb) to service_role;

-- ----------------------------------------------------------------------------
-- Rate limiting (fixed window, DB-backed so it works across serverless instances)
-- ----------------------------------------------------------------------------
create table private.rate_limits (
  key          text primary key,
  window_start timestamptz not null,
  count        int not null
);
create index rate_limits_window_idx on private.rate_limits(window_start);
create or replace function private.cleanup_rate_limits()
returns int language sql security definer set search_path = '' as $$
  with del as (delete from private.rate_limits where window_start < now() - interval '1 day' returning 1)
  select count(*)::int from del
$$;
create or replace function public.admin_check_rate_limit(p_key text, p_limit int, p_window_seconds int)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := now();
  v_row private.rate_limits%rowtype;
begin
  insert into private.rate_limits (key, window_start, count) values (p_key, v_now, 1)
  on conflict (key) do update
    set count = case when private.rate_limits.window_start + make_interval(secs => p_window_seconds) < v_now
                     then 1 else private.rate_limits.count + 1 end,
        window_start = case when private.rate_limits.window_start + make_interval(secs => p_window_seconds) < v_now
                            then v_now else private.rate_limits.window_start end
  returning * into v_row;
  return v_row.count <= p_limit;
end $$;
revoke execute on function public.admin_check_rate_limit(text, int, int) from public;
grant execute on function public.admin_check_rate_limit(text, int, int) to service_role;

-- ----------------------------------------------------------------------------
-- THE ANONYMITY WALL (schema `wall`)
-- ----------------------------------------------------------------------------
create table wall.anonymous_profiles (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid references public.organizations(id) on delete set null,
  profile_anon_code  text not null unique check (profile_anon_code ~ '^PROF-[0-9]{4}[A-Z]-[A-Z]$'),
  framework          text not null check (framework in ('MBTI_Step_I', 'MBTI_Step_II', 'Symbiotics_ADAPT', 'Custom')),
  raw_report_json    jsonb,                 -- extracted text + candidate identity hints; never leaves the wall
  normalized_persona jsonb not null,
  uploaded_by        uuid references public.users(id) on delete set null,
  created_at         timestamptz not null default now()
);
create index anon_profiles_org_idx on wall.anonymous_profiles(organization_id);

create table wall.user_profile_mappings (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null constraint user_profile_mappings_user_id_key unique references public.users(id) on delete cascade,
  profile_id            uuid not null unique references wall.anonymous_profiles(id) on delete cascade,
  linked_by             uuid references public.users(id) on delete set null,
  method                text not null check (method in ('manual', 'auto', 'self')),
  linked_at             timestamptz not null default now()
);

create table wall.identity_audit_log (
  id         bigserial primary key,
  actor      uuid,
  action     text not null check (action in ('link', 'unlink', 'ingest', 'auto_match')),
  user_id    uuid,
  profile_id uuid,
  metadata   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table wall.anonymous_profiles    enable row level security;
alter table wall.user_profile_mappings enable row level security;
alter table wall.identity_audit_log    enable row level security;
-- No policies on purpose: only SECURITY DEFINER functions (owner = postgres) touch these tables.

-- Keep users.has_active_report in sync with mappings.
create or replace function wall.sync_has_active_report()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.users set has_active_report = true where id = new.user_id;
  elsif tg_op = 'DELETE' then
    update public.users set has_active_report = false where id = old.user_id;
  end if;
  return null;
end $$;
create trigger mappings_sync_has_active_report
  after insert or delete on wall.user_profile_mappings
  for each row execute function wall.sync_has_active_report();

create or replace function wall.generate_anon_code()
returns text language plpgsql set search_path = '' as $$
declare
  v_code text;
  v_letters constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ';
begin
  loop
    v_code := 'PROF-'
      || lpad((floor(random() * 10000))::int::text, 4, '0')
      || substr(v_letters, 1 + floor(random() * length(v_letters))::int, 1)
      || '-'
      || substr(v_letters, 1 + floor(random() * length(v_letters))::int, 1);
    exit when not exists (select 1 from wall.anonymous_profiles where profile_anon_code = v_code);
  end loop;
  return v_code;
end $$;

-- Ingest a normalized report. Optionally link it immediately (self-upload).
create or replace function public.admin_wall_ingest_profile(
  p_org_id uuid, p_uploaded_by uuid, p_framework text, p_raw jsonb, p_normalized jsonb,
  p_link_user_id uuid default null, p_method text default 'manual')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id   uuid;
  v_code text := wall.generate_anon_code();
begin
  insert into wall.anonymous_profiles (organization_id, profile_anon_code, framework, raw_report_json, normalized_persona, uploaded_by)
  values (p_org_id, v_code, p_framework, p_raw, p_normalized, p_uploaded_by)
  returning id into v_id;
  insert into wall.identity_audit_log (actor, action, profile_id, metadata)
  values (p_uploaded_by, 'ingest', v_id, jsonb_build_object('framework', p_framework));
  if p_link_user_id is not null then
    insert into wall.user_profile_mappings (user_id, profile_id, linked_by, method)
    values (p_link_user_id, v_id, p_uploaded_by, p_method);
    insert into wall.identity_audit_log (actor, action, user_id, profile_id, metadata)
    values (p_uploaded_by, 'link', p_link_user_id, v_id, jsonb_build_object('method', p_method));
  end if;
  return jsonb_build_object('id', v_id, 'code', v_code);
end $$;

create or replace function public.admin_wall_get_profile_for_user(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
           'profile_id', p.id,
           'code', p.profile_anon_code,
           'framework', p.framework,
           'persona', p.normalized_persona,
           'linked_at', m.linked_at,
           'method', m.method)
  from wall.user_profile_mappings m
  join wall.anonymous_profiles p on p.id = m.profile_id
  where m.user_id = p_user_id
$$;

-- Org-admin view: codes and technical status only. Never content, never identity.
create or replace function public.admin_wall_list_profiles(p_org_id uuid)
returns table (id uuid, code text, framework text, created_at timestamptz, is_linked boolean)
language sql stable security definer set search_path = '' as $$
  select p.id, p.profile_anon_code, p.framework, p.created_at,
         exists (select 1 from wall.user_profile_mappings m where m.profile_id = p.id)
  from wall.anonymous_profiles p
  where p.organization_id = p_org_id
  order by p.created_at desc
$$;

-- Super-admin mapping console
create or replace function public.admin_wall_list_mappings(p_org_id uuid default null)
returns table (mapping_id uuid, user_id uuid, full_name text, email text, organization_id uuid,
               profile_id uuid, code text, framework text, method text, linked_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.id, u.id, u.full_name, u.email, u.organization_id,
         p.id, p.profile_anon_code, p.framework, m.method, m.linked_at
  from wall.user_profile_mappings m
  join public.users u on u.id = m.user_id
  join wall.anonymous_profiles p on p.id = m.profile_id
  where p_org_id is null or u.organization_id = p_org_id
  order by m.linked_at desc
$$;

create or replace function public.admin_wall_unlinked_profiles(p_org_id uuid default null)
returns table (id uuid, code text, framework text, organization_id uuid, created_at timestamptz, candidate_email text, candidate_name text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.profile_anon_code, p.framework, p.organization_id, p.created_at,
         p.raw_report_json->'candidate_identity'->>'email',
         p.raw_report_json->'candidate_identity'->>'name'
  from wall.anonymous_profiles p
  where not exists (select 1 from wall.user_profile_mappings m where m.profile_id = p.id)
    and (p_org_id is null or p.organization_id = p_org_id)
  order by p.created_at desc
$$;

create or replace function public.admin_wall_link_profile(p_user_id uuid, p_profile_id uuid, p_actor uuid, p_method text default 'manual')
returns void language plpgsql security definer set search_path = '' as $$
declare v_user_org uuid; v_profile_org uuid;
begin
  select organization_id into v_user_org from public.users where id = p_user_id;
  select organization_id into v_profile_org from wall.anonymous_profiles where id = p_profile_id;
  if v_profile_org is not null and v_user_org is distinct from v_profile_org then
    raise exception 'ORG_MISMATCH';
  end if;
  insert into wall.user_profile_mappings (user_id, profile_id, linked_by, method)
  values (p_user_id, p_profile_id, p_actor, p_method);
  insert into wall.identity_audit_log (actor, action, user_id, profile_id, metadata)
  values (p_actor, 'link', p_user_id, p_profile_id, jsonb_build_object('method', p_method));
end $$;

create or replace function public.admin_wall_unlink_profile(p_user_id uuid, p_actor uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_profile uuid;
begin
  delete from wall.user_profile_mappings where user_id = p_user_id returning profile_id into v_profile;
  if v_profile is null then raise exception 'NOT_LINKED'; end if;
  insert into wall.identity_audit_log (actor, action, user_id, profile_id)
  values (p_actor, 'unlink', p_user_id, v_profile);
end $$;

-- Auto-match unlinked profiles to users by candidate email (same org). Returns number linked.
create or replace function public.admin_wall_auto_match(p_org_id uuid, p_actor uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare r record; v_n int := 0;
begin
  for r in
    -- One candidate profile per user (oldest first); the row set is fixed before the loop,
    -- so re-check inside the loop as well.
    select distinct on (u.id) p.id as profile_id, u.id as user_id
    from wall.anonymous_profiles p
    join public.users u
      on lower(u.email) = lower(p.raw_report_json->'candidate_identity'->>'email')
     and u.organization_id = p_org_id
    where p.organization_id = p_org_id
      and not exists (select 1 from wall.user_profile_mappings m where m.profile_id = p.id)
      and not exists (select 1 from wall.user_profile_mappings m where m.user_id = u.id)
    order by u.id, p.created_at asc
  loop
    continue when exists (select 1 from wall.user_profile_mappings m where m.user_id = r.user_id or m.profile_id = r.profile_id);
    insert into wall.user_profile_mappings (user_id, profile_id, linked_by, method)
    values (r.user_id, r.profile_id, p_actor, 'auto');
    insert into wall.identity_audit_log (actor, action, user_id, profile_id, metadata)
    values (p_actor, 'auto_match', r.user_id, r.profile_id, '{"method":"auto"}'::jsonb);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

create or replace function public.admin_wall_identity_audit(p_limit int default 200)
returns table (id bigint, actor uuid, actor_email text, action text, user_id uuid, user_email text,
               profile_id uuid, code text, metadata jsonb, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select l.id, l.actor, a.email, l.action, l.user_id, u.email, l.profile_id, p.profile_anon_code, l.metadata, l.created_at
  from wall.identity_audit_log l
  left join public.users a on a.id = l.actor
  left join public.users u on u.id = l.user_id
  left join wall.anonymous_profiles p on p.id = l.profile_id
  order by l.id desc
  limit least(greatest(p_limit, 1), 1000)
$$;

-- Research slicing: anonymized rows (no user ids / names / emails).
create or replace function public.admin_wall_research_rows(p_org_id uuid default null, p_gender text default null, p_category text default null)
returns table (organization_id uuid, framework text, type_code text, gender text, operational_category text,
               extraversion int, sensing int, thinking int, judging int, linked boolean)
language sql stable security definer set search_path = '' as $$
  select p.organization_id, p.framework, p.normalized_persona->>'type_code',
         u.gender, u.operational_category,
         (p.normalized_persona->'dimensions'->>'extraversion')::int,
         (p.normalized_persona->'dimensions'->>'sensing')::int,
         (p.normalized_persona->'dimensions'->>'thinking')::int,
         (p.normalized_persona->'dimensions'->>'judging')::int,
         m.id is not null
  from wall.anonymous_profiles p
  left join wall.user_profile_mappings m on m.profile_id = p.id
  left join public.users u on u.id = m.user_id
  where (p_org_id is null or p.organization_id = p_org_id)
    and (p_gender is null or u.gender = p_gender)
    and (p_category is null or u.operational_category = p_category)
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.admin_wall_ingest_profile(uuid,uuid,text,jsonb,jsonb,uuid,text)',
    'public.admin_wall_get_profile_for_user(uuid)',
    'public.admin_wall_list_profiles(uuid)',
    'public.admin_wall_list_mappings(uuid)',
    'public.admin_wall_unlinked_profiles(uuid)',
    'public.admin_wall_link_profile(uuid,uuid,uuid,text)',
    'public.admin_wall_unlink_profile(uuid,uuid)',
    'public.admin_wall_auto_match(uuid,uuid)',
    'public.admin_wall_identity_audit(int)',
    'public.admin_wall_research_rows(uuid,text,text)'
  ] loop
    execute format('revoke execute on function %s from public', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- Org engagement dashboard (anonymous aggregates only)
-- ----------------------------------------------------------------------------
create or replace function public.org_engagement_stats()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_org uuid := private.current_org_id();
begin
  if not (private.is_org_admin_of(v_org) or private.is_super_admin()) then
    raise exception 'FORBIDDEN';
  end if;
  return jsonb_build_object(
    'members',        (select count(*) from public.users where organization_id = v_org and role = 'end_user'),
    'reports_loaded', (select count(*) from public.users where organization_id = v_org and role = 'end_user' and has_active_report),
    'avg_credits',    (select coalesce(round(avg(s.total_credits_earned)), 0)
                         from public.user_gamification_status s join public.users u on u.id = s.user_id
                        where u.organization_id = v_org and u.role = 'end_user'),
    'tiers',          (select coalesce(jsonb_object_agg(t.tier, t.n), '{}'::jsonb) from (
                         select s.readiness_tier as tier, count(*) as n
                           from public.user_gamification_status s join public.users u on u.id = s.user_id
                          where u.organization_id = v_org and u.role = 'end_user'
                          group by s.readiness_tier) t),
    'weekly_sessions', (select coalesce(jsonb_agg(jsonb_build_object('week', w.week, 'routine', w.routine_code, 'n', w.n) order by w.week), '[]'::jsonb) from (
                         select to_char(date_trunc('week', created_at), 'IYYY-"W"IW') as week, routine_code, count(*) as n
                           from public.routine_sessions
                          where organization_id = v_org and created_at > now() - interval '8 weeks'
                          group by 1, 2) w),
    'reflections_30d', (select count(*) from public.reflections r join public.users u on u.id = r.user_id
                         where u.organization_id = v_org and r.created_at > now() - interval '30 days'),
    'consents',       (select coalesce(jsonb_object_agg(c.status, c.n), '{}'::jsonb) from (
                         select status, count(*) as n from public.consent_requests
                          where organization_id = v_org group by status) c),
    'sessions_by_routine', (select coalesce(jsonb_object_agg(r.routine_code, r.n), '{}'::jsonb) from (
                         select routine_code, count(*) as n from public.routine_sessions
                          where organization_id = v_org group by routine_code) r)
  );
end $$;
revoke execute on function public.org_engagement_stats() from public;
grant execute on function public.org_engagement_stats() to authenticated;

-- ----------------------------------------------------------------------------
-- Consent expiry (pg_cron when available; the app also treats stale rows as expired)
-- ----------------------------------------------------------------------------
create or replace function private.expire_consents()
returns int language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  with upd as (
    update public.consent_requests set status = 'expired', responded_at = now()
     where status = 'pending' and expires_at < now()
    returning 1)
  select count(*) into v_n from upd;
  return v_n;
end $$;
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('expire-consents', '17 * * * *', $cron$select private.expire_consents()$cron$);
    perform cron.schedule('cleanup-rate-limits', '23 3 * * *', $cron$select private.cleanup_rate_limits()$cron$);
  end if;
exception when others then
  raise notice 'pg_cron not scheduled: %', sqlerrm;
end $$;

-- ----------------------------------------------------------------------------
-- Auth trigger
-- ----------------------------------------------------------------------------
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_auth_user();

-- ----------------------------------------------------------------------------
-- RLS + GRANTS (public schema)
-- ----------------------------------------------------------------------------
alter table public.organizations                enable row level security;
alter table public.users                        enable row level security;
alter table public.user_preferences_and_consent enable row level security;
alter table public.consent_requests             enable row level security;
alter table public.routine_sessions             enable row level security;
alter table public.reflections                  enable row level security;
alter table public.weekly_insights              enable row level security;
alter table public.insight_acknowledgements     enable row level security;
alter table public.gamification_rules           enable row level security;
alter table public.readiness_tiers              enable row level security;
alter table public.user_gamification_status     enable row level security;
alter table public.gamification_logs            enable row level security;
alter table public.organization_rewards         enable row level security;
alter table public.reward_redemptions           enable row level security;
alter table public.system_prompts               enable row level security;
alter table public.audit_log                    enable row level security;

-- ----------------------------------------------------------------------------
-- Reference data required for the app to function (idempotent; safe on every push).
-- Demo users/orgs/profiles stay in supabase/seed.sql.
-- ----------------------------------------------------------------------------
insert into public.readiness_tiers (tier, label, min_credits, sort_order) values
  ('bronze',   'Tier 1 - Bronze',   0,   1),
  ('silver',   'Tier 2 - Silver',   100, 2),
  ('gold',     'Tier 3 - Gold',     300, 3),
  ('platinum', 'Tier 4 - Platinum', 600, 4)
on conflict (tier) do nothing;

insert into public.gamification_rules (action_type, label, credits, cooldown_kind, cooldown_limit, description) values
  ('report_verified',     'Verify & load full report',        100, 'once',     1, 'MBTI / ADAPT report verified and loaded into the system.'),
  ('synergy_brief',       'Generate Synergy Brief',           25,  'per_day',  2, 'Generate a CRM/TEM briefing for a flight or simulator session.'),
  ('weekly_insight_read', 'Read & confirm weekly insight',    10,  'per_week', 1, 'Open and acknowledge the weekly communication / preparation tip.'),
  ('reflection',          'Post-training / flight reflection', 20, 'per_day',  1, 'Answer the reflection questions after a session.'),
  ('consent_given',       'Approve a sharing request',        15,  'per_week', 3, 'Respond quickly to a crew member''s sharing request.'),
  ('streak_bonus',        'Streak bonus (3 weeks)',           30,  'per_week', 1, 'Consistent activity over 3 consecutive weeks.')
on conflict (action_type) do nothing;

insert into public.weekly_insights (week_index, title, body, focus) values
  (0, 'Name the threat out loud',        'During the briefing, state the single most likely threat for this leg in one sentence. Crews that verbalise the top threat catch 30% more errors before they matter.', 'briefing_prep'),
  (1, 'Two-breath reset',                'Before a high-workload phase, take two slow breaths and scan the panel left to right. It resets attention and lowers reactive decision-making.', 'stress_management'),
  (2, 'Debrief the decision, not the person', 'Ask "what information did we have at that moment?" before "what should we have done?". Just Culture starts with the mental model.', 'debrief_reflection'),
  (3, 'Assign the challenge word',       'Agree in the briefing on one neutral challenge phrase (e.g. "check that"). A pre-agreed phrase lowers the social cost of speaking up.', 'briefing_prep'),
  (4, 'Workload check-in',               'At top of descent, ask your partner a single closed question: "Anything I can take off you?" It normalises workload sharing.', 'stress_management'),
  (5, 'One lesson, one action',          'Close every debrief with one behavioural lesson and one concrete action for the next flight. More than that and nothing sticks.', 'debrief_reflection')
on conflict (week_index) do nothing;

insert into public.system_prompts (routine_type, version, is_active, notes, content) values
('briefing', 1, true, 'PRD 7.1 – crew briefing for simulator / flight',
$P$You are an expert advisor in human factors, crew teamwork and threat & error management (CRM & TEM) in high-risk flight environments.
Your task is to analyse the working interface between two crew members using their normalised psychometric profiles and produce a concise, operational briefing.

Mandatory principles:
1. Operational, practical language only. Translate psychometric measures into clear behavioural tendencies. Avoid theoretical psychological terminology completely.
2. Absolute anonymity (Blind Synergy): never present one person's raw profile data to the other. Only describe interface insights - how the two styles interact.
3. TEM focus: identify where a communication gap or mismatch may become a threat, and propose a concrete countermeasure for each.
4. Do not diagnose, label, or rank people. No stereotypes; describe tendencies as situational.
5. Keep every item short enough to be read aloud in a briefing. Prefer imperative sentences.

If only one profile is provided (solo routine), produce a self-briefing focused on that person's tendencies under workload and the countermeasures they should pre-plan.

Output structure (strict JSON as specified by the response schema):
1. Synergy Area - the central strength of this crew pairing.
2. Threat Points - friction points under workload, each with a countermeasure.
3. Briefing Do's & Don'ts - practical communication guidelines for the briefing and the flight.
4. Challenge & Response Trigger - one explicit, pre-agreed trigger phrase and the expected response.$P$),

('debrief', 1, true, 'PRD 7.2 – operational debriefing (Just Culture)',
$P$You are an expert in operational event debriefing and human-factors lessons learned, working in a Just Culture approach.
Your task is to help crew members examine an event that occurred, while identifying how personal characteristics influenced the picture of the situation and the decisions taken.

Mandatory principles:
1. Systemic learning without judgement or blame. Never assign fault to a person.
2. Identify cognitive biases (premature closure, information gathering under pressure, confirmation bias) in plain language and tie each to a moment in the event.
3. Identify coordination gaps (assertiveness gaps or a mental-model gap within the shared model) and how they could have been closed.
4. Keep the tone respectful, factual and forward-looking. Use the crew's own scenario description as the anchor; do not invent facts that were not described.

Output structure (strict JSON as specified by the response schema):
1. Mental Model Alignment - analysis of mental-model gaps during the event.
2. Stress Impact - how stress and workload influenced communication channels.
3. Actionable Behavioural Lesson - one focused behavioural lesson for next time, with a concrete cue for applying it.$P$),

('coaching', 1, true, 'PRD 7.3 – manager-employee feedback coaching',
$P$You are a senior advisor for leadership development and interpersonal communication in organisations.
Your task is to guide a manager on how to deliver effective feedback to an employee, based on the employee's feedback-reception style and the manager's own communication style.

Mandatory principles:
1. Reduce resistance by framing: adapt the framing of the feedback to what motivates the employee (facts and data, the bigger picture, relationships and values, or order and structure).
2. Balance directness and empathy with concrete phrasing examples - give an example of what to say and what not to say.
3. Give the manager tools to help the employee build their own improvement plan (questions, not prescriptions).
4. Never reveal or describe the employee's underlying psychometric profile. Express everything as practical guidance for the conversation.
5. Keep it usable in a 20-minute conversation.

Output structure (strict JSON as specified by the response schema):
1. Feedback reception profile of the employee and sensitivity points, expressed operationally.
2. Language adaptation - DOs and DON'Ts in phrasing, with example sentences.
3. Recommended questions to encourage self-reflection.$P$),

('normalize_report', 1, true, 'Report parser / persona normaliser',
$P$You convert the text of a psychometric report (MBTI Step I, MBTI Step II, Symbiotics ADAPT, or a comparable instrument) into a normalised behavioural persona for use in aviation crew resource management tools.

Rules:
1. Extract only what the report supports. If a dimension is not reported, return null for it rather than guessing.
2. Express every field as an observable behavioural tendency in plain operational language, not psychological jargon.
3. Dimension scores are 0-100 preferences: extraversion (0 = strongly introverted, 100 = strongly extraverted), sensing (0 = strongly intuitive, 100 = strongly sensing), thinking (0 = strongly feeling, 100 = strongly thinking), judging (0 = strongly perceiving, 100 = strongly judging).
4. Report a confidence of "low" when the text is short, ambiguous, or does not look like a psychometric report. Set is_valid_report to false when the text is clearly not a psychometric report.
5. candidate_identity: if the report names the person it is about, extract their name and email exactly as written; otherwise return null values. This is stored only behind an identity wall.
6. Never include the person's name anywhere except candidate_identity.$P$)
on conflict (routine_type, version) do nothing;

-- ----------------------------------------------------------------------------
-- Prompt management (atomic, audited) and org stats — service role only
-- ----------------------------------------------------------------------------
create or replace function public.admin_create_prompt_version(
  p_family text, p_content text, p_notes text, p_activate boolean, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_version int; v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('system_prompts:' || p_family));
  select coalesce(max(version), 0) + 1 into v_version from public.system_prompts where routine_type = p_family;
  if p_activate then
    update public.system_prompts set is_active = false where routine_type = p_family and is_active;
  end if;
  insert into public.system_prompts (routine_type, version, content, notes, is_active, created_by)
  values (p_family, v_version, p_content, nullif(p_notes, ''), p_activate, p_actor)
  returning id into v_id;
  insert into public.audit_log (actor_user_id, action, target_type, target_id, metadata)
  values (p_actor, 'prompt.created', 'system_prompt', p_family || ':v' || v_version, jsonb_build_object('activated', p_activate));
  return jsonb_build_object('id', v_id, 'version', v_version);
end $$;

create or replace function public.admin_activate_prompt(p_id uuid, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_family text; v_version int;
begin
  select routine_type, version into v_family, v_version from public.system_prompts where id = p_id;
  if v_family is null then raise exception 'PROMPT_NOT_FOUND'; end if;
  perform pg_advisory_xact_lock(hashtext('system_prompts:' || v_family));
  update public.system_prompts set is_active = false where routine_type = v_family and is_active and id <> p_id;
  update public.system_prompts set is_active = true where id = p_id;
  insert into public.audit_log (actor_user_id, action, target_type, target_id)
  values (p_actor, 'prompt.activated', 'system_prompt', v_family || ':v' || v_version);
  return jsonb_build_object('family', v_family, 'version', v_version);
end $$;

create or replace function public.admin_org_stats()
returns table (organization_id uuid, admins bigint, crew bigint, reports bigint)
language sql stable security definer set search_path = '' as $$
  select u.organization_id,
         count(*) filter (where u.role = 'org_admin'),
         count(*) filter (where u.role = 'end_user'),
         count(*) filter (where u.has_active_report)
  from public.users u
  where u.organization_id is not null
  group by u.organization_id
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.admin_create_prompt_version(text,text,text,boolean,uuid)',
    'public.admin_activate_prompt(uuid,uuid)',
    'public.admin_org_stats()'
  ] loop
    execute format('revoke execute on function %s from public', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- LOCKDOWN. Supabase's default privileges grant anon/authenticated/service_role on
-- every object the `postgres` role creates. Strip those first, then grant the
-- minimum explicitly below, and stop future objects from inheriting broad grants.
-- ---------------------------------------------------------------------------
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
revoke all on all functions in schema private from anon, authenticated, service_role;
revoke all on all functions in schema wall    from anon, authenticated, service_role;
alter default privileges for role postgres revoke all on tables    from anon, authenticated;
alter default privileges for role postgres revoke all on sequences from anon, authenticated;
alter default privileges for role postgres revoke all on functions from anon, authenticated;
alter default privileges for role postgres in schema public  revoke all on tables    from anon, authenticated;
alter default privileges for role postgres in schema public  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public  revoke all on functions from anon, authenticated;
alter default privileges for role postgres in schema private revoke all on functions from anon, authenticated, service_role;
alter default privileges for role postgres in schema wall    revoke all on functions from anon, authenticated, service_role;

-- Re-grant the few things the API roles legitimately need.
grant execute on function private.current_user_role()      to authenticated;
grant execute on function private.current_org_id()         to authenticated;
grant execute on function private.is_super_admin()         to authenticated;
grant execute on function private.is_org_admin_of(uuid)    to authenticated;
grant execute on function private.is_crew_member_of(uuid, uuid) to authenticated;
grant execute on function public.crew_directory()          to authenticated;
grant execute on function public.redeem_reward(uuid)       to authenticated;
grant execute on function public.expire_stale_consents()   to authenticated;
grant execute on function private.partner_allows(uuid, text) to authenticated;
grant execute on function public.org_engagement_stats()    to authenticated;

-- Explicit, minimal grants. `anon` gets nothing. `service_role` gets everything (server code).
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

grant select on public.organizations to authenticated;
grant select on public.users to authenticated;
grant update (full_name, gender, operational_category, team) on public.users to authenticated;
grant select, insert, update on public.user_preferences_and_consent to authenticated;
grant select, insert, update on public.consent_requests to authenticated;
grant select on public.routine_sessions to authenticated;
grant select, insert on public.reflections to authenticated;
grant select on public.weekly_insights to authenticated;
grant select, insert on public.insight_acknowledgements to authenticated;
grant select on public.gamification_rules to authenticated;
grant select on public.readiness_tiers to authenticated;
grant select on public.user_gamification_status to authenticated;
grant select on public.gamification_logs to authenticated;
grant select, insert, update on public.organization_rewards to authenticated;
grant select, update (status) on public.reward_redemptions to authenticated;
grant select on public.system_prompts to authenticated;
grant select on public.audit_log to authenticated;

-- organizations
create policy org_select on public.organizations for select to authenticated
  using (id = private.current_org_id() or private.is_super_admin());

-- users
create policy users_select on public.users for select to authenticated
  using (id = (select auth.uid())
         or private.is_super_admin()
         or (organization_id is not null and private.is_org_admin_of(organization_id)));
create policy users_update on public.users for update to authenticated
  using (id = (select auth.uid())
         or (organization_id is not null and private.is_org_admin_of(organization_id) and role = 'end_user'))
  with check (id = (select auth.uid())
         or (organization_id is not null and private.is_org_admin_of(organization_id) and role = 'end_user'));

-- preferences (owner only)
create policy prefs_select on public.user_preferences_and_consent for select to authenticated
  using (user_id = (select auth.uid()));
create policy prefs_insert on public.user_preferences_and_consent for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy prefs_update on public.user_preferences_and_consent for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- consent requests
create policy consent_select on public.consent_requests for select to authenticated
  using (requester_user_id = (select auth.uid()) or target_user_id = (select auth.uid()) or private.is_super_admin());
create policy consent_insert on public.consent_requests for insert to authenticated
  with check (
    requester_user_id = (select auth.uid())
    and status = 'pending'
    and organization_id = private.current_org_id()
    and private.is_crew_member_of(requester_user_id, private.current_org_id())
    and private.is_crew_member_of(target_user_id, private.current_org_id())
    and private.partner_allows(target_user_id, routine_type)
  );
create policy consent_update_target on public.consent_requests for update to authenticated
  using (target_user_id = (select auth.uid()) and status = 'pending')
  with check (target_user_id = (select auth.uid()) and status in ('approved', 'declined'));

-- routine sessions: only the primary user sees their own output
create policy sessions_select on public.routine_sessions for select to authenticated
  using (primary_user_id = (select auth.uid()));

-- reflections
create policy reflections_select on public.reflections for select to authenticated
  using (user_id = (select auth.uid()));
create policy reflections_insert on public.reflections for insert to authenticated
  with check (user_id = (select auth.uid()));

-- weekly insights (catalog) + acks
create policy insights_select on public.weekly_insights for select to authenticated using (true);
create policy acks_select on public.insight_acknowledgements for select to authenticated
  using (user_id = (select auth.uid()));
create policy acks_insert on public.insight_acknowledgements for insert to authenticated
  with check (user_id = (select auth.uid()));

-- gamification catalog + own status/logs
create policy rules_select on public.gamification_rules for select to authenticated using (true);
create policy tiers_select on public.readiness_tiers for select to authenticated using (true);
create policy status_select on public.user_gamification_status for select to authenticated
  using (user_id = (select auth.uid()) or private.is_super_admin());
create policy logs_select on public.gamification_logs for select to authenticated
  using (user_id = (select auth.uid()));

-- rewards
create policy rewards_select on public.organization_rewards for select to authenticated
  using (organization_id = private.current_org_id() and (is_active or private.is_org_admin_of(organization_id))
         or private.is_super_admin());
create policy rewards_insert on public.organization_rewards for insert to authenticated
  with check (private.is_org_admin_of(organization_id) and created_by = (select auth.uid()));
create policy rewards_update on public.organization_rewards for update to authenticated
  using (private.is_org_admin_of(organization_id))
  with check (private.is_org_admin_of(organization_id));

create policy redemptions_select on public.reward_redemptions for select to authenticated
  using (user_id = (select auth.uid()) or private.is_org_admin_of(organization_id) or private.is_super_admin());
create policy redemptions_update on public.reward_redemptions for update to authenticated
  using (private.is_org_admin_of(organization_id))
  with check (private.is_org_admin_of(organization_id));

-- system prompts & audit log: super admin read; writes go through service role
create policy prompts_select on public.system_prompts for select to authenticated
  using (private.is_super_admin());
create policy audit_select on public.audit_log for select to authenticated
  using (private.is_super_admin());
