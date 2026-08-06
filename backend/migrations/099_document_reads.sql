-- Migration: 099_document_reads.sql
-- Purpose: reading a document with a model costs money on every call, and the
--          browser decides when to call it.
--
-- ============================================================================
-- What needs a ceiling
-- ============================================================================
-- /api/extract-document sends a company's certificate to Claude and gets back
-- structured fields. It is the only feature in Marsad with a per-use external
-- cost, and the thing that triggers it is a file picker — a person who uploads
-- the wrong file five times has spent five reads, and a script pointed at the
-- endpoint could spend thousands.
--
-- Authenticating the caller is not a limit; it only says who is spending. The
-- limit goes where the count is, and the count has to be in one place that
-- every caller passes through — otherwise two browser tabs each see a quota of
-- one and spend two.
--
-- Every attempt is recorded, not just the allowed ones: a person hitting the
-- ceiling repeatedly is the signal that the ceiling is wrong, and that signal
-- is invisible if refusals are not written down.

create table if not exists public.document_reads (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null references public.users(id) on delete cascade,
  tenant_id   uuid references public.tenants(id) on delete set null,
  doc_type    text not null,
  allowed     boolean not null,
  reason      text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_document_reads_user_day
  on public.document_reads (user_id, created_at desc);

comment on table public.document_reads is
  'كل محاولة قراءة مستند بالذكاء الاصطناعي — المسموح والمرفوض معاً، لأن تكرار الرفض هو ما يكشف أن الحد خاطئ';

alter table public.document_reads enable row level security;

drop policy if exists document_reads_select on public.document_reads;
create policy document_reads_select on public.document_reads
  for select using (
    user_id = public.get_current_user_id()
    or tenant_id = public.get_current_tenant_id()
    or coalesce(public.is_platform_admin(), false)
  );

-- Written only by claim_document_read, which is SECURITY DEFINER. No insert
-- policy exists, so a browser cannot forge a record of a read it did not make —
-- nor erase one it did.

-- ============================================================================
-- The limits, as data
-- ============================================================================
insert into public.system_settings (key, value)
values ('document_ai', jsonb_build_object(
  'per_user_daily',   40,
  'per_tenant_daily', 120,
  'enabled',          true
))
on conflict (key) do nothing;

-- ============================================================================
-- Claim one read
-- ============================================================================
-- Counts and records in the same statement. Checking the count and then writing
-- the row as two steps lets two concurrent requests both read 39 and both
-- proceed — the ceiling would be advisory, which on a paid API is the same as
-- no ceiling. An advisory lock per user serialises the pair.
create or replace function public.claim_document_read(
  p_user_id  text,
  p_doc_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_cfg       jsonb;
  v_tenant    uuid;
  v_user_cap  int;
  v_tenant_cap int;
  v_user_used int;
  v_tenant_used int;
  v_reason    text;
begin
  select value into v_cfg from public.system_settings where key = 'document_ai';

  if not coalesce((v_cfg ->> 'enabled')::boolean, true) then
    insert into public.document_reads (user_id, doc_type, allowed, reason)
    values (p_user_id, p_doc_type, false, 'disabled');
    return jsonb_build_object('ok', false, 'reason',
      'قراءة المستندات موقوفة مؤقتاً — استخدم المسح بالـQR أو الإدخال اليدوي');
  end if;

  select tenant_id into v_tenant from public.users where id = p_user_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'المستخدم غير معروف');
  end if;

  -- Serialised per user for the read-then-write below. Transaction-scoped, so
  -- it is released whether this commits or raises.
  perform pg_advisory_xact_lock(hashtext('document_read:' || p_user_id));

  v_user_cap   := coalesce((v_cfg ->> 'per_user_daily')::int, 40);
  v_tenant_cap := coalesce((v_cfg ->> 'per_tenant_daily')::int, 120);

  select count(*) into v_user_used
    from public.document_reads
   where user_id = p_user_id and allowed
     and created_at >= now() - interval '24 hours';

  if v_tenant is not null then
    select count(*) into v_tenant_used
      from public.document_reads
     where tenant_id = v_tenant and allowed
       and created_at >= now() - interval '24 hours';
  else
    v_tenant_used := 0;
  end if;

  if v_user_used >= v_user_cap then
    v_reason := format('بلغت حد قراءة المستندات اليومي (%s) — أعد المحاولة غداً أو أدخل البيانات يدوياً', v_user_cap);
  elsif v_tenant is not null and v_tenant_used >= v_tenant_cap then
    v_reason := format('بلغت شركتكم حد قراءة المستندات اليومي (%s)', v_tenant_cap);
  end if;

  if v_reason is not null then
    insert into public.document_reads (user_id, tenant_id, doc_type, allowed, reason)
    values (p_user_id, v_tenant, p_doc_type, false, v_reason);
    return jsonb_build_object('ok', false, 'reason', v_reason);
  end if;

  insert into public.document_reads (user_id, tenant_id, doc_type, allowed)
  values (p_user_id, v_tenant, p_doc_type, true);

  return jsonb_build_object(
    'ok', true,
    'remaining', greatest(0, v_user_cap - v_user_used - 1));
end $fn$;

-- Only the service role calls this — the endpoint holds the key, and a browser
-- that could claim its own reads could also claim someone else's.
revoke all on function public.claim_document_read(text, text) from public, anon, authenticated;

-- ============================================================================
-- Prove the ceiling actually stops at the ceiling
-- ============================================================================
do $blk$
declare
  v_user text; v_res jsonb; v_n int; v_cap int := 5;
begin
  select id into v_user from public.users where tenant_id is not null limit 1;
  if v_user is null then raise notice 'لا مستخدم للفحص'; return; end if;

  -- A low cap for the duration of the check, so the loop below is short.
  update public.system_settings
     set value = jsonb_set(value, '{per_user_daily}', to_jsonb(v_cap))
   where key = 'document_ai';

  for i in 1..v_cap loop
    v_res := public.claim_document_read(v_user, 'commercial_registration');
    if not (v_res->>'ok')::boolean then
      raise exception 'رُفضت القراءة رقم % وهي ضمن الحد: %', i, v_res->>'reason';
    end if;
  end loop;

  -- The one past the ceiling.
  v_res := public.claim_document_read(v_user, 'commercial_registration');
  if (v_res->>'ok')::boolean then
    raise exception 'تجاوز الحد ومرّ';
  end if;

  -- And the refusal is recorded, not just returned.
  select count(*) into v_n from public.document_reads
   where user_id = v_user and not allowed;
  if v_n < 1 then
    raise exception 'الرفض لم يُسجَّل — لن نعرف أن الحد ضيّق';
  end if;

  -- Turning the feature off refuses everything, whatever the count says.
  update public.system_settings
     set value = jsonb_set(value, '{enabled}', 'false'::jsonb)
   where key = 'document_ai';
  v_res := public.claim_document_read(v_user, 'commercial_registration');
  if (v_res->>'ok')::boolean then
    raise exception 'الميزة موقوفة ومع ذلك سُمح بالقراءة';
  end if;

  raise notice '✅ الحد يقف عند الحد، والرفض يُسجَّل، والإيقاف يعمل';
end $blk$;

-- Undo everything the check wrote, and restore the shipped limits.
delete from public.document_reads;

update public.system_settings
   set value = jsonb_build_object(
     'per_user_daily', 40, 'per_tenant_daily', 120, 'enabled', true)
 where key = 'document_ai';

do $blk$
declare v_n int;
begin
  select count(*) into v_n from public.document_reads;
  if v_n > 0 then raise exception 'بقيت % سجلات من الفحص', v_n; end if;

  select (value ->> 'per_user_daily')::int into v_n
    from public.system_settings where key = 'document_ai';
  if v_n <> 40 then raise exception 'لم تُستعد الحدود'; end if;

  raise notice '✅ لم يبقَ أثر';
end $blk$;
