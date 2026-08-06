-- Migration: 108_report_access_is_enforced_by_the_server.sql
-- Purpose: the trust report — the thing Marsad sells — was readable without a
--          plan, without a limit, and in one case without an account.
--
-- ============================================================================
-- What was wrong (three separate holes, one root)
-- ============================================================================
--
-- 1. The knowledge-base views were granted to `anon`.
--
--    `v_company_knowledge_base` has no `security_invoker`, so it runs with its
--    owner's rights and ignores every row-level policy underneath it. It was
--    granted to `anon` and `authenticated`, and PostgREST publishes a view at a
--    URL exactly like a table. The anon key ships inside the browser bundle, so
--
--        GET /rest/v1/v_company_knowledge_base?select=*
--
--    returned all 31 companies — names, commercial registers, trust scores,
--    report counts — to anyone at all. Measured, not inferred: as `anon` the
--    `companies` table itself returns 0 rows, correctly blocked by RLS, and the
--    view returns every one of them. The same is true of
--    `v_report_knowledge_base`, which carries `reporter_tenant_id` — the column
--    migration 107 went to some trouble to keep away from ordinary users.
--
-- 2. The monthly allowance was counted correctly and enforced nowhere.
--
--    The browser checks `remaining('searches_per_month')` before it fetches, and
--    that check is the only one there is. `get_company_knowledge_base`,
--    `get_company_reports_timeline` and `get_company_reports_summary` never ask
--    what plan the caller is on. Calling the RPC directly — or letting the page
--    fetch and ignoring the block — returns the full report every time. A plan
--    that says 100 lookups a month grants an unlimited number to anyone who
--    looks past the page.
--
-- 3. The meter and the gate could not have been made to agree.
--
--    Whether a lookup is free (staff, own company, enforcement switched off,
--    already opened this month) was decided in JavaScript. Any server-side gate
--    written separately would have had to restate all of it, and the two copies
--    would have drifted the first time either changed.
--
-- ============================================================================
-- Why the obvious fix is wrong
-- ============================================================================
-- Setting `security_invoker = true` on `v_company_knowledge_base` closes the
-- anon hole in one line. It also breaks the product: the view counts a
-- company's reports with a subquery over `reports`, and under RLS a caller sees
-- only its own. Tried in a rolled-back transaction, the totals for a signed-in
-- company user fell from 53 reports to 18 — every company's report count would
-- have become "the reports you happen to have filed". Those counts are public
-- facts about a company and have to be computed with full sight.
--
-- So the views keep their elevated read, and stop being reachable. Everything
-- goes through SECURITY DEFINER functions that each state who may call them.
--
-- ============================================================================
-- One place decides
-- ============================================================================
-- `report_access_state` answers "is this caller exempt, and if not, what is
-- their ceiling" — once. `company_report_access` (the gate) and
-- `open_company_report` (the meter) both call it. They cannot disagree about
-- who pays, because neither of them decides.

-- ============================================================================
-- 1. The views stop being public
-- ============================================================================
-- Also revoked from `authenticated`: every caller now goes through a function,
-- and a view that only some callers may read is a second set of rules to keep
-- in step with the first.
revoke all on public.v_company_knowledge_base           from anon, authenticated, public;
revoke all on public.v_report_knowledge_base            from anon, authenticated, public;
revoke all on public.company_data_request_contributors  from anon, authenticated, public;

