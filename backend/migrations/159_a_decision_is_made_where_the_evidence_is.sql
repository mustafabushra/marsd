-- A decision is made where the evidence is
-- ============================================================================
--
-- Approving a registration and granting a verification badge were done by the
-- browser writing to `companies` directly and then inserting its own audit row.
-- Three things follow from that, and all three are why these move into
-- functions before they move into the company file:
--
--   The permission is the screen. Both actions sit behind AdminRoute, which
--   admits platform_admin, and nothing under it checks anything — the UPDATE is
--   held off only by RLS on the table. A guard that lives in a React route is
--   not a guard, it is a preference.
--
--   The audit entry is optional in practice. It is inserted after the update,
--   in its own try, and the approval screen explicitly logs a warning and
--   carries on when it fails. So a company can change state with nobody
--   recorded as having changed it.
--
--   Doing it twice guarantees drift. Putting the same writes in the company
--   file as well would be a second copy of the rules, and the two would part
--   company the first time one of them was corrected.
--
-- So the write, the audit entry and the notification happen together or not at
-- all, in one transaction, behind one permission check.
--
-- ============================================================================
-- On the permission chosen
-- ============================================================================
-- `platform.admin`, because that is what is true today: only platform_admin
-- reaches these screens, and this migration is not the place to widen who may
-- approve a company. The role model is untouched — seven roles, same keys.

-- ============================================================================
-- Registration
-- ============================================================================

