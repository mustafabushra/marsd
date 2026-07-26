-- Migration: 023_drop_foreign_tables.sql
-- Purpose: remove seven tables that belong to no application.
--
-- Appointment, KnowledgeSource, Lead, Page, Post, SiteSetting and Testimonial
-- describe a marketing site with a chat assistant — leads captured from a
-- conversation, appointments with meeting links, articles, testimonials. Their
-- naming gives away where they came from: PascalCase tables with camelCase
-- columns is Prisma's convention, while every Marsad table is snake_case from
-- hand-written SQL. Two projects, two tools, one database.
--
-- The site they were built for now runs on its own hosting and its own database:
-- its deployed bundle carries no reference to this Supabase project. What is
-- left here is the abandoned half of a move.
--
-- Checked before writing this: no rows, no foreign keys in either direction, no
-- function or view referring to them, and no file in this repository naming any
-- of them. They cost nothing to keep except confusion — during this session they
-- were taken for a live application's data, and securing the database was held
-- up over not wanting to break it.
--
-- The verification runs again below rather than being trusted from earlier: this
-- statement is not reversible, and a row appearing between the check and the
-- migration is exactly the case worth refusing on.

do $$
declare
  t text;
  n bigint;
begin
  foreach t in array array['Appointment', 'KnowledgeSource', 'Lead', 'Page', 'Post', 'SiteSetting', 'Testimonial']
  loop
    if to_regclass(format('public.%I', t)) is null then
      raise notice 'skipped (absent): %', t;
      continue;
    end if;

    execute format('select count(*) from public.%I', t) into n;
    if n > 0 then
      raise exception 'الجدول % يحتوي % صفاً — لن يُحذف', t, n;
    end if;

    execute format('drop table public.%I cascade', t);
    raise notice 'dropped: %', t;
  end loop;
end $$;
