function ContributionCard() {
  return (
    <div className="w-full max-w-md rounded-3xl border border-white/10 bg-navy-800 p-6">
      <p className="text-sm font-semibold text-white">مستوى مساهمتك</p>
      <p className="mt-2 text-xs leading-relaxed text-white/50">
        أنت ضمن أعلى 15% من المساهمين هذا الشهر
      </p>

      <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-brand-500"
          style={{ width: "78%" }}
        />
      </div>

      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="font-bold text-white">78%</span>
        <span className="font-medium text-white/50">مساهم نشط</span>
      </div>
    </div>
  );
}

export default function GiveToGet() {
  return (
    <section className="bg-navy-700">
      <div className="mx-auto grid max-w-7xl items-center gap-16 px-6 py-20 lg:grid-cols-2 lg:px-10">
        <div className="text-center lg:text-right">
          <span className="inline-block rounded-full bg-brand-500/15 px-4 py-1.5 text-sm font-semibold text-brand-300">
            فلسفة Give to Get
          </span>

          <h2 className="mt-5 text-3xl font-extrabold leading-[1.3] text-white lg:text-4xl">
            ساهم بمعلوماتك، لتستفيد من معلومات الآخرين
          </h2>

          <p className="mt-5 text-base leading-relaxed text-white/60">
            قوة "مرصد" تأتي من المجتمع. كلما ساهمت بتقارير معتمدة عن تعاملاتك،
            حصلت على وصول أوسع وتقارير أعمق عن شركائك المحتملين. مبدأ عادل
            يبني مرجعاً موثوقاً للجميع.
          </p>

          <div className="mt-8 flex items-center justify-center gap-3 lg:justify-start">
            <div className="flex flex-1 items-center justify-between rounded-2xl border border-white/10 bg-navy-800 px-6 py-4 lg:flex-none lg:min-w-[180px]">
              <span className="text-2xl font-extrabold text-brand-400">
                1+
              </span>
              <span className="text-sm font-medium text-white/60">
                تقرير معتمد
              </span>
            </div>
            <span className="text-white/30">←</span>
            <div className="flex flex-1 items-center justify-between rounded-2xl border border-white/10 bg-navy-800 px-6 py-4 lg:flex-none lg:min-w-[180px]">
              <span className="text-2xl font-extrabold text-brand-400">
                5+
              </span>
              <span className="text-sm font-medium text-white/60">
                عمليات بحث
              </span>
            </div>
          </div>
        </div>

        <div className="flex justify-center lg:justify-start">
          <ContributionCard />
        </div>
      </div>
    </section>
  );
}
