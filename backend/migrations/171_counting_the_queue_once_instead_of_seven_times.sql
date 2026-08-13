-- Migration: 171_counting_the_queue_once_instead_of_seven_times.sql
--
-- عدّ الطابور كان يبني الطابور سبع مرات، وشارات القائمة كانت تُنزّل السجلّ
-- كلّه لتقرأ رقمين.
--
-- ============================================================================
-- admin_work_counts
-- ============================================================================
-- الدالة تُرجع سبعة أعداد، وكل واحد كان استدعاءً مستقلاً لـ admin_work_items —
-- وهي اتحادٌ فوق company_requests و reports و disputes و company_documents مع
-- فحص صلاحية لكل مصدر. أي أن نداءً واحداً يبني الطابور كاملاً سبع مرات ثم
-- يعدّ.
--
-- ولا يُستدعى مرة في اليوم: AdminShell يستدعيه في كل تنقّل لتحديث الشارات.
--
-- الطابور يُبنى الآن مرة واحدة في CTE وتُشتقّ منه ستة أعداد. و«mine» وحده
-- يبقى نداءً ثانياً: تصفيته تحتاج assigned_to، وهو عمود تستعمله
-- admin_work_items داخلياً ولا تُرجعه. اشتقاقه بمقارنة البريد كان سيبدّل
-- شرطاً مضموناً بآخر يعتمد على تفرّد البريد — ونداءان أصدق من سبعة بشرط
-- أضعف.
--
-- النتيجة نفسها بالضبط: نفس المفاتيح، ونفس دلالة كل عدّ، ونفس الاستثناء عند
-- غياب الصلاحية.

create or replace function public.admin_work_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v jsonb;
begin
  if not coalesce(public.has_permission('work.view_all')
                  or public.has_permission('work.view_assigned'), false) then
    raise exception 'مركز العمل يحتاج صلاحية';
  end if;

  with w as (
    select * from public.admin_work_items('all', null, 500)
  )
  select jsonb_build_object(
    'all',          (select count(*) from w),
    'mine',         (select count(*) from public.admin_work_items('mine', null, 500)),
    -- نفس شروط p_scope داخل admin_work_items، مطبَّقة على الصفوف المبنيّة.
    'unassigned',   (select count(*) from w where assignee is null and assignable),
    'late',         (select count(*) from w where sla_state in ('late_response', 'late_resolution')),
    'waiting_them', (select count(*) from w where sla_state = 'paused'),
    'by_kind',      (select jsonb_object_agg(kind, n)
                       from (select kind, count(*) n from w group by kind) k),
    'by_priority',  (select jsonb_object_agg(priority, n)
                       from (select priority, count(*) n from w group by priority) p)
  ) into v;

  return v;
end;
$fn$;

revoke all on function public.admin_work_counts() from anon, public;
grant execute on function public.admin_work_counts() to authenticated;

-- ============================================================================
-- شارات القائمة الجانبية
-- ============================================================================
-- AdminShell كان يستدعي company_roster() ليقرأ رقمين: كم شركة غير مطالب بها،
-- وكم شركة مؤشر ثقتها متدنٍّ. والدالة تُرجع السجلّ كاملاً بلا ترقيم — ثمانمئة
-- وثمانية وخمسون بايتاً للصفّ الواحد، أي ثمانية ميغابايت عند عشرة آلاف شركة
-- وعشرون عند أربعة وعشرين ألفاً. في كل تنقّل.
--
-- عدّان يُحسبان في القاعدة ويعودان في jsonb لا يتجاوز عشرات البايتات، مهما
-- كبر السجلّ.
--
-- والتعريف يطابق ما تحسبه الواجهة اليوم حرفياً: الشركات المعتمدة وحدها،
-- و«متدنٍّ» يعني درجة محتسَبة أقل من خمسين — الصفر يعني «لم تُصنَّف» لا
-- «ثقتها صفر»، لأن أرضية الـ clamp خمسة.
create or replace function public.admin_company_badges()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select case
    when not coalesce(public.is_platform_admin() or public.is_reviewer(), false)
      then '{}'::jsonb
    else (
      select jsonb_build_object(
        'total',     count(*),
        'unclaimed', count(*) filter (where t.id is null),
        'low_trust', count(*) filter (where ts.score > 0 and ts.score < 50),
        'official',  count(*) filter (where c.official_status is not null
                                        and c.official_status <> 'none'))
        from public.companies c
        left join public.tenants t      on t.company_id = c.id
        left join public.trust_scores ts on ts.company_id = c.id
       where c.approved)
  end;
$fn$;

revoke all on function public.admin_company_badges() from anon, public;
grant execute on function public.admin_company_badges() to authenticated;

-- تحقّق: العدّان الجديدان يطابقان ما كان يُحسب من السجلّ، والدالة مغلقة.
do $blk$
declare
  v_admin  text;
  v_badges jsonb;
  v_roster record;
  v_counts jsonb;
begin
  select id into v_admin from public.users where role = 'platform_admin' limit 1;
  if v_admin is null then raise notice '⚠ لا platform_admin — تُخطّى'; return; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);

  select count(*) filter (where not claimed) unclaimed,
         count(*) filter (where sc > 0 and sc < 50) low_trust
    into v_roster
    from (select (r.claimed_by is not null) claimed, coalesce(r.trust_score, 0) sc
            from public.company_roster() r where r.approved) x;

  v_badges := public.admin_company_badges();

  raise notice 'من السجلّ: غير مطالب %  · متدنٍّ %', v_roster.unclaimed, v_roster.low_trust;
  raise notice 'من الدالة : غير مطالب %  · متدنٍّ %',
    v_badges ->> 'unclaimed', v_badges ->> 'low_trust';

  if (v_badges ->> 'unclaimed')::int <> v_roster.unclaimed then
    raise exception 'عدّ «غير المطالب بها» لا يطابق السجلّ';
  end if;
  if (v_badges ->> 'low_trust')::int <> v_roster.low_trust then
    raise exception 'عدّ «مؤشر الثقة المتدنّي» لا يطابق السجلّ';
  end if;
  raise notice '✅ الشارتان تطابقان السجلّ';

  v_counts := public.admin_work_counts();
  if not (v_counts ? 'all' and v_counts ? 'by_kind' and v_counts ? 'unassigned') then
    raise exception 'admin_work_counts فقدت مفاتيح';
  end if;
  raise notice '✅ admin_work_counts تحتفظ بمفاتيحها: %', v_counts;

  perform set_config('request.jwt.claims', '', true);
end $blk$;
