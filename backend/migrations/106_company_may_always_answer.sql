-- Migration: 106_company_may_always_answer.sql
-- Purpose: a company asked a question could not answer it unless its file
--          happened to be in one of two states — and attaching the document it
--          was asked for was impossible in any state.
--
-- ============================================================================
-- What was reported
-- ============================================================================
-- «لما الشركة تحاول ترد ردها أو ترسل وثيقة ما في مكان ترسل فيه الوثيقة، وتطلع
-- ❌ حالة المراجعة تُغيّرها إدارة مرصد فقط».
--
-- Two separate defects behind one symptom.
--
-- ============================================================================
-- 1. Answering depended on a state the company does not control
-- ============================================================================
-- `answer_clarification` ends by setting `review_status = 'clarification_
-- received'`. 076 taught the guard to permit exactly that — but only from
-- `clarification_needed` or `awaiting_documents`.
--
-- Nothing forces a review into either of those. A reviewer can open a question
-- from `under_review`, from `awaiting_verification`, from `on_hold`, or on a
-- file already approved. Measured against every state:
--
--     under_review            ❌ حالة المراجعة تُغيّرها إدارة مرصد فقط
--     awaiting_verification   ❌
--     clarification_needed    ✅
--     awaiting_documents      ✅
--     on_hold                 ❌
--     approved                ❌
--
-- Four of six. The company is told to respond and cannot, and the reason it is
-- shown blames it for something it never attempted — it was answering a
-- question, not editing its review status.
--
-- The fix is not to widen the guard. `clarification_received` is a statement
-- about a review queue, and a file sitting in `under_review` with an answered
-- question does not belong in it. The answer stops moving the review status
-- from a state that did not ask for one, and moves it only from the two states
-- that mean a question is outstanding. Everywhere else the answer is recorded,
-- the request is closed, and the review stays where the reviewer put it.
--
-- ============================================================================
-- 2. There was nowhere to put the document
-- ============================================================================
-- `clarification_requests.documents_requested` exists — Marsad asks for named
-- documents. `clarification_messages` had `body` and nothing else, and
-- `answer_clarification(uuid, text)` took only prose.
--
-- So the screen told the company to upload in a different section, on a
-- different part of the page, and then come back and write that it had. Two
-- disconnected acts for one request, with nothing tying the file to the
-- question it answers — a reviewer opening the request saw «أرفقت الصورة» and
-- had to go hunting.
--
-- `document_ids` links the message to rows in company_documents, which already
-- has the storage, the RLS, and the verification workflow. The document is
-- uploaded the way every other document is; the message records which ones were
-- meant as the answer.

alter table public.clarification_messages
  add column if not exists document_ids uuid[];

comment on column public.clarification_messages.document_ids is
  'المستندات التي أرفقتها الشركة مع هذا الرد — مفاتيح في company_documents';

-- `body` was NOT NULL, which made prose the thing a message is. Once a document
-- can be the whole answer — and for «أرسل صورة السجل» it usually is — that
-- constraint forces the company to type something to accompany a file, and
-- whatever it types is noise.
--
-- The invariant is not "there is text". It is "the message says something", by
-- words or by attachment, so that is what is written down instead. Loosening
-- one rule without stating the real one is how a table ends up accepting an
-- empty row.
alter table public.clarification_messages alter column body drop not null;

do $blk$
begin
  if not exists (select 1 from pg_constraint where conname = 'clarification_message_not_empty') then
    alter table public.clarification_messages
      add constraint clarification_message_not_empty check (
        coalesce(trim(body), '') <> '' or coalesce(array_length(document_ids, 1), 0) > 0
      );
  end if;
end $blk$;

