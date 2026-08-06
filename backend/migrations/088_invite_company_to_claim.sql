-- Migration: 088_invite_company_to_claim.sql
-- Purpose: Marsad has no way to reach out to a company. Claiming a record can
--          only ever start from the company's side.
--
-- ============================================================================
-- The hole this closes
-- ============================================================================
-- 087 stopped the panel from filing document requests against companies nobody
-- owns — 28 of 31 — because the request was created, the file frozen, and the
-- notification silently skipped. Refusing was right, but it left the obvious
-- question unanswered: then how does a company ever come to own its record?
--
-- Today, only by finding Marsad itself, signing up, and asking. There is no
-- "invite this company". So for a registry built mostly by bulk import, the
-- documents can never be requested at all.
--
-- ============================================================================
-- Why this creates the tenant now rather than at sign-up
-- ============================================================================
-- AuthCallback already knows how to finish this: a new user whose email matches
-- a pending_invites row is attached to the inviting tenant and lands on their
-- company's dashboard. That path works and is exercised by the seat-invite flow.
--
-- So the invitation creates the tenant up front, unclaimed and empty, and writes
-- an ordinary pending_invites row against it. Nothing in the authentication flow
-- changes — the person who accepts is simply the first member of a tenant that
-- was waiting for them.
--
-- The cost is that "a tenant exists" stops meaning "somebody is there". That is
-- exactly the condition 087 checked, so it is tightened below to what was always
-- meant: at least one active human to receive the message.

-- ============================================================================
-- 1) The invitation
-- ============================================================================
create or replace function public.invite_company(
  p_company_id uuid,
  p_email      text,
  p_note       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_co      public.companies%rowtype;
  v_email   text := lower(trim(coalesce(p_email, '')));
  v_tenant  uuid;
  v_members int;
  v_invite  uuid;
begin
  if not coalesce(public.is_platform_admin(), false) then
    return jsonb_build_object('ok', false, 'reason', 'دعوة الشركات من صلاحيات إدارة مرصد');
  end if;

  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-zA-Z]{2,}$' then
    return jsonb_build_object('ok', false, 'reason', 'صيغة البريد غير صحيحة');
  end if;

  select * into v_co from public.companies where id = p_company_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'الشركة غير موجودة');
  end if;
  if not v_co.approved then
    return jsonb_build_object('ok', false, 'reason', 'السجل غير معتمد بعد — يُعتمد أولاً');
  end if;

  select t.id into v_tenant from public.tenants t where t.company_id = p_company_id limit 1;

  if v_tenant is not null then
    select count(*) into v_members
      from public.users u where u.tenant_id = v_tenant and u.status = 'active';
    if v_members > 0 then
      return jsonb_build_object('ok', false, 'reason', 'الشركة استلمت سجلّها بالفعل');
    end if;
  else
    -- tenants.cr_number and tenants.email are both unique and not null. Say which
    -- one is taken rather than letting a constraint name reach the screen.
    if exists (select 1 from public.tenants t where t.cr_number = v_co.cr_number) then
      return jsonb_build_object('ok', false, 'reason',
        'السجل التجاري مستخدم في حساب شركة آخر — يُراجَع التكرار أولاً');
    end if;
    if exists (select 1 from public.tenants t where lower(t.email) = v_email) then
      return jsonb_build_object('ok', false, 'reason', 'هذا البريد مستخدم في حساب شركة آخر');
    end if;

    -- The same shape company onboarding creates, so a company that arrives this
    -- way is indistinguishable from one that signed up on its own.
    insert into public.tenants (name, cr_number, email, phone, sector, city, company_id, status)
    values (v_co.name, v_co.cr_number, v_email, v_co.phone, v_co.sector, v_co.city,
            p_company_id, 'active')
    returning id into v_tenant;
  end if;

  if exists (select 1 from public.users u where lower(u.email) = v_email) then
    return jsonb_build_object('ok', false, 'reason', 'هذا البريد مسجّل لمستخدم آخر في مرصد');
  end if;

  -- Re-inviting the same address refreshes the existing row instead of leaving
  -- two live invitations for one mailbox.
  select id into v_invite
    from public.pending_invites
   where tenant_id = v_tenant and lower(email) = v_email and status = 'pending'
   limit 1;

  if v_invite is null then
    insert into public.pending_invites (tenant_id, email, role, invited_by, status, expires_at)
    values (v_tenant, v_email, 'company_admin', public.get_current_user_id(),
            'pending', now() + interval '7 days')
    returning id into v_invite;
  else
    update public.pending_invites
       set expires_at = now() + interval '7 days', invited_by = public.get_current_user_id()
     where id = v_invite;
  end if;

  -- A record we now have an address for is no longer unreachable. Only filled if
  -- empty: an invitation is not a correction of the official contact.
  if v_co.official_email is null then
    perform set_config('marsad.change_reason',
      'استُكمل البريد الرسمي من دعوة استلام السجل', true);
    update public.companies set official_email = v_email where id = p_company_id;
    perform set_config('marsad.change_reason', '', true);
  end if;

  insert into public.company_audit_log (company_id, action, actor_id, change_reason, new_values, created_at)
  values (p_company_id, 'claim_invited', public.get_current_user_id(),
          coalesce(nullif(trim(coalesce(p_note, '')), ''), 'دعوة الشركة لاستلام سجلّها'),
          jsonb_build_object('email', v_email, 'tenant_id', v_tenant, 'invite_id', v_invite),
          now());

  -- tenant_id is what the mail endpoint puts in the invitation's public_metadata,
  -- and what AuthCallback reads back when the person signs up.
  return jsonb_build_object('ok', true, 'tenant_id', v_tenant, 'invite_id', v_invite, 'email', v_email);
