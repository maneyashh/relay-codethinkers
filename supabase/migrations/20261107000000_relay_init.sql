-- =============================================================================
-- RELAY  |  Evidence-First Handover Engine
-- Migration 0001: schema, integrity guards, permission-aware RLS, graph RPC
--
-- Layers (bottom to top)
--   RAW        source_items          immutable, scoped (Slack / Jira / GitHub)
--   EVIDENCE   evidence              verbatim spans; the DB re-verifies every quote
--   KNOWLEDGE  claims, decisions     atomic assertions assembled into decisions
--   DOUBT      doubts, resolutions   contradictions + gaps -> triage -> audit trail
--   ACCESS     scopes, grants        who may read which source (fail-closed)
--
-- Permission-aware contract
--   1. Every raw item belongs to a scope (a Slack channel, a Jira project, a repo).
--   2. A scope is 'public' | 'team' | 'restricted'.
--        public     any project member
--        team       departing / incoming members, or org role >= manager
--        restricted explicit scope_grant, OR org role >= scopes.required_role
--                   (#exec-finance => required_role = 'manager')
--   3. Derived rows FAIL CLOSED. A claim is readable only if the caller can read
--      EVERY source it cites. A decision needs all of its 'core' claims readable.
--      A doubt needs every claim on its sides readable. Even if the pipeline
--      mislabels a claim, restricted text cannot leak through a derived row.
--   4. get_visible_graph() never drops hidden nodes. It returns them LOCKED:
--      existence, kind and scope label survive; text, quotes and authors do not.
--   5. FastAPI uses the service role (bypasses RLS) and is the only writer of the
--      raw / evidence / knowledge layers. Browsers get SELECT plus narrow writes.
--
-- Pipeline contract (enforced by convention, backstopped by rule 3)
--   * Claims are atomic. If a claim would cite sources from different access
--     levels, the extractor emits SEPARATE claims per access level.
--   * decisions.title / summary are generated from 'core' claims only.
--   * Character offsets are Unicode code points (Python / Postgres agree; JS
--     UTF-16 offsets differ for astral characters such as emoji, so the web app
--     must convert with Array.from()).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. ENUMS
-- -----------------------------------------------------------------------------
create type public.source_kind     as enum ('slack','jira','github_pr','github_issue','github_commit','doc','handover_note');
create type public.claim_kind      as enum ('decision','rationale','constraint','owner','status','risk','todo','tribal_knowledge');
create type public.doubt_kind      as enum ('contradiction','missing_info','stale','single_source','ownership_gap','unanswered_question');
create type public.doubt_status    as enum ('open','resolved','deferred','dismissed');
create type public.resolution_kind as enum ('pick_a','pick_b','both_wrong','merge','provide_missing','mark_unknown','delegate');
create type public.edge_kind       as enum ('supports','contradicts','supersedes','derived_from','mentions','blocks');
create type public.access_level    as enum ('public','team','restricted');
create type public.org_role        as enum ('engineer','manager','admin');
create type public.person_status   as enum ('active','departing','departed');


-- -----------------------------------------------------------------------------
-- 2. TABLES
-- -----------------------------------------------------------------------------

-- 2.1 Identity & workspace ----------------------------------------------------
create table public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  display_name   text not null,
  email          text,
  org_role       public.org_role not null default 'engineer',  -- NEVER derived from user metadata
  slack_handle   text,
  github_login   text,
  jira_account_id text,
  avatar_url     text,
  created_at     timestamptz not null default now()
);

create table public.projects (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  slug            text not null unique,
  departing_user  uuid references auth.users(id) on delete set null,
  incoming_user   uuid references auth.users(id) on delete set null,
  status          text not null default 'ingesting' check (status in ('ingesting','triage','published')),
  readiness_score numeric(5,1) not null default 0 check (readiness_score between 0 and 100),
  handover_date   date,
  created_at      timestamptz not null default now()
);

create table public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('departing','incoming','viewer')),
  primary key (project_id, user_id)
);

-- Humans who appear in sources. Resolves identities across tools (Slack handle,
-- Jira account, GitHub login) and tracks who has left (drives ownership_gap).
create table public.people (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  profile_id      uuid references public.profiles(id) on delete set null,
  display_name    text not null,
  role_title      text,
  email           text,
  slack_handle    text,
  jira_account_id text,
  github_login    text,
  status          public.person_status not null default 'active',
  left_at         date,
  created_at      timestamptz not null default now(),
  unique (project_id, slack_handle),
  unique (project_id, jira_account_id),
  unique (project_id, github_login)
);

-- 2.2 Access control ----------------------------------------------------------
create table public.scopes (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  kind          public.source_kind not null,
  external_ref  text not null,                       -- '#exec-finance', 'PAY', 'meridian/payments-service'
  access        public.access_level not null default 'team',
  required_role public.org_role,                     -- restricted scopes: minimum org role that bypasses grants
  reveal_label  boolean not null default true,       -- false => locked nodes say "Restricted source"
  description   text,
  unique (project_id, kind, external_ref)
);

