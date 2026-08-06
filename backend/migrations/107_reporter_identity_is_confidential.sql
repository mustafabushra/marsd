-- Migration: 107_reporter_identity_is_confidential.sql
-- Purpose: the trust report handed every paying company the names of the
--          companies that had reported on it.
--
-- ============================================================================
-- What was wrong
-- ============================================================================
-- `get_company_reports_timeline` is SECURITY DEFINER, is granted to
-- `authenticated`, and returned:
--
--     coalesce(c.name, 'مصدر غير مُتتبَّع')   -- the reporting company's name
--
-- with no check on who was asking. Any signed-in account could open any
-- company's report and read exactly who had filed against it — and could call
-- the RPC directly for the same answer without opening a page at all.
--
-- The same report prints, in its own disclaimer:
--
--     «لا تُعرض أسماء الشركات المبلّغة في أي موضع من هذا التقرير»
--
-- So the page carried a written promise and broke it three panels above.
--
-- ============================================================================
-- Why this is not a display bug
-- ============================================================================
-- A platform whose reporters can be identified by the companies they reported
-- on does not collect honest reports for long. The cost of filing becomes
-- retaliation, and the only reports left are from parties with nothing to lose
-- — which is the opposite of the evidence a trust score needs.
--
-- Fixing it in the browser would have hidden the name from the screen and left
-- the API answering the same question to anyone who asked it. The name has to
-- stop leaving the database.
--
-- ============================================================================
-- What each caller now gets
-- ============================================================================
--   Marsad staff  — the name. They review these reports, they arbitrate
--                   disputes, and detecting a company filing maliciously
--                   against a competitor is impossible without knowing who
--                   filed.
--   everyone else — the reporter's *sector*. It is what the reader actually
--                   needs: whether the evidence comes from one corner of one
--                   market or is spread across several. It identifies nobody.
--
-- `reporter_company_name` keeps its name in the result so the existing front
-- end does not break mid-deployment; what travels in it changes.

-- Adding columns to the result means the signature changes, and Postgres will
-- not replace a function whose return type moved. Dropped first, and the grant
-- re-issued below — DROP + CREATE re-applies Supabase's default privileges,
-- which hands EXECUTE back to roles that must not have it.
drop function if exists public.get_company_reports_timeline(uuid, integer);

create function public.get_company_reports_timeline(
  p_company_id uuid,
  limit_val    integer default 10
)
returns table (
  id           uuid,
  title        varchar,
  summary      text,
  severity     varchar,
  status       varchar,
  created_at   timestamptz,
  reporter_company_name varchar,
  -- New, and the honest name for what non-staff receive. The old column is
  -- kept beside it so a browser that has not reloaded yet keeps working.
  reporter_sector       varchar,
  reporter_is_visible   boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
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
    and r.target_company_id = p_company_id
    and r.status = 'approved'
  order by r.created_at desc
  limit greatest(1, least(limit_val, 100));
$fn$;

revoke all on function public.get_company_reports_timeline(uuid, integer) from public, anon;
grant execute on function public.get_company_reports_timeline(uuid, integer) to authenticated;

comment on function public.get_company_reports_timeline(uuid, integer) is
  'تسلسل التقارير المعتمدة. اسم الجهة المُبلِّغة لا يخرج إلا لفريق مرصد — لغيرهم يُعاد القطاع فقط';

-- ============================================================================
-- Prove the name does not leave for an ordinary caller
-- ============================================================================
do $blk$
declare
  v_company uuid;
  v_user    text;
  v_admin   text;
  v_name    varchar;
  v_sector  varchar;
  v_visible boolean;
  v_n       int;
begin
  select target_company_id into v_company
    from public.reports where status = 'approved' limit 1;
  if v_company is null then raise notice 'لا تقارير معتمدة للفحص'; return; end if;

  select u.id into v_user
    from public.users u where coalesce(u.role, '') not in ('platform_admin', 'reviewer') limit 1;
  select u.id into v_admin
    from public.users u where u.role = 'platform_admin' limit 1;

  -- ---- as a company ------------------------------------------------------
  if v_user is not null then
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

    select count(*) into v_n from public.get_company_reports_timeline(v_company, 10);
    if v_n = 0 then raise exception 'الشركة لا ترى أي تقرير — كُسر العرض'; end if;

    select reporter_company_name, reporter_sector, reporter_is_visible
      into v_name, v_sector, v_visible
      from public.get_company_reports_timeline(v_company, 1);

    if v_visible then raise exception 'الهوية معلَنة لمستخدم عادي'; end if;
    if v_name <> 'جهة مُبلِّغة — الهوية محجوبة' then
      raise exception 'تسرّب اسم الجهة المُبلِّغة: %', v_name;
    end if;
    if v_sector is null then raise exception 'القطاع لم يُعد'; end if;

    -- And no row anywhere in the result carries a real company name.
    if exists (
      select 1 from public.get_company_reports_timeline(v_company, 100) t
        join public.companies c on c.name = t.reporter_company_name) then
      raise exception 'أحد الصفوف يحمل اسم شركة حقيقية';
    end if;
  end if;

  -- ---- as Marsad ---------------------------------------------------------
  if v_admin is not null then
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

    select reporter_is_visible into v_visible
      from public.get_company_reports_timeline(v_company, 1);
    if not coalesce(v_visible, false) then
      raise exception 'فريق مرصد لا يرى الهوية — المراجعة مستحيلة بدونها';
    end if;
  end if;

  perform set_config('request.jwt.claims', null, true);
  raise notice '✅ الاسم لفريق مرصد فقط، والقطاع للجميع، والعرض لم ينكسر';
end $blk$;