end $fn$;

grant execute on function public.invite_company(uuid, text, text) to authenticated;
revoke all on function public.invite_company(uuid, text, text) from public, anon;

-- ============================================================================
-- 2) "Someone owns it" has to mean "someone is there"
-- ============================================================================
-- 087 refused a clarification request when no tenant held the record. Now a
-- tenant can exist with nobody in it — an invitation that has not been accepted
-- — and notifyTenant fans out to a tenant's active users, so it would write zero
-- notifications and return 0 without complaining. Same silence, new cause.
create or replace function public.request_clarification(
  p_company_id uuid,
  p_reason     text,
  p_details    text default null,
  p_type       text default 'information',
  p_documents  text[] default null,
  p_due_days   integer default 14
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_id      uuid;
  v_owner   uuid;
  v_members int;
begin
  if not coalesce(public.is_platform_admin() or public.is_reviewer(), false) then
    return jsonb_build_object('ok', false, 'reason', 'طلب التوضيح لإدارة مرصد فقط');
  end if;
  if coalesce(trim(p_reason), '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'سبب طلب التوضيح مطلوب');
  end if;

  select t.id into v_owner from public.tenants t where t.company_id = p_company_id limit 1;
  if v_owner is null then
    return jsonb_build_object('ok', false, 'reason',
      'لا أحد يملك هذا السجل — ادعُ الشركة لاستلامه أولاً، فالطلب لا يصل لأحد.');
  end if;

  select count(*) into v_members
    from public.users u where u.tenant_id = v_owner and u.status = 'active';
  if v_members = 0 then
    return jsonb_build_object('ok', false, 'reason',
      'الدعوة أُرسلت ولم تُقبل بعد — لا يوجد من يستلم الطلب حتى الآن.');
  end if;

  insert into public.clarification_requests
    (company_id, request_type, reason, details, documents_requested, due_at, requested_by)
  values
    (p_company_id, p_type, trim(p_reason), nullif(trim(coalesce(p_details, '')), ''),
     p_documents,
     case when p_due_days > 0 then now() + (p_due_days || ' days')::interval end,
     public.get_current_user_id())
  returning id into v_id;

  insert into public.clarification_messages (request_id, body)
  values (v_id, trim(p_reason) || coalesce(E'\n' || nullif(trim(coalesce(p_details, '')), ''), ''));

  -- The file stops here. This is the point of the whole request.
  update public.companies
     set review_status = case when p_type = 'documents'
                              then 'awaiting_documents' else 'clarification_needed' end,
         review_reason = trim(p_reason)
   where id = p_company_id;

  return jsonb_build_object('ok', true, 'request_id', v_id, 'tenant_id', v_owner);
end $fn$;

-- ============================================================================
-- 3) The roster tells apart "claimed", "invited" and "nobody"
-- ============================================================================
-- Without this, an invited company reads as claimed the moment the tenant row
-- exists, and the panel would stop chasing a company that has not answered.
drop function if exists public.company_roster();

create function public.company_roster()
returns table (
  company_id uuid, name text, cr_number text, sector text, city text,
  source text, approved boolean, verified boolean,
  review_status text, review_reason text, review_at timestamptz, review_by text,
  official_status text, completeness integer,
  docs_verified integer, docs_pending integer,
  open_clarifications integer, reports_about integer, trust_score integer,
  registrar text, claimed_by text,
  last_action text, last_action_at timestamptz, last_action_by text,
  created_at timestamptz,
  status text, status_reason text, status_at timestamptz, status_by text,
  quality_issues text[],
  invite_status text, invited_email text, invited_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select
    co.id,
    co.name::text,
    co.cr_number::text,
    co.sector::text,
    co.city::text,
    co.source::text,
    co.approved,
    coalesce(co.verified, false),
    coalesce(co.review_status, 'approved')::text,
    co.review_reason,
    co.review_status_at,
    (select u.email from public.users u where u.id = co.review_status_by)::text,
    coalesce(co.official_status, 'none')::text,
    -- The same eight fields the platform layer of the trust score counts, so the
    -- number here and the number in the report cannot disagree.
    (round((
        (co.sector is not null)::int + (co.city is not null)::int
      + (co.main_activity is not null)::int + (co.entity_type is not null)::int
      + (co.phone is not null)::int + (co.official_email is not null)::int
      + (co.website is not null)::int
      + (coalesce(co.founding_date::text, co.founded_year::text) is not null)::int
    ) * 100.0 / 8))::int,
    (select count(*)::int from public.company_documents d
      where d.company_id = co.id and d.status = 'verified'),
    (select count(*)::int from public.company_documents d
      where d.company_id = co.id and d.status = 'pending'),
    (select count(*)::int from public.clarification_requests r
      where r.company_id = co.id and r.status = 'open'),
    (select count(*)::int from public.reports r
      where r.target_company_id = co.id and r.status = 'approved'),
    (select ts.score from public.trust_scores ts where ts.company_id = co.id),
    -- Who put this company in the registry. companies carries no submitter, so
    -- it is the audit entry written when it was filed — the same derivation the
    -- approval queue and the credit award both use.
    (select t.name from public.audit_logs al
       join public.tenants t on t.id = al.tenant_id
      where al.action = 'company_add_requested' and al.entity_id = co.id::text
      order by al.created_at asc limit 1)::text,
    -- Owned means a person is in it. A tenant created by an invitation that was
    -- never accepted is not an owner, and reporting it as one would take the
    -- company off every list that chases it.
    (select t.name from public.tenants t
      where t.company_id = co.id
        and exists (select 1 from public.users u where u.tenant_id = t.id and u.status = 'active')
      limit 1)::text,
    (select l.action from public.company_audit_log l
      where l.company_id = co.id order by l.created_at desc limit 1)::text,
    (select l.created_at from public.company_audit_log l
      where l.company_id = co.id order by l.created_at desc limit 1),
    (select u.email from public.company_audit_log l
       left join public.users u on u.id = l.actor_id
      where l.company_id = co.id order by l.created_at desc limit 1)::text,
    co.created_at,
    coalesce(co.status, 'active')::text,
    co.status_reason,
    co.status_at,
    (select u.email from public.users u where u.id = co.status_by)::text,
    -- Correctness, not completeness. Exact-name duplicates only: the fuzzy pass
    -- is expensive and lives in company_duplicates, which is opened on purpose.
    (array_remove(array[
      case when co.cr_number !~ '^[0-9]{10}$' then 'cr_format' end,
      case when exists (select 1 from public.companies x
                         where x.id <> co.id and lower(trim(x.name)) = lower(trim(co.name)))
           then 'duplicate_name' end,
      case when co.approved and co.sector is null then 'no_sector' end,
      case when co.approved
            and not exists (select 1 from public.tenants t where t.company_id = co.id)
            and co.official_email is null and co.phone is null and co.website is null
           then 'unreachable' end
    ], null))::text[],
    -- accepted · pending · expired · none
    (select case
       when exists (select 1 from public.users u where u.tenant_id = t.id and u.status = 'active')
         then 'accepted'
       when i.id is null           then 'none'
       when i.expires_at < now()   then 'expired'
       else 'pending'
     end
     from public.tenants t
     left join lateral (
       select p.id, p.expires_at from public.pending_invites p
        where p.tenant_id = t.id and p.status = 'pending'
        order by p.created_at desc limit 1) i on true
     where t.company_id = co.id limit 1)::text,
    (select p.email from public.tenants t
       join public.pending_invites p on p.tenant_id = t.id and p.status = 'pending'
      where t.company_id = co.id order by p.created_at desc limit 1)::text,
    (select p.created_at from public.tenants t
       join public.pending_invites p on p.tenant_id = t.id and p.status = 'pending'
      where t.company_id = co.id order by p.created_at desc limit 1)
  from public.companies co
  where coalesce(public.is_platform_admin() or public.is_reviewer(), false)
  order by
    -- What needs attention first: open questions, then pending documents, then
    -- anything not yet approved, then the rest by age.
    (select count(*) from public.clarification_requests r
      where r.company_id = co.id and r.status = 'open') desc,
    (select count(*) from public.company_documents d
      where d.company_id = co.id and d.status = 'pending') desc,
    (co.review_status = 'approved'),
    co.created_at desc;
$fn$;

grant execute on function public.company_roster() to authenticated;
revoke all on function public.company_roster() from public, anon;

-- ============================================================================
-- Prove the whole sequence on a real record, then undo it
-- ============================================================================
do $blk$
declare
  v_admin text; v_co uuid; v_res jsonb; v_clar jsonb; v_row record;
begin
  select id into v_admin from public.users where role = 'platform_admin' limit 1;
  select c.id into v_co from public.companies c
   where c.approved and not exists (select 1 from public.tenants t where t.company_id = c.id)
   limit 1;
  if v_co is null then raise notice 'لا سجل بلا مالك للفحص'; return; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);

  -- Bad address is refused before anything is created.
  v_res := public.invite_company(v_co, 'ليس بريدا', null);
  if (v_res->>'ok')::boolean then raise exception 'قُبل بريد غير صالح'; end if;

  v_res := public.invite_company(v_co, 'probe-088@example.com', 'فحص المهاجرة 088');
  if not (v_res->>'ok')::boolean then
    raise exception 'فشلت الدعوة: %', v_res->>'reason';
  end if;

  -- The tenant exists but nobody is in it, so the company is invited, not owned,
  -- and cannot yet be asked for documents.
  select claimed_by, invite_status, invited_email into v_row
    from public.company_roster() where company_id = v_co;
  if v_row.claimed_by is not null then
    raise exception 'سجل مدعوّ ظهر كأنه مُستلَم';
  end if;
  if v_row.invite_status <> 'pending' or v_row.invited_email <> 'probe-088@example.com' then
    raise exception 'حالة الدعوة غير صحيحة: %', v_row.invite_status;
  end if;

  v_clar := public.request_clarification(v_co, 'مستندات', null, 'documents', null, 14);
  if (v_clar->>'ok')::boolean then
    raise exception 'قُبل طلب مستندات ولا أحد استلم الدعوة';
  end if;

  -- The address is now on the record, so it is no longer unreachable.
  select quality_issues into v_row from public.company_roster() where company_id = v_co;
  if 'unreachable' = any (v_row.quality_issues) then
    raise exception 'بقي السجل موسوماً بلا سبيل للتواصل بعد الدعوة';
  end if;

  -- Inviting again refreshes rather than duplicates.
  v_res := public.invite_company(v_co, 'probe-088@example.com', null);
  if not (v_res->>'ok')::boolean then raise exception 'فشلت إعادة الدعوة'; end if;
  if (select count(*) from public.pending_invites p
       join public.tenants t on t.id = p.tenant_id
      where t.company_id = v_co and p.status = 'pending') <> 1 then
    raise exception 'إعادة الدعوة أنشأت دعوة ثانية';
  end if;

  raise notice '✅ الدعوة تُنشئ الجهة، والمطالبة تنتظر من يستلمها';
end $blk$;

-- Undo everything the check created: the invite, the empty tenant, and the
-- email it filled in.
delete from public.pending_invites where email = 'probe-088@example.com';
delete from public.tenants t
 where t.email = 'probe-088@example.com'
   and not exists (select 1 from public.users u where u.tenant_id = t.id);
update public.companies set official_email = null
 where official_email = 'probe-088@example.com';
delete from public.company_audit_log
 where action = 'claim_invited' and new_values->>'email' = 'probe-088@example.com';

do $blk$
begin
  if exists (select 1 from public.tenants where email = 'probe-088@example.com')
     or exists (select 1 from public.pending_invites where email = 'probe-088@example.com') then
    raise exception 'بقيت آثار من فحص الدعوة';
  end if;
  raise notice '✅ لم يبقَ أثر من الفحص';
end $blk$;
