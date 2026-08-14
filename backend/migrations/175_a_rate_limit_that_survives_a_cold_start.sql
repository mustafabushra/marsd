-- Migration: 175_a_rate_limit_that_survives_a_cold_start.sql
--
-- حدّ معدّل لدوال الـAPI، محسوبٌ في القاعدة.
--
-- ============================================================================
-- لماذا في القاعدة لا في الذاكرة
-- ============================================================================
-- عدّادٌ في متغيّر داخل دالة serverless يعيش بعمر النسخة. Vercel يشغّل نسخاً
-- متوازية ويطفئها عند الخمول، فالعدّاد يبدأ من الصفر مع كل بداية باردة ومع
-- كل نسخة جديدة. أي أن حدّاً كهذا يقول إنه يحدّ ولا يحدّ.
--
-- والجدول هنا هو ما يراه الجميع.
--
-- ============================================================================
-- ما تحرسه
-- ============================================================================
-- extract-document محروس أصلاً بـ claim_document_read لأنه يكلّف مالاً لكل
-- نداء. والباقيان بلا حدّ:
--
--   invite-user      يرسل بريداً لعنوان يختاره المُرسِل. حسابٌ واحد يقصف
--                     صندوق أي شخص، والبريد يخرج باسم مرصد.
--   trust-report-pdf يُشغّل Chromium كاملاً لكل طلب — أثقل ما في المشروع،
--                     وعشرة طلبات متوازية تستنزف حصّة الدوال.
--
-- والنافذة منزلقة بالحذف لا بالتقسيم: تقسيم الوقت إلى دقائق ثابتة يسمح
-- بضعف الحدّ عند حدّ الدقيقة — خمسة في آخر ثانية وخمسة في أولها.

create table if not exists public.api_rate_limits (
  actor      text        not null,
  action     text        not null,
  at         timestamptz not null default now()
);

create index if not exists idx_api_rate_limits_lookup
  on public.api_rate_limits (actor, action, at desc);

-- الجدول لا يُقرأ ولا يُكتب إلا عبر الدالة أدناه، وهي definer.
alter table public.api_rate_limits enable row level security;
revoke all on table public.api_rate_limits from anon, authenticated;

/**
 * يحجز محاولة ويقول إن كانت مسموحة.
 *
 * يُرجع { allowed, remaining, retry_after_seconds }. لا يرمي عند التجاوز:
 * الرمي يجعل المستدعي يخلط بين «تجاوزت» و«تعطّل شيء»، وهما ردّان مختلفان.
 */
create or replace function public.api_rate_limit(
  p_actor  text,
  p_action text,
  p_limit  int  default 10,
  p_window interval default interval '1 hour'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_used  int;
  v_first timestamptz;
begin
  if coalesce(btrim(p_actor), '') = '' or coalesce(btrim(p_action), '') = '' then
    raise exception 'الفاعل والفعل مطلوبان';
  end if;

  -- تنظيف عابر: الصفوف خارج النافذة لا تُقرأ، وتركها ينفخ الجدول.
  delete from public.api_rate_limits
   where actor = p_actor and action = p_action and at < now() - p_window;

  select count(*), min(at) into v_used, v_first
    from public.api_rate_limits
   where actor = p_actor and action = p_action and at >= now() - p_window;

  if v_used >= p_limit then
    return jsonb_build_object(
      'allowed', false,
      'remaining', 0,
      'retry_after_seconds',
        greatest(1, ceil(extract(epoch from (v_first + p_window) - now()))::int));
  end if;

  insert into public.api_rate_limits (actor, action) values (p_actor, p_action);

  return jsonb_build_object(
    'allowed', true,
    'remaining', p_limit - v_used - 1,
    'retry_after_seconds', 0);
end;
$fn$;

revoke all on function public.api_rate_limit(text, text, int, interval)
  from anon, public, authenticated;

-- تحقّق: يسمح حتى الحدّ ثم يمنع، ويعزل الفاعلين والأفعال عن بعضهم.
do $blk$
declare
  v jsonb;
  v_actor text := 'probe-' || gen_random_uuid()::text;
  i int;
begin
  for i in 1..3 loop
    v := public.api_rate_limit(v_actor, 'probe', 3, interval '1 hour');
    if not (v ->> 'allowed')::boolean then
      raise exception 'مُنع عند المحاولة % والحدّ 3', i;
    end if;
  end loop;
  raise notice '✅ سمح بثلاث محاولات · المتبقّي %', v ->> 'remaining';

  v := public.api_rate_limit(v_actor, 'probe', 3, interval '1 hour');
  if (v ->> 'allowed')::boolean then raise exception 'لم يمنع الرابعة'; end if;
  if (v ->> 'retry_after_seconds')::int <= 0 then
    raise exception 'لم يُرجع مهلة إعادة المحاولة';
  end if;
  raise notice '✅ منع الرابعة · أعد المحاولة بعد % ثانية', v ->> 'retry_after_seconds';

  -- فعلٌ آخر لنفس الفاعل لا يتأثّر.
  v := public.api_rate_limit(v_actor, 'probe-other', 3, interval '1 hour');
  if not (v ->> 'allowed')::boolean then raise exception 'خلط بين فعلين'; end if;
  raise notice '✅ الأفعال معزولة';

  -- فاعلٌ آخر لا يتأثّر.
  v := public.api_rate_limit(v_actor || '-b', 'probe', 3, interval '1 hour');
  if not (v ->> 'allowed')::boolean then raise exception 'خلط بين فاعلين'; end if;
  raise notice '✅ الفاعلون معزولون';

  delete from public.api_rate_limits where actor like 'probe-%';
end $blk$;
