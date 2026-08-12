-- Joining a company is not something you do to yourself
-- ============================================================================
--
-- guard_user_privileges carried an exemption for «registering your own first
-- company»: if the caller is updating their own row, and their tenant_id was
-- null, and the new role is company_admin, the update is allowed.
--
-- The intent was right — register_company_for_current_user creates a tenant and
-- must then attach its creator. The condition was not. It tested that the
-- account had *no* company, and never that the company had no *owner*. So any
-- signed-in user without a tenant could send one request:
--
--     update users set tenant_id = <any tenant>, role = 'company_admin'
--                where id = <themselves>
--
-- and become company_admin of a company that already had one — no claim, no
-- approval, no document, no audit entry. Demonstrated against a real tenant
-- before this migration: it succeeded.
--
-- Everything built to prevent exactly that — claim_requests, its reviewer
-- queue, decide_claim_request with its platform.admin check — was reachable
-- around rather than through.
--
-- The fix keeps the legitimate case and removes the rest: you may attach
-- yourself to a company that nobody is attached to. Registration creates the
-- tenant and is its first member, so it still passes. A company with an owner,
-- or with any member at all, refuses — and the way in is the claim, which is
-- reviewed.

create or replace function public.guard_user_privileges()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  caller_id     text := public.get_current_user_id();
  caller_role   text := public.get_current_user_role();
  caller_tenant uuid := public.get_current_tenant_id();
begin
  -- No session: migrations, jobs and SECURITY DEFINER work that runs with no
  -- claim at all.
  if caller_id is null then
    return new;
  end if;

  if caller_role = 'platform_admin' then
    return new;
  end if;

  -- Registering your own first company.
  --
  -- Narrowed: the account must have no company AND the company must have no
  -- members. Attaching yourself to a tenant that already has one is joining
  -- somebody else's company, which is a claim and goes through review.
  if caller_id = new.id
     and old.tenant_id is null
     and new.tenant_id is not null
     and new.role = 'company_admin'
     and coalesce(old.role, '') in ('company_member', 'company_admin', '')
     and not exists (
       select 1 from public.users u
        where u.tenant_id = new.tenant_id and u.id <> new.id)
  then
    return new;
  end if;

  -- Said plainly, because this is the path somebody takes when they mean to
  -- join a company that is already on Marsad.
  if caller_id = new.id
     and old.tenant_id is null
     and new.tenant_id is not null
     and exists (
       select 1 from public.users u
        where u.tenant_id = new.tenant_id and u.id <> new.id)
  then
    raise exception 'هذه الشركة لها حساب بالفعل — قدّم طلب ملكية أو انضمام ليراجعه مسؤولها';
  end if;

  if new.role is distinct from old.role then
    if new.role = 'platform_admin' then
      raise exception 'لا يمكن منح دور platform_admin من التطبيق';
    end if;
    if not (caller_role = 'company_admin'
            and old.tenant_id = caller_tenant
            and new.role in ('company_admin', 'company_member')) then
      raise exception 'تغيير الدور محظور';
    end if;
  end if;

  -- Moving an account between companies is not something an account may do to
  -- itself, and remains refused.
  if new.tenant_id is distinct from old.tenant_id and old.tenant_id is not null then
    raise exception 'لا يمكن نقل الحساب بين الشركات';
  end if;

  return new;
end;
$fn$;
