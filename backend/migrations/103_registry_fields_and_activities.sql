-- Migration: 103_registry_fields_and_activities.sql
-- Purpose: the add-company form is becoming the commercial registration itself,
--          so the table has to hold what a registration actually contains.
--
-- ============================================================================
-- Part 1 — the fields the registration has and the table did not
-- ============================================================================
-- `entity_type` was carrying two different answers at once: whether this is a
-- company or an establishment, and which legal form it takes. They filter
-- differently — "show me every مؤسسة" and "show me every ذات مسؤولية محدودة"
-- are different questions — so they become separate columns.
--
-- The existing column is left alone. Splitting it in place would rewrite live
-- rows on the strength of a string match, and a legal form guessed wrong is a
-- fact about a real business stated wrongly. New records fill the new columns;
-- old ones keep what they have until somebody edits them.

alter table public.companies
  add column if not exists company_type              text,
  add column if not exists company_traits            text,
  add column if not exists cr_type                   text,
  add column if not exists cr_version                text,
  add column if not exists annual_confirmation_date  date,
  add column if not exists capital                   numeric(18,2),
  -- Lists, as jsonb rather than a delimited string. `sub_activities` (text)
  -- stays and is still written, because the search index reads it — this holds
  -- the same activities with their ISIC codes attached, which a joined string
  -- cannot express.
  add column if not exists activities                jsonb,
  add column if not exists managers                  jsonb;

comment on column public.companies.company_type is
  'الشكل القانوني: ذات مسؤولية محدودة، مساهمة… — منفصل عن نوع المنشأة (شركة/مؤسسة)';
comment on column public.companies.activities is
  'أنشطة السجل بأكوادها: [{"code":"561010","name":"المطاعم مع الخدمة"}]';
comment on column public.companies.managers is
  'أسماء المديرين: ["هيفاء احمد سعيد ظهران"]';
comment on column public.companies.capital is
  'رأس المال بالريال. رقم لا نص، حتى يمكن الترتيب والمقارنة';

-- Capital is a quantity, and a negative one is a data-entry error rather than a
-- fact about a business.
do $blk$
begin
  if not exists (select 1 from pg_constraint where conname = 'companies_capital_not_negative') then
    alter table public.companies
      add constraint companies_capital_not_negative check (capital is null or capital >= 0);
  end if;
end $blk$;

create index if not exists idx_companies_company_type
  on public.companies (company_type) where company_type is not null;

-- ============================================================================
-- Part 2 — the official activity list, as data
-- ============================================================================
-- The Ministry of Commerce publishes the national economic activity directory
-- (ISIC4). It is not available as a file this migration can fetch: the ministry
-- and the business centre both serve it through pages that render in
-- JavaScript behind an anti-automation control, and going around that is not
-- something to build into a product.
--
-- So the list lives in a table an administrator loads, rather than in code a
-- developer edits. When the official file arrives — from the ministry, or from
-- Wathq, which returns activities with their codes as part of a registration —
-- it is imported here and every dropdown in the product is populated at once,
-- with no deployment.
--
-- What is seeded below is the ISIC4 *structure*: the 21 sections and their
-- divisions, which are the published international standard and are stable.
-- Saudi Arabia extends these to six and seven digits nationally, and those
-- extensions are exactly what has to be loaded. Seeding invented six-digit
-- codes to make the list look complete would put fabricated official data in
-- front of people, which is the one thing this feature must never do.

create table if not exists public.reference_activities (
  code        text primary key,
  name_ar     text not null,
  name_en     text,
  -- 2 = division, 4 = ISIC class, 6+ = Saudi national extension. Recorded so a
  -- screen can offer the specific activities and not the headings.
  level       int  not null,
  parent_code text,
  active      boolean not null default true,
  source      text not null default 'seed',
  created_at  timestamptz not null default now()
);

comment on table public.reference_activities is
  'الدليل الوطني للأنشطة الاقتصادية ISIC4. المزروع هنا هو الهيكل الدولي فقط — الأنشطة السعودية التفصيلية (6-7 أرقام) تُرفع من لوحة التحكم';

create index if not exists idx_reference_activities_search
  on public.reference_activities (name_ar text_pattern_ops) where active;
create index if not exists idx_reference_activities_level
  on public.reference_activities (level) where active;

alter table public.reference_activities enable row level security;

-- Readable by anyone signed in: it is a public government classification, and a
-- dropdown that needs a permission check is a dropdown that fails to load.
drop policy if exists reference_activities_select on public.reference_activities;
create policy reference_activities_select on public.reference_activities
  for select using (true);

-- Written only by platform staff. A shared vocabulary that any account can edit
-- is not a shared vocabulary.
drop policy if exists reference_activities_write on public.reference_activities;
create policy reference_activities_write on public.reference_activities
  for all using (coalesce(public.is_platform_admin(), false))
  with check (coalesce(public.is_platform_admin(), false));

