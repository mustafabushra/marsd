-- Migration: 102_pause_document_ai.sql
-- Purpose: the UI stopped offering document reading; the database should say so
--          too.
--
-- ============================================================================
-- Why turn it off rather than leave it enabled and unused
-- ============================================================================
-- The reader (099, 100, api/extract-document.js) works and is tested, but the
-- provider's vision model returns an empty completion on a full certificate
-- page, so the button was removed from the import sheet.
--
-- Removing a button is not the same as closing a door. /api/extract-document is
-- still deployed and still authenticates callers; anything that reaches it —
-- a stale browser tab, a script, a future screen that reuses the endpoint —
-- would spend real money on a path already known not to work. The kill switch
-- built in 099 exists for exactly this, so it is used rather than admired.
--
-- Nothing is deleted. The table, the quota function, the model setting and the
-- endpoint all stay. Turning `enabled` back to true in the admin settings screen
-- re-opens the endpoint, and one line in CompanyImportSheet.jsx re-adds the
-- button. This is a pause, and it is written down as one.

update public.system_settings
   set value = jsonb_set(value, '{enabled}', 'false'::jsonb),
       updated_at = now()
 where key = 'document_ai';

do $blk$
declare
  v_on    boolean;
  v_model text;
  v_cap   int;
begin
  select (value ->> 'enabled')::boolean, value ->> 'model', (value ->> 'per_user_daily')::int
    into v_on, v_model, v_cap
    from public.system_settings where key = 'document_ai';

  if v_on is not false then raise exception 'لم تُوقَف الميزة'; end if;

  -- The pause must not quietly discard the configuration it pauses: turning it
  -- back on has to restore the same model and the same limits.
  if v_model is null or v_cap is null then
    raise exception 'ضاعت الإعدادات عند الإيقاف — الموديل=% الحد=%', v_model, v_cap;
  end if;

  raise notice '✅ موقوفة، والإعدادات محفوظة (الموديل «%»، الحد %)', v_model, v_cap;
end $blk$;
