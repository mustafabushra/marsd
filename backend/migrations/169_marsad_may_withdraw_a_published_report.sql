-- Migration: 169_marsad_may_withdraw_a_published_report.sql
--
-- سحب تقرير منشور بقرار من مرصد، لا بانتظار اعتراض من الشركة.
--
-- الطريق الوحيد لسحب تقرير حتى الآن يمرّ عبر resolve_dispute: تعترض الشركة،
-- فيُقبل اعتراضها، فيسقط التقرير. وهذا يفترض أن كل تقرير خاطئ ستعترض عليه
-- الشركة المعنيّة — وهو افتراض يسقط في أوضح الحالات: تقرير مكرّر، أو كيدي،
-- أو عن شركة خطأ، أو تبيّن أن مُرسِله لم يتعامل معها أصلاً. لا شركة تعترض على
-- تقرير لا تعرف بوجوده، ومرصد يرى ما لا تراه.
--
-- الدلالة هنا هي دلالة resolve_dispute نفسها، حرفياً:
--
--   status = 'rejected'  ← لا حالة جديدة. كل شاشة وكل عدّاد على المنصّة يفهم
--                          هذه، وقيمة لا يقرأها شيء تعني تقريراً يظلّ يظهر
--                          حيث لا ينبغي.
--   rejected_at / rejection_reason
--   compute_trust_score في نفس المعاملة — تقرير مسحوب يجب أن يكفّ عن العدّ
--                          لحظة سحبه، لا في احتساب لاحق.
--
-- السبب إلزامي. سحب أثرٌ في سجلّ علنيّ لشركة، وسحبٌ بلا سبب مسجَّل لا يمكن
-- مراجعته لاحقاً ولا الدفاع عنه. الرفض في مسار المراجعة يشترط سبباً كذلك،
-- فهذا اتّساق لا تشدّد.

create or replace function public.withdraw_report(
  p_report_id uuid,
  p_reason    text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  r record;
  v_actor text := public.get_current_user_id();
begin
  if not coalesce(public.has_permission('reports.review'), false) then
    raise exception 'سحب التقارير لإدارة مرصد وحدها';
  end if;

  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'سبب السحب مطلوب';
  end if;

  select * into r from public.reports where id = p_report_id for update;
  if not found then
    raise exception 'التقرير غير موجود';
  end if;

  -- المنشور وحده يُسحب. غير المنشور يُرفض من مسار المراجعة، وخلط المسارين
  -- يجعل «مسحوب» و«لم يُقبل» شيئاً واحداً في السجلّ وهما ليسا كذلك.
  if r.status <> 'approved' then
    raise exception 'لا يُسحب إلا تقرير منشور — حالته الآن %', r.status;
  end if;

  update public.reports
     set status           = 'rejected',
         rejected_at      = now(),
         rejection_reason = btrim(p_reason),
         updated_at       = now()
   where id = p_report_id;

  -- في نفس المعاملة، تماماً كما يفعل resolve_dispute.
  perform public.compute_trust_score(r.target_company_id);

  insert into public.audit_logs (actor_id, action, entity, entity_id, meta)
  values (v_actor, 'report_withdrawn', 'reports', p_report_id,
          jsonb_build_object('reason', btrim(p_reason),
                             'company_id', r.target_company_id));

  return jsonb_build_object('ok', true, 'company_id', r.target_company_id);
end;
$fn$;

revoke all on function public.withdraw_report(uuid, text) from anon, public;
grant execute on function public.withdraw_report(uuid, text) to authenticated;

-- تحقّق: الصلاحية تحكم، والسبب إلزامي، والمنشور وحده يُسحب.
do $blk$
declare v_admin text; v_rep uuid; v_err text;
begin
  select id into v_admin from public.users where role = 'platform_admin' limit 1;
  if v_admin is null then raise notice '⚠ لا يوجد platform_admin — تُخطّى'; return; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);

  select id into v_rep from public.reports where status = 'approved' limit 1;
  if v_rep is null then raise notice 'ℹ لا تقرير منشور — يُختبر الحارسان فقط'; end if;

  begin
    perform public.withdraw_report(coalesce(v_rep, gen_random_uuid()), '   ');
    raise exception 'قُبل سبب فارغ';
  exception when others then
    get stacked diagnostics v_err = message_text;
    if v_err <> 'سبب السحب مطلوب' then raise exception 'خطأ غير متوقّع: %', v_err; end if;
    raise notice '✅ السبب إلزامي';
  end;

  perform set_config('request.jwt.claims', '', true);
  begin
    perform public.withdraw_report(gen_random_uuid(), 'سبب');
    raise exception 'نفّذت بلا صلاحية';
  exception when others then
    raise notice '✅ مغلقة أمام من لا صلاحية له';
  end;
end $blk$;
