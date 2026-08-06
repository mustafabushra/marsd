-- Migration: 086_duplicates_and_merge.sql
-- Purpose: the registry already contains the same company twice, and there is no
--          way to see that or to fix it.
--
-- ============================================================================
-- The case that prompted this
-- ============================================================================
-- «شركة نجد الاولى» exists as two rows, with CR numbers 1111111111 and
-- 20222222222222. cr_number is unique, so the database saw two different
-- companies. A buyer searching that name gets two results with two trust
-- scores, and the reports about the business are split between them — which
-- means both scores are wrong, and the more damaging one may be the emptier
-- record.
--
-- For a platform that sells a single number about a company, one company having
-- two numbers is the worst failure available. Nothing detected it and nothing
-- could have fixed it.
--
-- ============================================================================
-- Why merging has to be a function and not a screen
-- ============================================================================
-- Fourteen tables reference companies.id and every one of them is ON DELETE
-- CASCADE. Deleting the duplicate row directly would take its reports, its
-- documents, its disputes and its users with it — silently, because that is what
-- CASCADE does. Everything has to move first, in one transaction, with the
-- collisions handled.

-- ============================================================================
-- 1) The roster says which records are malformed
-- ============================================================================
-- Completeness already answers "how much is filled in". This answers a different
-- question: is what IS filled in wrong. A missing sector is an empty field; a
-- commercial registration number that is not a commercial registration number is
-- a broken identity, and identity is what the report is sold on.
drop function if exists public.company_roster();

create function public.company_roster()
returns table (
  company_id uuid, name text, cr_number text, sector text, city text,
  source text, approved boolean, verified boolean,
  review_status text, review_reason text, review_at timestamptz, review_by text,
  official_status text, completeness integer,
  docs_verified integer, docs_pending integer,
  open_clarifications integer, reports_about integer, trust_score integer,
  registrar text, claimed_by text,
  last_action text, last_action_at timestamptz, last_action_by text,
  created_at timestamptz,
  status text, status_reason text, status_at timestamptz, status_by text,
  quality_issues text[]
)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select
    co.id,
    co.name::text,
    co.cr_number::text,
    co.sector::text,
    co.city::text,
    co.source::text,
    co.approved,
    coalesce(co.verified, false),
    coalesce(co.review_status, 'approved')::text,
    co.review_reason,
    co.review_status_at,
    (select u.email from public.users u where u.id = co.review_status_by)::text,
    coalesce(co.official_status, 'none')::text,
    -- The same eight fields the platform layer of the trust score counts, so the
    -- number here and the number in the report cannot disagree.
    (round((
        (co.sector is not null)::int + (co.city is not null)::int
      + (co.main_activity is not null)::int + (co.entity_type is not null)::int
      + (co.phone is not null)::int + (co.official_email is not null)::int
      + (co.website is not null)::int
      + (coalesce(co.founding_date::text, co.founded_year::text) is not null)::int
    ) * 100.0 / 8))::int,
    (select count(*)::int from public.company_documents d
      where d.company_id = co.id and d.status = 'verified'),
    (select count(*)::int from public.company_documents d
      where d.company_id = co.id and d.status = 'pending'),
    (select count(*)::int from public.clarification_requests r
      where r.company_id = co.id and r.status = 'open'),
    (select count(*)::int from public.reports r
      where r.target_company_id = co.id and r.status = 'approved'),
    (select ts.score from public.trust_scores ts where ts.company_id = co.id),
    -- Who put this company in the registry. companies carries no submitter, so
    -- it is the audit entry written when it was filed — the same derivation the
    -- approval queue and the credit award both use.
    (select t.name from public.audit_logs al
       join public.tenants t on t.id = al.tenant_id
      where al.action = 'company_add_requested' and al.entity_id = co.id::text
      order by al.created_at asc limit 1)::text,
    -- And who owns it now, if anyone claimed it.
    (select t.name from public.tenants t where t.company_id = co.id limit 1)::text,
    (select l.action from public.company_audit_log l
      where l.company_id = co.id order by l.created_at desc limit 1)::text,
    (select l.created_at from public.company_audit_log l
      where l.company_id = co.id order by l.created_at desc limit 1),
    (select u.email from public.company_audit_log l
       left join public.users u on u.id = l.actor_id
      where l.company_id = co.id order by l.created_at desc limit 1)::text,
    co.created_at,
    coalesce(co.status, 'active')::text,
    co.status_reason,
    co.status_at,
    (select u.email from public.users u where u.id = co.status_by)::text,
    -- Correctness, not completeness. Exact-name duplicates only: the fuzzy pass
    -- is expensive and lives in company_duplicates, which is opened on purpose.
    (array_remove(array[
      case when co.cr_number !~ '^[0-9]{10}$' then 'cr_format' end,
      case when exists (select 1 from public.companies x
                         where x.id <> co.id and lower(trim(x.name)) = lower(trim(co.name)))
           then 'duplicate_name' end,
      case when co.approved and co.sector is null then 'no_sector' end
    ], null))::text[]
  from public.companies co
  where coalesce(public.is_platform_admin() or public.is_reviewer(), false)
  order by
    -- What needs attention first: open questions, then pending documents, then
    -- anything not yet approved, then the rest by age.
    (select count(*) from public.clarification_requests r
      where r.company_id = co.id and r.status = 'open') desc,
    (select count(*) from public.company_documents d
      where d.company_id = co.id and d.status = 'pending') desc,
    (co.review_status = 'approved'),
    co.created_at desc;
