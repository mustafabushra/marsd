-- The register is its own evidence
-- ============================================================================
--
-- `guard_company_requires_cr_doc` refuses a company added without a scan of its
-- commercial registration. That rule is right, and it is right for the reason
-- it was written: a person adding a company to the registry is making a claim,
-- and a reviewer needs something to check it against.
--
-- A row from the Ministry's own published register is not that. It is the
-- document — the authority that issues commercial registrations, saying this
-- registration exists. Demanding a photograph of it is asking someone to prove
-- the register against itself, and there is no photograph to give: the open
-- data file carries fields, not scans.
--
-- So the guard exempts `source = 'official'`, and only that. Community entries
-- are unchanged, and a company cannot be slipped past the requirement by
-- claiming an official source: `companies_source_check` restricts the column,
-- and `guard_company_profile_edit` already refuses source changes from a
-- company account.

create or replace function public.guard_company_requires_cr_doc()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if public.get_current_user_id() is null
     or coalesce(public.is_platform_admin(), false)
     or public.get_current_tenant_id() is null then
    return new;
  end if;

  -- Published by the Ministry. The record is the evidence.
  if new.source = 'official' then
    return new;
  end if;

  if coalesce(trim(new.cr_file_url), '') = '' then
    raise exception 'إضافة الشركة تحتاج صورة السجل التجاري — أرفقها ثم أعد الإرسال'
      using errcode = 'check_violation';
  end if;

  return new;
end $function$;
