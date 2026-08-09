-- Let the Ministry's file in as it is
-- ============================================================================
--
-- The register is being loaded through Supabase's own CSV importer, which
-- matches columns by name exactly and cannot transform anything. Four things in
-- the table refused the file, and none of them were protecting anything:
--
--   `registration_date` is a `date`, and the file carries values like «12:22.7»
--   — Excel's idea of a date after a round trip. One bad value rejects the
--   whole import;
--
--   the file names the registration number `commercial_registration_number`;
--   the table calls it `cr_number`;
--
--   `dataset_id` and `snapshot_period` are NOT NULL and the file carries
--   neither, because they describe the publication rather than the company.
--
-- So the dates arrive as text and are converted afterwards, once their actual
-- shape is known rather than guessed; the file's own column name exists and
-- feeds `cr_number`; and the two publication columns default to this quarter.

-- --- 1. Dates arrive as text ------------------------------------------------
-- Deliberately temporary. Storing a date as text is a decision to convert it
-- later, and «later» is after looking at what the file actually holds — not
-- after discovering that a million rows now sort alphabetically.
alter table public.government_company_registry
  alter column registration_date type text using registration_date::text;

-- --- 2. The file's own name for the registration number ----------------------
alter table public.government_company_registry
  add column if not exists commercial_registration_number text;

-- `cr_number` is what the unique index, the search and everything downstream
-- read. It stays, and is filled from whichever of the two the import supplied,
-- so nothing below this line has to know which importer ran.
alter table public.government_company_registry
  alter column cr_number drop not null;

create or replace function public.registry_fill_cr_number()
returns trigger
language plpgsql
as $$
begin
  if new.cr_number is null then
    new.cr_number := new.commercial_registration_number;
  elsif new.commercial_registration_number is null then
    new.commercial_registration_number := new.cr_number;
  end if;

  -- A row with no registration number has no identity in this register and
  -- nothing to match a company on later. Refused here rather than found months
  -- from now as a company nobody can look up.
  if new.cr_number is null then
    raise exception 'صفّ بلا رقم سجل تجاري';
  end if;

  return new;
end;
$$;

drop trigger if exists registry_fill_cr_number_trigger on public.government_company_registry;
create trigger registry_fill_cr_number_trigger
  before insert or update on public.government_company_registry
  for each row execute function public.registry_fill_cr_number();

-- --- 3. Which publication this is -------------------------------------------
-- The file describes companies, not the publication it came from. These
-- default to the Q2 2026 dataset so a plain CSV import lands somewhere
-- identifiable; a later quarter is imported with its own values set.
alter table public.government_company_registry
  alter column dataset_id set default 'ed041830-933d-4b93-aab2-c3b78822b22f'::uuid,
  alter column snapshot_period set default 'الربع الثاني 2026',
  alter column snapshot_at set default date '2026-06-30';

-- --- 4. And the name ---------------------------------------------------------
-- Left NOT NULL. A registry row without a name is not a company record, and the
-- file has the column.
