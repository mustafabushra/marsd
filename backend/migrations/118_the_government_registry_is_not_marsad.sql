-- The government registry is not Marsad
-- ============================================================================
--
-- The Ministry of Commerce publishes every active commercial registration in
-- the Kingdom — 1,048,576 rows in the file we have, which is Excel's ceiling and
-- so probably not all of them. The first import wrote them straight into
-- `companies`. That was wrong, and wrong in a way worth writing down.
--
-- `companies` means «an entity Marsad tracks». The register means «an entity
-- that exists». Merging them would have:
--
--   made every feature — the trust score, RLS, search, every admin screen —
--   work over a million rows of which almost none have a report or a
--   relationship with anyone;
--
--   overwritten live companies. The import upserted on `cr_number`, so a
--   company with reports and a trust score would have had its record replaced
--   by a quarterly snapshot;
--
--   destroyed the history. This dataset is a snapshot of Q2 2026 with
--   `updateFrequency: NEVER`. Q3 is a different snapshot, not an update, and
--   keeping them apart is what lets anyone ask what changed.
--
-- So the register lives here, and a company enters Marsad only when somebody
-- asks for it — at which point `companies.government_company_id` records where
-- it came from.

create table if not exists public.government_company_registry (
  id                    uuid primary key default gen_random_uuid(),

  -- Which publication this row came from, kept as the portal's own identifier
  -- so provenance is a fact rather than a note.
  dataset_id            uuid        not null,
  snapshot_period       text        not null,

  unified_number        text,
  cr_number             text        not null,
  name                  text        not null,
  registration_type     text,
  legal_entity          text,
  -- The sheet carries this column twice; the parser suffixes the second. Kept
  -- rather than discarded, because a value the Ministry publishes twice is not
  -- ours to decide is redundant.
  legal_entity_2        text,
  capital               numeric,
  region                text,
  city                  text,
  registration_date     date,

  source                text        not null default 'ministry_of_commerce',
  imported_at           timestamptz not null default now()
);

-- One row per registration per snapshot.
--
-- Not `cr_number` alone: Q2 and Q3 both contain the same company, and that is
-- the point. Re-importing the same quarter updates in place; importing the next
-- quarter adds alongside.
create unique index if not exists gov_registry_dataset_cr_idx
  on public.government_company_registry (dataset_id, cr_number);

-- --- Finding a company ------------------------------------------------------
-- Three ways in, because that is how people search: by name, by the unified
-- number on an invoice, or by the registration number on a contract.
create index if not exists gov_registry_cr_idx
  on public.government_company_registry (cr_number);

create index if not exists gov_registry_unified_idx
  on public.government_company_registry (unified_number)
  where unified_number is not null;

-- Arabic full text over a million names. `simple` rather than `arabic`: the
-- Arabic dictionary stems, and stemming a company name turns «التجارية» and
-- «تجارة» into the same token — which finds the wrong companies confidently.
create index if not exists gov_registry_name_fts_idx
  on public.government_company_registry
  using gin (to_tsvector('simple', coalesce(name, '')));

-- And a prefix index for «starts with», which is what someone typing a name
-- into a search box is doing. text_pattern_ops because the default btree
-- collation cannot answer LIKE 'x%'.
create index if not exists gov_registry_name_prefix_idx
  on public.government_company_registry (name text_pattern_ops);

-- --- Who may read it --------------------------------------------------------
-- Published open data, so any signed-in account may read it — that is the whole
-- value of holding it. Nobody may write it from a browser: it arrives through
-- an import an administrator runs, and a row here is a claim about the national
-- register that no user should be able to invent.
alter table public.government_company_registry enable row level security;

revoke all on public.government_company_registry from anon, authenticated, public;
grant select on public.government_company_registry to authenticated;

drop policy if exists gov_registry_select on public.government_company_registry;
create policy gov_registry_select on public.government_company_registry
  for select to authenticated using (true);

-- --- The link back ----------------------------------------------------------
-- Set when somebody presses «إضافة إلى مرصد». Null for every company that came
-- from a person rather than from the register, which is how the two origins
-- stay distinguishable forever rather than only until somebody forgets.
alter table public.companies
  add column if not exists government_company_id uuid
    references public.government_company_registry(id) on delete set null;

create index if not exists companies_government_id_idx
  on public.companies (government_company_id)
  where government_company_id is not null;

-- --- Who may write it -------------------------------------------------------
-- Only Marsad's own staff, and only through the import screen.
--
-- The first version of this migration granted `select` and stopped, which reads
-- as caution and is not: the import runs in an administrator's browser, so it
-- would have failed on the first batch with a policy error rather than a
-- refusal anyone could act on. Granting the write and gating it on
-- `is_platform_admin()` is the same restriction, expressed where it can be
-- enforced.
grant insert, update on public.government_company_registry to authenticated;

drop policy if exists gov_registry_admin_insert on public.government_company_registry;
create policy gov_registry_admin_insert on public.government_company_registry
  for insert to authenticated
  with check (coalesce(public.is_platform_admin(), false));

drop policy if exists gov_registry_admin_update on public.government_company_registry;
create policy gov_registry_admin_update on public.government_company_registry
  for update to authenticated
  using (coalesce(public.is_platform_admin(), false))
  with check (coalesce(public.is_platform_admin(), false));
