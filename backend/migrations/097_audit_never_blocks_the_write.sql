-- Migration: 097_audit_never_blocks_the_write.sql
-- Purpose: the company audit trigger can refuse the write it is auditing.
--
-- ============================================================================
-- What 085 introduced
-- ============================================================================
-- company_audit_log.actor_id has a foreign key to users. It was NULL in every
-- row because log_company_change never set it — which was the accountability
-- hole 085 closed by writing get_current_user_id() into it.
--
-- get_current_user_id() reads the `sub` claim from the session token. Nothing
-- guarantees that subject has a row in users: a Clerk session exists from the
-- moment somebody authenticates, and the users row is written afterwards by
-- /auth/callback. Any company insert in that window now fails — not with a
-- message about companies, but with
--
--   violates foreign key constraint "company_audit_log_actor_id_fkey"
--
-- and the insert it was recording is rolled back with it.
--
-- A probe caught it while checking that registration still worked after 096 made
-- the commercial registration document mandatory. Two changes a week apart, and
-- the failure only appears where they meet.
--
-- ============================================================================
-- The rule
-- ============================================================================
-- An audit trail records what happened. It does not get to decide what is
-- allowed to happen — a log that can veto the operation it observes has stopped
-- being a log. So an actor the users table does not know is recorded as unknown,
-- exactly as it was before 085, and everything else about the entry is still
-- written: the reason, the old values, the new values, the timestamp.
--
-- Real users are the overwhelming case and are still named. This only decides
-- what to do about the ones that cannot be.

create or replace function public.log_company_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_actor text;
begin
  -- Named only if the users table can vouch for them; the foreign key would
  -- otherwise reject the row and take the company write down with it.
  select u.id into v_actor
    from public.users u where u.id = public.get_current_user_id();

  insert into public.company_audit_log (
    company_id, action, actor_id, change_reason, old_values, new_values, created_at
  ) values (
    new.id,
    case
      when tg_op = 'INSERT'                                   then 'created'
      when new.status   is distinct from old.status           then 'status_changed'
      when new.approved is distinct from old.approved
        then (case when new.approved then 'approved' else 'unapproved' end)
      else 'updated'
    end,
    v_actor,
    nullif(current_setting('marsad.change_reason', true), ''),
    case when tg_op = 'UPDATE' then row_to_json(old) else null end,
    row_to_json(new),
    current_timestamp
  );
  return new;
end $fn$;

-- ============================================================================
-- Prove both halves: still attributed, and no longer fatal
-- ============================================================================
do $blk$
declare
  v_admin text; v_id uuid; v_actor text; v_n int;
  v_cr text := '97' || lpad((floor(random() * 100000000))::text, 8, '0');
begin
  select id into v_admin from public.users where role = 'platform_admin' limit 1;

  -- 1) A known actor is still named — 085's whole point must survive the fix.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
  insert into public.companies (name, cr_number, approved, source)
  values ('شركة فحص 097', v_cr, false, 'community') returning id into v_id;

  select actor_id into v_actor from public.company_audit_log
   where company_id = v_id order by created_at desc limit 1;
  if v_actor is distinct from v_admin then
    raise exception 'الفاعل المعروف لم يُسجَّل: %', coalesce(v_actor, 'فارغ');
  end if;

  delete from public.company_documents where company_id = v_id;
  delete from public.companies where id = v_id;

  -- 2) A subject with no users row no longer kills the write.
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'probe_097_unknown_subject')::text, true);
  insert into public.companies (name, cr_number, approved, source)
  values ('شركة فحص 097 مجهول', '97' || lpad((floor(random() * 100000000))::text, 8, '0'),
          false, 'community')
  returning id into v_id;

  if v_id is null then
    raise exception 'فشلت الإضافة بسبب سجل التدقيق';
  end if;

  select count(*) into v_n from public.company_audit_log where company_id = v_id;
  if v_n <> 1 then
    raise exception 'لم يُكتب سجل تدقيق للإضافة';
  end if;

  select actor_id into v_actor from public.company_audit_log where company_id = v_id;
  if v_actor is not null then
    raise exception 'سُجّل فاعل غير موجود في جدول المستخدمين';
  end if;

  delete from public.company_documents where company_id = v_id;
  delete from public.companies where id = v_id;

  perform set_config('request.jwt.claims', '', true);
  raise notice '✅ المعروف يُنسب، والمجهول لا يُسقط العملية';
end $blk$;

do $blk$
declare v_n int;
begin
  select count(*) into v_n from public.companies where name like 'شركة فحص 097%';
  if v_n > 0 then raise exception 'بقيت % شركة من الفحص', v_n; end if;
  raise notice '✅ لم يبقَ أثر';
end $blk$;