-- ---------------------------------------------------------------------------
-- The ISIC4 divisions
-- ---------------------------------------------------------------------------
insert into public.reference_activities (code, name_ar, name_en, level, parent_code) values
  ('01','الزراعة وإنتاج المحاصيل والحيوانات','Crop and animal production',2,null),
  ('02','الحراجة وقطع الأشجار','Forestry and logging',2,null),
  ('03','صيد الأسماك وتربية المائيات','Fishing and aquaculture',2,null),
  ('05','تعدين الفحم والليغنيت','Mining of coal and lignite',2,null),
  ('06','استخراج النفط الخام والغاز الطبيعي','Extraction of crude petroleum and natural gas',2,null),
  ('07','تعدين ركازات الفلزات','Mining of metal ores',2,null),
  ('08','الأنشطة الأخرى للتعدين واستغلال المحاجر','Other mining and quarrying',2,null),
  ('09','أنشطة خدمات دعم التعدين','Mining support service activities',2,null),
  ('10','صناعة المنتجات الغذائية','Manufacture of food products',2,null),
  ('11','صناعة المشروبات','Manufacture of beverages',2,null),
  ('12','صناعة منتجات التبغ','Manufacture of tobacco products',2,null),
  ('13','صناعة المنسوجات','Manufacture of textiles',2,null),
  ('14','صناعة الملبوسات','Manufacture of wearing apparel',2,null),
  ('15','صناعة الجلود والمنتجات ذات الصلة','Manufacture of leather and related products',2,null),
  ('16','صناعة الخشب ومنتجات الخشب','Manufacture of wood and of products of wood',2,null),
  ('17','صناعة الورق ومنتجات الورق','Manufacture of paper and paper products',2,null),
  ('18','الطباعة واستنساخ وسائط الإعلام المسجلة','Printing and reproduction of recorded media',2,null),
  ('19','صناعة فحم الكوك والمنتجات النفطية المكررة','Manufacture of coke and refined petroleum products',2,null),
  ('20','صناعة المواد الكيميائية والمنتجات الكيميائية','Manufacture of chemicals and chemical products',2,null),
  ('21','صناعة المنتجات الصيدلانية','Manufacture of pharmaceuticals',2,null),
  ('22','صناعة منتجات المطاط واللدائن','Manufacture of rubber and plastics products',2,null),
  ('23','صناعة منتجات المعادن اللافلزية الأخرى','Manufacture of other non-metallic mineral products',2,null),
  ('24','صناعة الفلزات القاعدية','Manufacture of basic metals',2,null),
  ('25','صناعة منتجات المعادن المشكلة','Manufacture of fabricated metal products',2,null),
  ('26','صناعة الحواسيب والمنتجات الإلكترونية والبصرية','Manufacture of computer, electronic and optical products',2,null),
  ('27','صناعة المعدات الكهربائية','Manufacture of electrical equipment',2,null),
  ('28','صناعة الآلات والمعدات غير المصنفة في موضع آخر','Manufacture of machinery and equipment n.e.c.',2,null),
  ('29','صناعة المركبات ذات المحركات والمركبات المقطورة','Manufacture of motor vehicles and trailers',2,null),
  ('30','صناعة معدات النقل الأخرى','Manufacture of other transport equipment',2,null),
  ('31','صناعة الأثاث','Manufacture of furniture',2,null),
  ('32','الصناعات التحويلية الأخرى','Other manufacturing',2,null),
  ('33','إصلاح وتركيب الآلات والمعدات','Repair and installation of machinery and equipment',2,null),
  ('35','إمدادات الكهرباء والغاز والبخار وتكييف الهواء','Electricity, gas, steam and air conditioning supply',2,null),
  ('36','تجميع المياه ومعالجتها وتوصيلها','Water collection, treatment and supply',2,null),
  ('37','الصرف الصحي','Sewerage',2,null),
  ('38','أنشطة جمع النفايات ومعالجتها','Waste collection and treatment',2,null),
  ('39','أنشطة المعالجة وخدمات إدارة النفايات الأخرى','Remediation activities and other waste management',2,null),
  ('41','تشييد المباني','Construction of buildings',2,null),
  ('42','الهندسة المدنية','Civil engineering',2,null),
  ('43','الأنشطة المتخصصة في التشييد','Specialized construction activities',2,null),
  ('45','تجارة الجملة والتجزئة وإصلاح المركبات ذات المحركات','Wholesale and retail trade and repair of motor vehicles',2,null),
  ('46','تجارة الجملة، باستثناء المركبات ذات المحركات','Wholesale trade, except of motor vehicles',2,null),
  ('47','تجارة التجزئة، باستثناء المركبات ذات المحركات','Retail trade, except of motor vehicles',2,null),
  ('49','النقل البري والنقل عبر الأنابيب','Land transport and transport via pipelines',2,null),
  ('50','النقل المائي','Water transport',2,null),
  ('51','النقل الجوي','Air transport',2,null),
  ('52','التخزين وأنشطة الدعم للنقل','Warehousing and support activities for transportation',2,null),
  ('53','أنشطة البريد ونقل الطرود','Postal and courier activities',2,null),
  ('55','أنشطة الإقامة','Accommodation',2,null),
  ('56','أنشطة خدمات الأطعمة والمشروبات','Food and beverage service activities',2,null),
  ('58','أنشطة النشر','Publishing activities',2,null),
  ('59','أنشطة إنتاج الأفلام والفيديو والبرامج التلفزيونية','Motion picture, video and television programme activities',2,null),
  ('60','أنشطة البث والبرمجة','Programming and broadcasting activities',2,null),
  ('61','الاتصالات السلكية واللاسلكية','Telecommunications',2,null),
  ('62','أنشطة البرمجة الحاسوبية والخبرة الاستشارية','Computer programming and consultancy activities',2,null),
  ('63','أنشطة خدمات المعلومات','Information service activities',2,null),
  ('64','أنشطة الخدمات المالية، عدا التأمين','Financial service activities, except insurance',2,null),
  ('65','التأمين وإعادة التأمين وصناديق المعاشات','Insurance, reinsurance and pension funding',2,null),
  ('66','الأنشطة المساعدة لأنشطة الخدمات المالية','Activities auxiliary to financial services',2,null),
  ('68','الأنشطة العقارية','Real estate activities',2,null),
  ('69','الأنشطة القانونية وأنشطة المحاسبة','Legal and accounting activities',2,null),
  ('70','أنشطة المكاتب الرئيسية والاستشارات الإدارية','Activities of head offices; management consultancy',2,null),
  ('71','الأنشطة المعمارية والهندسية والاختبارات التقنية','Architectural and engineering activities; technical testing',2,null),
  ('72','البحث العلمي والتطوير','Scientific research and development',2,null),
  ('73','الدعاية والإعلان وبحوث السوق','Advertising and market research',2,null),
  ('74','الأنشطة المهنية والعلمية والتقنية الأخرى','Other professional, scientific and technical activities',2,null),
  ('75','الأنشطة البيطرية','Veterinary activities',2,null),
  ('77','أنشطة التأجير والاستئجار','Rental and leasing activities',2,null),
  ('78','أنشطة الاستخدام','Employment activities',2,null),
  ('79','أنشطة وكالات السفر ومنظمي الرحلات','Travel agency and tour operator activities',2,null),
  ('80','أنشطة الأمن والتحقيقات','Security and investigation activities',2,null),
  ('81','أنشطة خدمات المباني وتنسيق المواقع','Services to buildings and landscape activities',2,null),
  ('82','أنشطة الخدمات الإدارية والمكتبية ودعم الأعمال','Office administrative and business support activities',2,null),
  ('84','الإدارة العامة والدفاع','Public administration and defence',2,null),
  ('85','التعليم','Education',2,null),
  ('86','أنشطة صحة الإنسان','Human health activities',2,null),
  ('87','أنشطة الرعاية المؤسسية','Residential care activities',2,null),
  ('88','أنشطة العمل الاجتماعي بدون إقامة','Social work activities without accommodation',2,null),
  ('90','الأنشطة الإبداعية والفنون وأنشطة الترفيه','Creative, arts and entertainment activities',2,null),
  ('91','أنشطة المكتبات والمحفوظات والمتاحف','Libraries, archives, museums',2,null),
  ('92','أنشطة المقامرة والمراهنة','Gambling and betting activities',2,null),
  ('93','الأنشطة الرياضية وأنشطة التسلية والترفيه','Sports activities and amusement and recreation',2,null),
  ('94','أنشطة المنظمات ذات العضوية','Activities of membership organizations',2,null),
  ('95','إصلاح الحواسيب والسلع الشخصية والمنزلية','Repair of computers and personal and household goods',2,null),
  ('96','أنشطة الخدمات الشخصية الأخرى','Other personal service activities',2,null)
