-- Migration: 168_the_one_queue_was_missing_the_documents.sql
--
-- «شكل واحد فوق كل أنواع العمل» — هذا ما وعدت به المهاجرة 148 في توثيقها.
-- ولم يكن صحيحاً.
--
-- admin_work_items فيها نوع اسمه document_review، لكنه يقرأ company_requests:
-- أي صفوف «طلبات» من نوع مراجعة مستندات. أما المستند الذي رفعته شركة وينتظر
-- توثيقاً فيعيش في company_documents، ولم يكن في الطابور إطلاقاً.
--
-- الأثر المقيس وقت كتابة هذه المهاجرة: خمسة مستندات بحالة pending، و
-- admin_work_counts().by_kind->>'document_review' يساوي صفراً. عمل حقيقي
-- ينتظر ولا يظهر في الشاشة التي بُنيت لتكون «كل ما ينتظر قراراً» — وهو أسوأ
-- ما يمكن أن يخفيه طابور، خاصةً في منصّة رقابية.
--
-- المستند ليس طلباً: لا أحد يُسنَد إليه ولا مهلة استجابة له، فيدخل بـ
-- assignable = false مثل التقارير والاعتراضات تماماً. والصلاحية documents.verify
-- تحكمه كما تحكم reports.review التقارير.
--
-- لا يتغيّر توقيع الدالة ولا أعمدتها. إعادة القديم = تشغيل 148 مرة أخرى.

