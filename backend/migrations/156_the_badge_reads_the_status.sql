-- The badge reads the status
-- ============================================================================
--
-- The company file badge read `review_status`, with `|| REVIEW.approved` behind
-- it. A company whose registration is still new displayed «معتمدة» — the
-- deprecated column saying yes on behalf of a column that says pending.
--
-- The function did not return `companies.status` at all, so the screen had
-- nothing truthful to read. It does now.

CREATE OR REPLACE FUNCTION public.company_review_file(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare co record; v jsonb;
begin
  if not coalesce(public.is_platform_admin() or public.is_reviewer(), false)
     and p_company_id is distinct from (select company_id from public.tenants
                                         where id = public.get_current_tenant_id()) then
    return '{}'::jsonb;
  end if;

  select * into co from public.companies where id = p_company_id;
  if not found then return '{}'::jsonb; end if;

  return jsonb_build_object(
    'company_id',    co.id,
    'name',          co.name,
    'status', co.status,
    'status_reason', co.status_reason,
    'source', co.source,
    'review_status', co.review_status,
    'review_reason', co.review_reason,
    'review_at',     co.review_status_at,
    'review_by',     (select email from public.users where id = co.review_status_by),
    'clarifications', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'type', r.request_type, 'reason', r.reason,
               'details', r.details, 'documents', r.documents_requested,
               'due_at', r.due_at, 'status', r.status, 'requested_at', r.requested_at,
               'messages', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'body', m.body, 'from_marsad', m.from_marsad, 'at', m.created_at)
                        order by m.created_at)
                   from public.clarification_messages m where m.request_id = r.id), '[]'::jsonb))
             order by r.requested_at desc)
        from public.clarification_requests r where r.company_id = p_company_id), '[]'::jsonb),
    -- The timeline the brief asks for: what happened, who did it, when.
    'timeline', coalesce((
      select jsonb_agg(jsonb_build_object(
               'action', l.action, 'at', l.created_at, 'reason', l.change_reason,
               'actor', (select email from public.users where id = l.actor_id),
               'from', l.old_values ->> 'review_status',
               'to',   l.new_values ->> 'review_status')
             order by l.created_at desc)
        from (select * from public.company_audit_log
               where company_id = p_company_id
               order by created_at desc limit 50) l), '[]'::jsonb));
end $function$
;