create table public.scope_grants (
  scope_id   uuid not null references public.scopes(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null,
  source     text not null default 'manual' check (source in ('seed','manual','request')),
  granted_at timestamptz not null default now(),
  primary key (scope_id, user_id)
);

create table public.access_requests (
  id            uuid primary key default gen_random_uuid(),
  scope_id      uuid not null references public.scopes(id) on delete cascade,
  requester_id  uuid not null references auth.users(id) on delete cascade,
  reason        text,
  status        text not null default 'pending' check (status in ('pending','approved','denied')),
  decided_by    uuid references auth.users(id) on delete set null,
  decided_at    timestamptz,
  decision_note text,
  created_at    timestamptz not null default now()
);
create unique index access_requests_one_pending
  on public.access_requests (scope_id, requester_id) where status = 'pending';

-- 2.3 Pipeline bookkeeping ----------------------------------------------------
create table public.pipeline_runs (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  status      text not null default 'queued' check (status in ('queued','running','succeeded','failed')),
  stage       text,                                  -- normalize|extract|verify|link|doubts|score
  progress    int not null default 0 check (progress between 0 and 100),
  stats       jsonb not null default '{}',
  log         jsonb not null default '[]',
  error       text,
  started_at  timestamptz,
  finished_at timestamptz,
  created_at  timestamptz not null default now()
);

-- 2.4 RAW layer (immutable) ---------------------------------------------------
create table public.source_items (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects(id) on delete cascade,
  scope_id         uuid not null references public.scopes(id) on delete restrict,
  kind             public.source_kind not null,
  external_id      text not null,                    -- 'C01PAYENG:1744622400.000100' | 'PAY-142' | 'PAY-142#c10003' | 'PR#318'
  thread_ref       text,                             -- groups a Slack thread / Jira issue / PR conversation
  author           text,
  author_person_id uuid references public.people(id) on delete set null,
  authored_at      timestamptz,
  title            text,
  body             text not null check (length(body) > 0),   -- exactly what the LLM sees; evidence offsets index into this
  url              text,
  metadata         jsonb not null default '{}',
  content_hash     text not null,
  ingested_at      timestamptz not null default now(),
  unique (project_id, kind, external_id)
);

-- 2.5 EVIDENCE layer ----------------------------------------------------------
create table public.evidence (
  id             uuid primary key default gen_random_uuid(),
  source_item_id uuid not null references public.source_items(id) on delete cascade,
  quote          text not null check (length(quote) > 0),
  char_start     int  not null check (char_start >= 0),
  char_end       int  not null,
  match_method   text not null default 'exact' check (match_method in ('exact','whitespace_normalized')),
  verified_at    timestamptz not null default now(),
  constraint evidence_span_valid check (char_end > char_start),
  unique (source_item_id, char_start, char_end)
);

-- 2.6 KNOWLEDGE layer ---------------------------------------------------------
create table public.claims (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects(id) on delete cascade,
  kind              public.claim_kind not null,
  statement         text not null,                   -- one atomic assertion
  subject           text,                            -- entity key: 'rate-limiting', 'webhook-retries'
  asserted_at       timestamptz,                     -- when the source said it (drives staleness)
  person_id         uuid references public.people(id) on delete set null,   -- owner claims point at a person
  status            text not null default 'active' check (status in ('active','superseded','rejected','disputed')),
  superseded_by     uuid references public.claims(id) on delete set null,
  extraction_run_id uuid references public.pipeline_runs(id) on delete set null,
  created_at        timestamptz not null default now()
);

create table public.claim_evidence (
  claim_id    uuid not null references public.claims(id) on delete cascade,
  evidence_id uuid not null references public.evidence(id) on delete cascade,
  stance      public.edge_kind not null default 'supports'
              check (stance in ('supports','contradicts','mentions')),
  primary key (claim_id, evidence_id)
);

create table public.decisions (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references public.projects(id) on delete cascade,
  title              text not null,
  summary            text,
  status             text not null default 'active' check (status in ('active','reversed','disputed')),
  confidence         numeric(4,3) check (confidence between 0 and 1),
  confidence_factors jsonb not null default '{}',    -- {source_diversity, evidence_count, recency, open_contradictions}
  needs_rescore      boolean not null default false, -- set by triage; FastAPI recomputes confidence
  decided_at         timestamptz,
  decided_by         text,
  created_at         timestamptz not null default now()
);

create table public.decision_claims (
  decision_id uuid not null references public.decisions(id) on delete cascade,
  claim_id    uuid not null references public.claims(id) on delete cascade,
  role        text not null default 'core' check (role in ('core','rationale','alternative_rejected','context')),
  primary key (decision_id, claim_id)
);

-- Edges that are NOT derivable from the join tables above (contradicts / supersedes /
-- blocks / person links). Structural edges (evidence->claim, claim->decision) are
-- synthesized by get_visible_graph() so they can never drift out of sync.
create table public.graph_edges (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  src_type   text not null check (src_type in ('decision','claim','evidence','person')),
  src_id     uuid not null,
  dst_type   text not null check (dst_type in ('decision','claim','evidence','person')),
  dst_id     uuid not null,
  kind       public.edge_kind not null,
  weight     numeric not null default 1,
  created_by text not null default 'engine',
  unique (project_id, src_type, src_id, dst_type, dst_id, kind)
);

-- 2.7 DOUBT ENGINE + TRIAGE ---------------------------------------------------
create table public.doubts (
  id                   uuid primary key default gen_random_uuid(),
  project_id           uuid not null references public.projects(id) on delete cascade,
  kind                 public.doubt_kind not null,
  title                text not null,
  explanation          text not null,
  severity             int  not null check (severity between 1 and 5),   -- drives XP + sort order
  decision_id          uuid references public.decisions(id) on delete cascade,
  status               public.doubt_status not null default 'open',
  suggested_resolution text check (suggested_resolution in ('pick_a','pick_b','needs_human')),
  engine_reasoning     text,
  prompt_for_dev       text,                         -- missing_info: the one-line question for the departing dev
  what_is_missing      text,
  fingerprint          text,                         -- hash(kind + sorted claim ids): re-runs don't duplicate doubts
  detected_by          text not null default 'engine',
  metadata             jsonb not null default '{}',
  created_at           timestamptz not null default now(),
  resolved_at          timestamptz,
  unique (project_id, fingerprint)
);

create table public.doubt_claims (
  doubt_id uuid not null references public.doubts(id) on delete cascade,
  claim_id uuid not null references public.claims(id) on delete cascade,
  side     text not null check (side in ('a','b','context')),
  primary key (doubt_id, claim_id)
);

create table public.resolutions (
  id                    uuid primary key default gen_random_uuid(),
  doubt_id              uuid not null references public.doubts(id) on delete cascade,
  kind                  public.resolution_kind not null,
  chosen_claim_id       uuid references public.claims(id) on delete set null,
  note                  text,
  new_evidence_id       uuid references public.evidence(id) on delete set null,  -- dev-provided info becomes evidence too
  delegate_to_person_id uuid references public.people(id) on delete set null,
  resolved_by           uuid references auth.users(id) on delete set null,
  time_spent_ms         int check (time_spent_ms >= 0),
  xp_awarded            int not null default 0,
  created_at            timestamptz not null default now(),
  constraint provide_missing_needs_note
    check (kind <> 'provide_missing' or nullif(btrim(note), '') is not null)
);

-- 2.8 PUBLISHED HANDOVER ------------------------------------------------------
-- IDs only. Content is always hydrated through RLS / get_visible_graph(), so a
-- published snapshot can never smuggle restricted text to an unauthorized reader.
create table public.handover_snapshots (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  version      int not null,
  manifest     jsonb not null,                       -- {decision_ids, claim_ids, evidence_ids, edge_ids}
  stats        jsonb not null default '{}',
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz not null default now(),
  unique (project_id, version)
);


-- -----------------------------------------------------------------------------
-- 3. INDEXES
-- -----------------------------------------------------------------------------
create index on public.project_members (user_id);
create index on public.people          (project_id, status);
create index on public.scopes          (project_id);
create index on public.scope_grants    (user_id);
create index on public.access_requests (requester_id);
create index on public.source_items    (project_id, authored_at);
create index on public.source_items    (scope_id);
create index on public.source_items    (project_id, thread_ref);
create index on public.source_items    using gin (to_tsvector('english', coalesce(title, '') || ' ' || body));
create index on public.evidence        (source_item_id);
create index on public.claims          (project_id, subject);
create index on public.claims          (project_id, status);
create index on public.claim_evidence  (evidence_id);
create index on public.decision_claims (claim_id);
create index on public.graph_edges     (project_id, src_type, src_id);
create index on public.graph_edges     (project_id, dst_type, dst_id);
create index on public.doubts          (project_id, status, severity desc);
create index on public.doubts          (decision_id);
create index on public.doubt_claims    (claim_id);
create index on public.resolutions     (doubt_id);


-- -----------------------------------------------------------------------------
-- 4. HELPER FUNCTIONS (SECURITY DEFINER so policies can consult membership /
--    grants without recursive RLS evaluation). Order matters: SQL-language
--    functions are validated against already-existing objects.
-- -----------------------------------------------------------------------------
create function public.role_rank(r public.org_role)
returns int language sql immutable as $$
  select case r when 'engineer' then 1 when 'manager' then 2 when 'admin' then 3 end
$$;

create function public.current_org_role()
returns public.org_role language sql stable security definer set search_path = public, pg_temp as $$
  select org_role from public.profiles where id = auth.uid()
$$;

create function public.has_min_org_role(p_min public.org_role)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(public.role_rank(public.current_org_role()) >= public.role_rank(p_min), false)
$$;

create function public.is_project_member(p_project_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.project_members
                 where project_id = p_project_id and user_id = auth.uid())
$$;

create function public.project_role(p_project_id uuid)
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select role from public.project_members
  where project_id = p_project_id and user_id = auth.uid()
$$;

create function public.shares_project_with(p_user_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.project_members a
    join public.project_members b on b.project_id = a.project_id
    where a.user_id = auth.uid() and b.user_id = p_user_id)
$$;

create function public.scope_project(p_scope_id uuid)
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select project_id from public.scopes where id = p_scope_id
$$;

create function public.doubt_project(p_doubt_id uuid)
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select project_id from public.doubts where id = p_doubt_id
$$;

-- THE permission check. Everything else is derived from this.
create function public.can_read_scope(p_scope_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((
    select case s.access
             when 'public'     then true
             when 'team'       then pm.role in ('departing','incoming') or public.has_min_org_role('manager')
             when 'restricted' then
               exists (select 1 from public.scope_grants g
                       where g.scope_id = s.id and g.user_id = auth.uid())
               or (s.required_role is not null and public.has_min_org_role(s.required_role))
           end
    from public.scopes s
    join public.project_members pm
      on pm.project_id = s.project_id and pm.user_id = auth.uid()
    where s.id = p_scope_id
  ), false)
$$;

create function public.can_read_source_item(p_source_item_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select public.can_read_scope(si.scope_id)
                   from public.source_items si where si.id = p_source_item_id), false)
$$;

-- Fail-closed: a claim is readable only if EVERY cited source is readable.
create function public.can_read_claim(p_claim_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.claims c
                 where c.id = p_claim_id and public.is_project_member(c.project_id))
     and not exists (
       select 1
       from public.claim_evidence ce
       join public.evidence e      on e.id = ce.evidence_id
       join public.source_items si on si.id = e.source_item_id
       where ce.claim_id = p_claim_id
         and not public.can_read_scope(si.scope_id))
$$;

-- A decision is visible iff all of its 'core' claims are. Rationale claims gate themselves,
-- which is what lets the incoming dev see a decision whose WHY is locked.
create function public.can_read_decision(p_decision_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.decisions d
                 where d.id = p_decision_id and public.is_project_member(d.project_id))
     and not exists (
       select 1 from public.decision_claims dc
       where dc.decision_id = p_decision_id and dc.role = 'core'
         and not public.can_read_claim(dc.claim_id))
$$;

create function public.can_read_doubt(p_doubt_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.doubts d
                 where d.id = p_doubt_id
                   and public.is_project_member(d.project_id)
                   and (d.decision_id is null or public.can_read_decision(d.decision_id)))
     and not exists (
       select 1 from public.doubt_claims dc
       where dc.doubt_id = p_doubt_id and not public.can_read_claim(dc.claim_id))
$$;

create function public.is_scope_admin(p_scope_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.has_min_org_role('manager')
     and public.is_project_member(public.scope_project(p_scope_id))
$$;

create function public.can_triage(p_project_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_project_member(p_project_id)
     and (public.project_role(p_project_id) = 'departing' or public.has_min_org_role('manager'))
$$;

-- Which restricted scopes block this claim for the caller? (labels only; no content)
create function public.claim_restricted_labels(p_claim_id uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(t.label order by t.label), '[]'::jsonb)
  from (
    select distinct case when s.reveal_label then s.external_ref else 'Restricted source' end as label
    from public.claim_evidence ce
    join public.evidence e      on e.id = ce.evidence_id
    join public.source_items si on si.id = e.source_item_id
    join public.scopes s        on s.id = si.scope_id
    where ce.claim_id = p_claim_id and not public.can_read_scope(s.id)
  ) t
$$;


-- -----------------------------------------------------------------------------
-- 5. TRIGGERS & BUSINESS RULES
-- -----------------------------------------------------------------------------

-- 5.1 New auth user -> profile. org_role is deliberately NOT read from metadata
--     (raw_user_meta_data is user-controlled); promote managers server-side.
create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles (id, display_name, email)
  values (new.id,
          coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
          new.email)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 5.2 RAW layer is immutable: evidence offsets index into body, so body cannot change.
--     (scope_id may change: re-scoping a source is how permission changes propagate.)
create function public.guard_source_items()
returns trigger language plpgsql as $$
begin
  if new.body         is distinct from old.body
  or new.content_hash is distinct from old.content_hash
  or new.external_id  is distinct from old.external_id
  or new.kind         is distinct from old.kind
  or new.project_id   is distinct from old.project_id then
    raise exception 'source_items are immutable (evidence offsets depend on body); insert a new item instead'
      using errcode = 'restrict_violation';
  end if;
  return new;
end $$;

create trigger source_items_immutable
  before update on public.source_items
  for each row execute function public.guard_source_items();

-- 5.3 The database refuses hallucinated evidence: quote must equal body[char_start:char_end].
create function public.verify_evidence_span()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_body text;
begin
  if tg_op = 'UPDATE' then
    if new.source_item_id <> old.source_item_id or new.quote <> old.quote
       or new.char_start <> old.char_start or new.char_end <> old.char_end then
      raise exception 'evidence spans are immutable' using errcode = 'restrict_violation';
    end if;
    return new;
  end if;

  select body into v_body from public.source_items where id = new.source_item_id;
  if v_body is null then
    raise exception 'unknown source item %', new.source_item_id using errcode = 'foreign_key_violation';
  end if;
  if substr(v_body, new.char_start + 1, new.char_end - new.char_start) is distinct from new.quote then
    raise exception 'evidence quote does not match source body at [%, %) of item %',
      new.char_start, new.char_end, new.source_item_id using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger evidence_span_guard
  before insert or update on public.evidence
  for each row execute function public.verify_evidence_span();

-- 5.4 Readiness = severity-weighted share of non-dismissed doubts that are resolved.
create function public.recompute_readiness(p_project_id uuid)
returns numeric language plpgsql security definer set search_path = public, pg_temp as $$
declare v_total numeric; v_done numeric; v_score numeric;
begin
  select coalesce(sum(severity) filter (where status <> 'dismissed'), 0),
         coalesce(sum(severity) filter (where status = 'resolved'), 0)
    into v_total, v_done
    from public.doubts where project_id = p_project_id;
  v_score := case when v_total = 0 then 0 else round(100.0 * v_done / v_total, 1) end;
  update public.projects set readiness_score = v_score where id = p_project_id;
  return v_score;
end $$;

-- 5.5 Doubt changes -> readiness + decision status (disputed while a contradiction is open).
create function public.after_doubt_change()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_project  uuid := coalesce(new.project_id,  old.project_id);
  v_decision uuid := coalesce(new.decision_id, old.decision_id);
begin
  perform public.recompute_readiness(v_project);
  if v_decision is not null then
    update public.decisions d set status = case
        when d.status = 'reversed' then d.status
        when exists (select 1 from public.doubts x
                     where x.decision_id = d.id and x.kind = 'contradiction'
                       and x.status in ('open','deferred')) then 'disputed'
        else 'active' end
    where d.id = v_decision;
  end if;
  return null;
end $$;

create trigger doubts_after_change
  after insert or update or delete on public.doubts
  for each row execute function public.after_doubt_change();

-- 5.6 Resolutions: fill chosen claim, award XP (severity-weighted, speed bonus).
create function public.prepare_resolution()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_doubt public.doubts%rowtype;
  v_mult  numeric;
begin
  select * into v_doubt from public.doubts where id = new.doubt_id;
  if not found then
    raise exception 'doubt % not found', new.doubt_id using errcode = 'foreign_key_violation';
  end if;

  new.resolved_by := coalesce(new.resolved_by, auth.uid());

  if new.kind in ('pick_a','pick_b') and new.chosen_claim_id is null then
    select dc.claim_id into new.chosen_claim_id
    from public.doubt_claims dc
    where dc.doubt_id = new.doubt_id
      and dc.side = case new.kind when 'pick_a' then 'a' else 'b' end
    limit 1;
  end if;

  v_mult := case new.kind
              when 'provide_missing' then 1.5
              when 'mark_unknown'    then 0.5
              when 'delegate'        then 0.25
              else 1.0 end;
  if new.kind in ('pick_a','pick_b') and new.time_spent_ms is not null and new.time_spent_ms <= 10000 then
    v_mult := v_mult * 1.2;                         -- fast, confident triage earns a bonus
  end if;
  new.xp_awarded := round(v_doubt.severity * 10 * v_mult);
  return new;
end $$;

create trigger resolutions_prepare
  before insert on public.resolutions
  for each row execute function public.prepare_resolution();

-- 5.7 Resolution side effects: doubt status, losing claim, decision rescore flag.
create function public.apply_resolution()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_doubt public.doubts%rowtype;
  v_a uuid; v_b uuid;
  v_loser_status text;
begin
  select * into v_doubt from public.doubts where id = new.doubt_id;
  select claim_id into v_a from public.doubt_claims where doubt_id = v_doubt.id and side = 'a' limit 1;
  select claim_id into v_b from public.doubt_claims where doubt_id = v_doubt.id and side = 'b' limit 1;

  -- stale = older claim superseded by a newer one; contradiction = loser is rejected
  v_loser_status := case when v_doubt.kind = 'stale' then 'superseded' else 'rejected' end;

  if new.kind = 'pick_a' and v_a is not null and v_b is not null then
    update public.claims set status = 'active' where id = v_a;
    update public.claims set status = v_loser_status, superseded_by = v_a where id = v_b;
  elsif new.kind = 'pick_b' and v_a is not null and v_b is not null then
    update public.claims set status = 'active' where id = v_b;
    update public.claims set status = v_loser_status, superseded_by = v_b where id = v_a;
  elsif new.kind = 'both_wrong' then
    update public.claims set status = 'rejected' where id in (v_a, v_b);
  end if;

  update public.doubts
     set status      = case when new.kind = 'delegate' then 'deferred'::public.doubt_status
                            else 'resolved'::public.doubt_status end,
         resolved_at = case when new.kind = 'delegate' then null else now() end
   where id = v_doubt.id;

  if v_doubt.decision_id is not null then
    update public.decisions set needs_rescore = true where id = v_doubt.decision_id;
  end if;
  return new;
end $$;

create trigger resolutions_apply
  after insert on public.resolutions
  for each row execute function public.apply_resolution();

-- 5.8 "Request access" flow: a manager approves -> a scope grant is minted atomically.
create function public.on_access_request_decided()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.status <> 'pending' then
    raise exception 'access request already %', old.status using errcode = 'restrict_violation';
  end if;
  if new.scope_id <> old.scope_id or new.requester_id <> old.requester_id then
    raise exception 'scope_id / requester_id are immutable' using errcode = 'restrict_violation';
  end if;
  if new.status in ('approved','denied') then
    new.decided_by := auth.uid();
    new.decided_at := now();
    if new.status = 'approved' then
      insert into public.scope_grants (scope_id, user_id, granted_by, source)
      values (new.scope_id, new.requester_id, auth.uid(), 'request')
      on conflict do nothing;
    end if;
  end if;
  return new;
end $$;

create trigger access_requests_decided
  before update on public.access_requests
  for each row execute function public.on_access_request_decided();


-- -----------------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY
-- -----------------------------------------------------------------------------
alter table public.profiles           enable row level security;
alter table public.projects           enable row level security;
alter table public.project_members    enable row level security;
alter table public.people             enable row level security;
alter table public.scopes             enable row level security;
alter table public.scope_grants       enable row level security;
alter table public.access_requests    enable row level security;
alter table public.pipeline_runs      enable row level security;
alter table public.source_items       enable row level security;
alter table public.evidence           enable row level security;
alter table public.claims             enable row level security;
alter table public.claim_evidence     enable row level security;
alter table public.decisions          enable row level security;
alter table public.decision_claims    enable row level security;
alter table public.graph_edges        enable row level security;
alter table public.doubts             enable row level security;
alter table public.doubt_claims       enable row level security;
alter table public.resolutions        enable row level security;
alter table public.handover_snapshots enable row level security;

-- 6.1 Identity & workspace
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_project_with(id));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());   -- column grants (section 8) exclude org_role

create policy projects_select on public.projects for select to authenticated
  using (public.is_project_member(id));
create policy project_members_select on public.project_members for select to authenticated
  using (user_id = auth.uid() or public.is_project_member(project_id));
create policy people_select on public.people for select to authenticated
  using (public.is_project_member(project_id));

-- 6.2 Access control
-- Scope rows are visible to members; a scope with reveal_label = false is hidden entirely
-- from callers who cannot read it (its existence is not disclosed).
create policy scopes_select on public.scopes for select to authenticated
  using (public.is_project_member(project_id) and (reveal_label or public.can_read_scope(id)));

create policy scope_grants_select on public.scope_grants for select to authenticated
  using (user_id = auth.uid() or public.is_scope_admin(scope_id));
create policy scope_grants_insert on public.scope_grants for insert to authenticated
  with check (public.is_scope_admin(scope_id));
create policy scope_grants_delete on public.scope_grants for delete to authenticated
  using (public.is_scope_admin(scope_id));

create policy access_requests_select on public.access_requests for select to authenticated
  using (requester_id = auth.uid() or public.is_scope_admin(scope_id));
create policy access_requests_insert on public.access_requests for insert to authenticated
  with check (
    requester_id = auth.uid()
    and status = 'pending'
    and public.is_project_member(public.scope_project(scope_id))
    and not public.can_read_scope(scope_id));
create policy access_requests_decide on public.access_requests for update to authenticated
  using (public.is_scope_admin(scope_id))
  with check (public.is_scope_admin(scope_id) and status in ('approved','denied'));

-- 6.3 Pipeline
create policy pipeline_runs_select on public.pipeline_runs for select to authenticated
  using (public.is_project_member(project_id));

-- 6.4 RAW + EVIDENCE: the permission-aware core.
--     Example: Arjun (engineer, no grant) gets 0 rows from #exec-finance;
--              Maya (explicit grant) and Rachel (manager role) get them.
create policy source_items_select on public.source_items for select to authenticated
  using (public.can_read_scope(scope_id));
create policy evidence_select on public.evidence for select to authenticated
  using (public.can_read_source_item(source_item_id));

-- 6.5 KNOWLEDGE (fail-closed derivation)
create policy claims_select          on public.claims          for select to authenticated using (public.can_read_claim(id));
create policy claim_evidence_select  on public.claim_evidence  for select to authenticated using (public.can_read_claim(claim_id));
create policy decisions_select       on public.decisions       for select to authenticated using (public.can_read_decision(id));
create policy decision_claims_select on public.decision_claims for select to authenticated using (public.can_read_decision(decision_id));
create policy graph_edges_select     on public.graph_edges     for select to authenticated using (public.is_project_member(project_id));

-- 6.6 DOUBTS + TRIAGE
create policy doubts_select       on public.doubts        for select to authenticated using (public.can_read_doubt(id));
create policy doubt_claims_select on public.doubt_claims  for select to authenticated using (public.can_read_doubt(doubt_id));
create policy resolutions_select  on public.resolutions   for select to authenticated using (public.can_read_doubt(doubt_id));
-- Only the departing dev (or a manager) may triage, and only doubts they can fully read.
create policy resolutions_insert  on public.resolutions   for insert to authenticated
  with check (
    resolved_by = auth.uid()
    and public.can_read_doubt(doubt_id)
    and public.can_triage(public.doubt_project(doubt_id)));

-- 6.7 Snapshots
create policy handover_snapshots_select on public.handover_snapshots for select to authenticated
  using (public.is_project_member(project_id));


-- -----------------------------------------------------------------------------
-- 7. VIEWS & RPCs  (security_invoker => RLS of the CALLER applies inside views)
-- -----------------------------------------------------------------------------

-- One query = one Triage card: the doubt, both sides, and each side's verified evidence.
create view public.doubt_board with (security_invoker = true) as
select
  d.id, d.project_id, d.kind, d.title, d.explanation, d.severity, d.status,
  d.decision_id,
  (select dec.title from public.decisions dec where dec.id = d.decision_id) as decision_title,
  d.suggested_resolution, d.engine_reasoning, d.prompt_for_dev, d.what_is_missing,
  d.created_at, d.resolved_at,
  coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'side',         dc.side,
        'claim_id',     c.id,
        'claim_kind',   c.kind,
        'statement',    c.statement,
        'subject',      c.subject,
        'asserted_at',  c.asserted_at,
        'claim_status', c.status,
        'evidence', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'evidence_id',    e.id,
              'quote',          e.quote,
              'char_start',     e.char_start,
              'char_end',       e.char_end,
              'source_item_id', si.id,
              'source_kind',    si.kind,
              'external_id',    si.external_id,
              'author',         si.author,
              'authored_at',    si.authored_at,
              'title',          si.title,
              'url',            si.url)
            order by si.authored_at)
          from public.claim_evidence ce
          join public.evidence e      on e.id = ce.evidence_id
          join public.source_items si on si.id = e.source_item_id
          where ce.claim_id = c.id), '[]'::jsonb))
      order by dc.side, c.asserted_at)
    from public.doubt_claims dc
    join public.claims c on c.id = dc.claim_id
    where dc.doubt_id = d.id), '[]'::jsonb) as sides
