-- Migration: 037_plan_upgrades.sql
-- Purpose: let a company actually buy a bigger plan.
--
-- Marsad has four plans priced 0 / 1,499 / 4,999 / 9,999 and no way for anyone
-- to move between them. /subscription listed what each plan allows and offered
-- no button; /admin/payments showed invented transactions. So the paid tiers
-- existed as numbers on a page and as nothing else, and a company that hit its
-- limit and wanted to pay had nowhere to press.
--
-- There is no payment gateway, and inventing one is not this migration's job.
-- What works today is what most B2B software in the Kingdom starts with: the
-- company requests the plan, pays by transfer, and Marsad activates it. Every
-- part of that is real — a request that exists, an invoice with VAT on it, a
-- subscription that changes — and none of it pretends money moved through the
-- platform.
--
-- When a gateway is added, it replaces the middle step. The request, the
-- invoice and the activation stay.
--
-- Idempotent.

-- ============================================================================
-- 1) Billing settings the operator owns
-- ============================================================================
-- VAT is 15% today and has been 5% in living memory. Bank details change. Both
-- belong in settings rather than in a literal somewhere in the code.

insert into public.system_settings (key, value, description)
values (
  'billing_settings',
  jsonb_build_object(
    'vat_percent', 15,
    'currency', 'SAR',
    'payment_window_days', 7,
    'bank_name', '',
    'account_name', '',
    'iban', '',
    'instructions', 'حوّل المبلغ على الحساب أعلاه ثم أرسل صورة الإيصال، وسيُفعَّل اشتراكك خلال يوم عمل.'
  ),
  'إعدادات الفوترة: الضريبة، الحساب البنكي، ومهلة السداد — تُقرأ عند إنشاء كل فاتورة'
)
on conflict (key) do nothing;

-- ============================================================================
-- 2) The request
-- ============================================================================

create table if not exists public.plan_change_requests (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  requested_by       text not null,
  current_plan_id    uuid references public.plans(id),
  requested_plan_id  uuid not null references public.plans(id),
  status             varchar(20) not null default 'pending'
                       check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  note               text,
  admin_note         text,
  resolved_by        text,
  resolved_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.plan_change_requests is
  'طلب شركة لتغيير باقتها. التفعيل من إدارة مرصد بعد تأكيد السداد.';

-- One open request per company. A second is the same conversation, and a queue
-- with three requests from one company is a queue nobody trusts.
drop index if exists plan_change_one_open;
create unique index plan_change_one_open
  on public.plan_change_requests (tenant_id)
  where status = 'pending';

create index if not exists plan_change_status_idx
  on public.plan_change_requests (status, created_at desc);

-- ============================================================================
-- 3) Who may ask, and for what
-- ============================================================================

create or replace function public.guard_plan_change_request()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_active boolean;
  v_same   boolean;
begin
  if public.get_current_user_id() is null then
    return new;
  end if;

  select active into v_active from public.plans where id = new.requested_plan_id;
  if not coalesce(v_active, false) then
    raise exception 'هذه الباقة غير متاحة حالياً';
  end if;

  -- Asking for the plan you already have is not a request, it is a mistake, and
  -- letting it into the queue costs someone a review.
  select exists (
    select 1 from public.subscriptions s
     where s.tenant_id = new.tenant_id and s.status = 'active' and s.plan_id = new.requested_plan_id
  ) into v_same;
  if v_same then
    raise exception 'أنت على هذه الباقة بالفعل';
  end if;

  new.requested_by := public.get_current_user_id();
  new.current_plan_id := (
    select s.plan_id from public.subscriptions s
     where s.tenant_id = new.tenant_id and s.status = 'active'
     order by s.created_at desc limit 1);
  new.status := 'pending';
  new.admin_note := null;
  new.resolved_by := null;
  new.resolved_at := null;
  return new;
end;
$$;

drop trigger if exists plan_change_insert_guard on public.plan_change_requests;
create trigger plan_change_insert_guard
  before insert on public.plan_change_requests
  for each row execute function public.guard_plan_change_request();

alter table public.plan_change_requests enable row level security;

drop policy if exists plan_change_select on public.plan_change_requests;
create policy plan_change_select on public.plan_change_requests
  for select to authenticated
  using (tenant_id = public.get_current_tenant_id() or public.is_platform_admin());

drop policy if exists plan_change_insert on public.plan_change_requests;
create policy plan_change_insert on public.plan_change_requests
  for insert to authenticated
  with check (tenant_id = public.get_current_tenant_id() and public.is_tenant_admin());

-- A company may cancel its own pending request. Everything else is Marsad's.
drop policy if exists plan_change_update on public.plan_change_requests;
create policy plan_change_update on public.plan_change_requests
  for update to authenticated
  using (public.is_platform_admin()
         or (tenant_id = public.get_current_tenant_id() and public.is_tenant_admin() and status = 'pending'))
  with check (public.is_platform_admin()
         or (tenant_id = public.get_current_tenant_id() and public.is_tenant_admin()));

create or replace function public.guard_plan_change_update()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if public.get_current_user_id() is null or public.is_platform_admin() then
    new.updated_at := now();
    return new;
  end if;
  if new.status is distinct from old.status and new.status <> 'cancelled' then
    raise exception 'تفعيل الباقة من إدارة مرصد بعد تأكيد السداد';
  end if;
  if new.requested_plan_id is distinct from old.requested_plan_id then
    raise exception 'لا يمكن تغيير الباقة المطلوبة — ألغِ الطلب وقدّم غيره';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists plan_change_update_guard on public.plan_change_requests;
create trigger plan_change_update_guard
  before update on public.plan_change_requests
  for each row execute function public.guard_plan_change_update();

