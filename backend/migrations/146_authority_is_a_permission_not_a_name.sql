-- Authority is a permission, not a name
-- ============================================================================
--
-- Every check in the system asks one of two questions: «is this a platform
-- admin» or «is this a reviewer». Both read a role name. So there are exactly
-- two kinds of staff, and adding a third means editing every function that
-- asks — which is how `reviewer` came to exist in the constraint, be checked
-- by every request function, and still be unable to approve a registration.
--
-- The fix is not more names. It is that the questions stop being about names.
--
--   is_platform_admin()  →  has_permission('platform.admin')
--   is_reviewer()        →  has_permission('work.decide')
--
-- Not one caller changes. The two predicates keep their signatures and their
-- meanings for the roles that exist today, and become one row in a table for
-- every role that comes later.

create table if not exists public.permissions (
  key         text primary key,
  area        text not null,
  label       text not null,
  description text
);

create table if not exists public.role_permissions (
  role           text not null,
  permission_key text not null references public.permissions(key) on delete cascade,
  primary key (role, permission_key)
);

create index if not exists role_permissions_role_idx on public.role_permissions (role);

comment on table public.permissions is
  'مفردات الصلاحيات — ما يمكن فعله، مستقلّاً عمّن يفعله';
comment on table public.role_permissions is
  'أي دور يملك أي صلاحية — إضافة دور صفٌّ هنا، لا تعديل في الدوال';

insert into public.permissions (key, area, label, description) values
  ('platform.admin',        'platform', 'مسؤول المنصة',            'المفتاح الرئيسي — كل ما لم يُفوَّض'),
  ('work.view_all',         'work',     'رؤية كل العمل',            'كل الطلبات والمهامّ، لا المُسنَد فقط'),
  ('work.view_assigned',    'work',     'رؤية عمله',                'غير المُسنَد وما أُسنِد إليه'),
  ('work.assign_self',      'work',     'استلام طلب',               null),
  ('work.assign_others',    'work',     'إسناد لموظّف آخر',          'وفكّ الإسناد'),
  ('work.decide',           'work',     'البتّ في الطلبات',          'قبول · رفض · طلب توضيح'),
  ('documents.verify',      'work',     'تدقيق المستندات',           null),
  ('reports.review',        'reports',  'مراجعة التقارير',           null),
  ('disputes.resolve',      'reports',  'البتّ في الاعتراضات',        null),
  ('companies.view',        'companies','فتح ملفّ الشركة',           'بما فيه بيانات المُرسِلين'),
  ('companies.edit_identity','companies','تعديل هوية الشركة',        'الاسم · رقم السجل · المصدر'),
  ('companies.suspend',     'companies','تعليق شركة',                null),
  ('data.import',           'data',     'تشغيل استيراد',             null),
  ('data.publish',          'data',     'نشر مجموعة سجلّ',           null),
  ('data.rollback',         'data',     'التراجع عن نشر',            null),
  ('billing.manage',        'billing',  'إدارة الاشتراكات والفواتير', null),
  ('users.manage',          'platform', 'إدارة المستخدمين والموظّفين', null),
  ('settings.manage',       'platform', 'تعديل الإعدادات',           null),
  ('audit.view',            'audit',    'قراءة سجلّ التدقيق',         null)
on conflict (key) do update
   set area = excluded.area, label = excluded.label, description = excluded.description;

-- ============================================================================
-- Who holds what
-- ============================================================================
-- `platform_admin` is the super admin and keeps its name: it is written into
-- rows, sessions and dozens of call sites, and renaming it would be a
-- migration about vocabulary rather than about authority.
--
-- Nothing here widens what today's two staff roles can already do. The five
-- new roles have no members yet — they are the shape being made available, not
-- a change to anyone's access.

delete from public.role_permissions where role in
  ('platform_admin', 'manager', 'reviewer', 'compliance', 'data_operator', 'finance', 'support');

insert into public.role_permissions (role, permission_key)
select 'platform_admin', key from public.permissions;