from public.doubts d;

-- Gamification header: readiness ring, XP bar.
create view public.triage_progress with (security_invoker = true) as
select
  d.project_id,
  count(*) filter (where d.status <> 'dismissed')                       as total_doubts,
  count(*) filter (where d.status = 'open')                             as open_doubts,
  count(*) filter (where d.status = 'resolved')                         as resolved_doubts,
  count(*) filter (where d.status = 'deferred')                         as deferred_doubts,
  coalesce(sum(d.severity) filter (where d.status = 'resolved'), 0)     as resolved_severity,
  coalesce(sum(d.severity) filter (where d.status <> 'dismissed'), 0)   as total_severity,
  (select coalesce(sum(r.xp_awarded), 0)
     from public.resolutions r join public.doubts d2 on d2.id = r.doubt_id
    where d2.project_id = d.project_id)                                 as total_xp
from public.doubts d
group by d.project_id;

-- The Evidence Graph payload for React Flow. Hidden nodes are returned LOCKED, never dropped.
create function public.get_visible_graph(p_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_result jsonb;
begin
  if not public.is_project_member(p_project_id) then
    raise exception 'not a member of project %', p_project_id using errcode = 'insufficient_privilege';
  end if;

  select jsonb_build_object(
    'project_id', p_project_id,
    'viewer', jsonb_build_object(
      'user_id',      auth.uid(),
      'org_role',     public.current_org_role(),
      'project_role', public.project_role(p_project_id)),

    'decisions', coalesce((
      select jsonb_agg(
        case when public.can_read_decision(d.id) then
          jsonb_build_object('id', d.id, 'locked', false, 'title', d.title, 'summary', d.summary,
            'status', d.status, 'confidence', d.confidence, 'confidence_factors', d.confidence_factors,
            'decided_at', d.decided_at, 'decided_by', d.decided_by)
        else
          jsonb_build_object('id', d.id, 'locked', true, 'title', 'Restricted decision', 'status', d.status)
        end
        order by d.decided_at nulls last, d.id)
      from public.decisions d where d.project_id = p_project_id), '[]'::jsonb),

    'claims', coalesce((
      select jsonb_agg(
        case when public.can_read_claim(c.id) then
          jsonb_build_object('id', c.id, 'locked', false, 'kind', c.kind, 'statement', c.statement,
            'subject', c.subject, 'asserted_at', c.asserted_at, 'status', c.status,
            'superseded_by', c.superseded_by, 'person_id', c.person_id)
        else
          jsonb_build_object('id', c.id, 'locked', true, 'kind', c.kind, 'status', c.status,
            'restricted_labels', public.claim_restricted_labels(c.id))
        end
        order by c.asserted_at nulls last, c.id)
      from public.claims c where c.project_id = p_project_id), '[]'::jsonb),

    'evidence', coalesce((
      select jsonb_agg(
        case when public.can_read_scope(s.id) then
          jsonb_build_object('id', e.id, 'locked', false, 'source_item_id', si.id,
            'quote', e.quote, 'char_start', e.char_start, 'char_end', e.char_end,
            'source_kind', si.kind, 'external_id', si.external_id, 'author', si.author,
            'authored_at', si.authored_at, 'title', si.title, 'url', si.url,
            'scope_id', s.id, 'scope_label', s.external_ref)
        else
          jsonb_build_object('id', e.id, 'locked', true, 'source_kind', si.kind,
            'authored_at', si.authored_at, 'scope_id', s.id,
            'scope_label', case when s.reveal_label then s.external_ref else 'Restricted source' end)
        end
        order by si.authored_at, e.char_start)
      from public.evidence e
      join public.source_items si on si.id = e.source_item_id
      join public.scopes s        on s.id  = si.scope_id
      where si.project_id = p_project_id), '[]'::jsonb),

    'people', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'display_name', p.display_name,
        'role_title', p.role_title, 'status', p.status, 'left_at', p.left_at)
        order by p.display_name)
      from public.people p where p.project_id = p_project_id), '[]'::jsonb),

    'doubts', coalesce((
      select jsonb_agg(
        case when public.can_read_doubt(x.id) then
          jsonb_build_object('id', x.id, 'locked', false, 'kind', x.kind, 'title', x.title,
            'severity', x.severity, 'status', x.status, 'decision_id', x.decision_id)
        else
          jsonb_build_object('id', x.id, 'locked', true, 'kind', x.kind,
            'severity', x.severity, 'status', x.status, 'decision_id', x.decision_id)
        end
        order by x.severity desc, x.created_at)
      from public.doubts x where x.project_id = p_project_id), '[]'::jsonb),

    -- evidence -> claim -> decision are synthesized from join tables (cannot drift);
    -- contradicts / supersedes / blocks come from graph_edges.
    'edges', coalesce((
      select jsonb_agg(t.edge) from (
        select jsonb_build_object('id', 'ce:' || ce.claim_id || ':' || ce.evidence_id,
                 'source_type', 'evidence', 'source_id', ce.evidence_id,
                 'target_type', 'claim',    'target_id', ce.claim_id,
                 'kind', ce.stance) as edge
        from public.claim_evidence ce
        join public.claims c on c.id = ce.claim_id
        where c.project_id = p_project_id
        union all
        select jsonb_build_object('id', 'dc:' || dc.claim_id || ':' || dc.decision_id,
                 'source_type', 'claim',    'source_id', dc.claim_id,
                 'target_type', 'decision', 'target_id', dc.decision_id,
                 'kind', 'supports', 'role', dc.role)
        from public.decision_claims dc
        join public.decisions d on d.id = dc.decision_id
        where d.project_id = p_project_id
        union all
        select jsonb_build_object('id', 'ge:' || ge.id,
                 'source_type', ge.src_type, 'source_id', ge.src_id,
                 'target_type', ge.dst_type, 'target_id', ge.dst_id,
                 'kind', ge.kind, 'weight', ge.weight, 'created_by', ge.created_by)
        from public.graph_edges ge
        where ge.project_id = p_project_id
      ) t), '[]'::jsonb)
  ) into v_result;

  return v_result;