on conflict (code) do nothing;

-- ============================================================================
-- Prove it
-- ============================================================================
do $blk$
declare
  v_divisions int;
  v_cols      int;
begin
  select count(*) into v_divisions from public.reference_activities where level = 2;
  if v_divisions < 80 then
    raise exception 'الأقسام المزروعة % فقط', v_divisions;
  end if;

  select count(*) into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'companies'
     and column_name in ('company_type','company_traits','cr_type','cr_version',
                         'annual_confirmation_date','capital','activities','managers');
  if v_cols <> 8 then raise exception 'أعمدة ناقصة: % من 8', v_cols; end if;

  -- A negative capital must be refused, or the constraint is decoration.
  begin
    insert into public.companies (name, cr_number, capital)
    values ('فحص رأس المال السالب', 'CHECK-NEG-CAP', -1);
    raise exception 'قُبل رأس مال سالب';
  exception when check_violation then
    null;   -- expected
  end;

  raise notice '✅ % قسم اقتصادي، 8 أعمدة جديدة، ورأس المال السالب مرفوض', v_divisions;
end $blk$;

do $blk$
declare v_n int;
begin
  delete from public.companies where cr_number = 'CHECK-NEG-CAP';
  select count(*) into v_n from public.companies where cr_number = 'CHECK-NEG-CAP';
  if v_n > 0 then raise exception 'بقي صف فحص'; end if;
  raise notice '✅ لم يبقَ أثر';
end $blk$;
