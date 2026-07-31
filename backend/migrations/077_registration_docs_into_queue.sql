-- Migration: 077_registration_docs_into_queue.sql
-- Purpose: the commercial registration a company uploads while registering never
--          reaches the document queue.
--
-- ============================================================================
-- Two places for the same paper
-- ============================================================================
-- Registration writes the file to companies.cr_file_url. The documents system
-- reads company_documents. Nine companies have a registration document on file
-- and company_documents holds one row — so a company uploads its سجل تجاري,
-- sees it accepted, and nothing appears in /admin/documents for anyone to
-- verify. It is not lost; it is somewhere nobody is looking.
--
-- That also means the official layer never counts it: only a verified row in
-- company_documents earns the document bonus, so nine companies are carrying a
-- registration they were never credited for.
--
-- The existing files are brought into the queue as pending, because that is what
-- they are — uploaded and unreviewed. Marking them verified would credit nine
-- companies for documents no one has looked at, which is the opposite of what
-- the verification badge means.

do $blk$
declare
  co record;
  n int := 0;
begin
  for co in
    select c.id, c.cr_file_url, c.name
      from public.companies c
     where c.cr_file_url is not null
       and not exists (
         select 1 from public.company_documents d
          where d.company_id = c.id
            and d.doc_type = 'commercial_registration')
  loop
    insert into public.company_documents
      (company_id, doc_type, file_url, file_name, status, note,
       uploaded_by_tenant_id)
    values
      (co.id, 'commercial_registration', co.cr_file_url,
       'السجل التجاري (من التسجيل)', 'pending',
       'رُفع أثناء تسجيل الشركة قبل وجود نظام المستندات',
       (select id from public.tenants where company_id = co.id limit 1));
    n := n + 1;
  end loop;
  raise notice 'سجلات تجارية أُدخلت الطابور: %', n;
end $blk$;

-- ============================================================================
-- And stop the divergence at its source
-- ============================================================================
-- A trigger rather than a change in api.ts: registration writes cr_file_url from
-- two different screens, and a rule enforced in one of them is a rule the other
-- forgets. Here it holds for every path, including any added later.
create or replace function public.mirror_cr_file_to_documents()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if new.cr_file_url is null
     or new.cr_file_url is not distinct from old.cr_file_url then
    return null;
  end if;

  -- Only when there is nothing of that type already. A company that has since
  -- uploaded a proper registration through the documents section should not have
  -- it duplicated by an edit to the old column.
  if exists (select 1 from public.company_documents
              where company_id = new.id and doc_type = 'commercial_registration') then
    return null;
  end if;

  insert into public.company_documents
    (company_id, doc_type, file_url, file_name, status, note, uploaded_by_tenant_id)
  values
    (new.id, 'commercial_registration', new.cr_file_url,
     'السجل التجاري (من التسجيل)', 'pending', 'رُفع أثناء التسجيل',
     (select id from public.tenants where company_id = new.id limit 1));

  return null;
end $fn$;

drop trigger if exists trg_mirror_cr_file on public.companies;
create trigger trg_mirror_cr_file
  after insert or update of cr_file_url on public.companies
  for each row execute function public.mirror_cr_file_to_documents();

-- ============================================================================
-- Verify
-- ============================================================================
do $blk$
declare v_missing int; v_pending int;
begin
  select count(*) into v_missing
    from public.companies c
   where c.cr_file_url is not null
     and not exists (select 1 from public.company_documents d
                      where d.company_id = c.id
                        and d.doc_type = 'commercial_registration');
  if v_missing > 0 then
    raise exception 'ما زال % سجلاً تجارياً خارج الطابور', v_missing;
  end if;

  select count(*) into v_pending from public.company_documents where status = 'pending';
  raise notice '✅ كل سجل تجاري في الطابور · % مستنداً بانتظار المراجعة', v_pending;
end $blk$;
