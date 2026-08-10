-- The queue shows who, and by when
-- ============================================================================
--
-- The queue could say a request had waited three days. It could not say whether
-- anybody had picked it up, who, or whether three days was late — and «4/4
-- مستند» meant four had arrived, not that four had been read, which is now the
-- difference between a request a reviewer can decide and one they cannot.

-- The return type gains columns, and Postgres will not replace a function's
-- signature in place. Dropped and recreated in the same transaction, so no
-- window exists where the queue has no function behind it.
drop function if exists public.admin_request_queue(text, int);

create function public.admin_request_queue(
  p_status text default null,
  p_limit  int  default 50
)
returns table (
  id                 uuid,
  kind               text,
  status             text,
  company_id         uuid,
  company_name       text,
  cr_number          text,
  tenant_name        text,
  requested_by       text,
  submitted_at       timestamptz,
  waiting_days       int,
  documents_total    int,
  documents_ready    int,
  documents_verified int,
  assigned_to        text,
  assigned_to_email  text,
  assigned_at        timestamptz,
  response_due_at    timestamptz,
  resolution_due_at  timestamptz,
  sla_state          text,
  ready_to_decide    boolean,
  last_note          text
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
         case when r.submitted_at is null then 0
              else greatest(0, (extract(epoch from now() - r.submitted_at) / 86400)::int)
         end,
         (select count(*)::int from public.company_document_types() dt where dt.required),
         (select count(distinct d.doc_type)::int
            from public.company_documents d
           where d.company_id = r.company_id
             and d.superseded_at is null
             and d.status <> 'rejected'
             and d.doc_type in (select dt.doc_type from public.company_document_types() dt where dt.required)),
         -- Arrived is not read. This column is the one a decision depends on.
         (select count(distinct d.doc_type)::int
            from public.company_documents d
           where d.company_id = r.company_id
             and d.superseded_at is null
             and d.status = 'verified'
             and d.doc_type in (select dt.doc_type from public.company_document_types() dt where dt.required)),
         r.assigned_to,
         au.email::text,
         r.assigned_at,
         r.response_due_at,
         r.resolution_due_at,
         -- One word for how this request stands against its promise. Ordered so
         -- the worst true thing wins: a request waiting on the company is not
         -- late even if its resolution date has passed, because the clock is
         -- stopped and the delay is not ours.
         case
           when r.status in ('approved', 'rejected', 'withdrawn') then 'closed'
           when r.status = 'clarification_needed'                 then 'paused'
           when r.assigned_at is null
            and r.response_due_at is not null
            and now() > r.response_due_at                         then 'late_response'
           when r.resolution_due_at is not null
            and now() > r.resolution_due_at                       then 'late_resolution'
           when r.resolution_due_at is not null
            and now() > r.resolution_due_at - interval '24 hours' then 'due_soon'
           when r.status = 'draft'                                then 'draft'
           else 'ok'
         end::text,
         -- Cheap enough to compute per row, and it turns the queue into a list
         -- a reviewer can triage: these can be decided now, those cannot.
         (r.kind not in ('registration', 'claim')
          or (
            (select count(distinct d.doc_type)
               from public.company_documents d
              where d.company_id = r.company_id and d.superseded_at is null
                and d.status = 'verified'
                and d.doc_type in (select dt.doc_type from public.company_document_types() dt where dt.required))
            = (select count(*) from public.company_document_types() dt where dt.required)
          ))
         and r.status in ('submitted', 'under_review', 'resubmitted'),
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
 * One request, whole — now with who holds it, and what it is still waiting for.
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
      'withdraw_reason', r.withdraw_reason,
      'assigned_to', (select email from public.users where id = r.assigned_to),
      'assigned_to_id', r.assigned_to,
      'assigned_at', r.assigned_at,
      'response_due_at', r.response_due_at,
      'resolution_due_at', r.resolution_due_at,
      'paused_total', r.paused_total::text,
      'requested_by', (select email from public.users where id = r.requested_by)
    ),

    -- The five conditions, so the screen can show them before the button
    -- rather than after the refusal.
    'readiness', public.company_request_readiness(p_request_id),

    'company', (
      select jsonb_build_object(
        'id', c.id, 'name', c.name, 'cr_number', c.cr_number,
        'unified_number', c.unified_number, 'entity_type', c.entity_type,
        'capital', c.capital, 'region', c.region, 'city', c.city,
        'sector', c.sector, 'official_email', c.official_email, 'phone', c.phone,
        'status', c.status, 'verified', c.verified,
        'official_status', coalesce(c.official_status, 'none'),
        'cr_status', c.cr_status,
        'source', c.source,
        'from_registry', c.government_company_id is not null,
        'cr_file_url', c.cr_file_url
      ) from public.companies c where c.id = r.company_id
    ),

    'tenant', (
      select jsonb_build_object('id', t.id, 'name', t.name, 'email', t.email, 'phone', t.phone)
        from public.tenants t where t.id = r.tenant_id
    ),

    'users', coalesce((
      select jsonb_agg(jsonb_build_object('email', u.email, 'role', u.role, 'status', u.status))
        from public.users u where u.tenant_id = r.tenant_id
    ), '[]'::jsonb),

    'documents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id, 'doc_type', d.doc_type, 'file_name', d.file_name,
        'file_url', d.file_url, 'status', d.status,
        'uploaded_at', d.created_at,
        'uploaded_by', (select email from public.users where id = d.uploaded_by_user_id),
        'uploaded_by_tenant', (select name from public.tenants where id = d.uploaded_by_tenant_id),
        'rejection_reason', d.rejection_reason,
        'required', exists (select 1 from public.company_document_types() dt
                             where dt.doc_type = d.doc_type and dt.required),
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

    -- Arabic on the way out of the database, so no screen has to keep its own
    -- copy of the vocabulary and no screen can print `created` at a person.
    'timeline', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event', e.event,
        'ar', coalesce(et.ar, e.event),
        'en', coalesce(et.en, e.event),
        'actor_type', et.actor_type,
        'from_status', e.from_status, 'to_status', e.to_status,
        'note', e.note, 'at', e.created_at,
        'actor', (select email from public.users where id = e.actor_id))
        order by e.created_at)
        from public.company_request_events e
        left join public.request_event_types() et on et.event = e.event
       where e.request_id = r.id
    ), '[]'::jsonb)
  ) into v;

  return v;
end;
$$;

revoke all on function public.admin_request_queue(text, int) from anon, public;
revoke all on function public.admin_request_detail(uuid) from anon, public;
grant execute on function public.admin_request_queue(text, int) to authenticated;
grant execute on function public.admin_request_detail(uuid) to authenticated;