create or replace function public.decide_company_registration(
  p_company_id uuid,
  p_approve    boolean,
  p_reason     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  c        public.companies;
  v_me     text := public.get_current_user_id();
  v_status text;
  v_tenant uuid;
begin
  if not coalesce(public.has_permission('platform.admin'), false) then
    raise exception 'قرار التسجيل من صلاحيات إدارة مرصد';
  end if;

  select * into c from public.companies where id = p_company_id for update;
  if c.id is null then raise exception 'الشركة غير موجودة'; end if;

  -- A rejection the company cannot act on is not a decision, it is a dead end.
  if not p_approve and coalesce(btrim(p_reason), '') = '' then
    raise exception 'الرفض يحتاج سبباً يُعرض على الشركة';
  end if;

  v_status := case when p_approve then 'approved' else 'rejected' end;

  update public.companies
     set status = v_status, updated_at = now()
   where id = p_company_id;

  insert into public.audit_logs (actor_id, actor_role, action, entity, entity_id, meta)
  values (v_me, 'platform_admin',
          case when p_approve then 'company_approved' else 'company_rejected' end,
          'company', p_company_id::text,
          jsonb_build_object('status', v_status, 'cr_number', c.cr_number,
                             'reason', nullif(btrim(coalesce(p_reason, '')), '')));

  -- The account is reached through tenants.company_id. `companies` carries no
  -- tenant column of its own — the screens that did this in the browser looked
  -- the tenant up separately and attached it to their own object, which is why
  -- it looked like a field here and is not one.
  select t.id into v_tenant from public.tenants t where t.company_id = p_company_id;

  -- Everyone still active on the account hears it. A company that is told
  -- nothing waits for a decision that has already been made.
  if v_tenant is not null then
    -- The shape notifications actually carries: one jsonb `payload` holding
    -- title, message and whatever else, which is what src/lib/notify.js writes
    -- and what NotificationBell reads.
    insert into public.notifications (user_id, tenant_id, type, payload)
    select u.id, v_tenant,
           case when p_approve then 'company_approved' else 'company_rejected' end,
           jsonb_build_object(
             'title', case when p_approve then 'قُبل تسجيل شركتك' else 'لم يُقبل تسجيل شركتك' end,
             'message', case when p_approve
                             then 'يمكنك الآن استخدام مرصد بالكامل.'
                             else coalesce(nullif(btrim(p_reason), ''), 'راجع بيانات التسجيل.') end,
             'company_id', p_company_id)
      from public.users u
     where u.tenant_id = v_tenant and u.status = 'active';
  end if;

  return jsonb_build_object('ok', true, 'status', v_status);
end;
$fn$;

-- ============================================================================
-- The verification badge
-- ============================================================================

create or replace function public.set_company_verification(
  p_company_id uuid,
  p_verified   boolean,
  p_reason     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  c        public.companies;
  v_me     text := public.get_current_user_id();
  v_tenant uuid;
begin
  if not coalesce(public.has_permission('platform.admin'), false) then
    raise exception 'التوثيق من صلاحيات إدارة مرصد';
  end if;

  select * into c from public.companies where id = p_company_id for update;
  if c.id is null then raise exception 'الشركة غير موجودة'; end if;

  -- Withdrawing a badge a company already carries is visible to everyone who
  -- reads its file, so it is not done silently.
  if not p_verified and coalesce(c.verified, false)
     and coalesce(btrim(p_reason), '') = '' then
    raise exception 'سحب التوثيق يحتاج سبباً';
  end if;

  update public.companies
     set verified = p_verified,
         verified_at = case when p_verified then now() else null end,
         verification_source = case when p_verified then 'marsad_review' else 'rejected' end,
         updated_at = now()
   where id = p_company_id;

  insert into public.audit_logs (actor_id, actor_role, action, entity, entity_id, meta)
  values (v_me, 'platform_admin',
          case when p_verified then 'company_verified' else 'company_verification_withdrawn' end,
          'company', p_company_id::text,
          jsonb_build_object('company_name', c.name, 'cr_number', c.cr_number,
                             'reason', nullif(btrim(coalesce(p_reason, '')), '')));

  select t.id into v_tenant from public.tenants t where t.company_id = p_company_id;

  -- A company added by the community and never claimed has nobody to tell.
  if v_tenant is not null then
    insert into public.notifications (user_id, tenant_id, type, payload)
    select u.id, v_tenant,
           case when p_verified then 'company_verified' else 'company_verification_withdrawn' end,
           jsonb_build_object(
             'title', case when p_verified then 'وُثّقت شركتك' else 'سُحب توثيق شركتك' end,
             'message', case when p_verified
                             then 'تحمل شركتك الآن شارة التوثيق من مرصد.'
                             else coalesce(nullif(btrim(p_reason), ''), 'تواصل مع إدارة مرصد.') end,
             'company_id', p_company_id)
      from public.users u
     where u.tenant_id = v_tenant and u.status = 'active';
  end if;

  return jsonb_build_object('ok', true, 'verified', p_verified);
end;
$fn$;

revoke all on function public.decide_company_registration(uuid, boolean, text) from anon, public;
revoke all on function public.set_company_verification(uuid, boolean, text)     from anon, public;
grant execute on function public.decide_company_registration(uuid, boolean, text) to authenticated;
grant execute on function public.set_company_verification(uuid, boolean, text)     to authenticated;

-- ============================================================================
-- Two notification types that were missing
-- ============================================================================
-- The verification screen sent a withdrawal under the type `company_approved`,
-- because the check constraint allowed nothing better. A notification that says
-- a badge was removed, typed as an approval, is a row that lies to anything
-- reading the type rather than the title — and `type` is what /notifications
-- keys its navigation on.
--
-- Widening a CHECK is additive: no existing row becomes invalid.

alter table public.notifications drop constraint if exists notifications_type_check;

alter table public.notifications add constraint notifications_type_check
  check (type in (
    'report_approved', 'report_rejected', 'report_request_info',
    'company_approved', 'company_rejected', 'company_data_updated',
    'claim_approved', 'claim_rejected', 'subscription_changed',
    'tenant_status_changed', 'credits_awarded', 'welcome',
    'company_registration_submitted', 'claim_request_submitted',
    'report_submitted', 'dispute_raised', 'document_submitted',
    'document_verified', 'document_rejected', 'official_status_recorded',
    'clarification_requested', 'clarification_answered',
    'review_status_changed', 'score_changed', 'watchlist_alert',
    'company_verified', 'company_verification_withdrawn'
  ));
