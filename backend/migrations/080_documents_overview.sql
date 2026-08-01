-- Migration: 080_documents_overview.sql
-- Purpose: /admin/documents shows pending documents and nothing else. Marsad
--          cannot see what it has verified, what expired, or what it rejected.
--
-- The screen queries status = 'pending' directly, so a verified document leaves
-- the queue and leaves the platform's view with it. Nobody can answer "which
-- registrations expire this month" or "what did we reject and why" without
-- opening the database.
--
-- Expiry is derived here the same way the company's own checklist derives it, so
-- the two cannot disagree about whether a certificate is still valid.

create or replace function public.documents_overview(p_state text default 'pending')
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare v jsonb;
begin
  if not coalesce(public.is_platform_admin() or public.is_reviewer(), false) then
    return '{}'::jsonb;
  end if;

  with d as (
    select cd.id, cd.company_id, cd.doc_type, cd.file_name, cd.note,
           cd.created_at, cd.verified_at, cd.expires_at, cd.rejection_reason,
           co.name as company_name, co.cr_number,
           (select u.email from public.users u where u.id = cd.verified_by) as reviewer,
           case
             when cd.status = 'pending'                          then 'pending'
             when cd.status = 'rejected'                         then 'rejected'
             when cd.status = 'reupload_required'                then 'reupload_required'
             when cd.status = 'superseded'                       then 'superseded'
             when cd.expires_at is not null
                  and cd.expires_at < current_date               then 'expired'
             when cd.expires_at is not null
                  and cd.expires_at < current_date + 30          then 'expiring'
             else 'verified'
           end as state
      from public.company_documents cd
      join public.companies co on co.id = cd.company_id
     where cd.superseded_at is null
  )
  select jsonb_build_object(
    'counts', (select jsonb_object_agg(state, n) from (
                 select state, count(*) n from d group by state) c),
    'items', coalesce((
       select jsonb_agg(to_jsonb(x) order by x.created_at)
         from (select * from d
                where p_state = 'all' or d.state = p_state
                order by created_at
                limit 300) x), '[]'::jsonb))
  into v;

  return v;
end $fn$;

grant execute on function public.documents_overview(text) to authenticated;
revoke all on function public.documents_overview(text) from public, anon;

do $blk$
declare v_admin text; v jsonb;
begin
  select id into v_admin from public.users where role = 'platform_admin' limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
  v := public.documents_overview('all');
  raise notice 'المستندات: % بند · الحالات %',
    jsonb_array_length(v -> 'items'), v -> 'counts';

  perform set_config('request.jwt.claims', '', true);
  if public.documents_overview('all') <> '{}'::jsonb then
    raise exception 'الدالة تُجيب بلا جلسة';
  end if;
  raise notice '✅ تعمل للإدارة · مغلقة أمام غيرها';
end $blk$;
