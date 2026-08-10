-- The old requests move house
-- ============================================================================
--
-- Two registrations sat in `registration_requests` reading `pending` while
-- their companies read `active` — and the new queue, which reads
-- `company_requests`, showed neither of them. The first real registration
-- would have arrived and nobody would have known, which is the failure this
-- whole line of work exists to close.
--
-- They are approved retroactively, by decision, and the timeline says so in
-- words. Pretending a reviewer looked at them would put a lie in the audit
-- trail; leaving them `pending` would put two live companies back in a queue
-- they have long since left.
--
-- Idempotent: a company that already has a request is skipped, so re-running
-- this cannot duplicate a journey.
--
-- Nothing is deleted. `registration_requests` keeps its rows and its history;
-- it is only closed and, from here, no longer written to by anything new.

do $$
declare
  r         record;
  v_request uuid;
  v_moved   int := 0;
  v_note    constant text :=
    'اعتماد بأثر رجعي عند ترحيل نموذج الحالة — لم تُراجَع يدوياً';
begin
  for r in
    select rr.id, rr.company_id, rr.tenant_id, rr.user_id, rr.created_at, rr.status,
           co.name, co.status as company_status
      from public.registration_requests rr
      join public.companies co on co.id = rr.company_id
     where not exists (
       select 1 from public.company_requests cr
        where cr.company_id = rr.company_id and cr.kind = 'registration'
     )
  loop
    -- The company's own state decides the outcome. A company that is live was
    -- accepted, whatever the abandoned row beside it says.
    insert into public.company_requests
      (company_id, tenant_id, requested_by, kind, status,
       submitted_at, reviewed_at, decision_reason, created_at, updated_at)
    values (
      r.company_id, r.tenant_id, r.user_id, 'registration',
      case when r.company_status in ('active', 'approved') then 'approved'
           when r.company_status = 'rejected' then 'rejected'
           else 'submitted' end,
      r.created_at,
      case when r.company_status in ('active', 'approved', 'rejected') then now() end,
      case when r.company_status in ('active', 'approved', 'rejected') then v_note end,
      r.created_at, now()
    )
    returning id into v_request;

    -- The journey as it actually happened, at the times it happened. The
    -- decision carries no actor because there was none.
    insert into public.company_request_events
      (request_id, actor_id, event, from_status, to_status, note, created_at)
    values (v_request, r.user_id, 'created', null, 'draft', null, r.created_at),
           (v_request, r.user_id, 'submitted', 'draft', 'submitted', null, r.created_at);

    if r.company_status in ('active', 'approved', 'rejected') then
      insert into public.company_request_events
        (request_id, actor_id, event, from_status, to_status, note, created_at)
      values (v_request, null,
              case when r.company_status = 'rejected' then 'rejected' else 'approved' end,
              'submitted',
              case when r.company_status = 'rejected' then 'rejected' else 'approved' end,
              v_note, now());
    end if;

    update public.registration_requests
       set status = case when r.company_status in ('active', 'approved') then 'approved'
                         when r.company_status = 'rejected' then 'rejected'
                         else status end,
           reviewed_at = coalesce(reviewed_at, now()),
           updated_at = now()
     where id = r.id;

    v_moved := v_moved + 1;
    raise notice 'رُحّل: % (%)', r.name, r.company_status;
  end loop;

  raise notice 'المرحَّل: % طلباً', v_moved;
end;
$$;

-- ============================================================================
-- The dead synonym
-- ============================================================================
-- `companies.status` allows both 'approved' and 'active' and they mean the same
-- thing. Nothing reads 'approved' as distinct, so it is a value that can only
-- ever cause a mismatch between two places that check for one of them.
--
-- No rows carry it today. Normalising now, while the count is zero, is what
-- keeps it zero.

update public.companies set status = 'active' where status = 'approved';

do $$
declare
  v_left int;
  v_orphan int;
begin
  select count(*)::int into v_left from public.companies where status = 'approved';
  if v_left > 0 then
    raise exception 'بقيت % شركة بحالة approved', v_left;
  end if;

  -- Every registration in the old table must now have a counterpart. This is
  -- the check that would have caught the double-write on the day it started.
  select count(*)::int into v_orphan
    from public.registration_requests rr
   where not exists (select 1 from public.company_requests cr
                      where cr.company_id = rr.company_id and cr.kind = 'registration');
  if v_orphan > 0 then
    raise exception 'بقي % طلب تسجيل بلا نظير في company_requests', v_orphan;
  end if;
end;
$$;
