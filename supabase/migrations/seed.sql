-- =============================================================================
-- RELAY demo seed  (runs automatically on `supabase db reset`)
--
-- Demo logins (password for all: relay-demo-2026)
--   maya@relay.demo    departing dev   engineer   explicit grant on #exec-finance
--   arjun@relay.demo   incoming dev    engineer   NO grant            -> sees locked nodes
--   rachel@relay.demo  eng manager     manager    org role           -> sees everything
--
-- Story: Maya was added to #exec-finance by the VP Finance, so she can triage the
-- doubts that depend on it. Arjun inherits the project but never saw that channel.
-- =============================================================================

-- Fixed IDs so the ingest loader and tests can reference them.
-- users     a1111111-... maya | a2222222-... arjun | a3333333-... rachel
-- project   b0000000-0000-4000-8000-000000000001

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
) values
  ('00000000-0000-0000-0000-000000000000', 'a1111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated',
   'maya@relay.demo',   extensions.crypt('relay-demo-2026', extensions.gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Maya Okafor"}',      now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a2222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated',
   'arjun@relay.demo',  extensions.crypt('relay-demo-2026', extensions.gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Arjun Mehta"}',      now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a3333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated',
   'rachel@relay.demo', extensions.crypt('relay-demo-2026', extensions.gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Rachel Lindqvist"}', now(), now(), '', '', '', '');

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u
where u.email in ('maya@relay.demo', 'arjun@relay.demo', 'rachel@relay.demo');

-- profiles were created by the on_auth_user_created trigger; org_role is set HERE, server-side.
update public.profiles set slack_handle = 'maya.okafor',      github_login = 'maya-okafor',      jira_account_id = 'jira-maya'
  where id = 'a1111111-1111-4111-8111-111111111111';
update public.profiles set slack_handle = 'arjun.mehta',      github_login = 'arjun-mehta',      jira_account_id = 'jira-arjun'
  where id = 'a2222222-2222-4222-8222-222222222222';
update public.profiles set slack_handle = 'rachel.lindqvist', github_login = 'rachel-lindqvist', jira_account_id = 'jira-rachel',
                           org_role = 'manager'
  where id = 'a3333333-3333-4333-8333-333333333333';

-- Project ----------------------------------------------------------------------
insert into public.projects (id, name, slug, departing_user, incoming_user, status, handover_date)
values ('b0000000-0000-4000-8000-000000000001', 'Meridian Payments Platform', 'meridian-payments',
        'a1111111-1111-4111-8111-111111111111', 'a2222222-2222-4222-8222-222222222222',
        'ingesting', '2026-11-20');

insert into public.project_members (project_id, user_id, role) values
  ('b0000000-0000-4000-8000-000000000001', 'a1111111-1111-4111-8111-111111111111', 'departing'),
  ('b0000000-0000-4000-8000-000000000001', 'a2222222-2222-4222-8222-222222222222', 'incoming'),
  ('b0000000-0000-4000-8000-000000000001', 'a3333333-3333-4333-8333-333333333333', 'viewer');

-- People seen in sources (identity resolution across Slack / Jira / GitHub) -------
insert into public.people (id, project_id, profile_id, display_name, role_title, slack_handle, jira_account_id, github_login, status, left_at) values
  ('d0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'a1111111-1111-4111-8111-111111111111', 'Maya Okafor',      'Staff Backend Engineer, payments-service lead', 'maya.okafor',      'jira-maya',   'maya-okafor',      'departing', null),
  ('d0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'a2222222-2222-4222-8222-222222222222', 'Arjun Mehta',      'Senior Backend Engineer (incoming owner)',      'arjun.mehta',      'jira-arjun',  'arjun-mehta',      'active',    null),
  ('d0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001', null,                                    'Tomas Rivera',     'Backend Engineer',                              'tomas.rivera',     'jira-tomas',  'tomas-rivera',     'departed',  '2026-08-07'),
  ('d0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000001', null,                                    'Li Wei',           'Backend Engineer',                              'li.wei',           'jira-li',     'li-wei',           'active',    null),
  ('d0000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000001', null,                                    'Sasha Kim',        'Site Reliability Engineer',                     'sasha.kim',        'jira-sasha',  'sasha-kim',        'active',    null),
  ('d0000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000001', 'a3333333-3333-4333-8333-333333333333', 'Rachel Lindqvist', 'Engineering Manager',                            'rachel.lindqvist', 'jira-rachel', 'rachel-lindqvist', 'active',    null),
  ('d0000000-0000-4000-8000-000000000007', 'b0000000-0000-4000-8000-000000000001', null,                                    'Priya Raman',      'Product Manager',                               'priya.raman',      'jira-priya',  'priya-raman',      'active',    null),
  ('d0000000-0000-4000-8000-000000000008', 'b0000000-0000-4000-8000-000000000001', null,                                    'Noah Brandt',      'VP Finance',                                    'noah.brandt',      null,          null,               'active',    null);

-- Scopes: one per Slack channel / Jira project / repo ------------------------------
insert into public.scopes (id, project_id, kind, external_ref, access, required_role, reveal_label, description) values
  ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'slack',      '#payments-eng',             'team',       null,      true, 'Day-to-day engineering discussion'),
  ('c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'slack',      '#payments-incidents',       'team',       null,      true, 'Incidents, alerts and runbook chatter'),
  ('c0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001', 'slack',      '#exec-finance',             'restricted', 'manager', true, 'Budget and cost decisions. Managers or explicit grant only.'),
  ('c0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000001', 'jira',       'PAY',                       'team',       null,      true, 'Payments Platform Jira project'),
  ('c0000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000001', 'github_pr',  'meridian/payments-service', 'team',       null,      true, 'Repository (PRs, issues and commits share this scope)');

-- Maya was invited to #exec-finance (see the Apr 30 message). Arjun was not.
insert into public.scope_grants (scope_id, user_id, source) values
  ('c0000000-0000-4000-8000-000000000003', 'a1111111-1111-4111-8111-111111111111', 'seed');