-- =============================================================================
-- RELAY  |  Permission-aware RLS: executable demo + regression test
--
--   psql "$SUPABASE_DB_URL" -f supabase/tests/rls_permission_demo.sql
--
-- Requires seed.sql (users, project, scopes, grants). Runs inside one transaction
-- and ROLLS BACK, so it leaves no trace. Any failed assertion aborts with an error.
--
-- Cast:  Arjun  = incoming dev, engineer, NO grant on #exec-finance
--        Maya   = departing dev, engineer, explicit grant on #exec-finance
--        Rachel = engineering manager (org role), project viewer
-- =============================================================================
\set ON_ERROR_STOP on

begin;

-- -----------------------------------------------------------------------------
-- Fixtures (inserted as superuser, i.e. what the FastAPI service role would do)
--   decision D "Rate limiting backend"
--     core claim       CC  <- evidence E1 in #payments-eng      (visible to all)
--     rationale claim  CR  <- evidence E2 in #exec-finance      (restricted)
--   doubt DM  missing_info          (no claims)
--   doubt DX  contradiction  a=CC, b=CR  (touches a restricted claim)
-- -----------------------------------------------------------------------------
insert into public.source_items (id, project_id, scope_id, kind, external_id, author, authored_at, body, content_hash) values
  ('f1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
   'slack', 'C01PAYENG:fixture.1', 'maya.okafor', '2026-04-14T09:30:00Z',
   'Decision: we are moving API rate limiting to Redis with a sliding-window counter.', md5('s1')),
  ('f1000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000003',
   'slack', 'C02EXECFIN:fixture.2', 'noah.brandt', '2026-04-30T16:45:00Z',
   'Managed Redis request declined for FY26. Infra spend is frozen except for compliance items.', md5('s2'));

insert into public.evidence (id, source_item_id, quote, char_start, char_end)
select e.id, s.id, e.quote, position(e.quote in s.body) - 1, position(e.quote in s.body) - 1 + length(e.quote)
from (values
  ('f2000000-0000-4000-8000-000000000001'::uuid, 'f1000000-0000-4000-8000-000000000001'::uuid, 'moving API rate limiting to Redis'),
  ('f2000000-0000-4000-8000-000000000002'::uuid, 'f1000000-0000-4000-8000-000000000002'::uuid, 'declined for FY26')
) as e(id, sid, quote)
join public.source_items s on s.id = e.sid;

insert into public.claims (id, project_id, kind, statement, subject, asserted_at) values
  ('f3000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'decision',
   'Rate limiting moves to Redis', 'rate-limiting', '2026-04-14T09:30:00Z'),
  ('f3000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'rationale',
   'Managed Redis request declined for FY26 (budget freeze)', 'rate-limiting', '2026-04-30T16:45:00Z');
insert into public.claim_evidence (claim_id, evidence_id) values
  ('f3000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001'),
  ('f3000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000002');

insert into public.decisions (id, project_id, title, summary, confidence) values
  ('f4000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
   'Rate limiting backend', 'Rate limiting store for the gateway.', 0.42);
insert into public.decision_claims (decision_id, claim_id, role) values
  ('f4000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000001', 'core'),
  ('f4000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000002', 'rationale');

insert into public.doubts (id, project_id, kind, title, explanation, severity, decision_id) values
  ('f5000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'missing_info',
   'No owner for rate limit tuning', 'Nobody is named as owner.', 2, 'f4000000-0000-4000-8000-000000000001'),
  ('f5000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'contradiction',
   'Redis decision vs budget freeze', 'Decision claims Redis; rationale says the request was declined.', 4,
   'f4000000-0000-4000-8000-000000000001');
insert into public.doubt_claims (doubt_id, claim_id, side) values
  ('f5000000-0000-4000-8000-000000000002', 'f3000000-0000-4000-8000-000000000001', 'a'),
  ('f5000000-0000-4000-8000-000000000002', 'f3000000-0000-4000-8000-000000000002', 'b');

do $$ begin
  assert (select status from public.decisions where id = 'f4000000-0000-4000-8000-000000000001') = 'disputed',
    'open contradiction should mark the decision disputed';
  raise notice 'PASS  fixtures loaded; decision is "disputed" while its contradiction is open';
end $$;