$fn$;

grant execute on function public.company_roster() to authenticated;
revoke all on function public.company_roster() from public, anon;

-- ============================================================================
-- 2) Which records look like the same company
-- ============================================================================
-- Trigram similarity over every pair is quadratic, so this is its own call with
-- a threshold and a cap rather than a column on the list. Each side carries its
-- report count and score, because the decision an administrator makes is which
-- record survives, and that is the evidence for it.
create or replace function public.company_duplicates(
  p_threshold real default 0.55,
  p_limit     integer default 100
)
returns table (
  a_id uuid, a_name text, a_cr text, a_reports integer, a_score integer, a_created timestamptz,
  b_id uuid, b_name text, b_cr text, b_reports integer, b_score integer, b_created timestamptz,
  similarity real, reason text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select
    a.id, a.name::text, a.cr_number::text,
    (select count(*)::int from public.reports r where r.target_company_id = a.id and r.status = 'approved'),
    (select ts.score from public.trust_scores ts where ts.company_id = a.id),
    a.created_at,
    b.id, b.name::text, b.cr_number::text,
    (select count(*)::int from public.reports r where r.target_company_id = b.id and r.status = 'approved'),
    (select ts.score from public.trust_scores ts where ts.company_id = b.id),
    b.created_at,
    similarity(a.name, b.name),
    (case when lower(trim(a.name)) = lower(trim(b.name)) then 'same_name' else 'similar_name' end)::text
  from public.companies a
  join public.companies b
    on a.id < b.id
   and similarity(a.name, b.name) >= greatest(p_threshold, 0.3)
  where coalesce(public.is_platform_admin(), false)
  order by (lower(trim(a.name)) = lower(trim(b.name))) desc, similarity(a.name, b.name) desc
  limit greatest(1, least(p_limit, 500));
$fn$;

grant execute on function public.company_duplicates(real, integer) to authenticated;
revoke all on function public.company_duplicates(real, integer) from public, anon;

-- ============================================================================
-- 3) The one case where a report may change the company it is about
-- ============================================================================
-- guard_report_review refuses any change to a report's target_company_id, and
-- that is the right default: it is what stops a reviewer from moving somebody
-- else's accusation onto an innocent business. It is also the reason the first
-- attempt at this migration failed, which is the guard doing its job.
--
-- A merge is the one legitimate case. The company a report named did not become
-- a different company — it stopped existing as a separate record. So the
-- exception is written as narrowly as the case is:
--
--   * only while merge_companies is running (it sets the flag, transaction-local)
--   * only toward the exact record being merged into
--   * only for a platform admin
--
-- A reviewer still cannot re-point a report anywhere, which is what the guard is
-- for. An admin could set the flag by hand — but an admin can already call
-- merge_companies, so the guard was never the thing standing between them and
-- this. Every other content field stays locked, including during a merge.
create or replace function public.guard_report_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_merging boolean;
begin
  if public.get_current_user_id() is null then
    return new;
  end if;

  -- The reporting company editing its own draft is not review; it may change
  -- whatever it likes until it submits.
  if new.reporter_tenant_id = public.get_current_tenant_id() and old.status = 'draft' then
    new.updated_at := now();
    return new;
  end if;

  if not (public.is_reviewer() or public.is_platform_admin()) then
    return new;   -- RLS will refuse the row anyway
  end if;

  -- coalesce, because the flag is normally unset: nullif() gives NULL, the
  -- comparison gives NULL, `not NULL` is NULL, and an `if` on NULL does not
  -- fire. Without this the guard silently permits exactly what it exists to
  -- refuse — the same shape of bug as 056.
  v_merging := coalesce(
    public.is_platform_admin()
      and nullif(current_setting('marsad.merging_into', true), '') = new.target_company_id::text,
    false);

  if new.reporter_tenant_id is distinct from old.reporter_tenant_id
     or (new.target_company_id is distinct from old.target_company_id and not v_merging)
     or new.payment_commitment is distinct from old.payment_commitment
     or new.delay_days is distinct from old.delay_days
     or new.defaulted is distinct from old.defaulted
     or new.deal_value is distinct from old.deal_value
     or new.dealt_at is distinct from old.dealt_at
     or new.description is distinct from old.description
  then
    raise exception 'المراجعة تُغيّر حالة التقرير لا محتواه';
  end if;

  new.updated_at := now();
  return new;