end $$;

comment on function public.get_visible_graph(uuid) is
  'Permission-filtered Evidence Graph. Restricted nodes come back locked (kind + scope label only).';


-- -----------------------------------------------------------------------------
-- 8. PRIVILEGES (defense in depth on top of RLS)
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke insert, update, delete, truncate on all tables in schema public from authenticated;
grant  select on all tables in schema public to authenticated;

grant insert on public.resolutions     to authenticated;   -- triage (policy: departing dev / manager)
grant insert, delete on public.scope_grants to authenticated;  -- policy: managers only
grant insert on public.access_requests to authenticated;   -- "request access" button
grant update (status, decision_note) on public.access_requests to authenticated;  -- manager decision
grant update (display_name, avatar_url, slack_handle, github_login) on public.profiles to authenticated;
-- profiles.org_role is intentionally not updatable by clients: no self-promotion to manager.

do $$
declare f regprocedure;
begin
  foreach f in array array[
    'public.role_rank(public.org_role)'::regprocedure,
    'public.current_org_role()'::regprocedure,
    'public.has_min_org_role(public.org_role)'::regprocedure,
    'public.is_project_member(uuid)'::regprocedure,
    'public.project_role(uuid)'::regprocedure,
    'public.shares_project_with(uuid)'::regprocedure,
    'public.scope_project(uuid)'::regprocedure,
    'public.doubt_project(uuid)'::regprocedure,
    'public.can_read_scope(uuid)'::regprocedure,
    'public.can_read_source_item(uuid)'::regprocedure,
    'public.can_read_claim(uuid)'::regprocedure,
    'public.can_read_decision(uuid)'::regprocedure,
    'public.can_read_doubt(uuid)'::regprocedure,
    'public.is_scope_admin(uuid)'::regprocedure,
    'public.can_triage(uuid)'::regprocedure,
    'public.claim_restricted_labels(uuid)'::regprocedure,
    'public.get_visible_graph(uuid)'::regprocedure
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

revoke all on function public.recompute_readiness(uuid) from public, anon, authenticated;
grant execute on function public.recompute_readiness(uuid) to service_role;


-- -----------------------------------------------------------------------------
-- 9. REALTIME (Triage Board + live unlock). RLS applies to subscribers.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.doubts, public.resolutions, public.pipeline_runs,
      public.scope_grants, public.access_requests, public.projects;
  end if;
end $$;