-- ============================================================================
-- 4) Activating it
-- ============================================================================
-- The subscription change and the invoice are one act. Two client calls leave a
-- company on a plan it has no invoice for, or holding an invoice for a plan it
-- was never moved to — and the second is the one that produces an argument
-- about money.

create or replace function public.approve_plan_change(
  p_request_id uuid,
  p_months integer default 1,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r            record;
  v_plan       record;
  v_billing    jsonb;
  v_vat_pct    numeric;
  v_window     int;
  v_sub_id     uuid;
  v_amount     numeric;
  v_vat        numeric;
  v_invoice_id uuid;
  v_start      timestamptz;
  v_end        timestamptz;
begin
  if not public.is_platform_admin() and public.get_current_user_id() is not null then
    raise exception 'تفعيل الباقات لإدارة مرصد فقط';
  end if;

  if coalesce(p_months, 0) < 1 then
    raise exception 'المدة يجب أن تكون شهراً واحداً على الأقل';
  end if;

  select * into r from public.plan_change_requests where id = p_request_id for update;
  if not found then raise exception 'الطلب غير موجود'; end if;
  if r.status <> 'pending' then raise exception 'سبق البتّ في هذا الطلب'; end if;

  select * into v_plan from public.plans where id = r.requested_plan_id;

  select value into v_billing from public.system_settings where key = 'billing_settings';
  v_vat_pct := coalesce((v_billing ->> 'vat_percent')::numeric, 15);
  v_window  := coalesce((v_billing ->> 'payment_window_days')::int, 7);

  -- Extend rather than restart: a company upgrading with three weeks left on
  -- its current term should not lose them for paying more.
  select s.id, s.current_period_end into v_sub_id, v_start
    from public.subscriptions s
   where s.tenant_id = r.tenant_id and s.status = 'active'
   order by s.created_at desc limit 1;

  if v_start is null or v_start < now() then v_start := now(); end if;
  v_end := v_start + (p_months || ' months')::interval;

  if v_sub_id is null then
    insert into public.subscriptions (tenant_id, plan_id, status, current_period_start, current_period_end)
    values (r.tenant_id, r.requested_plan_id, 'active', now(), v_end)
    returning id into v_sub_id;
  else
    update public.subscriptions
       set plan_id = r.requested_plan_id,
           status = 'active',
           current_period_start = now(),
           current_period_end = v_end,
           updated_at = now()
     where id = v_sub_id;
  end if;

  v_amount := coalesce(v_plan.price_monthly, 0) * p_months;
  v_vat    := round(v_amount * v_vat_pct / 100.0, 2);

  -- A free plan has nothing to invoice. Writing a zero invoice would put a row
  -- in the billing history that never corresponded to a payment.
  if v_amount > 0 then
    insert into public.invoices (subscription_id, amount, vat, status, issued_at, due_at, paid_at)
    values (v_sub_id, v_amount, v_vat, 'paid', now(), now() + (v_window || ' days')::interval, now())
    returning id into v_invoice_id;
  end if;

  update public.plan_change_requests
     set status = 'approved',
         admin_note = p_note,
         resolved_by = public.get_current_user_id(),
         resolved_at = now(),
         updated_at = now()
   where id = p_request_id;

  return jsonb_build_object(
    'request_id', r.id,
    'tenant_id', r.tenant_id,
    'plan_name', v_plan.name,
    'plan_id', v_plan.id,
    'months', p_months,
    'amount', v_amount,
    'vat', v_vat,
    'total', v_amount + v_vat,
    'period_end', v_end,
    'invoice_id', v_invoice_id
  );
end;
$$;

revoke all on function public.approve_plan_change(uuid, integer, text) from public;
grant execute on function public.approve_plan_change(uuid, integer, text) to authenticated, service_role;

-- ============================================================================
-- 5) A tenant's billing history, without opening invoices to everyone
-- ============================================================================
-- invoices is keyed on subscription_id, so reading a company's own invoices
-- means joining through subscriptions — which the RLS on invoices does not
-- currently allow at all.

create or replace function public.tenant_invoices(p_tenant_id uuid default null)
returns table (
  id uuid, amount numeric, vat numeric, total numeric,
  status text, issued_at timestamptz, due_at timestamptz, paid_at timestamptz,
  plan_name text, tenant_name text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select i.id, i.amount, i.vat, i.amount + coalesce(i.vat, 0),
         i.status::text, i.issued_at, i.due_at, i.paid_at,
         p.name::text, t.name::text
    from public.invoices i
    join public.subscriptions s on s.id = i.subscription_id
    join public.tenants t on t.id = s.tenant_id
    left join public.plans p on p.id = s.plan_id
   where (
     -- A platform admin passing nothing sees every invoice; passing a tenant
     -- narrows it. A company sees only its own, whatever it passes.
     (public.is_platform_admin() and (p_tenant_id is null or s.tenant_id = p_tenant_id))
     or s.tenant_id = public.get_current_tenant_id()
   )
   order by i.issued_at desc nulls last
$$;

revoke all on function public.tenant_invoices(uuid) from public;
grant execute on function public.tenant_invoices(uuid) to authenticated, service_role;

-- ============================================================================
-- 6) Realtime
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and tablename = 'plan_change_requests') then
    alter publication supabase_realtime add table public.plan_change_requests;
  end if;
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and tablename = 'invoices') then
    alter publication supabase_realtime add table public.invoices;
  end if;
end $$;
alter table public.plan_change_requests replica identity full;

do $$
begin
  raise notice 'plan_change_requests: جاهز — الطلب من الشركة، والتفعيل من مرصد';
end $$;
