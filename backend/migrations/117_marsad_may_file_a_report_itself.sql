-- Marsad may file a report itself
-- ============================================================================
--
-- Reports arrive from tenants. Marsad's own staff have no tenant — that is what
-- makes them staff — and `reports_insert_policy` requires
-- `reporter_tenant_id = get_current_tenant_id()`, so an administrator could not
-- record a report at all. Anything Marsad learned directly had nowhere to go.
--
-- ============================================================================
-- Why a function and not a policy
-- ============================================================================
-- The other way was to widen the insert policy to admit platform admins. That
-- would let an administrator write any `reporter_tenant_id` they liked —
-- including some real company's — and the row would be indistinguishable from
-- one that company filed. A report is testimony; who gave it is the whole of
-- its weight.
--
-- So the reporter is not a parameter. The function resolves it to the Marsad
-- tenant and nothing else can be passed in its place.
--
-- ============================================================================
-- It goes to the queue, not straight in
-- ============================================================================
-- Status is `pending_review`, like every other report. An administrator can
-- approve it a second later in /admin/reports — the point is not the delay, it
-- is that there stays exactly one door into an approved report. A second path
-- that skips review is a path that will one day be taken by accident.
--
-- BR-05 applies unchanged: `prevent_duplicate_reports_trigger` fires on this
-- insert like any other, so Marsad cannot report the same company twice inside
-- ninety days either.

-- ============================================================================
-- The platform's own tenant
-- ============================================================================
-- There is already a tenant called «مرصد». It is a customer's company account
-- that happens to carry that name, with a company_id and a real owner — using
-- it would have filed Marsad's reports in a paying customer's name. The probe
-- caught it, because the function refuses any tenant that has a company.
--
-- So the platform gets one of its own, identified by a reserved registration
-- number rather than by its display name. A name is editable from the admin
-- panel; the day somebody renames it, a lookup by name would silently start
-- resolving to nothing — or worse, to somebody else.
insert into public.tenants (name, cr_number, email, status, company_id)
select 'مرصد — المنصّة', 'MARSAD-PLATFORM', 'platform@marsad.sa', 'active', null
 where not exists (
   select 1 from public.tenants where cr_number = 'MARSAD-PLATFORM'
 );

create or replace function public.admin_create_report(
  p_target_company_id uuid,
  p_category          text,
  p_title             text,
  p_description       text,
  p_dealt_at          timestamptz,
  p_payment_commitment text default null,
  p_delay_days        int     default null,
  p_defaulted         boolean default false,
  p_deal_value        numeric default null,
  p_relationship_type text    default null,
  p_detail_codes      text[]  default null,
  p_notes             text    default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_marsad uuid;
  v_report uuid;
begin
  if not coalesce(public.is_platform_admin(), false) then
    raise exception 'هذا الإجراء لإدارة مرصد فقط';
  end if;

  -- The platform's own tenant. Resolved, never supplied: a caller who could
  -- name the reporter could file testimony in somebody else's name. Found by
  -- its reserved registration number, and required to have no company — a
  -- tenant with a company is somebody's account, not the platform.
  select id into v_marsad
    from public.tenants
   where cr_number = 'MARSAD-PLATFORM' and company_id is null
   limit 1;

  if v_marsad is null then
    raise exception 'لا يوجد مستأجر لمرصد — تعذّر تسجيل التقرير';
  end if;

  if p_target_company_id is null then
    raise exception 'الشركة المُبلَّغ عنها مطلوبة';
  end if;

  -- Marsad reporting on a company that is Marsad would be a company reporting
  -- on itself, which the product forbids everywhere else.
  if exists (select 1 from public.tenants t
              where t.id = v_marsad and t.company_id = p_target_company_id) then
    raise exception 'لا يمكن تقديم تقرير عن مرصد نفسها';
  end if;

  insert into public.reports (
    reporter_tenant_id, target_company_id, status,
    category, title, description, dealt_at,
    payment_commitment, delay_days, defaulted, deal_value,
    relationship_type, detail_codes, notes,
    declaration_accepted, declaration_accepted_at, submitted_at
  ) values (
    v_marsad, p_target_company_id, 'pending_review',
    p_category, p_title, p_description, coalesce(p_dealt_at, now()),
    p_payment_commitment, p_delay_days, coalesce(p_defaulted, false), p_deal_value,
    p_relationship_type, p_detail_codes, p_notes,
    -- The declaration is the reporter's, and here the reporter is Marsad. An
    -- administrator recording what the platform itself established is making
    -- that statement on its behalf, so it is recorded rather than left null and
    -- looking like an unsigned report.
    true, now(), now()
  )
  returning id into v_report;

  -- Who actually pressed the button. The row says Marsad filed it; the log says
  -- which member of staff, which is the question asked when a report is
  -- disputed.
  insert into public.audit_logs (tenant_id, actor_id, action, entity, entity_id, meta, created_at)
  values (v_marsad, public.get_current_user_id(), 'admin_report_created', 'report',
          v_report::text,
          jsonb_build_object('target_company_id', p_target_company_id, 'category', p_category),
          now());

  return v_report;
end;
$$;

revoke all on function public.admin_create_report(uuid, text, text, text, timestamptz, text, int, boolean, numeric, text, text[], text) from anon, public;
grant execute on function public.admin_create_report(uuid, text, text, text, timestamptz, text, int, boolean, numeric, text, text[], text) to authenticated;
