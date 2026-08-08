-- A dead link says so before it is used
-- ============================================================================
--
-- Reported from a real phone: the laptop's code ran out and said so, and
-- scanning it afterwards still opened a working-looking upload page. Choosing a
-- file was refused — the expiry was always enforced where it counts, and no
-- document could be filed — but the screen invited somebody to photograph a
-- document and only then told them it was too late.
--
-- The cause is that the phone page asked nothing on arrival. Its first and only
-- question was «here is a file, may I», so an expired token, a consumed token
-- and a valid one all rendered identically.
--
-- ============================================================================
-- Why this is not `open_upload_handoff`
-- ============================================================================
-- `open_upload_handoff` issues an upload: it counts against the three attempts
-- a code is allowed. Calling it on page load would spend one of the three on
-- merely looking, and a person who scanned, hesitated and scanned again would
-- be out of tries before sending anything.
--
-- So looking and issuing are separated. This one reads and counts nothing. It
-- returns what the page has to say — which company, which document, how long is
-- left — and refuses in the same words for the same reasons, so the page cannot
-- show one answer while the upload gives another.

create or replace function public.peek_upload_handoff(p_token text)
returns table (company_name text, doc_label text, doc_type text, expires_at timestamptz)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_row public.upload_handoffs;
begin
  select * into v_row
    from public.upload_handoffs
   where token_hash = encode(digest(p_token, 'sha256'), 'hex');

  -- The same three refusals, in the same order and the same words as the
  -- issuing path. Two functions that disagree about whether a link is dead
  -- would be worse than the bug this fixes.
  if v_row.id is null then
    raise exception 'رابط غير صالح';
  end if;
  if v_row.consumed_at is not null then
    raise exception 'استُخدم هذا الرابط بالفعل';
  end if;
  if v_row.expires_at < now() then
    raise exception 'انتهت صلاحية الرابط';
  end if;

  return query
    select c.name::text,
           coalesce(
             (select t.label from public.company_document_types() t
               where t.doc_type = v_row.doc_type),
             v_row.doc_type)::text,
           v_row.doc_type::text,
           v_row.expires_at
      from public.companies c
     where c.id = v_row.company_id;
end;
$$;

-- Only the server. The phone has no key and talks to the serverless function.
revoke all on function public.peek_upload_handoff(text) from anon, authenticated, public;