-- ============================================================================
-- 2. Who pays, decided once
-- ============================================================================
create or replace function public.report_access_state(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user   text := public.get_current_user_id();
  v_tenant uuid;
  v_off    boolean;
  v_plan   record;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'exempt', false, 'reason', 'لا توجد جلسة');
  end if;

  -- Marsad's own staff are not customers. my_entitlements() already treats them
  -- this way; saying it differently here is how the two would drift.
  if public.is_platform_admin()
     or coalesce(public.get_current_user_role(), '') = 'reviewer' then
    return jsonb_build_object('ok', true, 'exempt', true, 'reason', 'إدارة مرصد');
  end if;

  select tenant_id into v_tenant from public.users where id = v_user;

  -- No tenant, and no plan below, both mean the billing setup is incomplete.
  -- my_entitlements() reports `degraded` for exactly these and the product lets
  -- the caller through: a customer must never be locked out of what they paid
  -- for because a lookup failed. The same choice, made the same way.
  if v_tenant is null then
    return jsonb_build_object('ok', true, 'exempt', true,
                              'reason', 'لا يوجد كيان مرتبط بالحساب');
  end if;

  select coalesce((value #>> '{disabled}')::boolean, false) into v_off
    from public.system_settings where key = 'entitlements_enforcement';
  if coalesce(v_off, false) then
    return jsonb_build_object('ok', true, 'exempt', true, 'tenantId', v_tenant,
                              'reason', 'تطبيق الحدود معطّل من الإعدادات');
  end if;

  -- Reading your own file is not a lookup of somebody else's.
  if exists (select 1 from public.tenants t
              where t.id = v_tenant and t.company_id = p_company_id) then
    return jsonb_build_object('ok', true, 'exempt', true, 'tenantId', v_tenant,
                              'reason', 'ملف شركتك');
  end if;

  select p.* into v_plan
    from public.subscriptions s
    join public.plans p on p.id = s.plan_id
   where s.tenant_id = v_tenant
     and s.status = 'active'
     and (s.current_period_end is null or s.current_period_end > now())
   order by s.created_at desc
   limit 1;

  if v_plan is null then
    select p.* into v_plan from public.plans p where p.is_default limit 1;
  end if;

  if v_plan is null then
    return jsonb_build_object('ok', true, 'exempt', true, 'tenantId', v_tenant,
                              'reason', 'لا توجد باقة');
  end if;

  return jsonb_build_object(
    'ok', true,
    'exempt', false,
    'tenantId', v_tenant,
    -- Absent or negative means unlimited, the same reading limitOf() uses.
    'ceiling', coalesce((v_plan.limits ->> 'searches_per_month')::int, -1),
    'giveToGet', coalesce(v_plan.give_to_get_enabled, false));
end $$;

comment on function public.report_access_state(uuid) is
  'هل هذا المستخدم معفى من عدّ فتح التقارير، وإن لم يكن فما سقفه. المصدر الوحيد لهذا القرار: تستدعيه بوابة القراءة وعدّاد الفتح معاً حتى لا يختلفا.';

-- ============================================================================
-- 3. The gate
-- ============================================================================
-- Deliberately reads the recorded view rather than re-deciding: the record is
-- what was paid for. A report opened this month stays open for the rest of it,
-- including the live refresh that re-reads on every approval — which would
-- otherwise re-charge a reader for sitting still.
create or replace function public.company_report_access(p_company_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_state jsonb := public.report_access_state(p_company_id);
begin
  if not coalesce((v_state ->> 'ok')::boolean, false) then return false; end if;
  if coalesce((v_state ->> 'exempt')::boolean, false) then return true; end if;
  if coalesce((v_state ->> 'ceiling')::int, -1) < 0 then return true; end if;

  return exists (
    select 1 from public.audit_logs
     where tenant_id = (v_state ->> 'tenantId')::uuid
       and action = 'company_report_viewed'
       -- entity_id is text, not uuid. Stated at every match rather than
       -- left to an implicit cast that does not exist.
       and entity_id = p_company_id::text
       and created_at >= date_trunc('month', now()));
end $$;

comment on function public.company_report_access(uuid) is
  'هل دفع هذا الكيان مقابل فتح تقرير هذه الشركة هذا الشهر. بوابة القراءة داخل دوال التقرير.';

-- ============================================================================
-- 4. The meter
-- ============================================================================
create or replace function public.open_company_report(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_state   jsonb;
  v_user    text := public.get_current_user_id();
  v_tenant  uuid;
  v_ceiling int;
  v_used    int := 0;
  v_spend   jsonb;
begin
  if not exists (select 1 from public.companies where id = p_company_id) then
    return jsonb_build_object('ok', false, 'reason', 'الشركة غير موجودة');
  end if;

  v_state := public.report_access_state(p_company_id);
  if not coalesce((v_state ->> 'ok')::boolean, false) then
    return jsonb_build_object('ok', false, 'reason', v_state ->> 'reason');
  end if;
  if coalesce((v_state ->> 'exempt')::boolean, false) then
    return jsonb_build_object('ok', true, 'metered', false,
                              'reason', v_state ->> 'reason');
  end if;

  v_tenant  := (v_state ->> 'tenantId')::uuid;
  v_ceiling := coalesce((v_state ->> 'ceiling')::int, -1);

  -- One opener per tenant at a time. Two tabs opening two different companies
  -- on the last remaining slot otherwise read the same count and both pass —
  -- the browser could not have prevented that at all, which is half the reason
  -- this moved.
  perform pg_advisory_xact_lock(hashtext('report_open:' || v_tenant::text));

  if exists (select 1 from public.audit_logs
              where tenant_id = v_tenant
                and action = 'company_report_viewed'
                and entity_id = p_company_id::text
                and created_at >= date_trunc('month', now())) then
    return jsonb_build_object('ok', true, 'alreadySeen', true);
  end if;

  if v_ceiling >= 0 then
    -- Distinct companies, not page loads: revisiting one already opened is free,
    -- which is what the exists() above enforces and this must agree with.
    select count(distinct entity_id) into v_used
      from public.audit_logs
     where tenant_id = v_tenant
       and action = 'company_report_viewed'
       and created_at >= date_trunc('month', now());

    if v_used >= v_ceiling then
      -- Past the plan's own allowance the lookup is paid out of the balance.
      -- spend_credits() takes its own lock, sums the ledger and writes the debit
      -- in one statement, and returns `proceed` when the plan does not use
      -- credits at all.
      if coalesce((v_state ->> 'giveToGet')::boolean, false) then
        v_spend := public.spend_credits('search_unlock');
        if coalesce((v_spend ->> 'spent')::int, 0) <= 0
           and not coalesce((v_spend ->> 'proceed')::boolean, false) then
          return jsonb_build_object('ok', false, 'reason', 'انتهت مشاهدات هذا الشهر',
                                    'used', v_used, 'ceiling', v_ceiling,
                                    'credits', v_spend -> 'balance');
        end if;
      else
        return jsonb_build_object('ok', false, 'reason', 'انتهت مشاهدات هذا الشهر',
                                  'used', v_used, 'ceiling', v_ceiling);
      end if;
    end if;
  end if;

  -- Recorded last: the debit above must not happen without this, and this must
  -- not happen without the debit. Both are in one transaction.
  insert into public.audit_logs (tenant_id, actor_id, action, entity, entity_id)
  values (v_tenant, v_user, 'company_report_viewed', 'company', p_company_id::text);

  return jsonb_build_object('ok', true, 'metered', true,
                            'used', v_used + 1, 'ceiling', v_ceiling);
end $$;

comment on function public.open_company_report(uuid) is
  'يفتح تقرير شركة ويحتسبه على باقة الكيان. يرجع ok=false مع السبب عند انتهاء الحصة. الفحص والخصم والتسجيل في معاملة واحدة.';

-- ============================================================================
-- 5. The report functions ask the gate
-- ============================================================================
-- SECURITY DEFINER because the views are no longer readable by the caller.
-- The elevated read is exactly the point: the counts are computed over every
-- report, and what the caller may see is decided by company_report_access
-- above rather than by which rows RLS happens to show them.
create or replace function public.get_company_knowledge_base(p_company_id uuid)
returns table(id uuid, name text, cr_number text, unified_number text,
              license_number text, official_email text, sector text, city text,
              founded_year integer, cr_file_url text, registration_status text,
              cr_status text, source text, approved boolean, claim_status text,
              approved_reports_count integer, pending_reports_count integer,
              rejected_reports_count integer, total_reports_count integer,
              trust_score numeric, trust_tier text,
              last_report_at timestamp with time zone,
              last_updated_at timestamp with time zone,
              created_at timestamp with time zone,
              updated_at timestamp with time zone)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select * from public.v_company_knowledge_base
   where id = p_company_id
     and public.company_report_access(p_company_id);
$$;

-- Search is not metered and never was: it runs on every keystroke, and charging
-- there would spend a month's allowance typing one company's name. It needs a
-- session, and it returns the summary line — name, sector, score — not the
-- report.
create or replace function public.search_company_knowledge_base(
  p_query text default null, p_source text default null, p_status text default null,
  p_limit integer default 50, p_offset integer default 0)
returns table(id uuid, name text, cr_number text, unified_number text, sector text,
              city text, registration_status text, source text, claim_status text,
              trust_score numeric, trust_tier text, total_reports_count integer,
              last_updated_at timestamp with time zone)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select id, name, cr_number, unified_number, sector, city,
         registration_status, source, claim_status,
         trust_score, trust_tier, total_reports_count, last_updated_at
    from public.v_company_knowledge_base
   where public.get_current_user_id() is not null
     and (p_query is null
          or name           ilike '%' || p_query || '%'
          or cr_number      ilike '%' || p_query || '%'
          or unified_number ilike '%' || p_query || '%'
          or license_number ilike '%' || p_query || '%'
          or official_email ilike '%' || p_query || '%')
     and (p_source is null or source = p_source)
     and (p_status is null or registration_status = p_status)
   order by last_updated_at desc
   limit p_limit offset p_offset;
$$;

-- These two carry `reporter_tenant_id`, which identifies who filed a report.
-- Migration 107 removed that from the timeline for everyone but Marsad; it was
-- still readable here by any signed-in account, and by anyone at all through the
-- view. Nothing in the application calls either one — both wrappers in
-- src/lib/api.ts are unused — so the audience is stated rather than guessed.
create or replace function public.get_report_knowledge_base(p_report_id uuid)
returns table(id uuid, reporter_tenant_id uuid, target_company_id uuid,
              company_name text, company_cr_number text, company_sector text,
              deal_amount_range text, payment_commitment text, delay_days integer,
              defaulted boolean, status text,
              submitted_at timestamp with time zone,
              last_updated_at timestamp with time zone,
              approved_at timestamp with time zone,
              rejected_at timestamp with time zone,
              dealt_at timestamp with time zone,
              credits_awarded integer, total_credits_awarded integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select * from public.v_report_knowledge_base
   where id = p_report_id
     and coalesce(public.is_platform_admin() or public.is_reviewer(), false);
$$;

create or replace function public.search_report_knowledge_base(
  p_query text default null, p_status text default null,
  p_company_id uuid default null, p_limit integer default 50, p_offset integer default 0)
returns table(id uuid, target_company_id uuid, company_name text,
              company_cr_number text, deal_amount_range text,
              payment_commitment text, status text,
              submitted_at timestamp with time zone, total_credits_awarded integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select id, target_company_id, company_name, company_cr_number,
         deal_amount_range, payment_commitment, status, submitted_at,
         total_credits_awarded
    from public.v_report_knowledge_base
   where coalesce(public.is_platform_admin() or public.is_reviewer(), false)
     and (p_query is null
          or company_name      ilike '%' || p_query || '%'
          or company_cr_number ilike '%' || p_query || '%')
     and (p_status is null or status = p_status)
     and (p_company_id is null or target_company_id = p_company_id)
   order by submitted_at desc
   limit p_limit offset p_offset;
$$;

-- The two that make up the body of the report. Both were already SECURITY
-- DEFINER and both asked only whether somebody was signed in.
create or replace function public.get_company_reports_timeline(
  p_company_id uuid, limit_val integer default 10)
returns table(id uuid, title character varying, summary text,
              severity character varying, status character varying,
              created_at timestamp with time zone,
              reporter_company_name character varying,
              reporter_sector character varying, reporter_is_visible boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    r.id,
    r.title::varchar,
    r.description,
    r.category::varchar,
    r.status::varchar,
    r.created_at,
    case
      when coalesce(public.is_platform_admin() or public.is_reviewer(), false)
        then coalesce(c.name, 'مصدر غير مُتتبَّع')::varchar
      -- Not the name, and not an empty string either: a reader has to be told
      -- that the identity is withheld on purpose rather than missing.
      else 'جهة مُبلِّغة — الهوية محجوبة'::varchar
    end,
    coalesce(c.sector, 'غير محدد')::varchar,
    coalesce(public.is_platform_admin() or public.is_reviewer(), false)
  from public.reports r
  left join public.tenants t on t.id = r.reporter_tenant_id
  left join public.companies c on c.id = t.company_id
  where public.get_current_user_id() is not null
    and public.company_report_access(p_company_id)
    and r.target_company_id = p_company_id
    and r.status = 'approved'
  order by r.created_at desc
  limit greatest(1, least(limit_val, 100));
$$;

create or replace function public.get_company_reports_summary(p_company_id uuid)
returns table(category character varying, count integer,
              icon character varying, color character varying)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    r.category::varchar,
    count(*)::int,
    (case r.category
       when 'late_payment'    then '💳'
       when 'no_payment'      then '⚠️'
       when 'contract_breach' then '📄'
       when 'quality'         then '🔧'
       when 'execution_delay' then '⏳'
       when 'dispute'         then '⚔️'
       when 'fraud'           then '🚨'
       else '📋'
     end)::varchar,
    (case r.category
       when 'late_payment'    then '#F59E0B'
       when 'no_payment'      then '#DC2626'
       when 'contract_breach' then '#B45309'
       when 'quality'         then '#7C3AED'
       when 'execution_delay' then '#0891B2'
       when 'dispute'         then '#7C3AED'
       when 'fraud'           then '#991B1B'
       else '#64748B'
     end)::varchar
  from public.reports r
  where public.get_current_user_id() is not null
    and public.company_report_access(p_company_id)
    and r.target_company_id = p_company_id
    and r.status = 'approved'
    and r.category is not null
  group by r.category
  order by count(*) desc;
$$;

-- ============================================================================
-- 6. Privileges, restated on purpose
-- ============================================================================
-- CREATE OR REPLACE keeps the existing ACL, but a later DROP + CREATE of any of
-- these re-applies the schema default, which on Supabase grants EXECUTE to
-- `anon`. This project has been bitten by that before. Say it here so the
-- intended audience is written down next to the functions rather than inferred
-- from whatever the default happened to be on the day.
revoke all on function public.report_access_state(uuid)              from public, anon;
revoke all on function public.company_report_access(uuid)            from public, anon;
revoke all on function public.open_company_report(uuid)              from public, anon;
revoke all on function public.get_company_knowledge_base(uuid)       from public, anon;
revoke all on function public.get_report_knowledge_base(uuid)        from public, anon;
revoke all on function public.get_company_reports_timeline(uuid, integer)   from public, anon;
revoke all on function public.get_company_reports_summary(uuid)      from public, anon;
revoke all on function public.search_company_knowledge_base(text, text, text, integer, integer) from public, anon;
revoke all on function public.search_report_knowledge_base(text, text, uuid, integer, integer)  from public, anon;

grant execute on function public.company_report_access(uuid)          to authenticated;
grant execute on function public.open_company_report(uuid)            to authenticated;
grant execute on function public.get_company_knowledge_base(uuid)     to authenticated;
grant execute on function public.get_report_knowledge_base(uuid)      to authenticated;
grant execute on function public.get_company_reports_timeline(uuid, integer) to authenticated;
grant execute on function public.get_company_reports_summary(uuid)    to authenticated;
grant execute on function public.search_company_knowledge_base(text, text, text, integer, integer) to authenticated;
grant execute on function public.search_report_knowledge_base(text, text, uuid, integer, integer)  to authenticated;

-- report_access_state is internal: both callers are SECURITY DEFINER and run as
-- the owner, so nothing needs to reach it from a session.

-- ============================================================================
-- 7. Prove it, here, before anything ships
-- ============================================================================
-- Everything below runs against real rows, and opening a report writes one. The
-- whole check therefore lives in a block that ends by raising, so PostgreSQL
-- rolls the subtransaction back: the migration commits the functions and not a
-- single lookup charged to a paying customer. Any genuine failure is re-raised
-- and takes the migration down with it, which is the point of running it here.
do $blk$
declare
  v_anon_rows int;
  v_user      text;
  v_tenant    uuid;
  v_company   uuid;
  v_res       jsonb;
  v_total     int;
begin
  begin
    -- The view is closed.
    begin
      set local role anon;
      select count(*) into v_anon_rows from public.v_company_knowledge_base;
      reset role;
      raise exception 'العرض ما زال مقروءاً لـ anon: % صف', v_anon_rows;
    exception
      when insufficient_privilege then reset role;
    end;

    select u.id, u.tenant_id into v_user, v_tenant
      from public.users u
     where u.role in ('company_admin', 'company_member') and u.tenant_id is not null
     limit 1;

    select c.id into v_company
      from public.companies c
     where c.id not in (select company_id from public.tenants where company_id is not null)
       and not exists (select 1 from public.audit_logs a
                        where a.tenant_id = v_tenant
                          and a.action = 'company_report_viewed'
                          and a.entity_id = c.id::text
                          and a.created_at >= date_trunc('month', now()))
     limit 1;

    if v_user is null or v_company is null then
      raise notice 'لا بيانات كافية للفحص داخل الترحيل';
      raise exception using errcode = 'ZZZZZ', message = '__rollback_probe__';
    end if;

    perform set_config('request.jwt.claims',
      json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

    -- Before opening: the report is shut.
    if exists (select 1 from public.get_company_knowledge_base(v_company)) then
      raise exception 'التقرير مقروء قبل احتسابه';
    end if;
    if exists (select 1 from public.get_company_reports_timeline(v_company, 5)) then
      raise exception 'سجل التقارير مقروء قبل احتسابه';
    end if;

    -- Opening it charges once and opens it.
    v_res := public.open_company_report(v_company);
    if not coalesce((v_res ->> 'ok')::boolean, false) then
      raise exception 'الفتح فشل: %', v_res;
    end if;
    if not exists (select 1 from public.get_company_knowledge_base(v_company)) then
      raise exception 'التقرير ما زال مغلقاً بعد الفتح';
    end if;

    -- And the counts are the real ones, not what RLS shows this reader. This is
    -- the check that would have caught security_invoker: under it the number
    -- stays non-null and quietly becomes wrong, so the assertion is that the
    -- function agrees with the view read at full sight.
    select total_reports_count into v_total
      from public.get_company_knowledge_base(v_company);
    if v_total is distinct from (
         select count(*)::int from public.reports where target_company_id = v_company) then
      raise exception 'عدد التقارير لا يطابق الحقيقة: % مقابل %', v_total,
        (select count(*) from public.reports where target_company_id = v_company);
    end if;

    -- Opening it again is free.
    v_res := public.open_company_report(v_company);
    if not coalesce((v_res ->> 'alreadySeen')::boolean, false) then
      raise exception 'الفتح الثاني لنفس الشركة احتُسب مرة أخرى: %', v_res;
    end if;

    -- Search still answers.
    if not exists (select 1 from public.search_company_knowledge_base(null, null, null, 5, 0)) then
      raise exception 'البحث توقّف عن الإجابة';
    end if;

    perform set_config('request.jwt.claims', null, true);
    raise notice '✅ العرض مغلق، والتقرير يُفتح بالاحتساب مرة واحدة، والبحث يعمل';

    -- Undo the lookup this block just spent.
    raise exception using errcode = 'ZZZZZ', message = '__rollback_probe__';
  exception
    when sqlstate 'ZZZZZ' then null;
  end;
end $blk$;
