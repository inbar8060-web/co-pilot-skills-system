-- ============================================================================
-- Local development seed. NEVER run against production.
-- Demo password for every seeded account: Copilot-Dev-2026!
-- Reference data (tiers, rules, prompts, insights) lives in the migration, not here.
-- ============================================================================
begin;

-- Organization -----------------------------------------------------------------
-- The demo organization pilots the crew canvas (organizations.canvas_enabled).
insert into public.organizations (id, name, slug, canvas_enabled) values
  ('11111111-1111-1111-1111-111111111111', 'Skyline Airways', 'skyline', true);

-- Seed users -------------------------------------------------------------------
-- Helper: create an auth user + identity with a bcrypt password (local dev only).
create or replace function pg_temp.seed_user(p_id uuid, p_email text, p_name text, p_role text, p_org uuid, p_password text)
returns void language plpgsql as $$
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change, email_change_token_new, is_sso_user)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email,
          extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
          jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'role', p_role, 'organization_id', p_org),
          jsonb_build_object('full_name', p_name), now(), now(), '', '', '', '', false);
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), p_id, p_id::text,
          jsonb_build_object('sub', p_id::text, 'email', p_email, 'email_verified', true),
          'email', now(), now(), now());
end $$;

select pg_temp.seed_user('aaaaaaaa-0000-0000-0000-000000000001', 'super@copilot.local',        'Sam Rivera (Super Admin)', 'super_admin', null, 'Copilot-Dev-2026!');
select pg_temp.seed_user('aaaaaaaa-0000-0000-0000-000000000002', 'admin@skyline.local',        'Maya Levi (Org Admin)',    'org_admin',   '11111111-1111-1111-1111-111111111111', 'Copilot-Dev-2026!');
select pg_temp.seed_user('aaaaaaaa-0000-0000-0000-000000000003', 'dana.captain@skyline.local', 'Dana Cohen',               'end_user',    '11111111-1111-1111-1111-111111111111', 'Copilot-Dev-2026!');
select pg_temp.seed_user('aaaaaaaa-0000-0000-0000-000000000004', 'yoav.fo@skyline.local',      'Yoav Peretz',              'end_user',    '11111111-1111-1111-1111-111111111111', 'Copilot-Dev-2026!');
select pg_temp.seed_user('aaaaaaaa-0000-0000-0000-000000000005', 'noa.pilot@skyline.local',    'Noa Ben-David',            'end_user',    '11111111-1111-1111-1111-111111111111', 'Copilot-Dev-2026!');

update public.users set gender = 'female', operational_category = 'captain',       team = 'Fleet 787' where id = 'aaaaaaaa-0000-0000-0000-000000000003';
update public.users set gender = 'male',   operational_category = 'first_officer', team = 'Fleet 787' where id = 'aaaaaaaa-0000-0000-0000-000000000004';
update public.users set gender = 'female', operational_category = 'civilian_pilot', team = 'Fleet A320' where id = 'aaaaaaaa-0000-0000-0000-000000000005';