insert into public.role_permissions (role, permission_key) values
  -- A manager runs the floor: sees everything, hands work out, decides.
  ('manager', 'work.view_all'), ('manager', 'work.view_assigned'),
  ('manager', 'work.assign_self'), ('manager', 'work.assign_others'),
  ('manager', 'work.decide'), ('manager', 'documents.verify'),
  ('manager', 'reports.review'), ('manager', 'disputes.resolve'),
  ('manager', 'companies.view'), ('manager', 'audit.view'),

  -- The reviewer as it exists today, unchanged.
  ('reviewer', 'work.view_assigned'), ('reviewer', 'work.assign_self'),
  ('reviewer', 'work.decide'), ('reviewer', 'documents.verify'),
  ('reviewer', 'reports.review'), ('reviewer', 'companies.view'),

  -- Compliance reads the evidence and rules on it. No registration decisions.
  ('compliance', 'work.view_all'), ('compliance', 'documents.verify'),
  ('compliance', 'disputes.resolve'), ('compliance', 'companies.view'),
  ('compliance', 'audit.view'),

  -- The registry, and nothing else.
  ('data_operator', 'data.import'), ('data_operator', 'data.publish'),
  ('data_operator', 'data.rollback'), ('data_operator', 'companies.view'),

  ('finance', 'billing.manage'), ('finance', 'companies.view'),

  -- Support can see, and can do nothing. The workflow for it comes later; the
  -- role exists now so adding that workflow is not another migration through
  -- every function that asks who is calling.
  ('support', 'work.view_all'), ('support', 'companies.view');

alter table public.permissions      enable row level security;
alter table public.role_permissions enable row level security;

drop policy if exists permissions_select on public.permissions;
create policy permissions_select on public.permissions for select to authenticated using (true);

drop policy if exists role_permissions_select on public.role_permissions;
create policy role_permissions_select on public.role_permissions for select to authenticated using (true);

-- ============================================================================
-- The roles a user may hold
-- ============================================================================
-- Widened so the five new ones can be assigned. Nobody holds them yet.

alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check check (role in (
  'company_member', 'company_admin',
  'platform_admin', 'manager', 'reviewer', 'compliance',
  'data_operator', 'finance', 'support'));

-- ============================================================================
-- The question every check now asks
-- ============================================================================

create or replace function public.has_permission(p_key text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1
      from public.role_permissions rp
     where rp.role = public.get_current_user_role()
       and rp.permission_key = p_key
  );
$fn$;

/**
 * The master key.
 *
 * Same signature, same answer for `platform_admin`, and no longer a string
 * comparison against a role name. Every guard, policy and definer function in
 * the system reads through this — which is why it is the one that had to keep
 * behaving exactly as it did.
 */
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select coalesce(public.has_permission('platform.admin'), false);
$fn$;

/**
 * «May decide work.»
 *
 * Was: role in ('reviewer', 'platform_admin'). Now: whoever holds
 * `work.decide`, which is those two plus any role given it later — a manager,
 * for instance, without a line of code changing.
 */
create or replace function public.is_reviewer()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select coalesce(public.has_permission('work.decide'), false);
$fn$;

/** Everything the signed-in user may do, for the screen to read once. */
create or replace function public.my_permissions()
returns table (key text, area text, label text)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select p.key, p.area, p.label
    from public.role_permissions rp
    join public.permissions p on p.key = rp.permission_key
   where rp.role = public.get_current_user_role()
   order by p.area, p.key;
$fn$;

grant execute on function public.has_permission(text) to authenticated;
grant execute on function public.my_permissions() to authenticated;

-- ============================================================================
-- Proof, at migration time
-- ============================================================================
-- The two predicates are load-bearing for every guard in the database. If this
-- rewrite changed what they answer for the roles that exist, the whole thing
-- must not apply.

do $$
declare
  v_admin boolean;
  v_rev   boolean;
begin
  select exists (select 1 from public.role_permissions
                  where role = 'platform_admin' and permission_key = 'platform.admin')
    into v_admin;
  if not v_admin then
    raise exception 'platform_admin فقد صلاحية المنصة — إجهاض';
  end if;

  select exists (select 1 from public.role_permissions
                  where role = 'reviewer' and permission_key = 'work.decide')
    into v_rev;
  if not v_rev then
    raise exception 'reviewer فقد صلاحية البتّ — إجهاض';
  end if;

  if exists (select 1 from public.role_permissions
              where role in ('company_admin', 'company_member')) then
    raise exception 'أدوار الشركات لا تملك صلاحيات موظّفين — إجهاض';
  end if;

  if exists (select 1 from public.role_permissions
              where role <> 'platform_admin' and permission_key = 'platform.admin') then
    raise exception 'المفتاح الرئيسي مُنح لغير مسؤول المنصة — إجهاض';
  end if;
end;
$$;
