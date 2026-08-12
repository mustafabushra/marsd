-- A Ministry record is not a Marsad verification
-- ============================================================================
--
-- The trust report prints «موثّقة من مرصد» whenever companies.verified is true.
-- Every verified company on the platform today got that flag from
-- add_registry_company_to_marsad, which sets it while importing the Ministry's
-- register:
--
--     verified = true, verification_source = 'وزارة التجارة'
--
-- There it means «the Ministry published this record» — the company's identity
-- is confirmed by the authority that issued it. It does not mean Marsad looked
-- at anything. Marsad's own verification is set_company_verification, which
-- stamps 'marsad_review' and only after somebody read the documents.
--
-- Two different claims, one badge, and the badge asserts the stronger one. On a
-- public trust report about a real business.
--
-- It also compounds with ownership. A Ministry-imported company has no account,
-- so the way in is a claim — and approving one hands somebody a company whose
-- report already says Marsad verified it, with no document ever reviewed.
--
-- The distinction exists in the column and never reached the screen, because
-- identity carries `verified` and not `verification_source`. This adds it. The
-- base function is left alone; the wrapper already patches identity twice and
-- this is the same kind of addition.

create or replace function public.company_report_full(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare v jsonb;
begin
  v := public.company_report_full_base(p_company_id);
  if v = '{}'::jsonb then return v; end if;

  return jsonb_set(
    jsonb_set(
      jsonb_set(v, '{quality,documents}',
        to_jsonb((select count(*) from public.company_documents
                   where company_id = p_company_id and status = 'verified'))),
      '{identity,official_status}',
      to_jsonb((select jsonb_build_object(
                  'status', coalesce(official_status, 'none'),
                  'at',     official_status_at,
                  'note',   official_status_note,
                  'source', official_status_source)
                  from public.companies where id = p_company_id))),
    -- What kind of verification this is. Without it the reader cannot tell a
    -- record the Ministry published from a company Marsad reviewed, and the
    -- screen has been calling both the second thing.
    '{identity,verification_source}',
    to_jsonb((select verification_source from public.companies where id = p_company_id)));
end
$fn$;
