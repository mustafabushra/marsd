-- Migration: 064_score_context.sql
-- Purpose: the four things a reader needs beside the number, in one call.
--
-- ============================================================================
-- Why each one
-- ============================================================================
-- A score with no reference point is not information. 74 in construction may be
-- better than 80 in trade, and the report gives the reader no way to know that —
-- so the sector average is the first thing here.
--
-- The category breakdown turns a number into a pattern: "60% late payment, 25%
-- contract breach" says what kind of risk this is, not merely how much. category
-- is filled on 50 of 52 approved reports, which is why this is buildable and the
-- six ratings are not — those are filled on 2.
--
-- Reporter diversity answers the question every reader has and nobody has been
-- able to ask: is this one aggrieved counterparty repeating itself, or six
-- separate companies describing the same behaviour? It already earns points in
-- the platform layer; stating it plainly is what makes that layer legible.
--
-- Disputes belong to the company being reported on. A business that has proven
-- reports against it wrong has earned the right to have that visible beside the
-- ones that stood.
--
-- One function rather than four: this is a page load, and four round trips to
-- fill one card is three too many.

create or replace function public.company_score_context(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_sector      text;
  v_score       int;
  v_sector_avg  numeric;
  v_sector_n    int;
  v_categories  jsonb;
  v_n           int;
  v_reporters   int;
  v_disputes    jsonb;
begin
  -- The registry needs an account, and so does its interpretation.
  if public.get_current_user_id() is null then
    return '{}'::jsonb;
  end if;

  select co.sector, ts.score into v_sector, v_score
    from public.companies co
    left join public.trust_scores ts on ts.company_id = co.id
   where co.id = p_company_id;
  if not found then return '{}'::jsonb; end if;

  -- Rated companies only. Averaging in the unrated would drag every sector
  -- toward zero and make the comparison flattering rather than true.
  select round(avg(ts.score)), count(*)
    into v_sector_avg, v_sector_n
    from public.trust_scores ts
    join public.companies co on co.id = ts.company_id
   where co.sector is not distinct from v_sector
     and ts.tier <> 'none'
     and ts.company_id <> p_company_id;

  select count(*), count(distinct reporter_tenant_id)
    into v_n, v_reporters
    from public.reports
   where target_company_id = p_company_id and status = 'approved';

  select coalesce(jsonb_agg(jsonb_build_object('category', category, 'count', n, 'pct', pct)
                            order by n desc), '[]'::jsonb)
    into v_categories
    from (
      select category, count(*) n,
             round(count(*) * 100.0 / nullif(sum(count(*)) over (), 0)) pct
        from public.reports
       where target_company_id = p_company_id
         and status = 'approved' and category is not null
       group by category) x;

  select jsonb_build_object(
           'total',    count(*),
           'upheld',   count(*) filter (where status = 'upheld'),
           'rejected', count(*) filter (where status = 'rejected'),
           'open',     count(*) filter (where status = 'open'))
    into v_disputes
    from public.disputes where company_id = p_company_id;

  return jsonb_build_object(
    'sector',          v_sector,
    'sector_avg',      v_sector_avg,
    'sector_count',    v_sector_n,
    'vs_sector',       case when v_sector_avg is null or v_score is null
                            then null else v_score - v_sector_avg end,
    'categories',      v_categories,
    'approved_reports', v_n,
    'distinct_reporters', v_reporters,
    'disputes',        v_disputes);
end $fn$;

-- Explicit, because the default is EXECUTE to PUBLIC and PUBLIC includes anon —
-- which is how 062 shipped two functions that answered unauthenticated callers.
revoke all on function public.company_score_context(uuid) from public, anon;
grant execute on function public.company_score_context(uuid) to authenticated;

-- ============================================================================
-- Verify: signed in it answers, anonymous it does not
-- ============================================================================
do $blk$
declare
  v_admin text;
  v_co    uuid;
  v jsonb;
begin
  select id into v_admin from public.users where role = 'platform_admin' limit 1;
  select company_id into v_co from public.trust_scores where tier <> 'none' limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
  v := public.company_score_context(v_co);
  if v = '{}'::jsonb then
    raise exception 'الدالة لا تُجيب مستخدماً مسجَّلاً';
  end if;
  raise notice 'قطاع % · متوسطه % من % شركة · % مُبلِّغاً مختلفاً',
    v ->> 'sector', v ->> 'sector_avg', v ->> 'sector_count', v ->> 'distinct_reporters';

  perform set_config('request.jwt.claims', '', true);
  if public.company_score_context(v_co) <> '{}'::jsonb then
    raise exception 'الدالة تُجيب بلا جلسة';
  end if;

  raise notice '✅ سياق المؤشر يعمل للمسجّلين ومغلق أمام المجهول';
end $blk$;