-- -----------------------------------------------------------------------------
-- 1. ARJUN (incoming, engineer, no grant): restricted content is invisible
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', 'a2222222-2222-4222-8222-222222222222'::text, 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare g jsonb; ev_locked jsonb; cl_locked jsonb;
begin
  assert (select count(*) from public.source_items) = 1, 'Arjun should see exactly 1 source item';
  assert (select count(*) from public.source_items where scope_id = 'c0000000-0000-4000-8000-000000000003') = 0,
    'Arjun must see 0 rows from #exec-finance';
  assert (select count(*) from public.evidence) = 1, 'Arjun should see 1 evidence row';
  raise notice 'PASS  Arjun: raw items 1/2, evidence 1/2 (#exec-finance hidden)';

  assert exists (select 1 from public.claims where id = 'f3000000-0000-4000-8000-000000000001'), 'core claim visible';
  assert not exists (select 1 from public.claims where id = 'f3000000-0000-4000-8000-000000000002'), 'rationale claim hidden (fail-closed)';
  assert exists (select 1 from public.decisions where id = 'f4000000-0000-4000-8000-000000000001'),
    'decision stays visible: only its rationale is locked';
  assert exists (select 1 from public.doubts where id = 'f5000000-0000-4000-8000-000000000001'), 'unrelated doubt visible';
  assert not exists (select 1 from public.doubts where id = 'f5000000-0000-4000-8000-000000000002'),
    'doubt touching a restricted claim is hidden';
  raise notice 'PASS  Arjun: decision visible, rationale claim + its contradiction doubt hidden (fail-closed)';

  g := public.get_visible_graph('b0000000-0000-4000-8000-000000000001');
  assert jsonb_array_length(g -> 'evidence') = 2, 'graph still returns BOTH evidence nodes';
  select e into ev_locked from jsonb_array_elements(g -> 'evidence') e where (e ->> 'locked')::boolean;
  assert ev_locked is not null, 'one evidence node is locked';
  assert ev_locked ->> 'scope_label' = '#exec-finance', 'locked node discloses WHERE it lives';
  assert not (ev_locked ? 'quote') and not (ev_locked ? 'author') and not (ev_locked ? 'url'),
    'locked node leaks no quote / author / url';
  select c into cl_locked from jsonb_array_elements(g -> 'claims') c where (c ->> 'locked')::boolean;
  assert cl_locked is not null and not (cl_locked ? 'statement'), 'locked claim has no statement';
  assert cl_locked -> 'restricted_labels' = '["#exec-finance"]'::jsonb, 'locked claim names the blocking scope';
  assert g::text not like '%declined for FY26%' and g::text not like '%budget freeze%',
    'restricted text appears nowhere in the payload';
  raise notice 'PASS  Arjun: get_visible_graph returns a LOCKED #exec-finance node with zero leaked text';
end $$;

-- Arjun cannot escalate, grant himself access, or triage.
do $$
begin
  begin
    update public.profiles set org_role = 'manager' where id = 'a2222222-2222-4222-8222-222222222222';
    raise exception 'self-promotion should have failed';
  exception when insufficient_privilege then null; end;

  begin
    insert into public.scope_grants (scope_id, user_id) values ('c0000000-0000-4000-8000-000000000003', 'a2222222-2222-4222-8222-222222222222');
    raise exception 'self-grant should have failed';
  exception when insufficient_privilege then null; end;

  begin
    insert into public.resolutions (doubt_id, kind, resolved_by)
    values ('f5000000-0000-4000-8000-000000000001', 'mark_unknown', 'a2222222-2222-4222-8222-222222222222');
    raise exception 'incoming dev triage should have failed';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS  Arjun: cannot self-promote, self-grant, or triage';
end $$;

-- ...but he CAN ask for access.
insert into public.access_requests (scope_id, requester_id, reason)
values ('c0000000-0000-4000-8000-000000000003', 'a2222222-2222-4222-8222-222222222222',
        'Need the budget context behind the Redis / rate limiting decision.');
reset role;