end $fn$;

-- ============================================================================
-- 4) Merging one record into another
-- ============================================================================
create or replace function public.merge_companies(
  p_keep   uuid,
  p_drop   uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_keep    public.companies%rowtype;
  v_drop    public.companies%rowtype;
  v_keep_t  uuid;
  v_drop_t  uuid;
  v_moved   jsonb := '{}'::jsonb;
  v_n       int;
begin
  if not coalesce(public.is_platform_admin(), false) then
    raise exception 'دمج السجلات من صلاحيات إدارة مرصد';
  end if;

  if coalesce(trim(p_reason), '') = '' then
    raise exception 'الدمج يحتاج سبباً — لا يمكن التراجع عنه';
  end if;

  if p_keep = p_drop then
    raise exception 'لا يمكن دمج السجل مع نفسه';
  end if;

  select * into v_keep from public.companies where id = p_keep;
  if not found then raise exception 'السجل المُبقى غير موجود'; end if;
  select * into v_drop from public.companies where id = p_drop;
  if not found then raise exception 'السجل المدموج غير موجود'; end if;

  -- Two owners is not a data problem, it is a dispute. A machine picking one is
  -- worse than refusing, because the losing tenant would silently lose a company
  -- it believes it owns.
  select id into v_keep_t from public.tenants where company_id = p_keep limit 1;
  select id into v_drop_t from public.tenants where company_id = p_drop limit 1;
  if v_keep_t is not null and v_drop_t is not null and v_keep_t <> v_drop_t then
    raise exception 'السجلان مملوكان لجهتين مختلفتين — تُحسم الملكية أولاً';
  end if;

  -- ---- things that move without conflicting ------------------------------
  -- Opens the one exception in guard_report_review, for this transaction and
  -- this destination only.
  perform set_config('marsad.merging_into', p_keep::text, true);

  update public.reports set target_company_id = p_keep where target_company_id = p_drop;
  get diagnostics v_n = row_count; v_moved := v_moved || jsonb_build_object('reports', v_n);

  update public.clarification_requests set company_id = p_keep where company_id = p_drop;
  get diagnostics v_n = row_count; v_moved := v_moved || jsonb_build_object('clarifications', v_n);

  update public.disputes set company_id = p_keep where company_id = p_drop;
  get diagnostics v_n = row_count; v_moved := v_moved || jsonb_build_object('disputes', v_n);

  update public.claim_requests        set company_id = p_keep where company_id = p_drop;
  update public.company_data_requests set company_id = p_keep where company_id = p_drop;
  update public.registration_requests set company_id = p_keep where company_id = p_drop;
  update public.trust_score_history   set company_id = p_keep where company_id = p_drop;
  update public.users                 set company_id = p_keep where company_id = p_drop;

  -- The losing record's history moves too, so the surviving company keeps the
  -- full account of what happened to both.
  update public.company_audit_log set company_id = p_keep where company_id = p_drop;

  -- ---- things that collide -----------------------------------------------
  -- One verified document per type per company. The survivor's stays current;
  -- the incoming one becomes a superseded version rather than being deleted, so
  -- the paper trail survives the merge.
  update public.company_documents d
     set superseded_at = now()
   where d.company_id = p_drop
     and d.status = 'verified'
     and d.superseded_at is null
     and exists (select 1 from public.company_documents k
                  where k.company_id = p_keep and k.doc_type = d.doc_type
                    and k.status = 'verified' and k.superseded_at is null);
  update public.company_documents set company_id = p_keep where company_id = p_drop;
  get diagnostics v_n = row_count; v_moved := v_moved || jsonb_build_object('documents', v_n);

  -- A tenant watching both records would become a tenant watching one twice.
  delete from public.watchlist_items w
   where w.company_id = p_drop
     and exists (select 1 from public.watchlist_items k
                  where k.company_id = p_keep and k.tenant_id = w.tenant_id);
  update public.watchlist_items set company_id = p_keep where company_id = p_drop;

  -- One profile per company, and one tenant per company.
  delete from public.company_profiles
   where company_id = p_drop
     and exists (select 1 from public.company_profiles k where k.company_id = p_keep);
  update public.company_profiles set company_id = p_keep where company_id = p_drop;

  if v_keep_t is null and v_drop_t is not null then
    update public.tenants set company_id = p_keep where id = v_drop_t;
  end if;

  -- The score is recomputed from the merged reports, so the old row is stale by
  -- definition and has a unique constraint on company_id.
  delete from public.trust_scores where company_id = p_drop;

  -- ---- fields worth keeping from the record being dropped ----------------
  -- Only where the survivor has nothing. A merge should never overwrite data
  -- with data, just fill gaps.
  update public.companies set
    sector           = coalesce(sector, v_drop.sector),
    city             = coalesce(city, v_drop.city),
    region           = coalesce(region, v_drop.region),
    main_activity    = coalesce(main_activity, v_drop.main_activity),
    entity_type      = coalesce(entity_type, v_drop.entity_type),
    phone            = coalesce(phone, v_drop.phone),
    official_email   = coalesce(official_email, v_drop.official_email),
    website          = coalesce(website, v_drop.website),
    national_address = coalesce(national_address, v_drop.national_address),
    founding_date    = coalesce(founding_date, v_drop.founding_date),
    founded_year     = coalesce(founded_year, v_drop.founded_year),
    commercial_name  = coalesce(commercial_name, v_drop.commercial_name),
    -- The dropped name stays searchable, or every buyer who knew the company by
    -- it stops finding it.
    previous_names   = trim(both ' | ' from
                        coalesce(previous_names, '') || ' | ' || v_drop.name)
  where id = p_keep;

  perform set_config('marsad.change_reason',
    format('دمج السجل «%s» (%s) — %s', v_drop.name, v_drop.cr_number, trim(p_reason)), true);

  delete from public.companies where id = p_drop;

  insert into public.company_audit_log (company_id, action, actor_id, change_reason, new_values, created_at)
  values (p_keep, 'merged', public.get_current_user_id(),
          format('دمج «%s» (%s) — %s', v_drop.name, v_drop.cr_number, trim(p_reason)),
          jsonb_build_object('merged_from', p_drop, 'merged_name', v_drop.name,
                             'merged_cr', v_drop.cr_number, 'moved', v_moved),
          now());

  perform set_config('marsad.change_reason', '', true);
  perform set_config('marsad.merging_into', '', true);
  perform public.compute_trust_score(p_keep);

  return jsonb_build_object('kept', p_keep, 'dropped', p_drop, 'moved', v_moved);
end $fn$;

grant execute on function public.merge_companies(uuid, uuid, text) to authenticated;
revoke all on function public.merge_companies(uuid, uuid, text) from public, anon;

-- ============================================================================
-- Prove the merge on real rows, then put them back
-- ============================================================================
-- Two throwaway companies and a real report, merged for real, then removed. A
-- merge that is only reasoned about is a merge that has not been tested.
do $blk$
declare
  v_admin text; v_tid uuid; v_a uuid; v_b uuid; v_rep uuid;
  v_res jsonb; v_n int; v_raised boolean; v_prev text;
begin
  select id into v_admin from public.users where role = 'platform_admin' limit 1;
  select t.id into v_tid from public.tenants t join public.users u on u.tenant_id = t.id limit 1;

  insert into public.companies (name, cr_number, approved, sector, status)
  values ('شركة فحص الدمج', '9900000001', true, 'قطاع أ', 'active') returning id into v_a;
  insert into public.companies (name, cr_number, approved, city, status)
  values ('شركة فحص الدمج', '9900000002', true, 'مدينة ب', 'active') returning id into v_b;

  insert into public.reports
    (reporter_tenant_id, target_company_id, status, dealt_at, payment_commitment, delay_days)
  values (v_tid, v_b, 'approved', now() - interval '30 days', 'late', 9)
  returning id into v_rep;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);

  -- The pair is detected before it is fixed.
  select count(*) into v_n from public.company_duplicates(0.55, 100)
   where (a_id = v_a and b_id = v_b) or (a_id = v_b and b_id = v_a);
  if v_n <> 1 then raise exception 'لم يُكتشف التكرار'; end if;

  -- A merge with no reason is refused.
  v_raised := false;
  begin perform public.merge_companies(v_a, v_b, '');
  exception when others then v_raised := true; end;
  if not v_raised then raise exception 'قُبل دمج بلا سبب'; end if;

  v_res := public.merge_companies(v_a, v_b, 'فحص المهاجرة 086');

  -- The report followed the company it is about.
  select count(*) into v_n from public.reports where id = v_rep and target_company_id = v_a;
  if v_n <> 1 then raise exception 'التقرير لم ينتقل — كان سيُحذف مع السجل'; end if;

  -- The dropped record is gone, its data filled the survivor's gaps, and its
  -- name is still findable.
  select count(*) into v_n from public.companies where id = v_b;
  if v_n <> 0 then raise exception 'السجل المدموج لم يُحذف'; end if;

  select previous_names into v_prev from public.companies where id = v_a;
  if v_prev is null or v_prev not like '%شركة فحص الدمج%' then
    raise exception 'الاسم القديم لم يُحفظ للبحث';
  end if;

  select count(*) into v_n from public.companies where id = v_a and city = 'مدينة ب';
  if v_n <> 1 then raise exception 'الحقول الفارغة لم تُملأ من السجل المدموج'; end if;

  raise notice '✅ الدمج ينقل التقارير ويملأ الفراغ ويحفظ الاسم القديم';

  -- And the exception closed behind it: with no merge running, re-pointing a
  -- report is refused again, for an admin too.
  v_raised := false;
  begin
    update public.reports set target_company_id = (
      select id from public.companies where id <> v_a limit 1) where id = v_rep;
  exception when others then v_raised := true; end;
  if not v_raised then
    raise exception 'يمكن تحويل تقرير لشركة أخرى خارج الدمج';
  end if;

  raise notice '✅ والاستثناء مغلق خارج الدمج';

  -- Clean up the throwaway rows. CASCADE takes the report and the audit trail
  -- with the company, which is exactly why the merge had to move them first.
  delete from public.credits_ledger where source_table = 'reports' and source_id = v_rep;
  delete from public.reports where id = v_rep;
  delete from public.companies where id = v_a;

  perform set_config('request.jwt.claims', '', true);
end $blk$;