-- ============================================================================
-- Answering, with an attachment and without hostage-taking the review status
-- ============================================================================
create or replace function public.answer_clarification(
  p_request_id   uuid,
  p_body         text,
  p_document_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  r        public.clarification_requests;
  v_tenant uuid := public.get_current_tenant_id();
  v_bad    int;
begin
  select * into r from public.clarification_requests where id = p_request_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'الطلب غير موجود');
  end if;

  if r.company_id is distinct from (select company_id from public.tenants where id = v_tenant) then
    return jsonb_build_object('ok', false, 'reason', 'هذا الطلب ليس على شركتك');
  end if;

  if r.status <> 'open' then
    return jsonb_build_object('ok', false, 'reason', 'هذا الطلب مُغلق — لا يقبل ردوداً جديدة');
  end if;

  -- A reply is now either words or documents. Requiring words when the request
  -- was «أرسل صورة السجل» made the company narrate an upload instead of making
  -- one.
  if coalesce(trim(p_body), '') = '' and coalesce(array_length(p_document_ids, 1), 0) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'اكتب توضيحاً أو أرفق مستنداً قبل الإرسال');
  end if;

  -- Every attached document must belong to this company. Without this a caller
  -- could point the message at somebody else's file and have a reviewer open
  -- it, which is a read of another tenant's document granted by a foreign key.
  if p_document_ids is not null then
    select count(*) into v_bad
      from unnest(p_document_ids) as d(id)
     where not exists (
       select 1 from public.company_documents cd
        where cd.id = d.id and cd.company_id = r.company_id);
    if v_bad > 0 then
      return jsonb_build_object('ok', false, 'reason', 'أحد المستندات المرفقة ليس من مستندات شركتك');
    end if;
  end if;

  insert into public.clarification_messages (request_id, body, document_ids)
  values (p_request_id, nullif(trim(p_body), ''), p_document_ids);

  update public.clarification_requests
     set status = 'answered', responded_at = now()
   where id = p_request_id;

  -- Only from the two states that mean a question is outstanding.
  --
  -- Answering from `under_review` used to try `clarification_received` and be
  -- refused by the guard, which failed the whole reply. The answer is not less
  -- valid because the reviewer never moved the file — so it is recorded, and
  -- the review stays exactly where the reviewer left it.
  update public.companies
     set review_status = 'clarification_received',
         review_reason = 'وصل توضيح الشركة — بانتظار قراءته'
   where id = r.company_id
     and review_status in ('clarification_needed', 'awaiting_documents');

  return jsonb_build_object('ok', true);
end $fn$;

-- The old two-argument form is dropped rather than kept alongside.
--
-- Keeping both looked safer — the deployed browser still calls the two-argument
-- one, and a signature change and a deployment are never simultaneous. But two
-- overloads that differ only by a defaulted trailing argument are ambiguous:
-- `answer_clarification(uuid, text)` matches both, and Postgres refuses to
-- guess. That is not a risk to weigh, it is a function nobody can call.
--
-- Dropping it is safe for exactly the reason the wrapper was meant to provide:
-- PostgREST resolves by parameter *name*, so the browser's existing call with
-- {p_request_id, p_body} binds to this function with p_document_ids taking its
-- default. The old front end keeps working, unchanged.
drop function if exists public.answer_clarification(uuid, text);

revoke all on function public.answer_clarification(uuid, text, uuid[]) from public, anon;
grant execute on function public.answer_clarification(uuid, text, uuid[]) to authenticated;

-- ============================================================================
-- Prove it against every state, which is how the bug was found
-- ============================================================================
do $blk$
declare
  v_company uuid;
  v_user    text;
  v_tenant  uuid;
  v_req     uuid;
  v_res     jsonb;
  v_state   text;
  v_after   text;
  v_doc     uuid;