-- -----------------------------------------------------------------------------
-- 2. MAYA (departing, explicit grant): sees everything, can triage
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', 'a1111111-1111-4111-8111-111111111111'::text, 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare v_xp int;
begin
  assert (select count(*) from public.source_items) = 2, 'Maya sees both items via her explicit grant';
  assert (select count(*) from public.claims) = 2 and (select count(*) from public.doubts) = 2, 'Maya sees all claims + doubts';
  assert not exists (select 1 from jsonb_array_elements(public.get_visible_graph('b0000000-0000-4000-8000-000000000001') -> 'evidence') e
                     where (e ->> 'locked')::boolean), 'no locked evidence for Maya';
  raise notice 'PASS  Maya: explicit grant unlocks #exec-finance (2/2 items, 0 locked nodes)';

  -- Triage: fast pick_a on severity 4 => 4 * 10 * 1.2 speed bonus = 48 XP
  insert into public.resolutions (doubt_id, kind, resolved_by, time_spent_ms)
  values ('f5000000-0000-4000-8000-000000000002', 'pick_a', 'a1111111-1111-4111-8111-111111111111', 4000)
  returning xp_awarded into v_xp;
  assert v_xp = 48, format('expected 48 XP, got %s', v_xp);
  assert (select status from public.doubts where id = 'f5000000-0000-4000-8000-000000000002') = 'resolved', 'doubt resolved';
  assert (select status from public.claims where id = 'f3000000-0000-4000-8000-000000000002') = 'rejected', 'losing claim rejected';
  assert (select status from public.decisions where id = 'f4000000-0000-4000-8000-000000000001') = 'active',
    'decision returns to active once its contradiction is resolved';
  raise notice 'PASS  Maya: triage awards % XP, rejects the losing claim, un-disputes the decision', v_xp;
end $$;
reset role;

do $$ begin
  -- readiness = resolved severity / total severity = 4 / (4 + 2) = 66.7
  assert (select readiness_score from public.projects where id = 'b0000000-0000-4000-8000-000000000001') = 66.7,
    'readiness should be 66.7';
  raise notice 'PASS  readiness ring = 66.7 (severity-weighted)';
end $$;


-- -----------------------------------------------------------------------------
-- 3. RACHEL (manager by ORG ROLE, no grant, project "viewer"): sees it; approves Arjun
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', 'a3333333-3333-4333-8333-333333333333'::text, 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
begin
  assert (select count(*) from public.source_items) = 2, 'manager role alone unlocks #exec-finance';
  assert not exists (select 1 from public.scope_grants where user_id = 'a3333333-3333-4333-8333-333333333333'), 'Rachel has no explicit grant';
  raise notice 'PASS  Rachel: manager org role unlocks #exec-finance without any grant';

  update public.access_requests set status = 'approved', decision_note = 'Approved for handover context'
  where requester_id = 'a2222222-2222-4222-8222-222222222222' and status = 'pending';
  assert exists (select 1 from public.scope_grants
                 where user_id = 'a2222222-2222-4222-8222-222222222222' and scope_id = 'c0000000-0000-4000-8000-000000000003' and source = 'request'),
    'approval must mint a scope grant';
  raise notice 'PASS  Rachel: approving the request minted a scope grant atomically';
end $$;
reset role;


-- -----------------------------------------------------------------------------
-- 4. ARJUN again: the lock opens, no redeploy, no re-ingest
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', 'a2222222-2222-4222-8222-222222222222'::text, 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare g jsonb;
begin
  assert (select count(*) from public.source_items) = 2, 'Arjun now sees #exec-finance';
  g := public.get_visible_graph('b0000000-0000-4000-8000-000000000001');
  assert not exists (select 1 from jsonb_array_elements(g -> 'evidence') e where (e ->> 'locked')::boolean), 'no locked evidence left';
  assert g::text like '%declined for FY26%', 'quote now present in payload';
  raise notice 'PASS  Arjun (after approval): previously locked node now returns its verbatim quote';
end $$;
reset role;


-- -----------------------------------------------------------------------------
-- 5. ANON gets nothing at all
-- -----------------------------------------------------------------------------
set local role anon;
do $$
begin
  begin
    perform count(*) from public.source_items;
    raise exception 'anon should not be able to read source_items';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS  anon: no access to any relay table';
end $$;
reset role;


-- -----------------------------------------------------------------------------
-- 6. Integrity guards: immutable raw layer, DB-verified evidence
-- -----------------------------------------------------------------------------
do $$
begin
  begin
    update public.source_items set body = 'edited' where id = 'f1000000-0000-4000-8000-000000000001';
    raise exception 'body edit should have failed';
  exception when restrict_violation then null; end;

  begin
    insert into public.evidence (source_item_id, quote, char_start, char_end)
    values ('f1000000-0000-4000-8000-000000000001', 'Kafka with exactly-once semantics', 0, 33);
    raise exception 'hallucinated evidence should have failed';
  exception when check_violation then null; end;
  raise notice 'PASS  raw layer is immutable; the DB rejects a quote that is not in the source';
end $$;

rollback;
\echo ''
\echo 'All RLS assertions passed. Transaction rolled back.'