create or replace function public.admin_work_items(
  p_scope text default 'all',
  p_kind  text default null,
  p_limit int  default 100
)
returns table (
  kind          text,
  kind_label    text,
  item_id       uuid,
  company_id    uuid,
  company_name  text,
  title         text,
  status        text,
  status_label  text,
  priority      text,
  assignee      text,
  created_at    timestamptz,
  updated_at    timestamptz,
  due_at        timestamptz,
  sla_state     text,
  waiting_days  int,
  assignable    boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_me      text := public.get_current_user_id();
  v_all     boolean := coalesce(public.has_permission('work.view_all'), false);
  v_mine    boolean := coalesce(public.has_permission('work.view_assigned'), false);
  v_reports boolean := coalesce(public.has_permission('reports.review'), false);
  v_disp    boolean := coalesce(public.has_permission('disputes.resolve'), false);
  v_docs    boolean := coalesce(public.has_permission('documents.verify'), false);
begin
  if not (v_all or v_mine) then
    raise exception 'مركز العمل يحتاج صلاحية';
  end if;

  return query
  with req as (
    select
      r.kind::text                                            as kind,
      case r.kind
        when 'registration'    then 'تسجيل شركة'
        when 'claim'           then 'مطالبة بملكية'
        when 'data_update'     then 'تصحيح بيانات'
        when 'document_review' then 'مراجعة مستندات'
        else r.kind end::text                                 as kind_label,
      r.id, c.id as company_id, c.name::text as company_name,
      c.name::text                                            as title,
      r.status::text,
      case r.status
        when 'draft'                then 'مسودّة'
        when 'submitted'            then 'جديد'
        when 'under_review'         then 'قيد المراجعة'
        when 'clarification_needed' then 'بانتظار الشركة'
        when 'resubmitted'          then 'رُدّ عليه'
        else r.status end::text                               as status_label,
      public.work_priority(
        r.resolution_due_at, r.response_due_at, r.assigned_at,
        coalesce(c.official_status, 'none') <> 'none')        as priority,
      u.email::text                                           as assignee,
      r.assigned_to, r.created_at, r.updated_at,
      r.resolution_due_at                                     as due_at,
      case
        when r.status = 'clarification_needed'                              then 'paused'
        when r.assigned_at is null and r.response_due_at is not null
             and now() > r.response_due_at                                  then 'late_response'
        when r.resolution_due_at is not null and now() > r.resolution_due_at then 'late_resolution'
        when r.resolution_due_at is not null
             and now() > r.resolution_due_at - interval '24 hours'          then 'due_soon'
        else 'ok' end::text                                   as sla_state,
      case when r.submitted_at is null then 0
           else greatest(0, (extract(epoch from now() - r.submitted_at) / 86400)::int)
      end                                                     as waiting_days,
      true                                                    as assignable
    from public.company_requests r
    join public.companies c on c.id = r.company_id
    left join public.users u on u.id = r.assigned_to
   where r.status in ('submitted', 'under_review', 'clarification_needed', 'resubmitted')
  ),
  rep as (
    select 'report_review'::text, 'مراجعة تقرير'::text,
           rp.id, rp.target_company_id, c.name::text, rp.title::text,
           rp.status::text,
           case rp.status when 'pending_review' then 'بانتظار المراجعة'
                          when 'request_info'   then 'بانتظار معلومات'
                          else rp.status end::text,
           public.work_priority(null, null, null,
                                coalesce(c.official_status, 'none') <> 'none'),
           null::text, null::text, rp.created_at, rp.updated_at, null::timestamptz,
           'ok'::text,
           greatest(0, (extract(epoch from now() - rp.created_at) / 86400)::int),
           false
      from public.reports rp
      left join public.companies c on c.id = rp.target_company_id
     where rp.status in ('pending_review', 'request_info') and v_reports
  ),
  dis as (
    select 'dispute'::text, 'اعتراض'::text,
           d.id, rp.target_company_id, c.name::text,
           coalesce(rp.title, 'اعتراض')::text,
           d.status::text, 'مفتوح'::text,
           'critical'::text,
           null::text, null::text, d.created_at, d.created_at, null::timestamptz,
           'ok'::text,
           greatest(0, (extract(epoch from now() - d.created_at) / 86400)::int),
           false
      from public.disputes d
      left join public.reports rp on rp.id = d.report_id
      left join public.companies c on c.id = rp.target_company_id
     where d.status = 'open' and v_disp
  ),
  -- الجديد: المستند نفسه، لا الطلب عليه.
  --
  -- superseded_at is null يستبعد النسخ التي حلّت محلّها نسخة أحدث، وهو نفس
  -- الشرط الذي تستعمله documents_overview — فلا يختلف عدّ الطابور عن عدّ شاشة
  -- المستندات.
  doc as (
    select 'document_review'::text, 'توثيق مستند'::text,
           cd.id, cd.company_id, c.name::text,
           case cd.doc_type
             when 'commercial_registration'   then 'السجل التجاري'
             when 'articles_of_incorporation' then 'عقد التأسيس'
             when 'vat_certificate'           then 'شهادة ضريبة القيمة المضافة'
             when 'zakat_certificate'         then 'شهادة الزكاة'
             when 'gosi_certificate'          then 'شهادة التأمينات الاجتماعية'
             when 'municipal_license'         then 'الرخصة البلدية'
             when 'national_address'          then 'العنوان الوطني'
             when 'chamber_membership'        then 'عضوية الغرفة التجارية'
             when 'license'                   then 'ترخيص النشاط'
             when 'bank_letter'               then 'خطاب بنكي'
             when 'owner_id'                  then 'هوية المالك أو المفوَّض'
             else 'مستند آخر' end::text,
           cd.status::text, 'بانتظار التوثيق'::text,
           public.work_priority(null, null, null,
                                coalesce(c.official_status, 'none') <> 'none'),
           null::text, null::text, cd.created_at, cd.created_at, null::timestamptz,
           'ok'::text,
           greatest(0, (extract(epoch from now() - cd.created_at) / 86400)::int),
           false
      from public.company_documents cd
      join public.companies c on c.id = cd.company_id
     where cd.status = 'pending'
       and cd.superseded_at is null
       and v_docs
  ),
  everything as (
    select * from req
    union all select * from rep
    union all select * from dis
    union all select * from doc
  )
  select e.kind, e.kind_label, e.id, e.company_id, e.company_name, e.title,
         e.status, e.status_label, e.priority, e.assignee,
         e.created_at, e.updated_at, e.due_at, e.sla_state, e.waiting_days, e.assignable
    from everything e
   where (p_kind is null or e.kind = p_kind)
     and (v_all or e.assigned_to = v_me or e.assigned_to is null)
     and case coalesce(p_scope, 'all')
           when 'mine'         then e.assigned_to = v_me
           when 'unassigned'   then e.assigned_to is null and e.assignable
           when 'late'         then e.sla_state in ('late_response', 'late_resolution')
           when 'waiting_them' then e.sla_state = 'paused'
           else true
         end
   order by
     case e.priority when 'critical' then 0 when 'high' then 1 else 2 end,
     e.due_at asc nulls last,
     e.created_at asc
   limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$fn$;

revoke all on function public.admin_work_items(text, text, int) from anon, public;
grant execute on function public.admin_work_items(text, text, int) to authenticated;

-- تحقّق: الطابور يرى المستندات المنتظرة، وبنفس عدد شاشة المستندات.
do $blk$
declare
  v_admin text;
  v_queue int;
  v_screen int;
begin
  select id into v_admin from public.users where role = 'platform_admin' limit 1;
  if v_admin is null then
    raise notice '⚠ لا يوجد platform_admin — تُخطّى المقارنة';
    return;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);

  select count(*) into v_queue
    from public.admin_work_items('all', 'document_review', 500);

  select jsonb_array_length(public.documents_overview('pending') -> 'items')
    into v_screen;

  raise notice 'الطابور: % · شاشة المستندات: %', v_queue, v_screen;
  if v_queue <> v_screen then
    raise exception 'الطابور وشاشة المستندات لا يتفقان: % مقابل %', v_queue, v_screen;
  end if;
  raise notice '✅ الطابور يشمل المستندات، والعددان متطابقان';

  perform set_config('request.jwt.claims', '', true);
end $blk$;
