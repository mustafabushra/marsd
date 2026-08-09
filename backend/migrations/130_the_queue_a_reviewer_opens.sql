-- The queue a reviewer opens
-- ============================================================================
--
-- Requests are written now and nothing shows them. The first real registration
-- would arrive, sit in `company_requests` with a state, and nobody would know —
-- which is the same failure as before wearing better clothes.
--
-- Two functions: the list, and the one request opened.

/**
 * Everything waiting, newest first, with what a reviewer needs to triage.
 *
 * Open requests before closed ones, because a queue sorted purely by date puts
 * last month's approvals above this morning's arrivals. Within that, oldest
 * first — a request that has waited three days is more urgent than one that
 * arrived a minute ago, and «newest first» is the ordering that quietly loses
 * the person who has been waiting longest.
 */
create or replace function public.admin_request_queue(
  p_status text default null,
  p_limit  int  default 50
)
returns table (
  id              uuid,
  kind            text,
  status          text,
  company_id      uuid,
  company_name    text,
  cr_number       text,
  tenant_name     text,
  requested_by    text,
  submitted_at    timestamptz,
  waiting_days    int,
  documents_total int,
  documents_ready int,
  assigned_to     text,
  last_note       text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not coalesce(public.is_platform_admin() or public.is_reviewer(), false) then
    raise exception 'هذا الإجراء لإدارة مرصد فقط';
  end if;

  return query
  select r.id,
         r.kind,
         r.status,
         r.company_id,
         c.name::text,
         c.cr_number::text,
         t.name::text,
         u.email::text,
         r.submitted_at,
         -- How long somebody has been waiting. The number a queue is really
         -- about, and it is nowhere on the current screens.
         case when r.submitted_at is null then 0
              else greatest(0, (extract(epoch from now() - r.submitted_at) / 86400)::int)
         end,
         (select count(*)::int from public.company_document_types() dt where dt.required),
         (select count(distinct d.doc_type)::int
            from public.company_documents d
           where d.company_id = r.company_id
             and d.status <> 'rejected'
             and d.doc_type in (select dt.doc_type from public.company_document_types() dt where dt.required)),
         au.email::text,
         (select e.note from public.company_request_events e
           where e.request_id = r.id and e.note is not null
           order by e.created_at desc limit 1)
    from public.company_requests r
    join public.companies c on c.id = r.company_id
    left join public.tenants t on t.id = r.tenant_id
    left join public.users u on u.id = r.requested_by
    left join public.users au on au.id = r.assigned_to
   where (p_status is null or r.status = p_status)
   order by
     case when r.status in ('submitted', 'resubmitted') then 0
          when r.status in ('under_review', 'clarification_needed') then 1
          when r.status = 'draft' then 2
          else 3 end,
     r.submitted_at asc nulls last,
     r.created_at asc
   limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

/**
 * How many are waiting in each state.
 *
 * For the badge beside the menu entry. A queue nobody can see the size of from
 * outside is a queue nobody opens.
 */
create or replace function public.admin_request_counts()
returns table (status text, n int)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not coalesce(public.is_platform_admin() or public.is_reviewer(), false) then
    raise exception 'هذا الإجراء لإدارة مرصد فقط';
  end if;

  return query
  select r.status, count(*)::int from public.company_requests r group by r.status;
end;
$$;

/**
 * One request, whole.
 *
 * Everything a decision needs, in one answer: the company as the registry has
 * it, who applied, every document with who sent it and when, the reports filed
 * against the company, its trust score, and the timeline.
 *
 * Assembled here rather than in the browser. The company file already showed
 * what four separate round trips cost — and a reviewer who has to open five
 * screens to decide one thing decides it on fewer facts than they meant to.
 */
create or replace function public.admin_request_detail(p_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  r public.company_requests;
  v jsonb;
begin
  if not coalesce(public.is_platform_admin() or public.is_reviewer(), false) then
    raise exception 'هذا الإجراء لإدارة مرصد فقط';
  end if;

  select * into r from public.company_requests where id = p_request_id;
  if r.id is null then
    raise exception 'الطلب غير موجود';
  end if;

  select jsonb_build_object(
    'request', jsonb_build_object(
      'id', r.id, 'kind', r.kind, 'status', r.status,
      'submitted_at', r.submitted_at, 'reviewed_at', r.reviewed_at,
      'decision_reason', r.decision_reason,
      'assigned_to', (select email from public.users where id = r.assigned_to),
      'requested_by', (select email from public.users where id = r.requested_by)
    ),

    'company', (
      select jsonb_build_object(
        'id', c.id, 'name', c.name, 'cr_number', c.cr_number,
        'unified_number', c.unified_number, 'entity_type', c.entity_type,
        'capital', c.capital, 'region', c.region, 'city', c.city,
        'sector', c.sector, 'official_email', c.official_email, 'phone', c.phone,
        'status', c.status, 'approved', c.approved, 'verified', c.verified,
        -- Where this record came from. A company the Ministry published and one
        -- somebody typed are different claims, and a reviewer deciding between
        -- them should not have to guess which is in front of them.
        'source', c.source,
        'from_registry', c.government_company_id is not null,
        'cr_file_url', c.cr_file_url
      ) from public.companies c where c.id = r.company_id
    ),

    'tenant', (
      select jsonb_build_object('id', t.id, 'name', t.name, 'email', t.email, 'phone', t.phone)
        from public.tenants t where t.id = r.tenant_id
    ),

    -- Who is in the account. A registration is somebody asking for access, and
    -- who they are is part of what is being decided.
    'users', coalesce((
      select jsonb_agg(jsonb_build_object('email', u.email, 'role', u.role, 'status', u.status))
        from public.users u where u.tenant_id = r.tenant_id
    ), '[]'::jsonb),

    -- Every document, with who sent it and when. Stored since the documents
    -- work landed and never shown anywhere.
    'documents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id, 'doc_type', d.doc_type, 'file_name', d.file_name,
        'file_url', d.file_url, 'status', d.status,
        'uploaded_at', d.created_at,
        'uploaded_by', (select email from public.users where id = d.uploaded_by_user_id),
        'uploaded_by_tenant', (select name from public.tenants where id = d.uploaded_by_tenant_id),
        'rejection_reason', d.rejection_reason,
        'label', (select dt.label from public.company_document_types() dt where dt.doc_type = d.doc_type)
      ) order by d.created_at)
        from public.company_documents d
       where d.company_id = r.company_id and d.superseded_at is null
    ), '[]'::jsonb),

    'required_documents', (
      select jsonb_agg(jsonb_build_object('doc_type', dt.doc_type, 'label', dt.label))
        from public.company_document_types() dt where dt.required
    ),

    'reports', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', rp.id, 'title', rp.title, 'category', rp.category,
        'status', rp.status, 'created_at', rp.created_at)
        order by rp.created_at desc)
        from public.reports rp where rp.target_company_id = r.company_id
    ), '[]'::jsonb),

    'trust_score', (
      select jsonb_build_object('score', ts.score, 'tier', ts.tier, 'risk_band', ts.risk_band)
        from public.trust_scores ts where ts.company_id = r.company_id
    ),

    'subscription', (
      select jsonb_build_object('plan', p.name, 'status', s.status, 'period_end', s.current_period_end)
        from public.subscriptions s
        left join public.plans p on p.id = s.plan_id
       where s.tenant_id = r.tenant_id limit 1
    ),

    'timeline', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event', e.event, 'from_status', e.from_status, 'to_status', e.to_status,
        'note', e.note, 'at', e.created_at,
        'actor', (select email from public.users where id = e.actor_id))
        order by e.created_at)
        from public.company_request_events e where e.request_id = r.id
    ), '[]'::jsonb)
  ) into v;

  return v;
end;
$$;

revoke all on function public.admin_request_queue(text, int) from anon, public;
revoke all on function public.admin_request_counts() from anon, public;
revoke all on function public.admin_request_detail(uuid) from anon, public;

grant execute on function public.admin_request_queue(text, int) to authenticated;
grant execute on function public.admin_request_counts() to authenticated;
grant execute on function public.admin_request_detail(uuid) to authenticated;