-- Rewards ----------------------------------------------------------------------
insert into public.organization_rewards (organization_id, title, description, cost_in_credits, inventory_count, created_by) values
  ('11111111-1111-1111-1111-111111111111', 'Coffee voucher',            'A voucher for the crew lounge café.',          50,  -1, 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('11111111-1111-1111-1111-111111111111', 'Extra simulator slot',      'One additional self-selected simulator slot.', 200,  5, 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('11111111-1111-1111-1111-111111111111', 'Day off (bidding priority)', 'Priority in the next roster bid.',            600,  2, 'aaaaaaaa-0000-0000-0000-000000000002');

-- Anonymous profiles behind the wall -------------------------------------------
-- Dana (linked, manual), Yoav (linked, manual), and one unlinked profile whose candidate email
-- matches Noa so the Super Admin "Auto match" button has something to do.
select public.admin_wall_ingest_profile(
  '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000002', 'MBTI_Step_II',
  '{"source":"seed","text_length":0,"candidate_identity":{"email":null,"name":null}}'::jsonb,
  $J${
    "framework": "MBTI_Step_II",
    "type_code": "ISTJ",
    "summary": "Methodical, procedure-anchored operator who prefers verified facts, clear sequencing and low-noise communication.",
    "dimensions": {"extraversion": 28, "sensing": 74, "thinking": 71, "judging": 82},
    "communication_style": "Brief, factual and sequential. Prefers explicit call-outs over inference.",
    "decision_making_style": "Weighs verified data and SOP first; slows down when information is incomplete.",
    "stress_response": "Narrows attention and becomes terse. May under-communicate intent under workload.",
    "conflict_style": "Avoids open confrontation; will comply then raise concerns later unless invited.",
    "leadership_style": "Structured and consistent. Delegates by checklist.",
    "strengths": ["Disciplined SOP adherence", "Reliable monitoring", "Calm, low-drama cockpit"],
    "watch_outs": ["Terse under stress", "May dismiss intuitive cues", "Slow to voice ambiguity"],
    "feedback_preferences": ["Specific examples", "Private setting", "Time to reflect before responding"],
    "confidence": "high",
    "is_valid_report": true
  }$J$::jsonb,
  'aaaaaaaa-0000-0000-0000-000000000003', 'manual');

select public.admin_wall_ingest_profile(
  '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000002', 'MBTI_Step_I',
  '{"source":"seed","text_length":0,"candidate_identity":{"email":null,"name":null}}'::jsonb,
  $J${
    "framework": "MBTI_Step_I",
    "type_code": "ENFP",
    "summary": "Energetic, big-picture communicator who reads the room quickly and generates options under pressure.",
    "dimensions": {"extraversion": 78, "sensing": 31, "thinking": 38, "judging": 27},
    "communication_style": "Expressive and exploratory. Thinks out loud; may float ideas before they are decisions.",
    "decision_making_style": "Pattern-based and fast; comfortable acting on partial information.",
    "stress_response": "Talks more and faster; may skip verification steps to keep momentum.",
    "conflict_style": "Raises concerns openly and early; can read silence as agreement.",
    "leadership_style": "Motivational and inclusive. Less attentive to sequencing details.",
    "strengths": ["Early threat verbalisation", "Adaptive problem solving", "Keeps crew engaged"],
    "watch_outs": ["Verbal overload for partner", "Ideas mistaken for commands", "Checklist discipline under time pressure"],
    "feedback_preferences": ["Conversational", "Connect to the bigger picture", "Acknowledge effort first"],
    "confidence": "high",
    "is_valid_report": true
  }$J$::jsonb,
  'aaaaaaaa-0000-0000-0000-000000000004', 'manual');

select public.admin_wall_ingest_profile(
  '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000002', 'Symbiotics_ADAPT',
  '{"source":"seed","text_length":0,"candidate_identity":{"email":"noa.pilot@skyline.local","name":"Noa Ben-David"}}'::jsonb,
  $J${
    "framework": "Symbiotics_ADAPT",
    "type_code": null,
    "summary": "Steady, collaborative operator with strong situational awareness and a preference for consensus before action.",
    "dimensions": {"extraversion": 52, "sensing": 60, "thinking": 45, "judging": 58},
    "communication_style": "Measured and inclusive; checks understanding with questions.",
    "decision_making_style": "Seeks a shared picture first; decisive once agreement exists.",
    "stress_response": "Stays outwardly calm; may defer to seniority rather than challenge.",
    "conflict_style": "Diplomatic; softens challenges, which can reduce their urgency.",
    "leadership_style": "Facilitative.",
    "strengths": ["Situational awareness", "Crew cohesion", "Composure"],
    "watch_outs": ["Softened challenges", "Deference to authority gradient"],
    "feedback_preferences": ["Collaborative framing", "Clear expectations"],
    "confidence": "medium",
    "is_valid_report": true
  }$J$::jsonb,
  null, 'manual');

-- Give the linked users their one-time report credits.
select public.admin_award_credits('aaaaaaaa-0000-0000-0000-000000000003', 'report_verified', '{"source":"seed"}'::jsonb);
select public.admin_award_credits('aaaaaaaa-0000-0000-0000-000000000004', 'report_verified', '{"source":"seed"}'::jsonb);

commit;
