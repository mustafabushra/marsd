-- Migration: 100_document_ai_model_setting.sql
-- Purpose: the model that reads company documents is a provider's product name,
--          and provider product names change.
--
-- ============================================================================
-- Why this is a setting and not a constant
-- ============================================================================
-- /api/extract-document sends a document to Groq's vision model. That model has
-- been renamed before. When it is renamed again — or when a better one ships —
-- the fix should be one field in the admin screen, not a code change and a
-- redeploy for a string.
--
-- The endpoint falls back to its own default when this key is absent, so an
-- empty or deleted value degrades to working rather than to broken. 099 shipped
-- the row without it; this adds the key to the existing value rather than
-- replacing it, so the limits already tuned in production survive.
--
-- The description is written for whoever opens the settings screen and has never
-- read this file, because they are the person who will have to change it.

update public.system_settings
   set value = jsonb_set(
         value,
         '{model}',
         to_jsonb('qwen/qwen3.6-27b'::text),
         true          -- create the key if it is missing
       )
 where key = 'document_ai'
   and not (value ? 'model');

comment on table public.system_settings is
  'إعدادات المنصة القابلة للتعديل من لوحة التحكم دون نشر جديد';

-- ============================================================================
-- Prove it
-- ============================================================================
do $blk$
declare
  v_model text;
  v_user  int;
  v_on    boolean;
begin
  select value ->> 'model',
         (value ->> 'per_user_daily')::int,
         (value ->> 'enabled')::boolean
    into v_model, v_user, v_on
    from public.system_settings
   where key = 'document_ai';

  if v_model is null then
    raise exception 'مفتاح الموديل لم يُضَف';
  end if;

  -- The limits from 099 must still be there: this migration adds a key, it does
  -- not rewrite the row, and a jsonb_set that replaced the whole value would
  -- silently reset a limit somebody had tuned.
  if v_user is null or v_on is null then
    raise exception 'الحدود ضاعت — %', v_user;
  end if;

  raise notice '✅ الموديل «%» قابل للتعديل، والحدود سليمة (% للمستخدم، مُفعّل=%)',
    v_model, v_user, v_on;
end $blk$;
