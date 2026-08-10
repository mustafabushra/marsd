-- A company file says who, and when
-- ============================================================================
--
-- The documents tab lists the nine types and their states. It does not say who
-- sent each file or when — which is stored, on every row, since the documents
-- work landed, and displayed nowhere.
--
-- `company_document_checklist` is the wrong place to add it: that function
-- answers «what does this company still owe», and the company's own screen
-- reads it too. A reviewer asking «who gave us this» is a different question,
-- and only an administrator may have the answer — a submitter's e-mail is not
-- something to hand to whoever opens a company page.
--
-- Two functions, for the two things the file is missing.

/** Every document a company has sent, with its provenance. */
create or replace function public.admin_company_documents(p_company_id uuid)
returns table (
  id            uuid,
  doc_type      text,
  label         text,
  file_name     text,
  file_url      text,
  status        text,
  uploaded_at   timestamptz,
  uploaded_by   text,
  uploaded_by_tenant text,
  request_id    uuid,
  rejection_reason text,
  versions      int
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
  select d.id,
         d.doc_type::text,
         coalesce((select dt.label from public.company_document_types() dt
                    where dt.doc_type = d.doc_type), d.doc_type)::text,
         d.file_name,
         d.file_url,
         d.status::text,
         d.created_at,
         (select u.email from public.users u where u.id = d.uploaded_by_user_id)::text,
         (select t.name from public.tenants t where t.id = d.uploaded_by_tenant_id)::text,
         d.request_id,
         d.rejection_reason,
         -- How many times this type has been sent. A document on its fourth
         -- upload is a different conversation from one that arrived once.
         (select count(*)::int from public.company_documents h
           where h.company_id = p_company_id and h.doc_type = d.doc_type)
    from public.company_documents d
   where d.company_id = p_company_id
     and d.superseded_at is null
   order by d.created_at desc;
end;
$$;

/**
 * The rest of what a company file should hold.
 *
 * The account and who is in it, the subscription, and every request ever raised
 * about this company — the three things a reviewer currently has to leave the
 * page to find, which is how a company file stops being one.
 */
create or replace function public.admin_company_context(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid;
begin
  if not coalesce(public.is_platform_admin() or public.is_reviewer(), false) then
    raise exception 'هذا الإجراء لإدارة مرصد فقط';
  end if;

  select id into v_tenant from public.tenants where company_id = p_company_id limit 1;

  return jsonb_build_object(
    'tenant', (
      select jsonb_build_object('id', t.id, 'name', t.name, 'email', t.email,
                                'phone', t.phone, 'status', t.status)
        from public.tenants t where t.id = v_tenant
    ),

    'users', coalesce((
      select jsonb_agg(jsonb_build_object(
        'email', u.email, 'role', u.role, 'status', u.status, 'last_login_at', u.last_login_at)
        order by u.created_at)
        from public.users u where u.tenant_id = v_tenant
    ), '[]'::jsonb),

    'subscription', (
      select jsonb_build_object('plan', p.name, 'status', s.status,
                                'period_end', s.current_period_end)
        from public.subscriptions s
        left join public.plans p on p.id = s.plan_id
       where s.tenant_id = v_tenant limit 1
    ),

    -- Every request, open and closed. The history of what has been asked about
    -- this company, which is the part that explains its current state.
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'kind', r.kind, 'status', r.status,
        'submitted_at', r.submitted_at, 'reviewed_at', r.reviewed_at,
        'decision_reason', r.decision_reason)
        order by r.created_at desc)
        from public.company_requests r where r.company_id = p_company_id
    ), '[]'::jsonb),

    'origin', (
      select jsonb_build_object(
        'source', c.source,
        'from_registry', c.government_company_id is not null,
        'snapshot', (select g.snapshot_period from public.government_company_registry g
                      where g.id = c.government_company_id),
        'verified', c.verified,
        'verification_source', c.verification_source)
        from public.companies c where c.id = p_company_id
    )
  );
end;
$$;

revoke all on function public.admin_company_documents(uuid) from anon, public;
revoke all on function public.admin_company_context(uuid) from anon, public;

grant execute on function public.admin_company_documents(uuid) to authenticated;
grant execute on function public.admin_company_context(uuid) to authenticated;