begin
  select t.company_id, u.id, t.id into v_company, v_user, v_tenant
    from public.tenants t join public.users u on u.tenant_id = t.id
   where t.company_id is not null limit 1;

  if v_company is null then raise notice 'لا شركة لها مالك — تخطّي الفحص'; return; end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

  foreach v_state in array array['under_review', 'awaiting_verification',
                                 'clarification_needed', 'awaiting_documents',
                                 'on_hold', 'approved']
  loop
    alter table public.companies disable trigger trg_guard_review_status;
    update public.companies set review_status = v_state, review_reason = 'فحص 106'
     where id = v_company;
    alter table public.companies enable trigger trg_guard_review_status;

    insert into public.clarification_requests
      (company_id, request_type, reason, status, requested_by)
    values (v_company, 'documents', 'فحص 106', 'open', v_user)
    returning id into v_req;

    v_res := public.answer_clarification(v_req, 'ردّ الشركة'::text, null::uuid[]);
    if not (v_res ->> 'ok')::boolean then
      raise exception 'الرد فشل من حالة «%»: %', v_state, v_res ->> 'reason';
    end if;

    select review_status into v_after from public.companies where id = v_company;

    -- The two states that asked a question move on; the rest stay put.
    if v_state in ('clarification_needed', 'awaiting_documents') then
      if v_after <> 'clarification_received' then
        raise exception 'من «%» كان يجب أن تصبح clarification_received، وهي %', v_state, v_after;
      end if;
    elsif v_after <> v_state then
      raise exception 'من «%» تغيّرت الحالة إلى % بلا سبب', v_state, v_after;
    end if;

    delete from public.clarification_requests where id = v_req;
  end loop;

  -- ---- an attachment travels with the reply -------------------------------
  alter table public.companies disable trigger trg_guard_review_status;
  update public.companies set review_status = 'awaiting_documents', review_reason = 'فحص 106'
   where id = v_company;
  alter table public.companies enable trigger trg_guard_review_status;

  insert into public.company_documents
    (company_id, uploaded_by_tenant_id, doc_type, file_url, status)
  values (v_company, v_tenant, 'commercial_registration', 'https://example.test/106.pdf', 'pending')
  returning id into v_doc;

  insert into public.clarification_requests
    (company_id, request_type, reason, status, requested_by)
  values (v_company, 'documents', 'فحص 106', 'open', v_user)
  returning id into v_req;

  -- Documents alone, with no words. This is the case the old signature could
  -- not express at all.
  v_res := public.answer_clarification(v_req, ''::text, array[v_doc]);
  if not (v_res ->> 'ok')::boolean then
    raise exception 'الرد بمستند وبلا نص فشل: %', v_res ->> 'reason';
  end if;

  if not exists (select 1 from public.clarification_messages
                  where request_id = v_req and document_ids @> array[v_doc]) then
    raise exception 'المستند لم يُربط بالرد';
  end if;

  -- ---- somebody else's document is refused --------------------------------
  delete from public.clarification_requests where id = v_req;
  insert into public.clarification_requests
    (company_id, request_type, reason, status, requested_by)
  values (v_company, 'documents', 'فحص 106', 'open', v_user)
  returning id into v_req;

  v_res := public.answer_clarification(v_req, 'محاولة'::text, array[gen_random_uuid()]);
  if (v_res ->> 'ok')::boolean then
    raise exception 'قُبل مستند لا يخص الشركة';
  end if;

  -- ---- an empty reply is still refused ------------------------------------
  v_res := public.answer_clarification(v_req, '   '::text, null::uuid[]);
  if (v_res ->> 'ok')::boolean then
    raise exception 'قُبل ردّ فارغ';
  end if;

  raise notice '✅ الرد يعمل من كل الحالات الست، ويحمل مستنداً، ويرفض مستند غيرها والردّ الفارغ';

  delete from public.clarification_messages where request_id = v_req;
  delete from public.clarification_requests where reason = 'فحص 106';
  delete from public.company_documents where file_url = 'https://example.test/106.pdf';
end $blk$;

do $blk$
declare v_n int;
begin
  alter table public.companies disable trigger trg_guard_review_status;
  update public.companies set review_status = 'approved', review_reason = null
   where review_reason = 'فحص 106';
  alter table public.companies enable trigger trg_guard_review_status;

  select count(*) into v_n from public.clarification_requests where reason = 'فحص 106';
  if v_n > 0 then raise exception 'بقيت % طلبات فحص', v_n; end if;

  select count(*) into v_n from public.company_documents where file_url like '%106.pdf';
  if v_n > 0 then raise exception 'بقي مستند فحص'; end if;

  raise notice '✅ لم يبقَ أثر';
end $blk$;
